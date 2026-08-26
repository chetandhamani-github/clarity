import { getDatabase } from './index';
import { updateAccountBalance, getAccountById } from './account-dao';
import type { Transaction, TransactionWithAccount, TransactionFilters, TransactionType, MonthlyTotals } from '@/types';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface TransactionRow {
  id: string;
  account_id: string;
  amount: number;
  type: string;
  merchant: string;
  category: string;
  date: string;
  is_recurring: number;
  note: string;
  account_name?: string; // from JOIN
}

function mapRow(row: TransactionRow): TransactionWithAccount {
  return {
    id: row.id,
    accountId: row.account_id,
    amount: row.amount,
    type: row.type as TransactionType,
    merchant: row.merchant,
    category: row.category,
    date: row.date,
    isRecurring: Boolean(row.is_recurring),
    note: row.note,
    accountName: row.account_name ?? 'Unknown Account',
  };
}

export async function getTransactions(
  filters?: TransactionFilters,
): Promise<TransactionWithAccount[]> {
  const db = getDatabase();
  
  let query = `
    SELECT t.*, a.name as account_name 
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filters?.accountId) {
    query += ` AND t.account_id = ?`;
    params.push(filters.accountId);
  }
  if (filters?.category) {
    query += ` AND t.category = ?`;
    params.push(filters.category);
  }
  if (filters?.type) {
    query += ` AND t.type = ?`;
    params.push(filters.type);
  }
  if (filters?.search) {
    query += ` AND (t.merchant LIKE ? OR t.note LIKE ?)`;
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters?.dateFrom) {
    query += ` AND t.date >= ?`;
    params.push(filters.dateFrom);
  }
  if (filters?.dateTo) {
    query += ` AND t.date <= ?`;
    params.push(filters.dateTo);
  }

  query += ` ORDER BY t.date DESC`;

  if (filters?.limit) {
    query += ` LIMIT ?`;
    params.push(filters.limit);
    if (filters?.offset) {
      query += ` OFFSET ?`;
      params.push(filters.offset);
    }
  }

  const rows = await db.getAllAsync<TransactionRow>(query, params);
  return rows.map(mapRow);
}

export async function getTransactionById(
  id: string,
): Promise<TransactionWithAccount | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<TransactionRow>(
    `SELECT t.*, a.name as account_name 
     FROM transactions t
     LEFT JOIN accounts a ON t.account_id = a.id
     WHERE t.id = ?`,
    [id]
  );
  return row ? mapRow(row) : null;
}

export async function insertTransaction(
  data: Omit<Transaction, 'id'>,
): Promise<Transaction> {
  const db = getDatabase();
  const id = generateId();

  // 1. Get current account to calculate new balance
  const account = await getAccountById(data.accountId);
  if (!account) throw new Error('Account not found');

  let balanceChange = 0;
  if (data.type === 'income') balanceChange = data.amount;
  else if (data.type === 'expense') balanceChange = -data.amount;
  // Note: Transfers require a second transaction for the other account, 
  // keeping it simple for now and treating it as a neutral/zero sum on the balance 
  // unless explicitly handled by the UI.

  const newBalance = account.balance + balanceChange;

  // 2. Insert transaction and update account balance in a transaction
  await db.execAsync('BEGIN TRANSACTION');
  try {
    await db.runAsync(
      `INSERT INTO transactions (id, account_id, amount, type, merchant, category, date, is_recurring, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.accountId,
        data.amount,
        data.type,
        data.merchant,
        data.category,
        data.date,
        data.isRecurring ? 1 : 0,
        data.note,
      ],
    );

    if (balanceChange !== 0) {
      await db.runAsync('UPDATE accounts SET balance = ? WHERE id = ?', [
        newBalance,
        data.accountId,
      ]);
    }

    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }

  return { id, ...data };
}

export async function updateTransaction(
  id: string,
  data: Partial<Omit<Transaction, 'id'>>,
): Promise<void> {
  const db = getDatabase();
  
  // 1. Fetch the existing transaction
  const oldTx = await db.getFirstAsync<TransactionRow>('SELECT * FROM transactions WHERE id = ?', [id]);
  if (!oldTx) throw new Error('Transaction not found');
  
  // We need to figure out what data is new, falling back to old
  const newAccountId = data.accountId ?? oldTx.account_id;
  const newAmount = data.amount ?? oldTx.amount;
  const newType = data.type ?? oldTx.type;
  
  const oldAccount = await getAccountById(oldTx.account_id);
  const newAccount = newAccountId === oldTx.account_id ? oldAccount : await getAccountById(newAccountId);
  
  await db.execAsync('BEGIN TRANSACTION');
  try {
    // 2. Revert old transaction's effect on old account
    if (oldAccount) {
      let balanceRevert = 0;
      if (oldTx.type === 'income') balanceRevert = -oldTx.amount;
      else if (oldTx.type === 'expense') balanceRevert = oldTx.amount;
      
      if (balanceRevert !== 0) {
        // We do this by updating our in-memory oldAccount so we don't have conflicting writes
        oldAccount.balance += balanceRevert;
        await db.runAsync('UPDATE accounts SET balance = ? WHERE id = ?', [oldAccount.balance, oldAccount.id]);
      }
    }
    
    // 3. Apply new transaction's effect on new account
    if (newAccount) {
      let balanceApply = 0;
      if (newType === 'income') balanceApply = newAmount;
      else if (newType === 'expense') balanceApply = -newAmount;
      
      if (balanceApply !== 0) {
        // If the old account is the same as the new account, we need to apply it to the already reverted balance
        if (newAccount.id === oldAccount?.id) {
            newAccount.balance = oldAccount.balance;
        }
        newAccount.balance += balanceApply;
        await db.runAsync('UPDATE accounts SET balance = ? WHERE id = ?', [newAccount.balance, newAccount.id]);
      }
    }
    
    // 4. Update the transaction row itself
    const sets: string[] = [];
    const params: any[] = [];
    
    if (data.accountId !== undefined) { sets.push('account_id = ?'); params.push(data.accountId); }
    if (data.amount !== undefined) { sets.push('amount = ?'); params.push(data.amount); }
    if (data.type !== undefined) { sets.push('type = ?'); params.push(data.type); }
    if (data.merchant !== undefined) { sets.push('merchant = ?'); params.push(data.merchant); }
    if (data.category !== undefined) { sets.push('category = ?'); params.push(data.category); }
    if (data.date !== undefined) { sets.push('date = ?'); params.push(data.date); }
    if (data.isRecurring !== undefined) { sets.push('is_recurring = ?'); params.push(data.isRecurring ? 1 : 0); }
    if (data.note !== undefined) { sets.push('note = ?'); params.push(data.note); }
    
    if (sets.length > 0) {
      params.push(id);
      await db.runAsync(`UPDATE transactions SET ${sets.join(', ')} WHERE id = ?`, params);
    }
    
    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = getDatabase();
  
  // Need to get the transaction first to revert the account balance
  const txRow = await db.getFirstAsync<TransactionRow>('SELECT * FROM transactions WHERE id = ?', [id]);
  if (!txRow) return;

  const account = await getAccountById(txRow.account_id);
  
  await db.execAsync('BEGIN TRANSACTION');
  try {
    await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
    
    if (account) {
      let balanceRevert = 0;
      if (txRow.type === 'income') balanceRevert = -txRow.amount;
      else if (txRow.type === 'expense') balanceRevert = txRow.amount;
      
      if (balanceRevert !== 0) {
        await db.runAsync('UPDATE accounts SET balance = ? WHERE id = ?', [
          account.balance + balanceRevert,
          txRow.account_id,
        ]);
      }
    }
    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}

export async function getMonthlyTotals(month: number, year: number): Promise<MonthlyTotals> {
  const db = getDatabase();
  
  // Format month to MM
  const monthStr = month.toString().padStart(2, '0');
  const datePrefix = `${year}-${monthStr}`;

  const result = await db.getFirstAsync<{ income: number, expenses: number }>(
    `SELECT 
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expenses
     FROM transactions 
     WHERE date LIKE ?`,
    [`${datePrefix}%`]
  );

  return {
    income: result?.income ?? 0,
    expenses: result?.expenses ?? 0,
  };
}

export async function getMonthlyReports(): Promise<{ datePrefix: string; income: number; expenses: number }[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{ datePrefix: string; income: number; expenses: number }>(
    `SELECT 
      SUBSTR(date, 1, 7) as datePrefix,
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expenses
     FROM transactions 
     GROUP BY SUBSTR(date, 1, 7)
     ORDER BY datePrefix DESC`
  );
  return rows;
}

export async function getTopMerchants(month: number, year: number, limit = 5): Promise<{ merchant: string; total: number }[]> {
  const db = getDatabase();
  const monthStr = month.toString().padStart(2, '0');
  const datePrefix = `${year}-${monthStr}`;

  const rows = await db.getAllAsync<{ merchant: string; total: number }>(
    `SELECT merchant, SUM(amount) as total
     FROM transactions 
     WHERE type = 'expense' AND date LIKE ?
     GROUP BY merchant
     ORDER BY total DESC
     LIMIT ?`,
    [`${datePrefix}%`, limit]
  );
  return rows;
}

export async function getRecurringTransactions(): Promise<TransactionWithAccount[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<TransactionRow>(
    `SELECT t.*, a.name as account_name 
     FROM transactions t
     LEFT JOIN accounts a ON t.account_id = a.id
     WHERE t.is_recurring = 1
     ORDER BY t.date DESC`
  );
  return rows.map(mapRow);
}

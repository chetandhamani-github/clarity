import { getDatabase } from './index';
import { updateAccountBalance, getAccountById } from './account-dao';
import type {
  Transaction,
  TransactionWithAccount,
  TransactionFilters,
  TransactionType,
  MonthlyTotals,
} from '@/types';

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
  splits_json?: string;
  to_account_id?: string;
  account_name?: string; // from JOIN
  to_account_name?: string; // from JOIN
}

function mapRow(row: TransactionRow): TransactionWithAccount {
  let splits;
  if (row.splits_json) {
    try {
      splits = JSON.parse(row.splits_json);
    } catch {
      // ignore
    }
  }

  return {
    id: row.id,
    accountId: row.account_id,
    toAccountId: row.to_account_id,
    amount: row.amount,
    type: row.type as TransactionType,
    merchant: row.merchant,
    category: row.category,
    date: row.date,
    isRecurring: Boolean(row.is_recurring),
    note: row.note,
    splits,
    accountName: row.account_name ?? 'Unknown Account',
    toAccountName: row.to_account_name,
  };
}

export async function getTransactions(
  filters?: TransactionFilters
): Promise<TransactionWithAccount[]> {
  const db = getDatabase();

  let query = `
    SELECT t.*, a.name as account_name, ta.name as to_account_name 
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN accounts ta ON t.to_account_id = ta.id
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

export async function getTransactionById(id: string): Promise<TransactionWithAccount | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<TransactionRow>(
    `SELECT t.*, a.name as account_name, ta.name as to_account_name 
     FROM transactions t
     LEFT JOIN accounts a ON t.account_id = a.id
     LEFT JOIN accounts ta ON t.to_account_id = ta.id
     WHERE t.id = ?`,
    [id]
  );
  return row ? mapRow(row) : null;
}

export interface InsertTransactionOptions {
  updateAccountBalance?: boolean;
}

export async function insertTransaction(
  data: Omit<Transaction, 'id'>,
  options: InsertTransactionOptions = {}
): Promise<Transaction> {
  const db = getDatabase();
  const id = generateId();

  // 1. Get current account to calculate new balance
  const account = await getAccountById(data.accountId);
  if (!account) throw new Error('Account not found');

  let balanceChange = 0;
  if (data.type === 'income') balanceChange = data.amount;
  else if (data.type === 'expense' || data.type === 'transfer') balanceChange = -data.amount;

  const newBalance = account.balance + balanceChange;
  const shouldUpdateAccountBalance = options.updateAccountBalance !== false;

  let toAccount;
  if (data.type === 'transfer') {
    if (!data.toAccountId) throw new Error('Transfer missing destination account');
    toAccount = await getAccountById(data.toAccountId);
    if (!toAccount) throw new Error('Destination account not found');
  }

  // 2. Insert transaction and update account balance in a transaction
  await db.execAsync('BEGIN TRANSACTION');
  try {
    await db.runAsync(
      `INSERT INTO transactions (id, account_id, amount, type, merchant, category, date, is_recurring, note, to_account_id, splits_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        data.toAccountId || null,
        data.splits && data.splits.length > 0 ? JSON.stringify(data.splits) : null,
      ]
    );

    if (shouldUpdateAccountBalance && balanceChange !== 0) {
      await db.runAsync('UPDATE accounts SET balance = ? WHERE id = ?', [
        newBalance,
        data.accountId,
      ]);
    }

    if (shouldUpdateAccountBalance && toAccount && data.toAccountId) {
      const newToBalance = toAccount.balance + data.amount;
      await db.runAsync('UPDATE accounts SET balance = ? WHERE id = ?', [
        newToBalance,
        data.toAccountId,
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
  data: Partial<Omit<Transaction, 'id'>>
): Promise<void> {
  const db = getDatabase();

  // 1. Fetch the existing transaction
  const oldTx = await db.getFirstAsync<TransactionRow>('SELECT * FROM transactions WHERE id = ?', [
    id,
  ]);
  if (!oldTx) throw new Error('Transaction not found');

  // We need to figure out what data is new, falling back to old
  const newAccountId = data.accountId ?? oldTx.account_id;
  const newToAccountId = data.toAccountId !== undefined ? data.toAccountId : oldTx.to_account_id;
  const newAmount = data.amount ?? oldTx.amount;
  const newType = data.type ?? oldTx.type;

  const oldAccount = await getAccountById(oldTx.account_id);
  const newAccount =
    newAccountId === oldTx.account_id ? oldAccount : await getAccountById(newAccountId);

  await db.execAsync('BEGIN TRANSACTION');
  try {
    // 2. Revert old transaction's effect on old account
    if (oldAccount) {
      let balanceRevert = 0;
      if (oldTx.type === 'income') balanceRevert = -oldTx.amount;
      else if (oldTx.type === 'expense' || oldTx.type === 'transfer') balanceRevert = oldTx.amount;

      if (balanceRevert !== 0) {
        oldAccount.balance += balanceRevert;
        await db.runAsync('UPDATE accounts SET balance = ? WHERE id = ?', [
          oldAccount.balance,
          oldAccount.id,
        ]);
      }
    }
    if (oldTx.type === 'transfer' && oldTx.to_account_id) {
      const oldToAccount = await getAccountById(oldTx.to_account_id);
      if (oldToAccount) {
        oldToAccount.balance -= oldTx.amount;
        await db.runAsync('UPDATE accounts SET balance = ? WHERE id = ?', [
          oldToAccount.balance,
          oldToAccount.id,
        ]);
      }
    }

    // 3. Apply new transaction's effect on new account
    if (newAccount) {
      let balanceApply = 0;
      if (newType === 'income') balanceApply = newAmount;
      else if (newType === 'expense' || newType === 'transfer') balanceApply = -newAmount;

      if (balanceApply !== 0) {
        if (newAccount.id === oldAccount?.id) newAccount.balance = oldAccount.balance;
        newAccount.balance += balanceApply;
        await db.runAsync('UPDATE accounts SET balance = ? WHERE id = ?', [
          newAccount.balance,
          newAccount.id,
        ]);
      }
    }
    if (newType === 'transfer' && newToAccountId) {
      const newToAccount = await getAccountById(newToAccountId);
      if (newToAccount) {
        if (newToAccount.id === oldAccount?.id) newToAccount.balance = oldAccount.balance;
        if (newToAccount.id === newAccount?.id) newToAccount.balance = newAccount.balance;
        newToAccount.balance += newAmount;
        await db.runAsync('UPDATE accounts SET balance = ? WHERE id = ?', [
          newToAccount.balance,
          newToAccount.id,
        ]);
      }
    }

    // 4. Update the transaction row itself
    const sets: string[] = [];
    const params: any[] = [];

    if (data.accountId !== undefined) {
      sets.push('account_id = ?');
      params.push(data.accountId);
    }
    if (data.toAccountId !== undefined) {
      sets.push('to_account_id = ?');
      params.push(data.toAccountId);
    }
    if (data.amount !== undefined) {
      sets.push('amount = ?');
      params.push(data.amount);
    }
    if (data.type !== undefined) {
      sets.push('type = ?');
      params.push(data.type);
    }
    if (data.merchant !== undefined) {
      sets.push('merchant = ?');
      params.push(data.merchant);
    }
    if (data.category !== undefined) {
      sets.push('category = ?');
      params.push(data.category);
    }
    if (data.date !== undefined) {
      sets.push('date = ?');
      params.push(data.date);
    }
    if (data.isRecurring !== undefined) {
      sets.push('is_recurring = ?');
      params.push(data.isRecurring ? 1 : 0);
    }
    if (data.note !== undefined) {
      sets.push('note = ?');
      params.push(data.note);
    }
    if (data.splits !== undefined) {
      sets.push('splits_json = ?');
      params.push(data.splits && data.splits.length > 0 ? JSON.stringify(data.splits) : null);
    }

    if (sets.length > 0) {
      params.push(id);
      await db.runAsync(`UPDATE transactions SET ${sets.join(', ')} WHERE id = ?`, params);
    }

    // 5. Sync with goal contributions if this transaction is linked
    if (data.amount !== undefined) {
      const gc = await db.getFirstAsync<any>(
        'SELECT * FROM goal_contributions WHERE transaction_id = ?',
        [id]
      );
      if (gc) {
        const diff = data.amount - oldTx.amount;
        if (diff !== 0) {
          await db.runAsync('UPDATE goal_contributions SET amount = ? WHERE id = ?', [
            data.amount,
            gc.id,
          ]);
          await db.runAsync('UPDATE goals SET current_amount = current_amount + ? WHERE id = ?', [
            diff,
            gc.goal_id,
          ]);
        }
      }
    }

    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = getDatabase();
  const tx = await db.getFirstAsync<TransactionRow>('SELECT * FROM transactions WHERE id = ?', [
    id,
  ]);
  if (!tx) return;

  const account = await getAccountById(tx.account_id);

  await db.execAsync('BEGIN TRANSACTION');
  try {
    // 1. Revert transaction's effect on account
    if (account) {
      let balanceRevert = 0;
      if (tx.type === 'income') balanceRevert = -tx.amount;
      else if (tx.type === 'expense' || tx.type === 'transfer') balanceRevert = tx.amount;

      if (balanceRevert !== 0) {
        account.balance += balanceRevert;
        await db.runAsync('UPDATE accounts SET balance = ? WHERE id = ?', [
          account.balance,
          account.id,
        ]);
      }
    }

    if (tx.type === 'transfer' && tx.to_account_id) {
      const toAccount = await getAccountById(tx.to_account_id);
      if (toAccount) {
        toAccount.balance -= tx.amount;
        await db.runAsync('UPDATE accounts SET balance = ? WHERE id = ?', [
          toAccount.balance,
          toAccount.id,
        ]);
      }
    }

    // 2. Sync with goal contributions if this transaction is linked
    const gc = await db.getFirstAsync<any>(
      'SELECT * FROM goal_contributions WHERE transaction_id = ?',
      [id]
    );
    if (gc) {
      await db.runAsync('DELETE FROM goal_contributions WHERE id = ?', [gc.id]);
      await db.runAsync('UPDATE goals SET current_amount = current_amount - ? WHERE id = ?', [
        gc.amount,
        gc.goal_id,
      ]);
    }

    // 3. Delete the transaction
    await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);

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

  const result = await db.getFirstAsync<{ income: number; expenses: number }>(
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

export async function getMonthlyReports(): Promise<
  { datePrefix: string; income: number; expenses: number }[]
> {
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

export async function getTopMerchants(
  month: number,
  year: number,
  limit = 5
): Promise<{ merchant: string; total: number }[]> {
  const db = getDatabase();
  const monthStr = month.toString().padStart(2, '0');
  const datePrefix = `${year}-${monthStr}`;

  const rows = await db.getAllAsync<{ merchant: string; total: number }>(
    `SELECT merchant, SUM(amount) as total
     FROM transactions 
     WHERE type = 'expense'
       AND date LIKE ?
       AND merchant IS NOT NULL
       AND TRIM(merchant) != ''
       AND LOWER(TRIM(merchant)) NOT LIKE '%transaction'
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

export interface HistoryPoint {
  date: string;
  value: number;
}

export async function getNetWorthHistory(days: number = 30): Promise<HistoryPoint[]> {
  const db = getDatabase();

  // 1. Get current total net worth
  const currentResult = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(balance), 0) as total FROM accounts'
  );
  let currentBalance = currentResult?.total ?? 0;

  // 2. Get all transactions from the last `days` days
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  const transactions = await db.getAllAsync<{ amount: number; type: string; date: string }>(
    `SELECT amount, type, date 
     FROM transactions 
     WHERE date >= ? 
     ORDER BY date DESC`,
    [startDateStr]
  );

  // 3. Build the timeseries backward
  const history: HistoryPoint[] = [];
  const today = new Date();

  // Group transactions by date string (YYYY-MM-DD)
  const txByDate = transactions.reduce(
    (acc, tx) => {
      const d = tx.date.split('T')[0];
      if (!acc[d]) acc[d] = 0;
      // To reverse a transaction: if it was income (added to balance), subtract it.
      // If it was expense (subtracted from balance), add it back.
      if (tx.type === 'income') acc[d] -= tx.amount;
      else if (tx.type === 'expense') acc[d] += tx.amount;
      return acc;
    },
    {} as Record<string, number>
  );

  let runningBalance = currentBalance;

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    // Push the balance for the current day being processed
    history.unshift({ date: dateStr, value: runningBalance });

    // Apply the reverse of transactions that happened on this day to get the balance at the end of the previous day
    if (txByDate[dateStr]) {
      runningBalance += txByDate[dateStr];
    }
  }

  return history;
}

export async function getAccountHistory(
  accountId: string,
  days: number = 30
): Promise<HistoryPoint[]> {
  const db = getDatabase();

  // 1. Get current account balance
  const account = await getAccountById(accountId);
  let currentBalance = account?.balance ?? 0;

  // 2. Get transactions for this account in the last `days` days
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  const transactions = await db.getAllAsync<{
    account_id: string;
    to_account_id?: string;
    amount: number;
    type: string;
    date: string;
  }>(
    `SELECT account_id, to_account_id, amount, type, date 
     FROM transactions 
     WHERE (account_id = ? OR to_account_id = ?) AND date >= ? 
     ORDER BY date DESC`,
    [accountId, accountId, startDateStr]
  );

  // 3. Build timeseries backward
  const history: HistoryPoint[] = [];
  const today = new Date();

  const txByDate = transactions.reduce(
    (acc, tx) => {
      const d = tx.date.split('T')[0];
      if (!acc[d]) acc[d] = 0;

      if (tx.type === 'income') {
        acc[d] -= tx.amount;
      } else if (tx.type === 'expense') {
        acc[d] += tx.amount;
      } else if (tx.type === 'transfer') {
        if (tx.account_id === accountId) {
          // Outgoing transfer (subtracted from balance): to reverse, add it back
          acc[d] += tx.amount;
        } else if (tx.to_account_id === accountId) {
          // Incoming transfer (added to balance): to reverse, subtract it
          acc[d] -= tx.amount;
        }
      }
      return acc;
    },
    {} as Record<string, number>
  );

  let runningBalance = currentBalance;

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    history.unshift({ date: dateStr, value: runningBalance });

    if (txByDate[dateStr]) {
      runningBalance += txByDate[dateStr];
    }
  }

  return history;
}

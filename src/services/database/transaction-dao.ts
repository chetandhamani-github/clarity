import type {
    Account,
    MonthlyTotals,
    Transaction,
    TransactionFilters,
    TransactionSource,
    TransactionStatus,
    TransactionType,
    TransactionWithAccount,
} from '@/types';
import { DeviceEventEmitter } from 'react-native';
import { getLocalTodayYmd, shiftYmdDays } from '@/utils/date';
import { formatLocalDate, parseDateSafely } from '@/utils/format';
import {
  revertLinkedBillsForTransaction,
  resyncRevertedBills,
  type RevertedBillInfo,
} from './bill-dao';
import { getAccountById } from './account-dao';
import { getDatabase } from './index';
import {
  getAllTransactionTagsMap,
  getTagsForTransaction,
  setTransactionTags,
} from './tag-dao';

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
  source?: string;
  status?: string;
  sms_id?: string;
  parsed_tx_id?: string;
  receipt_uri?: string;
  account_name?: string; // from JOIN
  to_account_name?: string; // from JOIN
  created_at?: string;
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
    source: (row.source as TransactionSource) || 'MANUAL',
    status: (row.status as TransactionStatus) || 'VERIFIED',
    smsId: row.sms_id,
    parsedTxId: row.parsed_tx_id,
    receiptUri: row.receipt_uri || undefined,
    accountName: row.account_name ?? 'Unknown Account',
    toAccountName: row.to_account_name,
    createdAt: row.created_at,
  };
}

let schemaEnsured = false;
export async function ensureTransactionsSchema(db: any) {
  if (schemaEnsured) return;
  try {
    const tableInfo = (await db.getAllAsync?.('PRAGMA table_info(transactions)')) as { name: string }[] | undefined;
    const hasCreatedAt = tableInfo?.some((col) => col.name === 'created_at');
    if (tableInfo && !hasCreatedAt) {
      await db.execAsync?.('ALTER TABLE transactions ADD COLUMN created_at TEXT;');
    }
  } catch {
    // Column may already exist or table_info failed
  }

  try {
    // 1. Backfill created_at and date from parsed_transactions for SMS transactions
    await db.execAsync(`
      UPDATE transactions
      SET created_at = (
        SELECT pt.transaction_date
        FROM parsed_transactions pt
        WHERE pt.id = transactions.parsed_tx_id OR pt.transaction_id = transactions.id
        LIMIT 1
      )
      WHERE (created_at IS NULL OR created_at = '')
        AND (parsed_tx_id IS NOT NULL OR id IN (SELECT transaction_id FROM parsed_transactions WHERE transaction_id IS NOT NULL));

      UPDATE transactions
      SET date = (
        SELECT pt.transaction_date
        FROM parsed_transactions pt
        WHERE pt.id = transactions.parsed_tx_id OR pt.transaction_id = transactions.id
        LIMIT 1
      )
      WHERE (date NOT LIKE '%T%' AND date NOT LIKE '% %')
        AND (parsed_tx_id IS NOT NULL OR id IN (SELECT transaction_id FROM parsed_transactions WHERE transaction_id IS NOT NULL))
        AND EXISTS (
          SELECT 1 FROM parsed_transactions pt
          WHERE (pt.id = transactions.parsed_tx_id OR pt.transaction_id = transactions.id)
            AND pt.transaction_date IS NOT NULL
        );
    `);
  } catch {
    // parsed_transactions might not exist in some environments
  }

  try {
    // 2. For transactions where date already has time, copy date to created_at
    await db.execAsync(`
      UPDATE transactions
      SET created_at = date
      WHERE (created_at IS NULL OR created_at = '') AND (date LIKE '%T%' OR date LIKE '% %');
    `);
  } catch {
    // ignore
  }

  try {
    // 3. For any remaining transactions where created_at is still missing:
    // Backfill with date at 12:00:00 + rowid seconds so each has a distinct time and sorts by rowid
    await db.execAsync(`
      UPDATE transactions
      SET created_at = COALESCE(
        datetime(date || ' 12:00:00', '+' || (rowid % 3600) || ' seconds'),
        datetime('now')
      )
      WHERE created_at IS NULL OR created_at = '';
    `);
  } catch {
    // ignore
  }

  try {
    await db.execAsync?.('CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);');
  } catch {
    // ignore
  }

  schemaEnsured = true;
}

const LOCAL_DATE_EXPR_T = `CASE WHEN t.date LIKE '%T%' THEN SUBSTR(date(t.date, 'localtime'), 1, 10) ELSE SUBSTR(t.date, 1, 10) END`;
const LOCAL_MONTH_EXPR_T = `CASE WHEN t.date LIKE '%T%' THEN SUBSTR(date(t.date, 'localtime'), 1, 7) ELSE SUBSTR(t.date, 1, 7) END`;

function buildTransactionsWhereClause(filters?: Omit<TransactionFilters, 'limit' | 'offset'>): {
  whereClause: string;
  params: (string | number)[];
} {
  let whereClause = 'WHERE 1=1';
  const params: (string | number)[] = [];

  if (filters?.accountId) {
    whereClause += ' AND (t.account_id = ? OR t.to_account_id = ?)';
    params.push(filters.accountId, filters.accountId);
  }
  if (filters?.category) {
    whereClause += ' AND t.category = ?';
    params.push(filters.category);
  }
  if (filters?.tag) {
    const cleanTag = filters.tag.trim().toLowerCase().replace(/^#/, '');
    whereClause += ` AND t.id IN (
      SELECT tt.transaction_id 
      FROM transaction_tags tt 
      JOIN tags tg ON tt.tag_id = tg.id 
      WHERE LOWER(tg.name) = ?
    )`;
    params.push(cleanTag);
  }
  if (filters?.type) {
    whereClause += ' AND t.type = ?';
    params.push(filters.type);
  }
  if (filters?.search) {
    whereClause += ' AND (t.merchant LIKE ? OR t.note LIKE ?)';
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters?.dateFrom) {
    const fromStr = filters.dateFrom.includes('T') ? filters.dateFrom.split('T')[0] : filters.dateFrom;
    whereClause += ` AND (${LOCAL_DATE_EXPR_T}) >= ?`;
    params.push(fromStr);
  }
  if (filters?.dateTo) {
    const toStr = filters.dateTo.includes('T') ? filters.dateTo.split('T')[0] : filters.dateTo;
    whereClause += ` AND (${LOCAL_DATE_EXPR_T}) <= ?`;
    params.push(toStr);
  }

  return { whereClause, params };
}

export async function getTransactionsCount(
  filters?: Omit<TransactionFilters, 'limit' | 'offset'>
): Promise<number> {
  const db = getDatabase();
  await ensureTransactionsSchema(db);
  const { whereClause, params } = buildTransactionsWhereClause(filters);
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM transactions t ${whereClause}`,
    params
  );
  return row?.count ?? 0;
}

export async function getTransactions(
  filters?: TransactionFilters
): Promise<TransactionWithAccount[]> {
  const db = getDatabase();
  await ensureTransactionsSchema(db);

  const { whereClause, params } = buildTransactionsWhereClause(filters);
  let query = `
    SELECT t.*, a.name as account_name, ta.name as to_account_name 
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN accounts ta ON t.to_account_id = ta.id
    ${whereClause}
    ORDER BY t.date DESC, t.rowid DESC
  `;

  if (filters?.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
    if (filters?.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }
  }

  const rows = await db.getAllAsync<TransactionRow>(query, params);
  if (rows.length === 0) return [];
  const tagsMap = await getAllTransactionTagsMap();
  return rows.map((row) => ({
    ...mapRow(row),
    tags: tagsMap[row.id] || [],
  }));
}

export async function getTransactionById(id: string): Promise<TransactionWithAccount | null> {
  const db = getDatabase();
  await ensureTransactionsSchema(db);
  const row = await db.getFirstAsync<TransactionRow>(
    `SELECT t.*, a.name as account_name, ta.name as to_account_name 
     FROM transactions t
     LEFT JOIN accounts a ON t.account_id = a.id
     LEFT JOIN accounts ta ON t.to_account_id = ta.id
     WHERE t.id = ?`,
    [id]
  );
  if (!row) return null;
  const tags = await getTagsForTransaction(id);
  return {
    ...mapRow(row),
    tags,
  };
}

export interface InsertTransactionOptions {
  updateAccountBalance?: boolean;
}

export async function insertTransaction(
  data: Omit<Transaction, 'id'>,
  options: InsertTransactionOptions = {}
): Promise<Transaction> {
  const db = getDatabase();
  await ensureTransactionsSchema(db);
  const id = generateId();

  // 1. Get current account to calculate new balance
  const account = await getAccountById(data.accountId);
  if (!account) throw new Error('Account not found');

  let balanceChange = 0;
  if (data.type === 'income') balanceChange = data.amount;
  else if (data.type === 'expense' || data.type === 'transfer') balanceChange = -data.amount;

  const newBalance = Math.round((account.balance + balanceChange) * 100) / 100;
  const shouldUpdateAccountBalance = options.updateAccountBalance !== false;

  let toAccount: Account | null = null;
  if (data.type === 'transfer') {
    if (!data.toAccountId) throw new Error('Transfer missing destination account');
    toAccount = await getAccountById(data.toAccountId);
    if (!toAccount) throw new Error('Destination account not found');
  }

  const source: TransactionSource = data.source || 'MANUAL';
  let status: TransactionStatus =
    data.status || (source === 'MANUAL' ? 'PENDING_MATCH' : 'VERIFIED');

  // 1.5 Evaluate Smart Automation Rules (IFTTT for Finance)
  let finalCategory = data.category;
  let finalNote = data.note;
  const tagsToApply = data.tags ? [...data.tags] : [];

  try {
    const { evaluateSmartRules } = await import('@/services/rules/rules-engine');
    const ruleResult = await evaluateSmartRules(
      {
        merchant: data.merchant,
        amount: data.amount,
        category: data.category,
        accountId: data.accountId,
        note: data.note,
        source,
      },
      source === 'SMS' ? 'sms' : 'manual'
    );

    if (ruleResult.category) finalCategory = ruleResult.category;
    if (ruleResult.note) finalNote = ruleResult.note;
    if (ruleResult.status) status = ruleResult.status as TransactionStatus;
    if (ruleResult.tagsToAdd && ruleResult.tagsToAdd.length > 0) {
      for (const tName of ruleResult.tagsToAdd) {
        const cleanName = tName.trim().replace(/^#/, '');
        if (cleanName && !tagsToApply.includes(cleanName)) {
          tagsToApply.push(cleanName);
        }
      }
    }
  } catch {
    // Smart rules evaluation should not block transaction creation
  }

  // 2. Insert transaction and update account balance atomically
  const createdAt = data.createdAt || new Date().toISOString();
  const executeInsert = async () => {
    try {
      await db.runAsync(
        `INSERT INTO transactions (id, account_id, amount, type, merchant, category, date, is_recurring, note, to_account_id, splits_json, source, status, sms_id, parsed_tx_id, receipt_uri, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          data.accountId,
          data.amount,
          data.type,
          data.merchant,
          finalCategory,
          data.date,
          data.isRecurring ? 1 : 0,
          finalNote,
          data.toAccountId || null,
          data.splits && data.splits.length > 0 ? JSON.stringify(data.splits) : null,
          source,
          status,
          data.smsId || null,
          data.parsedTxId || null,
          data.receiptUri || null,
          createdAt,
        ]
      );
    } catch {
      await db.runAsync(
        `INSERT INTO transactions (id, account_id, amount, type, merchant, category, date, is_recurring, note, to_account_id, splits_json, source, status, sms_id, parsed_tx_id, receipt_uri)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          data.accountId,
          data.amount,
          data.type,
          data.merchant,
          finalCategory,
          data.date,
          data.isRecurring ? 1 : 0,
          finalNote,
          data.toAccountId || null,
          data.splits && data.splits.length > 0 ? JSON.stringify(data.splits) : null,
          source,
          status,
          data.smsId || null,
          data.parsedTxId || null,
          data.receiptUri || null,
        ]
      );
    }

    if (shouldUpdateAccountBalance && balanceChange !== 0) {
      await db.runAsync('UPDATE accounts SET balance = ? WHERE id = ?', [
        newBalance,
        data.accountId,
      ]);
    }

    if (shouldUpdateAccountBalance && toAccount && data.toAccountId) {
      const newToBalance = Math.round((toAccount.balance + data.amount) * 100) / 100;
      await db.runAsync('UPDATE accounts SET balance = ? WHERE id = ?', [
        newToBalance,
        data.toAccountId,
      ]);
    }
  };

  if (typeof db.withTransactionAsync === 'function') {
    await db.withTransactionAsync(executeInsert);
  } else {
    await db.execAsync('BEGIN TRANSACTION');
    try {
      await executeInsert();
      await db.execAsync('COMMIT');
    } catch (error) {
      await db.execAsync('ROLLBACK');
      throw error;
    }
  }

  // Trigger auto-settlement for unpaid bills if this is an expense
  if (data.type === 'expense') {
    // Import dynamically or use BillSettlementEngine
    import('@/modules/sms/services/billSettlementEngine')
      .then(({ BillSettlementEngine }) => {
        BillSettlementEngine.settleBillsForTransaction({
          id,
          amount: data.amount,
          merchant: data.merchant,
          type: data.type,
          date: data.date,
          category: data.category,
        }).catch(() => {});
      })
      .catch(() => {});
  }

  if (tagsToApply.length > 0) {
    try {
      await setTransactionTags(id, tagsToApply);
    } catch {
      // ignore
    }
  }

  return { id, ...data, category: finalCategory, note: finalNote, source, status, createdAt };
}

export async function updateTransaction(
  id: string,
  data: Partial<Omit<Transaction, 'id'>>
): Promise<void> {
  const db = getDatabase();
  await ensureTransactionsSchema(db);

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
  const shouldRevertLinkedBills =
    newType !== 'expense' || Math.abs(newAmount - oldTx.amount) > Math.max(1, oldTx.amount * 0.02);
  let revertedBills: { modernBills: RevertedBillInfo[]; legacyCount: number } = {
    modernBills: [],
    legacyCount: 0,
  };

  const executeUpdate = async () => {
    // 2. Revert old transaction's effect on old account
    if (oldAccount) {
      let balanceRevert = 0;
      if (oldTx.type === 'income') balanceRevert = -oldTx.amount;
      else if (oldTx.type === 'expense' || oldTx.type === 'transfer') balanceRevert = oldTx.amount;

      if (balanceRevert !== 0) {
        oldAccount.balance = Math.round((oldAccount.balance + balanceRevert) * 100) / 100;
        await db.runAsync('UPDATE accounts SET balance = ? WHERE id = ?', [
          oldAccount.balance,
          oldAccount.id,
        ]);
      }
    }
    if (oldTx.type === 'transfer' && oldTx.to_account_id) {
      const oldToAccount = await getAccountById(oldTx.to_account_id);
      if (oldToAccount) {
        oldToAccount.balance = Math.round((oldToAccount.balance - oldTx.amount) * 100) / 100;
        await db.runAsync('UPDATE accounts SET balance = ? WHERE id = ?', [
          oldToAccount.balance,
          oldToAccount.id,
        ]);
      }
    }

    // 3. Apply new transaction's effect on new accounts (fetched post-revert to avoid stale balances)
    const newAccount = await getAccountById(newAccountId);
    if (newAccount) {
      let balanceApply = 0;
      if (newType === 'income') balanceApply = newAmount;
      else if (newType === 'expense' || newType === 'transfer') balanceApply = -newAmount;

      if (balanceApply !== 0) {
        newAccount.balance = Math.round((newAccount.balance + balanceApply) * 100) / 100;
        await db.runAsync('UPDATE accounts SET balance = ? WHERE id = ?', [
          newAccount.balance,
          newAccount.id,
        ]);
      }
    }
    if (newType === 'transfer' && newToAccountId) {
      const newToAccount = await getAccountById(newToAccountId);
      if (newToAccount) {
        newToAccount.balance = Math.round((newToAccount.balance + newAmount) * 100) / 100;
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
    if (data.source !== undefined) {
      sets.push('source = ?');
      params.push(data.source);
    }
    if (data.status !== undefined) {
      sets.push('status = ?');
      params.push(data.status);
    }
    if (data.smsId !== undefined) {
      sets.push('sms_id = ?');
      params.push(data.smsId);
    }
    if (data.parsedTxId !== undefined) {
      sets.push('parsed_tx_id = ?');
      params.push(data.parsedTxId);
    }
    if (data.receiptUri !== undefined) {
      sets.push('receipt_uri = ?');
      params.push(data.receiptUri);
    }
    if (data.createdAt !== undefined) {
      sets.push('created_at = ?');
      params.push(data.createdAt);
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

    if (shouldRevertLinkedBills) {
      revertedBills = await revertLinkedBillsForTransaction(db, id);
    }
  };

  if (typeof db.withTransactionAsync === 'function') {
    await db.withTransactionAsync(executeUpdate);
  } else {
    await db.execAsync('BEGIN TRANSACTION');
    try {
      await executeUpdate();
      await db.execAsync('COMMIT');
    } catch (error) {
      await db.execAsync('ROLLBACK');
      throw error;
    }
  }

  await resyncRevertedBills(revertedBills);

  if (data.tags !== undefined) {
    try {
      await setTransactionTags(id, data.tags);
    } catch {
      // ignore
    }
  }
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = getDatabase();
  const tx = await db.getFirstAsync<TransactionRow>('SELECT * FROM transactions WHERE id = ?', [
    id,
  ]);
  if (!tx) return;

  const account = await getAccountById(tx.account_id);
  let revertedBills: { modernBills: RevertedBillInfo[]; legacyCount: number } = {
    modernBills: [],
    legacyCount: 0,
  };

  const executeDelete = async () => {
    // 1. Revert transaction's effect on account
    if (account) {
      let balanceRevert = 0;
      if (tx.type === 'income') balanceRevert = -tx.amount;
      else if (tx.type === 'expense' || tx.type === 'transfer') balanceRevert = tx.amount;

      if (balanceRevert !== 0) {
        account.balance = Math.round((account.balance + balanceRevert) * 100) / 100;
        await db.runAsync('UPDATE accounts SET balance = ? WHERE id = ?', [
          account.balance,
          account.id,
        ]);
      }
    }

    if (tx.type === 'transfer' && tx.to_account_id) {
      const toAccount = await getAccountById(tx.to_account_id);
      if (toAccount) {
        toAccount.balance = Math.round((toAccount.balance - tx.amount) * 100) / 100;
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

    // 2.5. Revert any bills previously settled by this transaction
    revertedBills = await revertLinkedBillsForTransaction(db, id);

    // 2.6. Mark linked parsed SMS/notification records as user-deleted so they are not re-surfaced on next launch
    try {
      await db.runAsync(
        `UPDATE parsed_transactions
         SET is_duplicate = 1,
             duplicate_of = 'USER_DELETED',
             transaction_id = NULL
         WHERE transaction_id = ? OR (? IS NOT NULL AND id = ?)`,
        [id, tx.parsed_tx_id ?? null, tx.parsed_tx_id ?? null]
      );
    } catch {
      // parsed_transactions table may not exist in isolated unit tests
    }

    // 3. Delete the transaction
    await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
  };

  if (typeof db.withTransactionAsync === 'function') {
    await db.withTransactionAsync(executeDelete);
  } else {
    await db.execAsync('BEGIN TRANSACTION');
    try {
      await executeDelete();
      await db.execAsync('COMMIT');
    } catch (error) {
      await db.execAsync('ROLLBACK');
      throw error;
    }
  }

  await resyncRevertedBills(revertedBills);
}

export async function bulkDeleteTransactions(ids: string[]): Promise<void> {
  for (const id of ids) {
    await deleteTransaction(id);
  }
}

export async function bulkUpdateCategory(ids: string[], category: string): Promise<void> {
  if (ids.length === 0) return;
  const db = getDatabase();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(
    `UPDATE transactions SET category = ? WHERE id IN (${placeholders})`,
    [category, ...ids]
  );
}

export async function bulkUpdateAccount(ids: string[], targetAccountId: string): Promise<void> {
  for (const id of ids) {
    await updateTransaction(id, { accountId: targetAccountId });
  }
}

const LOCAL_MONTH_EXPR = `CASE WHEN date LIKE '%T%' THEN SUBSTR(date(date, 'localtime'), 1, 7) ELSE SUBSTR(date, 1, 7) END`;

export interface DailyTransactionSummary {
  date: string; // YYYY-MM-DD
  income: number;
  expense: number;
  transfer: number;
  count: number;
}

export async function getMonthlyDailyTotals(
  month: number,
  year: number,
  filters?: Omit<TransactionFilters, 'limit' | 'offset' | 'dateFrom' | 'dateTo'>
): Promise<DailyTransactionSummary[]> {
  const db = getDatabase();
  await ensureTransactionsSchema(db);

  const monthStr = month.toString().padStart(2, '0');
  const datePrefix = `${year}-${monthStr}`;
  const { whereClause, params } = buildTransactionsWhereClause(filters);

  const rows = await db.getAllAsync<DailyTransactionSummary>(
    `SELECT
      (${LOCAL_DATE_EXPR_T}) as date,
      COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) as expense,
      COALESCE(SUM(CASE WHEN t.type = 'transfer' THEN t.amount ELSE 0 END), 0) as transfer,
      COUNT(*) as count
     FROM transactions t
     ${whereClause}
       AND (${LOCAL_MONTH_EXPR_T}) = ?
     GROUP BY date
     ORDER BY date ASC`,
    [...params, datePrefix]
  );

  return rows;
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
     WHERE (${LOCAL_MONTH_EXPR}) = ?`,
    [datePrefix]
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
      (${LOCAL_MONTH_EXPR}) as datePrefix,
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expenses
     FROM transactions 
     GROUP BY datePrefix
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
       AND (${LOCAL_MONTH_EXPR}) = ?
       AND merchant IS NOT NULL
       AND TRIM(merchant) != ''
       AND LOWER(TRIM(merchant)) NOT LIKE '%transaction'
     GROUP BY merchant
     ORDER BY total DESC
     LIMIT ?`,
    [datePrefix, limit]
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

  // 1. Get current total net worth (accounts + investment holdings)
  const currentResult = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(balance), 0) as total FROM accounts'
  );
  let holdingsTotal = 0;
  try {
    const holdingsResult = await db.getFirstAsync<{ total: number }>(
      'SELECT COALESCE(SUM(current_value), 0) as total FROM investment_holdings'
    );
    holdingsTotal = holdingsResult?.total ?? 0;
  } catch {
    // Table may not exist before migrations
  }
  const currentBalance = (currentResult?.total ?? 0) + holdingsTotal;

  // 2. Get all transactions from the last `days` days (1-day buffer for UTC-stored timestamps)
  const safeDays = Math.max(1, Math.floor(days));
  const todayStr = getLocalTodayYmd();
  const startDateStr = shiftYmdDays(todayStr, -(safeDays + 1));

  const transactions = await db.getAllAsync<{ amount: number; type: string; date: string }>(
    `SELECT amount, type, date 
     FROM transactions 
     WHERE date >= ? 
     ORDER BY date DESC`,
    [startDateStr]
  );

  // 3. Build the timeseries backward
  const history: HistoryPoint[] = [];

  // Group transactions by local calendar date string (YYYY-MM-DD)
  const txByDate = transactions.reduce(
    (acc, tx) => {
      const d = formatLocalDate(parseDateSafely(tx.date));
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

  for (let i = 0; i < safeDays; i++) {
    const dateStr = shiftYmdDays(todayStr, -i);

    // Push the balance for the current day being processed
    history.unshift({ date: dateStr, value: Math.round(runningBalance * 100) / 100 });

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
  const currentBalance = account?.balance ?? 0;

  // 2. Get transactions for this account in the last `days` days (1-day buffer for UTC-stored timestamps)
  const safeDays = Math.max(1, Math.floor(days));
  const todayStr = getLocalTodayYmd();
  const startDateStr = shiftYmdDays(todayStr, -(safeDays + 1));

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

  // 3. Build timeseries backward using local calendar dates
  const history: HistoryPoint[] = [];

  const txByDate = transactions.reduce(
    (acc, tx) => {
      const d = formatLocalDate(parseDateSafely(tx.date));
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

  for (let i = 0; i < safeDays; i++) {
    const dateStr = shiftYmdDays(todayStr, -i);

    history.unshift({ date: dateStr, value: Math.round(runningBalance * 100) / 100 });

    if (txByDate[dateStr]) {
      runningBalance += txByDate[dateStr];
    }
  }

  return history;
}

export async function findManualMatch(
  accountId: string,
  amount: number,
  type: TransactionType,
  timestampMs: number,
  windowHours: number = 24
): Promise<TransactionWithAccount | null> {
  const db = getDatabase();
  const windowStart = new Date(timestampMs - windowHours * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(timestampMs + 6 * 60 * 60 * 1000).toISOString();

  const rows = await db.getAllAsync<TransactionRow>(
    `SELECT t.*, a.name as account_name, ta.name as to_account_name
     FROM transactions t
     LEFT JOIN accounts a ON t.account_id = a.id
     LEFT JOIN accounts ta ON t.to_account_id = ta.id
     WHERE t.account_id = ?
       AND ABS(t.amount - ?) <= 0.01
       AND t.type = ?
       AND (t.source = 'MANUAL' OR t.status = 'PENDING_MATCH')
       AND (
         t.date BETWEEN ? AND ?
         OR date(t.date) BETWEEN date(?) AND date(?)
       )
     ORDER BY t.date DESC
     LIMIT 10`,
    [accountId, amount, type, windowStart, windowEnd, windowStart, windowEnd]
  );

  if (rows.length === 0) return null;

  // If multiple candidates exist, choose the one closest in time
  let closestRow = rows[0];
  let minDiff = Math.abs(new Date(rows[0].date).getTime() - timestampMs);

  for (let i = 1; i < rows.length; i++) {
    const diff = Math.abs(new Date(rows[i].date).getTime() - timestampMs);
    if (diff < minDiff) {
      minDiff = diff;
      closestRow = rows[i];
    }
  }

  return mapRow(closestRow);
}

export async function mergeManualWithSmsTransaction(
  manualTxId: string,
  smsData: {
    smsId: string;
    parsedTxId: string;
    merchant?: string;
    date?: string;
  }
): Promise<void> {
  const db = getDatabase();
  const existingTx = await getTransactionById(manualTxId);
  if (!existingTx) return;

  const shouldEnrichMerchant =
    smsData.merchant &&
    (!existingTx.merchant ||
      existingTx.merchant.trim() === '' ||
      existingTx.merchant.toLowerCase() === existingTx.category.toLowerCase());

  const sets = ["source = 'SMS'", "status = 'VERIFIED'", 'sms_id = ?', 'parsed_tx_id = ?'];
  const params: any[] = [smsData.smsId, smsData.parsedTxId];

  if (smsData.date) {
    if (!existingTx.date.includes('T')) {
      sets.push('date = ?');
      params.push(smsData.date);
    }
    if (!existingTx.createdAt || !existingTx.createdAt.includes('T')) {
      sets.push('created_at = ?');
      params.push(smsData.date);
    }
  }

  if (shouldEnrichMerchant) {
    sets.push('merchant = ?');
    params.push(smsData.merchant!.trim());
  }

  params.push(manualTxId);
  await db.runAsync(`UPDATE transactions SET ${sets.join(', ')} WHERE id = ?`, params);
}


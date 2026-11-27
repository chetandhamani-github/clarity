import { DuplicateDetectionEngine } from '@/modules/sms/duplicate/duplicateDetectionEngine';
import { deleteReceiptImage } from '@/services/storage/receipt-storage';
import type { Account } from '@/types';
import {
  resyncRevertedBills,
  revertLinkedBillsForTransactions,
  type RevertedBillsSummary,
} from './bill-dao';
import { getDatabase } from './index';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r % 4) + 8;
    return v.toString(16);
  });
}

interface AccountRow {
  id: string;
  name: string;
  type: string;
  balance: number;
  institution: string;
  last_four: string;
  sort_order?: number;
  is_primary?: number;
  billing_cycle_day?: number | null;
  due_day?: number | null;
  credit_limit?: number | null;
  created_at: string;
  updated_at?: string;
}

function mapRow(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type as Account['type'],
    balance: row.balance,
    institution: row.institution,
    lastFour: row.last_four,
    sortOrder: row.sort_order ?? 0,
    isPrimary: Boolean(row.is_primary),
    billingCycleDay: row.billing_cycle_day ?? undefined,
    dueDay: row.due_day ?? undefined,
    creditLimit: row.credit_limit ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

export async function getAllAccounts(): Promise<Account[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<AccountRow>(
    'SELECT * FROM accounts ORDER BY is_primary DESC, sort_order ASC, created_at DESC'
  );
  return rows.map(mapRow);
}

export async function getAccountById(id: string): Promise<Account | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<AccountRow>('SELECT * FROM accounts WHERE id = ?', [id]);
  return row ? mapRow(row) : null;
}

export async function insertAccount(data: Omit<Account, 'id' | 'createdAt'>): Promise<Account> {
  const db = getDatabase();
  const id = generateId();
  const now = new Date().toISOString();
  const updatedAt = data.updatedAt || now;
  const roundedBalance = Math.round((data.balance ?? 0) * 100) / 100;

  let sortOrder = data.sortOrder;
  if (sortOrder === undefined) {
    const maxRow = await db.getFirstAsync<{ max_order: number | null }>(
      'SELECT MAX(sort_order) as max_order FROM accounts'
    );
    sortOrder = (maxRow?.max_order ?? -1) + 1;
  }

  const isPrimary = data.isPrimary ? 1 : 0;
  if (isPrimary) {
    await db.runAsync('UPDATE accounts SET is_primary = 0 WHERE is_primary = 1');
  }

  await db.runAsync(
    `INSERT INTO accounts (id, name, type, balance, institution, last_four, sort_order, is_primary, billing_cycle_day, due_day, credit_limit, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.name,
      data.type,
      roundedBalance,
      data.institution,
      data.lastFour,
      sortOrder,
      isPrimary,
      data.billingCycleDay ?? null,
      data.dueDay ?? null,
      data.creditLimit ?? null,
      now,
      updatedAt,
    ]
  );

  return {
    id,
    ...data,
    balance: roundedBalance,
    sortOrder,
    isPrimary: Boolean(isPrimary),
    createdAt: now,
    updatedAt,
  };
}

export async function updateAccountBalance(id: string, balance: number): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const rounded = Math.round(balance * 100) / 100;
  await db.runAsync('UPDATE accounts SET balance = ?, updated_at = ? WHERE id = ?', [rounded, now, id]);
}

export async function updateAccount(
  id: string,
  data: Partial<Omit<Account, 'id' | 'createdAt'>>
): Promise<void> {
  const db = getDatabase();

  const sets: string[] = [];
  const params: any[] = [];

  if (data.name !== undefined) {
    sets.push('name = ?');
    params.push(data.name);
  }
  if (data.type !== undefined) {
    sets.push('type = ?');
    params.push(data.type);
  }
  if (data.balance !== undefined) {
    sets.push('balance = ?');
    params.push(Math.round(data.balance * 100) / 100);
  }
  if (data.institution !== undefined) {
    sets.push('institution = ?');
    params.push(data.institution);
  }
  if (data.lastFour !== undefined) {
    sets.push('last_four = ?');
    params.push(data.lastFour);
  }
  if (data.sortOrder !== undefined) {
    sets.push('sort_order = ?');
    params.push(data.sortOrder);
  }
  if (data.isPrimary !== undefined) {
    if (data.isPrimary) {
      await db.runAsync('UPDATE accounts SET is_primary = 0 WHERE id != ? AND is_primary = 1', [id]);
    }
    sets.push('is_primary = ?');
    params.push(data.isPrimary ? 1 : 0);
  }
  if (data.billingCycleDay !== undefined) {
    sets.push('billing_cycle_day = ?');
    params.push(data.billingCycleDay);
  }
  if (data.dueDay !== undefined) {
    sets.push('due_day = ?');
    params.push(data.dueDay);
  }
  if (data.creditLimit !== undefined) {
    sets.push('credit_limit = ?');
    params.push(data.creditLimit);
  }

  if (sets.length === 0) return;

  const now = data.updatedAt || new Date().toISOString();
  sets.push('updated_at = ?');
  params.push(now);

  params.push(id);
  await db.runAsync(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`, params);
}

export async function setPrimaryAccount(id: string | null): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  const execute = async () => {
    await db.runAsync('UPDATE accounts SET is_primary = 0, updated_at = ? WHERE is_primary = 1', [now]);
    if (id) {
      await db.runAsync('UPDATE accounts SET is_primary = 1, updated_at = ? WHERE id = ?', [now, id]);
    }
  };

  if (typeof db.withTransactionAsync === 'function') {
    await db.withTransactionAsync(execute);
  } else {
    await db.execAsync('BEGIN TRANSACTION');
    try {
      await execute();
      await db.execAsync('COMMIT');
    } catch (error) {
      await db.execAsync('ROLLBACK');
      throw error;
    }
  }
}

export async function updateAccountsOrder(orderedIds: string[]): Promise<void> {
  const db = getDatabase();
  const executeOrderUpdate = async () => {
    const now = new Date().toISOString();
    for (let i = 0; i < orderedIds.length; i++) {
      await db.runAsync('UPDATE accounts SET sort_order = ?, updated_at = ? WHERE id = ?', [
        i,
        now,
        orderedIds[i],
      ]);
    }
  };

  if (typeof db.withTransactionAsync === 'function') {
    await db.withTransactionAsync(executeOrderUpdate);
  } else {
    await db.execAsync('BEGIN TRANSACTION');
    try {
      await executeOrderUpdate();
      await db.execAsync('COMMIT');
    } catch (error) {
      await db.execAsync('ROLLBACK');
      throw error;
    }
  }
}

const SQLITE_VAR_CHUNK_SIZE = 400;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function revertAccountGoalContributions(
  db: ReturnType<typeof getDatabase>,
  accountId: string
): Promise<void> {
  const contributions =
    (await db.getAllAsync<{ id: string; goal_id: string; amount: number }>(
      `SELECT gc.id, gc.goal_id, gc.amount 
       FROM goal_contributions gc
       JOIN transactions t ON gc.transaction_id = t.id
       WHERE t.account_id = ?`,
      [accountId]
    )) ?? [];

  for (const gc of contributions) {
    await db.runAsync('UPDATE goals SET current_amount = MAX(0, current_amount - ?) WHERE id = ?', [
      gc.amount,
      gc.goal_id,
    ]);
    await db.runAsync('DELETE FROM goal_contributions WHERE id = ?', [gc.id]);
  }
}

export async function clearAccountData(id: string): Promise<void> {
  const db = getDatabase();
  let receiptUris: string[] = [];
  let revertedBills: RevertedBillsSummary = { modernBills: [], legacyCount: 0 };

  const executeClear = async () => {
    const txRows =
      (await db.getAllAsync<{
        id: string;
        parsed_tx_id?: string | null;
        receipt_uri?: string | null;
      }>('SELECT id, parsed_tx_id, receipt_uri FROM transactions WHERE account_id = ?', [id])) ?? [];

    const txIds = txRows.map((row) => row.id);
    const parsedTxIds = Array.from(
      new Set(
        txRows
          .map((row) => row.parsed_tx_id)
          .filter((parsedId): parsedId is string => Boolean(parsedId))
      )
    );
    receiptUris = Array.from(
      new Set(
        txRows
          .map((row) => row.receipt_uri)
          .filter((uri): uri is string => Boolean(uri))
      )
    );

    // 1. Revert linked goal contributions & settled bills before deleting transactions
    await revertAccountGoalContributions(db, id);
    revertedBills = await revertLinkedBillsForTransactions(db, txIds);

    // 2. Mark imported SMS/notification records as user-deleted so they don't re-prompt on next launch
    try {
      for (const chunk of chunkArray(txIds, SQLITE_VAR_CHUNK_SIZE)) {
        const placeholders = chunk.map(() => '?').join(',');
        await db.runAsync(
          `UPDATE parsed_transactions
           SET is_duplicate = 1,
               duplicate_of = 'USER_DELETED',
               transaction_id = NULL
           WHERE transaction_id IN (${placeholders})`,
          chunk
        );
      }
      for (const chunk of chunkArray(parsedTxIds, SQLITE_VAR_CHUNK_SIZE)) {
        const placeholders = chunk.map(() => '?').join(',');
        await db.runAsync(
          `UPDATE parsed_transactions
           SET is_duplicate = 1,
               duplicate_of = 'USER_DELETED',
               transaction_id = NULL
           WHERE id IN (${placeholders})`,
          chunk
        );
      }
    } catch {
      // parsed_transactions table may not exist in isolated unit tests
    }

    // 3. Remove transaction tag mappings, detach incoming transfers, and delete transactions
    try {
      for (const chunk of chunkArray(txIds, SQLITE_VAR_CHUNK_SIZE)) {
        const placeholders = chunk.map(() => '?').join(',');
        await db.runAsync(
          `DELETE FROM transaction_tags WHERE transaction_id IN (${placeholders})`,
          chunk
        );
      }
    } catch {
      // transaction_tags table may not exist in isolated unit tests
    }

    await db.runAsync('UPDATE transactions SET to_account_id = NULL WHERE to_account_id = ?', [id]);
    await db.runAsync('DELETE FROM transactions WHERE account_id = ?', [id]);

    // 4. Delete recurring schedules & unlink investment holdings
    await db.runAsync(
      'DELETE FROM recurring_transactions WHERE to_account_id = ? OR account_id = ?',
      [id, id]
    );

    try {
      await db.runAsync('UPDATE investment_holdings SET account_id = NULL WHERE account_id = ?', [
        id,
      ]);
    } catch {
      // investment_holdings table may not exist in isolated unit tests
    }

    // 5. Reset the account balance while preserving account metadata
    const now = new Date().toISOString();
    await db.runAsync('UPDATE accounts SET balance = 0, updated_at = ? WHERE id = ?', [now, id]);
  };

  if (typeof db.withTransactionAsync === 'function') {
    await db.withTransactionAsync(executeClear);
  } else {
    await db.execAsync('BEGIN TRANSACTION');
    try {
      await executeClear();
      await db.execAsync('COMMIT');
    } catch (error) {
      await db.execAsync('ROLLBACK');
      throw error;
    }
  }

  await resyncRevertedBills(revertedBills);

  if (receiptUris.length > 0) {
    try {
      await Promise.all(receiptUris.map((uri) => deleteReceiptImage(uri)));
    } catch {
      // Ignore receipt file cleanup failures
    }
  }

  try {
    DuplicateDetectionEngine.clearCache();
  } catch {
    // Ignore in isolated environments
  }
}

export async function deleteAccount(id: string): Promise<void> {
  const db = getDatabase();
  const executeDelete = async () => {
    // 1. Revert and clean up goal contributions linked to this account's transactions
    await revertAccountGoalContributions(db, id);

    await db.runAsync('UPDATE transactions SET to_account_id = NULL WHERE to_account_id = ?', [id]);
    await db.runAsync('DELETE FROM recurring_transactions WHERE to_account_id = ? OR account_id = ?', [id, id]);
    await db.runAsync('DELETE FROM accounts WHERE id = ?', [id]);
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
}

export async function getTotalBalance(): Promise<number> {
  const db = getDatabase();
  const result = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(balance), 0) as total FROM accounts'
  );
  return result?.total ?? 0;
}

export async function getAccountCount(): Promise<number> {
  const db = getDatabase();
  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM accounts'
  );
  return result?.count ?? 0;
}

import type { Account } from '@/types';
import { getDatabase } from './index';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
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
    'SELECT * FROM accounts ORDER BY sort_order ASC, created_at DESC'
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

  await db.runAsync(
    `INSERT INTO accounts (id, name, type, balance, institution, last_four, sort_order, billing_cycle_day, due_day, credit_limit, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.name,
      data.type,
      roundedBalance,
      data.institution,
      data.lastFour,
      sortOrder,
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

export async function deleteAccount(id: string): Promise<void> {
  const db = getDatabase();
  const executeDelete = async () => {
    // 1. Revert and clean up goal contributions linked to this account's transactions
    const contributions = await db.getAllAsync<{ id: string; goal_id: string; amount: number }>(
      `SELECT gc.id, gc.goal_id, gc.amount 
       FROM goal_contributions gc
       JOIN transactions t ON gc.transaction_id = t.id
       WHERE t.account_id = ?`,
      [id]
    );
    for (const gc of contributions) {
      await db.runAsync('UPDATE goals SET current_amount = MAX(0, current_amount - ?) WHERE id = ?', [
        gc.amount,
        gc.goal_id,
      ]);
      await db.runAsync('DELETE FROM goal_contributions WHERE id = ?', [gc.id]);
    }

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

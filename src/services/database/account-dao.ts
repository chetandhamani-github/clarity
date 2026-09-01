import { getDatabase } from './index';
import type { Account } from '@/types';

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
  created_at: string;
}

function mapRow(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type as Account['type'],
    balance: row.balance,
    institution: row.institution,
    lastFour: row.last_four,
    createdAt: row.created_at,
  };
}

export async function getAllAccounts(): Promise<Account[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<AccountRow>('SELECT * FROM accounts ORDER BY created_at DESC');
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

  await db.runAsync(
    `INSERT INTO accounts (id, name, type, balance, institution, last_four, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, data.name, data.type, data.balance, data.institution, data.lastFour, now]
  );

  return {
    id,
    ...data,
    createdAt: now,
  };
}

export async function updateAccountBalance(id: string, balance: number): Promise<void> {
  const db = getDatabase();
  await db.runAsync('UPDATE accounts SET balance = ? WHERE id = ?', [balance, id]);
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
    params.push(data.balance);
  }
  if (data.institution !== undefined) {
    sets.push('institution = ?');
    params.push(data.institution);
  }
  if (data.lastFour !== undefined) {
    sets.push('last_four = ?');
    params.push(data.lastFour);
  }

  if (sets.length === 0) return;

  params.push(id);
  await db.runAsync(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`, params);
}

export async function deleteAccount(id: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM accounts WHERE id = ?', [id]);
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

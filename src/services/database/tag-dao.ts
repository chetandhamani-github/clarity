import type { Tag } from '@/types';
import { getDatabase } from './index';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface TagRow {
  id: string;
  name: string;
  color: string | null;
  created_at: number;
}

function mapTagRow(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color || undefined,
    createdAt: row.created_at,
  };
}

export async function getAllTags(): Promise<Tag[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<TagRow>('SELECT * FROM tags ORDER BY name ASC');
  return rows.map(mapTagRow);
}

export async function getOrCreateTag(name: string, color?: string): Promise<Tag> {
  const db = getDatabase();
  const cleanName = name.trim().toLowerCase().replace(/^#/, '');
  if (!cleanName) throw new Error('Tag name cannot be empty');

  const existing = await db.getFirstAsync<TagRow>('SELECT * FROM tags WHERE LOWER(name) = ?', [cleanName]);
  if (existing) {
    return mapTagRow(existing);
  }

  const id = generateId();
  const now = Math.floor(Date.now() / 1000);
  await db.runAsync(
    'INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)',
    [id, cleanName, color || null, now]
  );

  return {
    id,
    name: cleanName,
    color,
    createdAt: now,
  };
}

export async function setTransactionTags(transactionId: string, tagNames: string[]): Promise<void> {
  const db = getDatabase();

  // Clear existing tags for this transaction
  await db.runAsync('DELETE FROM transaction_tags WHERE transaction_id = ?', [transactionId]);

  if (!tagNames || tagNames.length === 0) return;

  for (const rawName of tagNames) {
    const tag = await getOrCreateTag(rawName);
    await db.runAsync(
      'INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)',
      [transactionId, tag.id]
    );
  }
}

export async function getTagsForTransaction(transactionId: string): Promise<string[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{ name: string }>(
    `SELECT t.name 
     FROM tags t
     JOIN transaction_tags tt ON t.id = tt.tag_id
     WHERE tt.transaction_id = ?
     ORDER BY t.name ASC`,
    [transactionId]
  );
  return rows.map((r) => r.name);
}

export async function getAllTransactionTagsMap(): Promise<Record<string, string[]>> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{ transaction_id: string; name: string }>(
    `SELECT tt.transaction_id, t.name
     FROM transaction_tags tt
     JOIN tags t ON tt.tag_id = t.id
     ORDER BY t.name ASC`
  );

  const map: Record<string, string[]> = {};
  for (const row of rows) {
    if (!map[row.transaction_id]) {
      map[row.transaction_id] = [];
    }
    map[row.transaction_id].push(row.name);
  }
  return map;
}

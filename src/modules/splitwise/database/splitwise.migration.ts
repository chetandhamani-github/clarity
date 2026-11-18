import type * as SQLite from 'expo-sqlite';
import {
  CREATE_ALL_SPLITWISE_SCHEMA_SQL,
  DROP_ALL_SPLITWISE_TABLES_SQL,
} from './splitwise.schema';

/**
 * Runs migration to create all Splitwise tables and indexes if they do not exist.
 */
export async function runSplitwiseMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(CREATE_ALL_SPLITWISE_SCHEMA_SQL);
  try {
    await db.execAsync("ALTER TABLE splitwise_settlements ADD COLUMN settlement_type TEXT DEFAULT 'THEY_PAID';");
  } catch {
    // Column already exists or table freshly created with column
  }
  try {
    await db.execAsync('ALTER TABLE splitwise_people ADD COLUMN email TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE splitwise_debts ADD COLUMN friend_email TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE splitwise_debts ADD COLUMN group_id TEXT REFERENCES splitwise_groups(id) ON DELETE SET NULL;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE splitwise_settlements ADD COLUMN friend_email TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE splitwise_settlements ADD COLUMN group_id TEXT REFERENCES splitwise_groups(id) ON DELETE SET NULL;');
  } catch {}
}

/**
 * Drops all Splitwise tables. Used during database reset/clear operations.
 */
export async function dropSplitwiseTables(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(DROP_ALL_SPLITWISE_TABLES_SQL);
}

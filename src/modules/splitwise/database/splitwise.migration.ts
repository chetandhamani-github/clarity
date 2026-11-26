import type * as SQLite from 'expo-sqlite';
import {
  CREATE_ALL_SPLITWISE_TABLES_SQL,
  CREATE_SPLITWISE_INDEXES_SQL,
  DROP_ALL_SPLITWISE_TABLES_SQL,
} from './splitwise.schema';

/**
 * Runs migration to create all Splitwise tables and indexes if they do not exist.
 */
export async function runSplitwiseMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  // 1. Create base tables
  await db.execAsync(CREATE_ALL_SPLITWISE_TABLES_SQL);

  // 2. Safely add missing columns for existing databases
  try {
    await db.execAsync("ALTER TABLE splitwise_settlements ADD COLUMN settlement_type TEXT DEFAULT 'THEY_PAID';");
  } catch {}
  try {
    await db.execAsync('ALTER TABLE splitwise_people ADD COLUMN email TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE splitwise_people ADD COLUMN phone TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE splitwise_people ADD COLUMN notes TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE splitwise_debts ADD COLUMN friend_email TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE splitwise_debts ADD COLUMN group_id TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE splitwise_settlements ADD COLUMN friend_email TEXT;');
  } catch {}
  try {
    await db.execAsync('ALTER TABLE splitwise_settlements ADD COLUMN group_id TEXT;');
  } catch {}

  // 3. Create all indexes after columns are guaranteed to exist
  try {
    await db.execAsync(CREATE_SPLITWISE_INDEXES_SQL);
  } catch {}
}

/**
 * Drops all Splitwise tables. Used during database reset/clear operations.
 */
export async function dropSplitwiseTables(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(DROP_ALL_SPLITWISE_TABLES_SQL);
}

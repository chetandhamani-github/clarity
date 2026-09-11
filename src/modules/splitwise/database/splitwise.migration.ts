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
}

/**
 * Drops all Splitwise tables. Used during database reset/clear operations.
 */
export async function dropSplitwiseTables(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(DROP_ALL_SPLITWISE_TABLES_SQL);
}

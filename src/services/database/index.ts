import * as SQLite from 'expo-sqlite';
import { runMigrations } from './migrations';
import { seedDatabase } from './seed';

let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  db = await SQLite.openDatabaseAsync('clarity.db');
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  
  await runMigrations(db);
  await seedDatabase(db);

  return db;
}

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error(
      'Database not initialized. Call initDatabase() first.',
    );
  }
  return db;
}

export async function clearDatabase(): Promise<void> {
  if (!db) return;
  // Drop tables
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  await db.execAsync(`
    DROP TABLE IF EXISTS goal_contributions;
    DROP TABLE IF EXISTS goals;
    DROP TABLE IF EXISTS budget_categories;
    DROP TABLE IF EXISTS budget_plans;
    DROP TABLE IF EXISTS recurring_transactions;
    DROP TABLE IF EXISTS transactions;
    DROP TABLE IF EXISTS accounts;
    DROP TABLE IF EXISTS notifications;
  `);
  await db.execAsync('PRAGMA foreign_keys = ON;');
  // Re-run migrations and seeds
  await runMigrations(db);
  await seedDatabase(db);
}

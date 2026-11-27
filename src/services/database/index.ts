import * as SQLite from 'expo-sqlite';
import { runMigrations } from './migrations';
import { seedDatabase } from './seed';

let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  db = await SQLite.openDatabaseAsync('clarity.db');
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync('PRAGMA busy_timeout = 5000;');

  await runMigrations(db);
  await seedDatabase(db);

  return db;
}

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export async function clearDatabase(): Promise<void> {
  const activeDb = db ?? (await initDatabase());
  if (!activeDb) return;

  await activeDb.execAsync('PRAGMA foreign_keys = OFF;');

  try {
    const userObjects = await activeDb.getAllAsync<{ name: string; type: string }>(
      "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%';"
    );
    for (const obj of userObjects) {
      if (obj.type === 'view') {
        await activeDb.execAsync(`DROP VIEW IF EXISTS "${obj.name}";`);
      } else {
        await activeDb.execAsync(`DROP TABLE IF EXISTS "${obj.name}";`);
      }
    }
  } catch {
    // Fallback to static drops below
  }

  // Static fallback drops to guarantee all known tables are purged
  await activeDb.execAsync(`
    DROP TABLE IF EXISTS splitwise_expense_splits;
    DROP TABLE IF EXISTS splitwise_expenses;
    DROP TABLE IF EXISTS splitwise_group_members;
    DROP TABLE IF EXISTS splitwise_groups;
    DROP TABLE IF EXISTS splitwise_settlements;
    DROP TABLE IF EXISTS splitwise_debts;
    DROP TABLE IF EXISTS splitwise_people;
    DROP TABLE IF EXISTS investment_holdings;
    DROP TABLE IF EXISTS reminders;
    DROP TABLE IF EXISTS subscriptions;
    DROP TABLE IF EXISTS bills;
    DROP TABLE IF EXISTS bill_reminders;
    DROP TABLE IF EXISTS sms_review_queue;
    DROP TABLE IF EXISTS sms_patterns;
    DROP TABLE IF EXISTS parsed_transactions;
    DROP TABLE IF EXISTS sms_messages;
    DROP TABLE IF EXISTS goal_contributions;
    DROP TABLE IF EXISTS goals;
    DROP TABLE IF EXISTS budget_categories;
    DROP TABLE IF EXISTS budget_plans;
    DROP TABLE IF EXISTS recurring_transactions;
    DROP TABLE IF EXISTS transaction_tags;
    DROP TABLE IF EXISTS tags;
    DROP TABLE IF EXISTS transactions;
    DROP TABLE IF EXISTS accounts;
    DROP TABLE IF EXISTS notifications_new;
    DROP TABLE IF EXISTS notifications;
    DROP TABLE IF EXISTS merchant_category_rules;
    DROP TABLE IF EXISTS smart_rules;
  `);

  await activeDb.execAsync('PRAGMA foreign_keys = ON;');

  // Re-run migrations and seeds
  await runMigrations(activeDb);
  await seedDatabase(activeDb);
}

import type * as SQLite from 'expo-sqlite';

export async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('savings', 'current', 'credit', 'investment', 'wallet', 'checking')),
      balance REAL NOT NULL DEFAULT 0,
      institution TEXT NOT NULL DEFAULT '',
      last_four TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY NOT NULL,
      account_id TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('expense', 'income', 'transfer')),
      merchant TEXT NOT NULL,
      category TEXT NOT NULL,
      date TEXT NOT NULL,
      is_recurring INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'flag',
      target_amount REAL NOT NULL,
      current_amount REAL NOT NULL DEFAULT 0,
      target_date TEXT NOT NULL,
      auto_save_amount REAL NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS goal_contributions (
      id TEXT PRIMARY KEY NOT NULL,
      goal_id TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS budget_plans (
      id TEXT PRIMARY KEY NOT NULL,
      monthly_income REAL NOT NULL,
      needs_percent REAL NOT NULL DEFAULT 50,
      wants_percent REAL NOT NULL DEFAULT 30,
      savings_percent REAL NOT NULL DEFAULT 20,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      UNIQUE(month, year)
    );

    CREATE TABLE IF NOT EXISTS budget_categories (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'category',
      budget_limit REAL NOT NULL DEFAULT 0,
      bucket_type TEXT NOT NULL CHECK(bucket_type IN ('needs', 'wants', 'savings')),
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('alert', 'milestone', 'default')) DEFAULT 'default',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      action_url TEXT NOT NULL DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
    CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_goal_contributions_goal ON goal_contributions(goal_id);
    CREATE INDEX IF NOT EXISTS idx_budget_plans_month_year ON budget_plans(month, year);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
  `);

  try {
    await db.execAsync('ALTER TABLE goal_contributions ADD COLUMN transaction_id TEXT;');
  } catch (e) {
    // Column might already exist, ignore error
  }

  try {
    await db.execAsync('ALTER TABLE transactions ADD COLUMN to_account_id TEXT;');
  } catch (e) {
    // Column might already exist, ignore error
  }

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS recurring_transactions (
      id TEXT PRIMARY KEY NOT NULL,
      account_id TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('expense', 'income', 'transfer')),
      merchant TEXT NOT NULL,
      category TEXT NOT NULL,
      frequency TEXT NOT NULL CHECK(frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
      next_process_date TEXT NOT NULL,
      last_processed_date TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      to_account_id TEXT,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
  `);
}

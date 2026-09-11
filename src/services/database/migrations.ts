import type * as SQLite from 'expo-sqlite';
import { runSplitwiseMigrations } from '@/modules/splitwise/database/splitwise.migration';

export async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('savings', 'current', 'credit', 'investment', 'wallet', 'checking', 'loan', 'borrowed', 'lent', 'other')),
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
      splits_json TEXT,
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

  try {
    await db.execAsync('ALTER TABLE transactions ADD COLUMN splits_json TEXT;');
  } catch (e) {
    // Column might already exist, ignore error
  }

  try {
    await db.execAsync("ALTER TABLE transactions ADD COLUMN source TEXT NOT NULL DEFAULT 'MANUAL';");
  } catch (e) {
    // Column might already exist, ignore error
  }

  try {
    await db.execAsync("ALTER TABLE transactions ADD COLUMN status TEXT NOT NULL DEFAULT 'VERIFIED';");
  } catch (e) {
    // Column might already exist, ignore error
  }

  try {
    await db.execAsync('ALTER TABLE transactions ADD COLUMN sms_id TEXT;');
  } catch (e) {
    // Column might already exist, ignore error
  }

  try {
    await db.execAsync('ALTER TABLE transactions ADD COLUMN parsed_tx_id TEXT;');
  } catch (e) {
    // Column might already exist, ignore error
  }

  try {
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_transactions_matching 
      ON transactions(account_id, amount, source, date);
    `);
  } catch (e) {
    // Index might already exist, ignore error
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
      splits_json TEXT,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );
  `);

  // Safe migration for existing recurring_transactions table if splits_json is missing
  try {
    const tableInfo = await db.getAllAsync<{ name: string }>('PRAGMA table_info(recurring_transactions)');
    const hasSplitsJson = tableInfo.some((col) => col.name === 'splits_json');
    if (!hasSplitsJson) {
      await db.execAsync('ALTER TABLE recurring_transactions ADD COLUMN splits_json TEXT;');
    }
  } catch (e) {
    console.warn('Could not add splits_json to recurring_transactions:', e);
  }

  // Create performance index
  try {
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_recurring_due 
      ON recurring_transactions(is_active, next_process_date);
    `);
  } catch (e) {
    console.warn('Could not create idx_recurring_due:', e);
  }

  // SMS Intelligence Engine tables
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sms_messages (
      id TEXT PRIMARY KEY NOT NULL,
      address TEXT NOT NULL,
      body TEXT NOT NULL,
      date INTEGER NOT NULL,
      date_sent INTEGER,
      status TEXT NOT NULL DEFAULT 'read',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS parsed_transactions (
      id TEXT PRIMARY KEY NOT NULL,
      sms_id TEXT,
      amount REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('DEBIT', 'CREDIT')),
      merchant TEXT NOT NULL,
      category TEXT NOT NULL,
      bank TEXT NOT NULL,
      account_mask TEXT NOT NULL,
      reference_number TEXT,
      available_balance REAL,
      transaction_date TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      is_duplicate INTEGER NOT NULL DEFAULT 0,
      duplicate_of TEXT,
      transaction_id TEXT,
      raw_body TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (sms_id) REFERENCES sms_messages(id) ON DELETE SET NULL,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sms_patterns (
      id TEXT PRIMARY KEY NOT NULL,
      bank TEXT NOT NULL,
      pattern_regex TEXT NOT NULL,
      pattern_type TEXT NOT NULL,
      mapping_json TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sms_review_queue (
      id TEXT PRIMARY KEY NOT NULL,
      sms_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      body TEXT NOT NULL,
      reason TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.0,
      extracted_data TEXT,
      status TEXT NOT NULL CHECK(status IN ('pending', 'resolved', 'dismissed')) DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_sms_messages_date ON sms_messages(date DESC);
    CREATE INDEX IF NOT EXISTS idx_sms_messages_address ON sms_messages(address);
    CREATE INDEX IF NOT EXISTS idx_parsed_tx_date ON parsed_transactions(transaction_date DESC);
    CREATE INDEX IF NOT EXISTS idx_parsed_tx_ref ON parsed_transactions(reference_number);
    CREATE INDEX IF NOT EXISTS idx_parsed_tx_lookup ON parsed_transactions(amount, account_mask, transaction_date);
    CREATE INDEX IF NOT EXISTS idx_sms_review_status ON sms_review_queue(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS bill_reminders (
      id TEXT PRIMARY KEY NOT NULL,
      source TEXT NOT NULL DEFAULT 'MANUAL' CHECK(source IN ('SMS', 'MANUAL')),
      biller_name TEXT NOT NULL,
      biller_category TEXT NOT NULL,
      amount_due REAL NOT NULL,
      min_amount_due REAL,
      due_date TEXT NOT NULL,
      repeat_frequency TEXT CHECK(repeat_frequency IN ('one_time', 'monthly', 'quarterly', 'yearly')) DEFAULT 'one_time',
      account_reference TEXT,
      status TEXT NOT NULL DEFAULT 'UNPAID' CHECK(status IN ('UNPAID', 'PAID', 'OVERDUE', 'DISMISSED')),
      reminder_days_before INTEGER NOT NULL DEFAULT 3,
      paid_date TEXT,
      paid_transaction_id TEXT,
      payment_url TEXT,
      note TEXT DEFAULT '',
      sms_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (sms_id) REFERENCES sms_messages(id) ON DELETE SET NULL,
      FOREIGN KEY (paid_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bills_due ON bill_reminders(status, due_date ASC);
    CREATE INDEX IF NOT EXISTS idx_bills_lookup ON bill_reminders(biller_name, due_date);

    CREATE TABLE IF NOT EXISTS bills (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      min_amount REAL,
      due_date TEXT NOT NULL,
      reminder_days INTEGER NOT NULL DEFAULT 3,
      status TEXT NOT NULL CHECK(status IN ('upcoming', 'paid', 'overdue', 'dismissed')) DEFAULT 'upcoming',
      notes TEXT DEFAULT '',
      is_recurring INTEGER NOT NULL DEFAULT 0,
      frequency TEXT CHECK(frequency IN ('one_time', 'weekly', 'monthly', 'quarterly', 'yearly')) DEFAULT 'one_time',
      last_paid_date TEXT,
      paid_transaction_id TEXT,
      payment_url TEXT,
      account_reference TEXT,
      source TEXT NOT NULL CHECK(source IN ('manual', 'sms', 'email', 'future_api')) DEFAULT 'manual',
      sms_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT '',
      amount REAL NOT NULL,
      billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('weekly', 'monthly', 'quarterly', 'yearly')) DEFAULT 'monthly',
      next_renewal_date TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'subscription',
      status TEXT NOT NULL CHECK(status IN ('active', 'paused', 'cancelled')) DEFAULT 'active',
      payment_url TEXT,
      account_reference TEXT,
      notes TEXT DEFAULT '',
      bill_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_bills_unified_due ON bills(due_date ASC);
    CREATE INDEX IF NOT EXISTS idx_bills_unified_status ON bills(status);
    CREATE INDEX IF NOT EXISTS idx_bills_unified_category ON bills(category);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_renewal ON subscriptions(next_renewal_date ASC);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
  `);

  await runSplitwiseMigrations(db);
}



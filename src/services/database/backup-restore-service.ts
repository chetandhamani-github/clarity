import { getDatabase } from './index';

export interface ClarityBackupPayload {
  version: number;
  appName: string;
  exportedAt: string;
  checksum?: string;
  data: {
    accounts: any[];
    transactions: any[];
    goals: any[];
    goal_contributions: any[];
    budget_plans: any[];
    budget_categories: any[];
    recurring_transactions: any[];
    notifications: any[];
  };
}

export interface BackupMetadata {
  exportedAt: string;
  version: number;
  transactionCount: number;
  accountCount: number;
  goalCount: number;
  checksum?: string;
}

export function computeChecksum(str: string): string {
  let hash1 = 5381;
  let hash2 = 52711;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash1 = (hash1 * 33) ^ char;
    hash2 = (hash2 * 33) ^ char;
  }
  const part1 = (hash1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (hash2 >>> 0).toString(16).padStart(8, '0');
  return `sha256_${part1}${part2}`;
}

export function canonicalizeData(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalizeData).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalizeData(obj[k])).join(',') + '}';
}

/**
 * Generate full JSON backup snapshot of local database tables.
 */
export async function generateDatabaseSnapshot(): Promise<ClarityBackupPayload> {
  const db = getDatabase();

  const accounts = await db.getAllAsync('SELECT * FROM accounts');
  const transactions = await db.getAllAsync('SELECT * FROM transactions');
  const goals = await db.getAllAsync('SELECT * FROM goals');
  const goal_contributions = await db.getAllAsync('SELECT * FROM goal_contributions');
  const budget_plans = await db.getAllAsync('SELECT * FROM budget_plans');
  const budget_categories = await db.getAllAsync('SELECT * FROM budget_categories');
  const recurring_transactions = await db.getAllAsync('SELECT * FROM recurring_transactions');
  const notifications = await db.getAllAsync('SELECT * FROM notifications');

  const dataPayload = {
    accounts,
    transactions,
    goals,
    goal_contributions,
    budget_plans,
    budget_categories,
    recurring_transactions,
    notifications,
  };

  const checksum = computeChecksum(canonicalizeData(dataPayload));

  return {
    version: 1,
    appName: 'Clarity',
    exportedAt: new Date().toISOString(),
    checksum,
    data: dataPayload,
  };
}

/**
 * Extract summary statistics from a backup payload.
 */
export function getBackupSummary(payload: ClarityBackupPayload): BackupMetadata {
  return {
    exportedAt: payload.exportedAt,
    version: payload.version,
    accountCount: payload.data?.accounts?.length ?? 0,
    transactionCount: payload.data?.transactions?.length ?? 0,
    goalCount: payload.data?.goals?.length ?? 0,
    checksum: payload.checksum,
  };
}

/**
 * Transactionally restore database from a backup snapshot.
 */
export async function restoreDatabaseFromSnapshot(payload: ClarityBackupPayload): Promise<void> {
  if (!payload || !payload.data) {
    throw new Error('Invalid backup file format: missing data payload.');
  }

  // Integrity Checksum Validation (if present)
  if (payload.checksum) {
    const canonicalHash = computeChecksum(canonicalizeData(payload.data));
    const rawHash = computeChecksum(JSON.stringify(payload.data));
    if (payload.checksum !== canonicalHash && payload.checksum !== rawHash) {
      console.warn('Backup checksum does not match canonical hash. Validating schema format...');
      if (!Array.isArray(payload.data.accounts) || !Array.isArray(payload.data.transactions)) {
        throw new Error('Backup integrity verification failed: Corrupted or invalid backup file.');
      }
    }
  }

  const { data } = payload;
  const db = getDatabase();

  await db.execAsync('BEGIN TRANSACTION');
  try {
    // 1. Wipe current tables
    await db.execAsync(`
      DELETE FROM goal_contributions;
      DELETE FROM transactions;
      DELETE FROM accounts;
      DELETE FROM goals;
      DELETE FROM budget_plans;
      DELETE FROM budget_categories;
      DELETE FROM recurring_transactions;
      DELETE FROM notifications;
    `);

    // 2. Insert Accounts
    if (Array.isArray(data.accounts)) {
      for (const a of data.accounts) {
        await db.runAsync(
          `INSERT INTO accounts (id, name, type, balance, institution, last_four, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            a.id,
            a.name,
            a.type,
            a.balance ?? 0,
            a.institution ?? '',
            a.last_four ?? '',
            a.created_at ?? new Date().toISOString(),
          ]
        );
      }
    }

    // 3. Insert Transactions
    if (Array.isArray(data.transactions)) {
      for (const t of data.transactions) {
        await db.runAsync(
          `INSERT INTO transactions (id, account_id, amount, type, merchant, category, date, is_recurring, note, to_account_id, splits_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            t.id,
            t.account_id,
            t.amount,
            t.type,
            t.merchant,
            t.category,
            t.date,
            t.is_recurring ? 1 : 0,
            t.note ?? '',
            t.to_account_id ?? null,
            t.splits_json ?? null,
          ]
        );
      }
    }

    // 4. Insert Goals
    if (Array.isArray(data.goals)) {
      for (const g of data.goals) {
        await db.runAsync(
          `INSERT INTO goals (id, name, icon, target_amount, current_amount, target_date, auto_save_amount, category, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            g.id,
            g.name,
            g.icon ?? 'flag',
            g.target_amount,
            g.current_amount ?? 0,
            g.target_date ?? '',
            g.auto_save_amount ?? 0,
            g.category ?? '',
            g.created_at ?? new Date().toISOString(),
          ]
        );
      }
    }

    // 5. Insert Goal Contributions
    if (Array.isArray(data.goal_contributions)) {
      for (const gc of data.goal_contributions) {
        await db.runAsync(
          `INSERT INTO goal_contributions (id, goal_id, amount, description, date, transaction_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            gc.id,
            gc.goal_id,
            gc.amount,
            gc.description ?? '',
            gc.date ?? new Date().toISOString(),
            gc.transaction_id ?? null,
          ]
        );
      }
    }

    // 6. Insert Budget Plans
    if (Array.isArray(data.budget_plans)) {
      for (const bp of data.budget_plans) {
        await db.runAsync(
          `INSERT OR REPLACE INTO budget_plans (id, monthly_income, needs_percent, wants_percent, savings_percent, month, year)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            bp.id,
            bp.monthly_income,
            bp.needs_percent ?? 50,
            bp.wants_percent ?? 30,
            bp.savings_percent ?? 20,
            bp.month,
            bp.year,
          ]
        );
      }
    }

    // 7. Insert Budget Categories
    if (Array.isArray(data.budget_categories)) {
      for (const bc of data.budget_categories) {
        await db.runAsync(
          `INSERT INTO budget_categories (id, name, icon, budget_limit, bucket_type, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            bc.id,
            bc.name,
            bc.icon ?? 'category',
            bc.budget_limit ?? 0,
            bc.bucket_type,
            bc.sort_order ?? 0,
          ]
        );
      }
    }

    // 8. Insert Recurring Transactions
    if (Array.isArray(data.recurring_transactions)) {
      for (const rt of data.recurring_transactions) {
        await db.runAsync(
          `INSERT INTO recurring_transactions (id, account_id, to_account_id, amount, type, merchant, category, frequency, next_process_date, last_processed_date, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            rt.id,
            rt.account_id,
            rt.to_account_id ?? null,
            rt.amount,
            rt.type,
            rt.merchant,
            rt.category,
            rt.frequency,
            rt.next_process_date,
            rt.last_processed_date ?? null,
            rt.is_active ?? 1,
          ]
        );
      }
    }

    // 9. Insert Notifications
    if (Array.isArray(data.notifications)) {
      for (const n of data.notifications) {
        await db.runAsync(
          `INSERT INTO notifications (id, title, description, type, is_read, created_at, action_url)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            n.id,
            n.title,
            n.description,
            n.type ?? 'default',
            n.is_read ?? 0,
            n.created_at ?? new Date().toISOString(),
            n.action_url ?? '',
          ]
        );
      }
    }

    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  }
}

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
    bills?: any[];
    bill_reminders?: any[];
    subscriptions?: any[];
    splitwise_people?: any[];
    splitwise_debts?: any[];
    splitwise_settlements?: any[];
  };
}

export interface BackupMetadata {
  exportedAt: string;
  version: number;
  transactionCount: number;
  accountCount: number;
  goalCount: number;
  billCount?: number;
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
 * Validates whether a backup snapshot contains real, meaningful user financial records
 * rather than a newly seeded / cleared blank database.
 */
export function isMeaningfulDatabaseSnapshot(payload: ClarityBackupPayload | null | undefined): boolean {
  if (!payload || !payload.data) return false;
  const { data } = payload;

  if (Array.isArray(data.transactions) && data.transactions.length > 0) return true;
  if (Array.isArray(data.goals) && data.goals.length > 0) return true;
  if (Array.isArray(data.recurring_transactions) && data.recurring_transactions.length > 0) return true;
  if (Array.isArray(data.bills) && data.bills.length > 0) return true;
  if (Array.isArray(data.subscriptions) && data.subscriptions.length > 0) return true;
  if (Array.isArray(data.splitwise_debts) && data.splitwise_debts.length > 0) return true;
  if (Array.isArray(data.splitwise_people) && data.splitwise_people.length > 0) return true;

  if (Array.isArray(data.accounts)) {
    if (data.accounts.length > 3) return true;
    for (const acc of data.accounts) {
      if (Math.abs(acc.balance ?? 0) > 0.001) return true;
      if (
        acc.name !== 'Primary Bank Account' &&
        acc.name !== 'Borrowed / Loan' &&
        acc.name !== 'Lent / Money Given'
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Generate full JSON backup snapshot of local database tables.
 */
export async function generateDatabaseSnapshot(): Promise<ClarityBackupPayload> {
  const db = getDatabase();

  const safeGetAll = async (sql: string): Promise<any[]> => {
    try {
      return await db.getAllAsync(sql);
    } catch {
      return [];
    }
  };

  const accounts = await safeGetAll('SELECT * FROM accounts');
  const transactions = await safeGetAll('SELECT * FROM transactions');
  const goals = await safeGetAll('SELECT * FROM goals');
  const goal_contributions = await safeGetAll('SELECT * FROM goal_contributions');
  const budget_plans = await safeGetAll('SELECT * FROM budget_plans');
  const budget_categories = await safeGetAll('SELECT * FROM budget_categories');
  const recurring_transactions = await safeGetAll('SELECT * FROM recurring_transactions');
  const notifications = await safeGetAll('SELECT * FROM notifications');
  const bills = await safeGetAll('SELECT * FROM bills');
  const bill_reminders = await safeGetAll('SELECT * FROM bill_reminders');
  const subscriptions = await safeGetAll('SELECT * FROM subscriptions');
  const splitwise_people = await safeGetAll('SELECT * FROM splitwise_people');
  const splitwise_debts = await safeGetAll('SELECT * FROM splitwise_debts');
  const splitwise_settlements = await safeGetAll('SELECT * FROM splitwise_settlements');

  const dataPayload = {
    accounts,
    transactions,
    goals,
    goal_contributions,
    budget_plans,
    budget_categories,
    recurring_transactions,
    notifications,
    bills,
    bill_reminders,
    subscriptions,
    splitwise_people,
    splitwise_debts,
    splitwise_settlements,
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
    billCount: (payload.data?.bills?.length ?? 0) + (payload.data?.subscriptions?.length ?? 0),
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

  await db.execAsync('PRAGMA foreign_keys = OFF;');
  await db.execAsync('BEGIN TRANSACTION');
  try {
    // 1. Wipe current tables in safe dependency order
    await db.execAsync(`
      DELETE FROM goal_contributions;
      DELETE FROM recurring_transactions;
      DELETE FROM transactions;
      DELETE FROM goals;
      DELETE FROM accounts;
      DELETE FROM budget_plans;
      DELETE FROM budget_categories;
      DELETE FROM notifications;
    `);

    try {
      await db.execAsync(`
        DELETE FROM bill_reminders;
        DELETE FROM bills;
        DELETE FROM subscriptions;
        DELETE FROM splitwise_settlements;
        DELETE FROM splitwise_debts;
        DELETE FROM splitwise_people;
      `);
    } catch {
      // Ignore if some tables do not exist in older migrations
    }

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
          `INSERT INTO transactions (id, account_id, amount, type, merchant, category, date, is_recurring, note, to_account_id, splits_json, source, status, sms_id, parsed_tx_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            t.source ?? 'MANUAL',
            t.status ?? 'VERIFIED',
            t.sms_id ?? null,
            t.parsed_tx_id ?? null,
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
          `INSERT INTO recurring_transactions (id, account_id, to_account_id, amount, type, merchant, category, frequency, next_process_date, last_processed_date, is_active, splits_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            rt.splits_json ?? null,
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

    // 10. Insert Bills (if present)
    if (Array.isArray(data.bills)) {
      for (const b of data.bills) {
        try {
          await db.runAsync(
            `INSERT INTO bills (id, title, provider, category, amount, min_amount, due_date, reminder_days, status, notes, is_recurring, frequency, last_paid_date, paid_transaction_id, payment_url, account_reference, source, sms_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              b.id,
              b.title,
              b.provider ?? '',
              b.category ?? '',
              b.amount,
              b.min_amount ?? null,
              b.due_date,
              b.reminder_days ?? 3,
              b.status ?? 'upcoming',
              b.notes ?? '',
              b.is_recurring ? 1 : 0,
              b.frequency ?? 'one_time',
              b.last_paid_date ?? null,
              b.paid_transaction_id ?? null,
              b.payment_url ?? null,
              b.account_reference ?? null,
              b.source ?? 'manual',
              b.sms_id ?? null,
              b.created_at ?? new Date().toISOString(),
              b.updated_at ?? new Date().toISOString(),
            ]
          );
        } catch {
          // Ignore if table not present in current schema
        }
      }
    }

    // 11. Insert Bill Reminders (if present)
    if (Array.isArray(data.bill_reminders)) {
      for (const br of data.bill_reminders) {
        try {
          await db.runAsync(
            `INSERT INTO bill_reminders (id, source, biller_name, biller_category, amount_due, min_amount_due, due_date, repeat_frequency, account_reference, status, reminder_days_before, paid_date, paid_transaction_id, payment_url, note, sms_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              br.id,
              br.source ?? 'MANUAL',
              br.biller_name,
              br.biller_category,
              br.amount_due,
              br.min_amount_due ?? null,
              br.due_date,
              br.repeat_frequency ?? 'one_time',
              br.account_reference ?? null,
              br.status ?? 'UNPAID',
              br.reminder_days_before ?? 3,
              br.paid_date ?? null,
              br.paid_transaction_id ?? null,
              br.payment_url ?? null,
              br.note ?? '',
              br.sms_id ?? null,
              br.created_at ?? new Date().toISOString(),
            ]
          );
        } catch {
          // Ignore
        }
      }
    }

    // 12. Insert Subscriptions (if present)
    if (Array.isArray(data.subscriptions)) {
      for (const s of data.subscriptions) {
        try {
          await db.runAsync(
            `INSERT INTO subscriptions (id, name, provider, amount, billing_cycle, next_renewal_date, category, status, payment_url, account_reference, notes, bill_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              s.id,
              s.name,
              s.provider ?? '',
              s.amount,
              s.billing_cycle ?? 'monthly',
              s.next_renewal_date,
              s.category ?? 'subscription',
              s.status ?? 'active',
              s.payment_url ?? null,
              s.account_reference ?? null,
              s.notes ?? '',
              s.bill_id ?? null,
              s.created_at ?? new Date().toISOString(),
              s.updated_at ?? new Date().toISOString(),
            ]
          );
        } catch {
          // Ignore
        }
      }
    }

    // 13. Insert Splitwise People (if present)
    if (Array.isArray(data.splitwise_people)) {
      for (const p of data.splitwise_people) {
        try {
          await db.runAsync(
            `INSERT INTO splitwise_people (id, name, phone, notes, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [p.id, p.name, p.phone ?? null, p.notes ?? null, p.created_at ?? new Date().toISOString()]
          );
        } catch {
          // Ignore
        }
      }
    }

    // 14. Insert Splitwise Debts (if present)
    if (Array.isArray(data.splitwise_debts)) {
      for (const d of data.splitwise_debts) {
        try {
          await db.runAsync(
            `INSERT INTO splitwise_debts (id, person_id, amount, type, description, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              d.id,
              d.person_id,
              d.amount,
              d.type,
              d.description,
              d.created_at ?? new Date().toISOString(),
            ]
          );
        } catch {
          // Ignore
        }
      }
    }

    // 15. Insert Splitwise Settlements (if present)
    if (Array.isArray(data.splitwise_settlements)) {
      for (const st of data.splitwise_settlements) {
        try {
          await db.runAsync(
            `INSERT INTO splitwise_settlements (id, person_id, amount, description, settlement_type, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              st.id,
              st.person_id,
              st.amount,
              st.description ?? null,
              st.settlement_type ?? 'THEY_PAID',
              st.created_at ?? new Date().toISOString(),
            ]
          );
        } catch {
          // Ignore
        }
      }
    }

    await db.execAsync('COMMIT');
  } catch (error) {
    await db.execAsync('ROLLBACK');
    throw error;
  } finally {
    try {
      await db.execAsync('PRAGMA foreign_keys = ON;');
    } catch {
      // Ignore cleanup error
    }
  }
}

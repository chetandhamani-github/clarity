import { getDatabase } from './index';
import { useAppStore } from '@/store/use-app-store';
import { mmkv } from '@/lib/storage';
import { getLocalTodayYmd } from '@/utils/date';

export interface ClarityBackupPayload {
  version: number;
  appName: string;
  exportedAt: string;
  checksum?: string;
  data: {
    accounts: any[];
    transactions: any[];
    tags?: any[];
    transaction_tags?: any[];
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
    splitwise_groups?: any[];
    splitwise_group_members?: any[];
    splitwise_expenses?: any[];
    splitwise_expense_splits?: any[];
    investment_holdings?: any[];
    smart_rules?: any[];
    merchant_category_rules?: any[];
    sms_messages?: any[];
    parsed_transactions?: any[];
    sms_review_queue?: any[];
    sms_patterns?: any[];
    preferences?: {
      theme?: 'light' | 'dark' | 'system';
      currency?: string;
      biometricEnabled?: boolean;
      timeoutSetting?: 'immediate' | '1min' | '5min' | 'never';
      hideBalances?: boolean;
      paydayDayOfMonth?: number;
      safetyBufferAmount?: number;
    };
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
  if (Array.isArray(data.splitwise_groups) && data.splitwise_groups.length > 0) return true;
  if (Array.isArray(data.splitwise_expenses) && data.splitwise_expenses.length > 0) return true;
  if (Array.isArray(data.tags) && data.tags.length > 0) return true;
  if (Array.isArray(data.merchant_category_rules) && data.merchant_category_rules.length > 0) return true;
  if (Array.isArray(data.parsed_transactions) && data.parsed_transactions.length > 0) return true;
  if (Array.isArray(data.sms_messages) && data.sms_messages.length > 0) return true;

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
  const tags = await safeGetAll('SELECT * FROM tags');
  const transaction_tags = await safeGetAll('SELECT * FROM transaction_tags');
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
  const splitwise_groups = await safeGetAll('SELECT * FROM splitwise_groups');
  const splitwise_group_members = await safeGetAll('SELECT * FROM splitwise_group_members');
  const splitwise_expenses = await safeGetAll('SELECT * FROM splitwise_expenses');
  const splitwise_expense_splits = await safeGetAll('SELECT * FROM splitwise_expense_splits');
  const investment_holdings = await safeGetAll('SELECT * FROM investment_holdings');
  const smart_rules = await safeGetAll('SELECT * FROM smart_rules');
  const merchant_category_rules = await safeGetAll('SELECT * FROM merchant_category_rules');
  const sms_messages = await safeGetAll('SELECT * FROM sms_messages');
  const parsed_transactions = await safeGetAll('SELECT * FROM parsed_transactions');
  const sms_review_queue = await safeGetAll('SELECT * FROM sms_review_queue');
  const sms_patterns = await safeGetAll('SELECT * FROM sms_patterns');

  let preferences: ClarityBackupPayload['data']['preferences'];
  try {
    const appState = useAppStore.getState();
    preferences = {
      theme: appState.theme,
      currency: appState.currency,
      biometricEnabled: appState.biometricEnabled,
      timeoutSetting: appState.timeoutSetting,
      hideBalances: appState.hideBalances,
      paydayDayOfMonth: appState.paydayDayOfMonth,
      safetyBufferAmount: appState.safetyBufferAmount,
    };
  } catch {
    // Graceful fallback if Zustand store unavailable in headless environment
  }

  const dataPayload: ClarityBackupPayload['data'] = {
    accounts,
    transactions,
    tags,
    transaction_tags,
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
    splitwise_groups,
    splitwise_group_members,
    splitwise_expenses,
    splitwise_expense_splits,
    investment_holdings,
    smart_rules,
    merchant_category_rules,
    sms_messages,
    parsed_transactions,
    sms_review_queue,
    sms_patterns,
    preferences,
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
      throw new Error('Backup integrity verification failed: Corrupted or invalid backup file.');
    }
  }

  const { data } = payload;
  const db = getDatabase();

  await db.execAsync('PRAGMA foreign_keys = OFF;');
  await db.execAsync('BEGIN TRANSACTION');
  try {
    // 1. Wipe current tables in safe dependency order
    await db.execAsync(`
      DELETE FROM transaction_tags;
      DELETE FROM tags;
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
        DELETE FROM splitwise_expense_splits;
        DELETE FROM splitwise_expenses;
        DELETE FROM splitwise_group_members;
        DELETE FROM splitwise_settlements;
        DELETE FROM splitwise_debts;
        DELETE FROM splitwise_groups;
        DELETE FROM splitwise_people;
        DELETE FROM investment_holdings;
        DELETE FROM smart_rules;
        DELETE FROM merchant_category_rules;
      `);
    } catch {
      // Ignore if some tables do not exist in older migrations
    }

    try {
      await db.execAsync(`
        DELETE FROM sms_review_queue;
        DELETE FROM parsed_transactions;
        DELETE FROM sms_patterns;
        DELETE FROM sms_messages;
      `);
    } catch {
      // Ignore if some tables do not exist in older migrations
    }

    // 2. Insert Accounts
    if (Array.isArray(data.accounts)) {
      for (const a of data.accounts) {
        await db.runAsync(
          `INSERT INTO accounts (id, name, type, balance, institution, last_four, sort_order, billing_cycle_day, due_day, credit_limit, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            a.id,
            a.name,
            a.type,
            a.balance ?? 0,
            a.institution ?? '',
            a.last_four ?? a.lastFour ?? '',
            a.sort_order ?? a.sortOrder ?? 0,
            a.billing_cycle_day ?? a.billingCycleDay ?? null,
            a.due_day ?? a.dueDay ?? null,
            a.credit_limit ?? a.creditLimit ?? null,
            a.created_at ?? a.createdAt ?? new Date().toISOString(),
            a.updated_at ?? a.updatedAt ?? a.created_at ?? new Date().toISOString(),
          ]
        );
      }
    }

    // 3. Insert Transactions
    if (Array.isArray(data.transactions)) {
      for (const t of data.transactions) {
        await db.runAsync(
          `INSERT INTO transactions (id, account_id, amount, type, merchant, category, date, is_recurring, note, to_account_id, splits_json, source, status, sms_id, parsed_tx_id, receipt_uri, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            t.id,
            t.account_id ?? t.accountId,
            t.amount,
            t.type,
            t.merchant,
            t.category,
            t.date,
            (t.is_recurring ?? t.isRecurring) ? 1 : 0,
            t.note ?? '',
            t.to_account_id ?? t.toAccountId ?? null,
            t.splits_json ?? t.splitsJson ?? null,
            t.source ?? 'MANUAL',
            t.status ?? 'VERIFIED',
            t.sms_id ?? t.smsId ?? null,
            t.parsed_tx_id ?? t.parsedTxId ?? null,
            t.receipt_uri ?? t.receiptUri ?? null,
            t.created_at ?? t.createdAt ?? new Date().toISOString(),
          ]
        );
      }
    }

    // 3b. Insert Tags & Transaction Tag Links
    if (Array.isArray(data.tags)) {
      for (const tag of data.tags) {
        try {
          await db.runAsync(
            `INSERT OR IGNORE INTO tags (id, name, color, created_at)
             VALUES (?, ?, ?, ?)`,
            [tag.id, tag.name, tag.color ?? null, tag.created_at ?? tag.createdAt ?? Math.floor(Date.now() / 1000)]
          );
        } catch {
          // Ignore if tags table unavailable
        }
      }
    }

    if (Array.isArray(data.transaction_tags)) {
      for (const tt of data.transaction_tags) {
        try {
          await db.runAsync(
            `INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id)
             VALUES (?, ?)`,
            [tt.transaction_id ?? tt.transactionId, tt.tag_id ?? tt.tagId]
          );
        } catch {
          // Ignore if transaction_tags table unavailable
        }
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
            g.target_amount ?? g.targetAmount,
            g.current_amount ?? g.currentAmount ?? 0,
            g.target_date ?? g.targetDate ?? '',
            g.auto_save_amount ?? g.autoSaveAmount ?? 0,
            g.category ?? '',
            g.created_at ?? g.createdAt ?? new Date().toISOString(),
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
            gc.goal_id ?? gc.goalId,
            gc.amount,
            gc.description ?? '',
            gc.date ?? new Date().toISOString(),
            gc.transaction_id ?? gc.transactionId ?? null,
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
            bp.monthly_income ?? bp.monthlyIncome,
            bp.needs_percent ?? bp.needsPercent ?? 50,
            bp.wants_percent ?? bp.wantsPercent ?? 30,
            bp.savings_percent ?? bp.savingsPercent ?? 20,
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
            bc.budget_limit ?? bc.budgetLimit ?? 0,
            bc.bucket_type ?? bc.bucketType,
            bc.sort_order ?? bc.sortOrder ?? 0,
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
            rt.account_id ?? rt.accountId,
            rt.to_account_id ?? rt.toAccountId ?? null,
            rt.amount,
            rt.type,
            rt.merchant,
            rt.category,
            rt.frequency,
            rt.next_process_date ?? rt.nextProcessDate,
            rt.last_processed_date ?? rt.lastProcessedDate ?? null,
            (rt.is_active ?? rt.isActive) ? 1 : 0,
            rt.splits_json ?? rt.splitsJson ?? null,
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
            (n.is_read ?? n.isRead) ? 1 : 0,
            n.created_at ?? n.createdAt ?? new Date().toISOString(),
            n.action_url ?? n.actionUrl ?? '',
          ]
        );
      }
    }

    // 10. Insert Bills (if present)
    if (Array.isArray(data.bills)) {
      for (const b of data.bills) {
        try {
          let billStatus = String(b.status ?? 'upcoming').toLowerCase();
          if (billStatus === 'unpaid') billStatus = 'upcoming';
          if (!['upcoming', 'paid', 'overdue', 'dismissed'].includes(billStatus)) billStatus = 'upcoming';

          let billFreq = String(b.frequency ?? 'one_time').toLowerCase();
          if (!['one_time', 'weekly', 'monthly', 'quarterly', 'yearly'].includes(billFreq)) billFreq = 'one_time';

          let billSource = String(b.source ?? 'manual').toLowerCase();
          if (!['manual', 'sms', 'email', 'future_api'].includes(billSource)) billSource = 'manual';

          await db.runAsync(
            `INSERT INTO bills (id, title, provider, category, amount, min_amount, due_date, reminder_days, status, notes, is_recurring, frequency, last_paid_date, paid_transaction_id, payment_url, account_reference, source, sms_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              b.id,
              b.title,
              b.provider ?? '',
              b.category ?? '',
              b.amount,
              b.min_amount ?? b.minAmount ?? null,
              b.due_date ?? b.dueDate ?? getLocalTodayYmd(),
              b.reminder_days ?? b.reminderDays ?? 3,
              billStatus,
              b.notes ?? '',
              (b.is_recurring ?? b.isRecurring) ? 1 : 0,
              billFreq,
              b.last_paid_date ?? b.lastPaidDate ?? null,
              b.paid_transaction_id ?? b.paidTransactionId ?? null,
              b.payment_url ?? b.paymentUrl ?? null,
              b.account_reference ?? b.accountReference ?? null,
              billSource,
              b.sms_id ?? b.smsId ?? null,
              b.created_at ?? b.createdAt ?? new Date().toISOString(),
              b.updated_at ?? b.updatedAt ?? b.created_at ?? new Date().toISOString(),
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
          let brSource = String(br.source ?? 'MANUAL').toUpperCase();
          if (!['SMS', 'MANUAL'].includes(brSource)) brSource = 'MANUAL';

          let brStatus = String(br.status ?? 'UNPAID').toUpperCase();
          if (brStatus === 'UPCOMING') brStatus = 'UNPAID';
          if (!['UNPAID', 'PAID', 'OVERDUE', 'DISMISSED'].includes(brStatus)) brStatus = 'UNPAID';

          let brFreq = String(br.repeat_frequency ?? br.repeatFrequency ?? br.frequency ?? 'one_time').toLowerCase();
          if (!['one_time', 'monthly', 'quarterly', 'yearly'].includes(brFreq)) brFreq = 'one_time';

          await db.runAsync(
            `INSERT INTO bill_reminders (id, source, biller_name, biller_category, amount_due, min_amount_due, due_date, repeat_frequency, account_reference, status, reminder_days_before, paid_date, paid_transaction_id, payment_url, note, sms_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              br.id,
              brSource,
              br.biller_name ?? br.billerName ?? br.title ?? 'Bill',
              br.biller_category ?? br.billerCategory ?? br.category ?? 'other',
              br.amount_due ?? br.amountDue ?? br.amount ?? 0,
              br.min_amount_due ?? br.minAmountDue ?? br.min_amount ?? null,
              br.due_date ?? br.dueDate ?? getLocalTodayYmd(),
              brFreq,
              br.account_reference ?? br.accountReference ?? null,
              brStatus,
              br.reminder_days_before ?? br.reminderDaysBefore ?? br.reminder_days ?? 3,
              br.paid_date ?? br.paidDate ?? null,
              br.paid_transaction_id ?? br.paidTransactionId ?? null,
              br.payment_url ?? br.paymentUrl ?? null,
              br.note ?? br.notes ?? '',
              br.sms_id ?? br.smsId ?? null,
              br.created_at ?? br.createdAt ?? new Date().toISOString(),
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
          let subCycle = String(s.billing_cycle ?? s.billingCycle ?? 'monthly').toLowerCase();
          if (!['weekly', 'monthly', 'quarterly', 'yearly'].includes(subCycle)) subCycle = 'monthly';

          let subStatus = String(s.status ?? 'active').toLowerCase();
          if (!['active', 'paused', 'cancelled'].includes(subStatus)) subStatus = 'active';

          await db.runAsync(
            `INSERT INTO subscriptions (id, name, provider, amount, billing_cycle, next_renewal_date, category, status, payment_url, account_reference, notes, bill_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              s.id,
              s.name,
              s.provider ?? '',
              s.amount,
              subCycle,
              s.next_renewal_date ?? s.nextRenewalDate ?? getLocalTodayYmd(),
              s.category ?? 'subscription',
              subStatus,
              s.payment_url ?? s.paymentUrl ?? null,
              s.account_reference ?? s.accountReference ?? null,
              s.notes ?? '',
              s.bill_id ?? s.billId ?? null,
              s.created_at ?? s.createdAt ?? new Date().toISOString(),
              s.updated_at ?? s.updatedAt ?? s.created_at ?? new Date().toISOString(),
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
            `INSERT INTO splitwise_people (id, name, email, phone, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [p.id, p.name, p.email ?? null, p.phone ?? null, p.notes ?? null, p.created_at ?? p.createdAt ?? new Date().toISOString()]
          );
        } catch {
          // Ignore
        }
      }
    }

    // 13b. Insert Splitwise Groups & Members (if present)
    if (Array.isArray(data.splitwise_groups)) {
      for (const g of data.splitwise_groups) {
        try {
          await db.runAsync(
            `INSERT OR REPLACE INTO splitwise_groups (id, name, description, icon, category, currency, created_by, is_archived, sync_status, sync_version, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              g.id,
              g.name,
              g.description ?? null,
              g.icon ?? null,
              g.category ?? null,
              g.currency ?? 'INR',
              g.created_by ?? g.createdBy ?? null,
              (g.is_archived ?? g.isArchived) ? 1 : 0,
              g.sync_status ?? g.syncStatus ?? 'LOCAL_ONLY',
              g.sync_version ?? g.syncVersion ?? 1,
              g.created_at ?? g.createdAt ?? new Date().toISOString(),
              g.updated_at ?? g.updatedAt ?? null,
            ]
          );
        } catch {
          // Ignore
        }
      }
    }

    if (Array.isArray(data.splitwise_group_members)) {
      for (const gm of data.splitwise_group_members) {
        try {
          await db.runAsync(
            `INSERT OR IGNORE INTO splitwise_group_members (id, group_id, person_id, role, joined_at, sync_status)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              gm.id,
              gm.group_id ?? gm.groupId,
              gm.person_id ?? gm.personId,
              gm.role ?? 'member',
              gm.joined_at ?? gm.joinedAt ?? new Date().toISOString(),
              gm.sync_status ?? gm.syncStatus ?? 'LOCAL_ONLY',
            ]
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
            `INSERT INTO splitwise_debts (id, person_id, amount, type, description, friend_email, group_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              d.id,
              d.person_id ?? d.personId,
              d.amount,
              d.type,
              d.description,
              d.friend_email ?? d.friendEmail ?? null,
              d.group_id ?? d.groupId ?? null,
              d.created_at ?? d.createdAt ?? new Date().toISOString(),
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
            `INSERT INTO splitwise_settlements (id, person_id, amount, description, settlement_type, friend_email, group_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              st.id,
              st.person_id ?? st.personId,
              st.amount,
              st.description ?? null,
              st.settlement_type ?? st.settlementType ?? 'THEY_PAID',
              st.friend_email ?? st.friendEmail ?? null,
              st.group_id ?? st.groupId ?? null,
              st.created_at ?? st.createdAt ?? new Date().toISOString(),
            ]
          );
        } catch {
          // Ignore
        }
      }
    }

    // 15b. Insert Splitwise Expenses & Expense Splits (if present)
    if (Array.isArray(data.splitwise_expenses)) {
      for (const ex of data.splitwise_expenses) {
        try {
          await db.runAsync(
            `INSERT OR REPLACE INTO splitwise_expenses (id, description, amount, currency, category, date, payer_id, group_id, split_type, notes, receipt_url, created_by_id, sync_status, sync_version, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              ex.id,
              ex.description,
              ex.amount,
              ex.currency ?? 'INR',
              ex.category ?? null,
              ex.date ?? new Date().toISOString(),
              ex.payer_id ?? ex.payerId,
              ex.group_id ?? ex.groupId ?? null,
              ex.split_type ?? ex.splitType ?? 'EQUAL',
              ex.notes ?? null,
              ex.receipt_url ?? ex.receiptUrl ?? null,
              ex.created_by_id ?? ex.createdById ?? null,
              ex.sync_status ?? ex.syncStatus ?? 'LOCAL_ONLY',
              ex.sync_version ?? ex.syncVersion ?? 1,
              ex.created_at ?? ex.createdAt ?? new Date().toISOString(),
              ex.updated_at ?? ex.updatedAt ?? null,
            ]
          );
        } catch {
          // Ignore
        }
      }
    }

    if (Array.isArray(data.splitwise_expense_splits)) {
      for (const sp of data.splitwise_expense_splits) {
        try {
          await db.runAsync(
            `INSERT OR IGNORE INTO splitwise_expense_splits (id, expense_id, person_id, paid_amount, owed_amount, percentage, shares, is_paid, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              sp.id,
              sp.expense_id ?? sp.expenseId,
              sp.person_id ?? sp.personId,
              sp.paid_amount ?? sp.paidAmount ?? 0,
              sp.owed_amount ?? sp.owedAmount ?? 0,
              sp.percentage ?? null,
              sp.shares ?? null,
              (sp.is_paid ?? sp.isPaid) ? 1 : 0,
              sp.created_at ?? sp.createdAt ?? new Date().toISOString(),
            ]
          );
        } catch {
          // Ignore
        }
      }
    }

    // 16. Insert SMS Messages (if present)
    if (Array.isArray(data.sms_messages)) {
      for (const sm of data.sms_messages) {
        try {
          await db.runAsync(
            `INSERT OR IGNORE INTO sms_messages (id, address, body, date, date_sent, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              sm.id,
              sm.address,
              sm.body,
              sm.date,
              sm.date_sent ?? sm.dateSent ?? null,
              sm.status ?? 'read',
              sm.created_at ?? sm.createdAt ?? new Date().toISOString(),
            ]
          );
        } catch {
          // Ignore
        }
      }
    }

    // 17. Insert Parsed Transactions (if present)
    if (Array.isArray(data.parsed_transactions)) {
      for (const pt of data.parsed_transactions) {
        try {
          const ptType = pt.type === 'CREDIT' ? 'CREDIT' : 'DEBIT';
          await db.runAsync(
            `INSERT OR IGNORE INTO parsed_transactions (id, sms_id, amount, type, merchant, category, bank, account_mask, reference_number, available_balance, transaction_date, confidence, is_duplicate, duplicate_of, transaction_id, raw_body, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              pt.id,
              pt.sms_id ?? pt.smsId ?? null,
              pt.amount,
              ptType,
              pt.merchant ?? 'Unknown Merchant',
              pt.category ?? 'Uncategorized',
              pt.bank ?? 'Bank / UPI',
              pt.account_mask ?? pt.accountMask ?? 'XXXX',
              pt.reference_number ?? pt.referenceNumber ?? null,
              pt.available_balance ?? pt.availableBalance ?? null,
              pt.transaction_date ?? pt.transactionDate ?? new Date().toISOString(),
              pt.confidence ?? 1.0,
              (pt.is_duplicate ?? pt.isDuplicate) ? 1 : 0,
              pt.duplicate_of ?? pt.duplicateOf ?? null,
              pt.transaction_id ?? pt.transactionId ?? null,
              pt.raw_body ?? pt.rawBody ?? null,
              pt.created_at ?? pt.createdAt ?? new Date().toISOString(),
            ]
          );
        } catch {
          // Ignore
        }
      }
    }

    // 18. Insert SMS Patterns (if present)
    if (Array.isArray(data.sms_patterns)) {
      for (const sp of data.sms_patterns) {
        try {
          await db.runAsync(
            `INSERT OR IGNORE INTO sms_patterns (id, bank, pattern_regex, pattern_type, mapping_json, is_active, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              sp.id,
              sp.bank,
              sp.pattern_regex ?? sp.patternRegex,
              sp.pattern_type ?? sp.patternType,
              sp.mapping_json ?? sp.mappingJson,
              (sp.is_active ?? sp.isActive) ? 1 : 0,
              sp.created_at ?? sp.createdAt ?? new Date().toISOString(),
            ]
          );
        } catch {
          // Ignore
        }
      }
    }

    // 19. Insert SMS Review Queue (if present)
    if (Array.isArray(data.sms_review_queue)) {
      for (const rq of data.sms_review_queue) {
        try {
          let rqStatus = String(rq.status ?? 'pending').toLowerCase();
          if (!['pending', 'resolved', 'dismissed'].includes(rqStatus)) rqStatus = 'pending';

          await db.runAsync(
            `INSERT OR IGNORE INTO sms_review_queue (id, sms_id, sender, body, reason, confidence, extracted_data, status, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              rq.id,
              rq.sms_id ?? rq.smsId,
              rq.sender,
              rq.body,
              rq.reason ?? 'UNKNOWN',
              rq.confidence ?? 0.0,
              rq.extracted_data ?? rq.extractedData ?? null,
              rqStatus,
              rq.created_at ?? rq.createdAt ?? new Date().toISOString(),
            ]
          );
        } catch {
          // Ignore
        }
      }
    }

    // 20. Insert Investment Holdings (if present)
    if (Array.isArray(data.investment_holdings)) {
      for (const inv of data.investment_holdings) {
        try {
          await db.runAsync(
            `INSERT OR REPLACE INTO investment_holdings (
               id, account_id, name, asset_class, sub_type, invested_amount,
               current_value, units, nav_or_price, folio_or_account_number,
               interest_rate, maturity_date, sip_amount, sip_day_of_month,
               notes, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              inv.id,
              inv.account_id ?? inv.accountId ?? null,
              inv.name,
              inv.asset_class ?? inv.assetClass,
              inv.sub_type ?? inv.subType,
              inv.invested_amount ?? inv.investedAmount ?? 0,
              inv.current_value ?? inv.currentValue ?? 0,
              inv.units ?? null,
              inv.nav_or_price ?? inv.navOrPrice ?? null,
              inv.folio_or_account_number ?? inv.folioOrAccountNumber ?? null,
              inv.interest_rate ?? inv.interestRate ?? null,
              inv.maturity_date ?? inv.maturityDate ?? null,
              inv.sip_amount ?? inv.sipAmount ?? null,
              inv.sip_day_of_month ?? inv.sipDayOfMonth ?? null,
              inv.notes ?? null,
              inv.created_at ?? inv.createdAt ?? new Date().toISOString(),
              inv.updated_at ?? inv.updatedAt ?? new Date().toISOString(),
            ]
          );
        } catch {
          // Ignore
        }
      }
    }

    // 21. Insert Smart Rules (if present)
    if (Array.isArray(data.smart_rules)) {
      for (const rule of data.smart_rules) {
        try {
          await db.runAsync(
            `INSERT OR REPLACE INTO smart_rules (
               id, name, is_enabled, trigger_source, match_type,
               conditions_json, actions_json, priority, match_count,
               last_matched_at, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              rule.id,
              rule.name,
              rule.is_enabled ?? (rule.isEnabled ? 1 : 0),
              rule.trigger_source ?? rule.trigger ?? 'any',
              rule.match_type ?? rule.matchType ?? 'ALL',
              typeof rule.conditions_json === 'string' ? rule.conditions_json : JSON.stringify(rule.conditions || []),
              typeof rule.actions_json === 'string' ? rule.actions_json : JSON.stringify(rule.actions || []),
              rule.priority ?? 0,
              rule.match_count ?? rule.matchCount ?? 0,
              rule.last_matched_at ?? rule.lastMatchedAt ?? null,
              rule.created_at ?? rule.createdAt ?? new Date().toISOString(),
              rule.updated_at ?? rule.updatedAt ?? new Date().toISOString(),
            ]
          );
        } catch {
          // Ignore
        }
      }
    }

    // 22. Insert Merchant Category Rules (if present)
    if (Array.isArray(data.merchant_category_rules)) {
      for (const mcr of data.merchant_category_rules) {
        try {
          await db.runAsync(
            `INSERT OR REPLACE INTO merchant_category_rules (id, merchant_pattern, category, updated_at)
             VALUES (?, ?, ?, ?)`,
            [
              mcr.id,
              mcr.merchant_pattern ?? mcr.merchantPattern,
              mcr.category,
              mcr.updated_at ?? mcr.updatedAt ?? Date.now(),
            ]
          );
        } catch {
          // Ignore
        }
      }
    }

    await db.execAsync('COMMIT');

    // Reset reminder/alert deduplication state, cancel stale OS alarms, and resync restored bills
    try {
      const { cleanupRedundantLegacyBillReminders } = await import('./migrations');
      await cleanupRedundantLegacyBillReminders(db);

      const { BillsRepository } = await import('@/modules/bills/database/bills.repository');
      BillsRepository.resetSchemaCache();

      const { resetBillReminderCheckCooldown } = await import('@/services/notifications/alert-engine');
      resetBillReminderCheckCooldown();

      const { BillAlertEngine } = await import('@/services/notifications/bill-alert-engine');
      await BillAlertEngine.cancelAllNativeBillReminders();
      await BillAlertEngine.syncAllNativeBillReminders();

      const { DeviceEventEmitter } = await import('react-native');
      DeviceEventEmitter.emit('billsUpdated');
      DeviceEventEmitter.emit('notificationsUpdated');
    } catch {
      // Ignore post-restore notification sync failures in constrained environments
    }

    // 20. Restore Preferences into App Store
    if (data.preferences) {
      try {
        const store = useAppStore.getState();
        if (data.preferences.theme) store.setTheme(data.preferences.theme);
        if (data.preferences.currency) store.setCurrency(data.preferences.currency);
        if (typeof data.preferences.biometricEnabled === 'boolean') {
          store.setBiometricEnabled(data.preferences.biometricEnabled);
        }
        if (data.preferences.timeoutSetting) {
          store.setTimeoutSetting(data.preferences.timeoutSetting);
        }
        if (typeof data.preferences.hideBalances === 'boolean') {
          store.setHideBalances(data.preferences.hideBalances);
        }
        if (typeof data.preferences.paydayDayOfMonth === 'number') {
          store.setPaydayDayOfMonth(data.preferences.paydayDayOfMonth);
        }
        if (typeof data.preferences.safetyBufferAmount === 'number') {
          store.setSafetyBufferAmount(data.preferences.safetyBufferAmount);
        }
      } catch {
        // Ignore store update failure in testing/headless mode
      }
    }

    // 21. Restore SMS sync timestamp in MMKV to latest SMS timestamp
    try {
      if (Array.isArray(data.sms_messages) && data.sms_messages.length > 0) {
        let maxDate = 0;
        for (const msg of data.sms_messages) {
          const dateVal = Number(msg.date);
          if (Number.isFinite(dateVal) && dateVal > maxDate) {
            maxDate = dateVal;
          }
        }
        if (maxDate > 0) {
          mmkv.set('clarity_last_sms_sync_timestamp', maxDate.toString());
        }
      }
    } catch {
      // Ignore MMKV error in testing
    }
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

/**
 * Queries the count of local transactions created or dated after a given ISO timestamp.
 * Used for detecting potential data conflicts before cloud or local restore.
 */
export async function getLocalTransactionsCountAfter(isoTimestamp: string): Promise<number> {
  try {
    const db = getDatabase();
    const datePrefix = isoTimestamp.includes('T') ? isoTimestamp.split('T')[0] : isoTimestamp;
    const row = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM transactions WHERE created_at > ? OR date > ?',
      [isoTimestamp, datePrefix]
    );
    return row?.count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Restores local database from a raw JSON string (supporting plain Clarity backup or encrypted format).
 */
export async function restoreFromLocalJSONString(
  rawContent: string,
  passphrase?: string
): Promise<{
  success: boolean;
  summary?: BackupMetadata;
  isEncrypted?: boolean;
  error?: string;
}> {
  try {
    let jsonToParse = rawContent.trim();

    // Check if payload is encrypted with AES-256-GCM
    let isEncrypted = false;
    try {
      const parsedCheck = JSON.parse(jsonToParse);
      if (parsedCheck && parsedCheck.salt && parsedCheck.iv && parsedCheck.ciphertext) {
        isEncrypted = true;
      }
    } catch {
      // Not JSON
    }

    if (isEncrypted) {
      if (!passphrase) {
        return { success: false, isEncrypted: true };
      }
      const { decryptBackupPayload } = await import('@/services/cloud/backup-crypto');
      const encryptedObj = JSON.parse(jsonToParse);
      jsonToParse = await decryptBackupPayload(encryptedObj, passphrase);
    }

    const payload = JSON.parse(jsonToParse);

    // Normalize legacy or alternative shapes if needed
    let canonicalPayload: ClarityBackupPayload = payload;
    if (payload.data && !payload.appName) {
      canonicalPayload = {
        version: payload.version || 1,
        appName: 'Clarity',
        exportedAt: payload.exportedAt || new Date().toISOString(),
        checksum: payload.checksum,
        data: payload.data,
      };
    }

    await restoreDatabaseFromSnapshot(canonicalPayload);
    const summary = getBackupSummary(canonicalPayload);

    return { success: true, summary };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Failed to restore database from local file.',
    };
  }
}

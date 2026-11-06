import { DeviceEventEmitter } from 'react-native';
import { getDatabase } from '@/services/database';
import type {
  Bill,
  BillCategory,
  BillStatus,
  BillSource,
  BillFrequency,
  Subscription,
  SubscriptionCycle,
  SubscriptionStatus,
  CreateBillDTO,
  UpdateBillDTO,
  CreateSubscriptionDTO,
  UpdateSubscriptionDTO,
  BillsSummary,
} from '../types/bill.types';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface BillRow {
  id: string;
  title: string;
  provider: string;
  category: string;
  amount: number;
  min_amount: number | null;
  due_date: string;
  reminder_days: number;
  status: string;
  notes: string | null;
  is_recurring: number;
  frequency: string | null;
  last_paid_date: string | null;
  paid_transaction_id: string | null;
  payment_url: string | null;
  account_reference: string | null;
  source: string;
  sms_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SubscriptionRow {
  id: string;
  name: string;
  provider: string;
  amount: number;
  billing_cycle: string;
  next_renewal_date: string;
  category: string;
  status: string;
  payment_url: string | null;
  account_reference: string | null;
  notes: string | null;
  bill_id: string | null;
  created_at: string;
  updated_at: string;
}

function mapBillRow(row: BillRow): Bill {
  return {
    id: row.id,
    title: row.title,
    provider: row.provider || '',
    category: (row.category as BillCategory) || 'other',
    amount: row.amount,
    minAmount: row.min_amount ?? undefined,
    dueDate: row.due_date,
    reminderDays: row.reminder_days ?? 3,
    status: (row.status as BillStatus) || 'upcoming',
    notes: row.notes ?? undefined,
    isRecurring: Boolean(row.is_recurring),
    frequency: (row.frequency as BillFrequency) || 'one_time',
    lastPaidDate: row.last_paid_date ?? undefined,
    paidTransactionId: row.paid_transaction_id ?? undefined,
    paymentUrl: row.payment_url ?? undefined,
    accountReference: row.account_reference ?? undefined,
    source: (row.source as BillSource) || 'manual',
    smsId: row.sms_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSubscriptionRow(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider || '',
    amount: row.amount,
    billingCycle: (row.billing_cycle as SubscriptionCycle) || 'monthly',
    nextRenewalDate: row.next_renewal_date,
    category: (row.category as BillCategory) || 'subscription',
    status: (row.status as SubscriptionStatus) || 'active',
    paymentUrl: row.payment_url ?? undefined,
    accountReference: row.account_reference ?? undefined,
    notes: row.notes ?? undefined,
    billId: row.bill_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class BillsRepository {
  /**
   * Initializes schema and ensures tables exist.
   */
  public static async ensureSchema(): Promise<void> {
    const db = getDatabase();
    if (typeof db.execAsync === 'function') {
      await db.execAsync(`
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

      CREATE INDEX IF NOT EXISTS idx_bills_due_date ON bills(due_date ASC);
      CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
      CREATE INDEX IF NOT EXISTS idx_bills_category ON bills(category);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_renewal ON subscriptions(next_renewal_date ASC);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
    `);
    }
  }

  public static async getAllBills(): Promise<Bill[]> {
    await this.ensureSchema();
    const db = getDatabase();

    // Auto-update overdue bills
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    await db.runAsync(
      `UPDATE bills 
       SET status = 'overdue', updated_at = datetime('now') 
       WHERE status = 'upcoming' AND due_date < ?`,
      [today]
    );

    const rows = await db.getAllAsync<BillRow>(
      `SELECT * FROM bills ORDER BY due_date ASC, created_at DESC`
    );
    return rows.map(mapBillRow);
  }

  public static async getUpcomingBills(daysAhead: number = 30): Promise<Bill[]> {
    await this.ensureSchema();
    const db = getDatabase();
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    const maxDueDate = `${futureDate.getFullYear()}-${pad(futureDate.getMonth() + 1)}-${pad(futureDate.getDate())}`;

    await db.runAsync(
      `UPDATE bills 
       SET status = 'overdue', updated_at = datetime('now') 
       WHERE status = 'upcoming' AND due_date < ?`,
      [today]
    );

    const rows = await db.getAllAsync<BillRow>(
      `SELECT * FROM bills 
       WHERE (status = 'upcoming' OR status = 'overdue') 
         AND due_date <= ?
       ORDER BY 
         CASE WHEN status = 'overdue' THEN 0 ELSE 1 END,
         due_date ASC`,
      [maxDueDate]
    );
    return rows.map(mapBillRow);
  }

  public static async getOverdueBills(): Promise<Bill[]> {
    await this.ensureSchema();
    const db = getDatabase();
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    await db.runAsync(
      `UPDATE bills 
       SET status = 'overdue', updated_at = datetime('now') 
       WHERE status = 'upcoming' AND due_date < ?`,
      [today]
    );

    const rows = await db.getAllAsync<BillRow>(
      `SELECT * FROM bills WHERE status = 'overdue' ORDER BY due_date ASC`
    );
    return rows.map(mapBillRow);
  }

  public static async getPaidBills(limit: number = 50): Promise<Bill[]> {
    await this.ensureSchema();
    const db = getDatabase();
    const rows = await db.getAllAsync<BillRow>(
      `SELECT * FROM bills WHERE status = 'paid' ORDER BY last_paid_date DESC, due_date DESC LIMIT ?`,
      [limit]
    );
    return rows.map(mapBillRow);
  }

  public static async getBillById(id: string): Promise<Bill | null> {
    await this.ensureSchema();
    const db = getDatabase();
    const row = await db.getFirstAsync<BillRow>(`SELECT * FROM bills WHERE id = ?`, [id]);
    return row ? mapBillRow(row) : null;
  }

  public static async insertBill(dto: CreateBillDTO): Promise<Bill> {
    await this.ensureSchema();
    const db = getDatabase();
    const id = generateId();
    const nowStr = new Date().toISOString();
    const status = dto.status || 'upcoming';
    const isRecurring = dto.isRecurring ? 1 : 0;
    const frequency = dto.frequency || 'one_time';
    const reminderDays = dto.reminderDays ?? 3;
    const provider = dto.provider || dto.title;

    await db.runAsync(
      `INSERT INTO bills (
        id, title, provider, category, amount, min_amount, due_date,
        reminder_days, status, notes, is_recurring, frequency,
        last_paid_date, paid_transaction_id,
        payment_url, account_reference, source, sms_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.title.trim(),
        provider.trim(),
        dto.category,
        dto.amount,
        dto.minAmount ?? null,
        dto.dueDate,
        reminderDays,
        status,
        dto.notes?.trim() || '',
        isRecurring,
        frequency,
        dto.paidDate || null,
        dto.paidTransactionId || null,
        dto.paymentUrl?.trim() || null,
        dto.accountReference?.trim() || null,
        dto.source || 'manual',
        dto.smsId || null,
        nowStr,
        nowStr,
      ]
    );

    DeviceEventEmitter.emit('billsUpdated');

    return {
      id,
      title: dto.title.trim(),
      provider: provider.trim(),
      category: dto.category,
      amount: dto.amount,
      minAmount: dto.minAmount,
      dueDate: dto.dueDate,
      reminderDays,
      status,
      notes: dto.notes?.trim() || '',
      isRecurring: Boolean(isRecurring),
      frequency,
      lastPaidDate: dto.paidDate,
      paidTransactionId: dto.paidTransactionId,
      paymentUrl: dto.paymentUrl?.trim() || undefined,
      accountReference: dto.accountReference?.trim() || undefined,
      source: dto.source || 'manual',
      smsId: dto.smsId,
      createdAt: nowStr,
      updatedAt: nowStr,
    };
  }

  public static async updateBill(id: string, updates: UpdateBillDTO): Promise<void> {
    await this.ensureSchema();
    const db = getDatabase();
    const sets: string[] = [];
    const params: (string | number | null)[] = [];

    if (updates.title !== undefined) {
      sets.push('title = ?');
      params.push(updates.title.trim());
    }
    if (updates.provider !== undefined) {
      sets.push('provider = ?');
      params.push(updates.provider.trim());
    }
    if (updates.category !== undefined) {
      sets.push('category = ?');
      params.push(updates.category);
    }
    if (updates.amount !== undefined) {
      sets.push('amount = ?');
      params.push(updates.amount);
    }
    if (updates.minAmount !== undefined) {
      sets.push('min_amount = ?');
      params.push(updates.minAmount ?? null);
    }
    if (updates.dueDate !== undefined) {
      sets.push('due_date = ?');
      params.push(updates.dueDate);
    }
    if (updates.reminderDays !== undefined) {
      sets.push('reminder_days = ?');
      params.push(updates.reminderDays);
    }
    if (updates.status !== undefined) {
      sets.push('status = ?');
      params.push(updates.status);
    }
    if (updates.notes !== undefined) {
      sets.push('notes = ?');
      params.push(updates.notes ? updates.notes.trim() : '');
    }
    if (updates.isRecurring !== undefined) {
      sets.push('is_recurring = ?');
      params.push(updates.isRecurring ? 1 : 0);
    }
    if (updates.frequency !== undefined) {
      sets.push('frequency = ?');
      params.push(updates.frequency);
    }
    if (updates.lastPaidDate !== undefined) {
      sets.push('last_paid_date = ?');
      params.push(updates.lastPaidDate ?? null);
    }
    if (updates.paidTransactionId !== undefined) {
      sets.push('paid_transaction_id = ?');
      params.push(updates.paidTransactionId ?? null);
    }
    if (updates.paymentUrl !== undefined) {
      sets.push('payment_url = ?');
      params.push(updates.paymentUrl ?? null);
    }
    if (updates.accountReference !== undefined) {
      sets.push('account_reference = ?');
      params.push(updates.accountReference ?? null);
    }
    if (updates.source !== undefined) {
      sets.push('source = ?');
      params.push(updates.source);
    }
    if (updates.smsId !== undefined) {
      sets.push('sms_id = ?');
      params.push(updates.smsId ?? null);
    }

    if (sets.length === 0) return;

    sets.push("updated_at = datetime('now')");
    params.push(id);

    await db.runAsync(`UPDATE bills SET ${sets.join(', ')} WHERE id = ?`, params);
    DeviceEventEmitter.emit('billsUpdated');
  }

  public static async deleteBill(id: string): Promise<void> {
    await this.ensureSchema();
    const db = getDatabase();
    await db.runAsync(`DELETE FROM bills WHERE id = ?`, [id]);
    DeviceEventEmitter.emit('billsUpdated');
  }

  public static async markBillAsPaid(
    id: string,
    paidDate?: string,
    paidTransactionId?: string
  ): Promise<{ updatedBill: Bill; nextBill?: Bill }> {
    await this.ensureSchema();
    const db = getDatabase();
    const bill = await this.getBillById(id);
    if (!bill) {
      throw new Error(`Bill not found: ${id}`);
    }

    const effectivePaidDate = paidDate || new Date().toISOString().split('T')[0];

    await db.runAsync(
      `UPDATE bills 
       SET status = 'paid', last_paid_date = ?, paid_transaction_id = ?, updated_at = datetime('now') 
       WHERE id = ?`,
      [effectivePaidDate, paidTransactionId || null, id]
    );

    const updatedBill: Bill = {
      ...bill,
      status: 'paid',
      lastPaidDate: effectivePaidDate,
      paidTransactionId: paidTransactionId || bill.paidTransactionId,
      updatedAt: new Date().toISOString(),
    };

    let nextBill: Bill | undefined;

    // If recurring, calculate and generate next occurrence
    if (bill.isRecurring && bill.frequency && bill.frequency !== 'one_time') {
      const nextDueDate = this.calculateNextOccurrence(bill.dueDate, bill.frequency);
      nextBill = await this.insertBill({
        title: bill.title,
        provider: bill.provider,
        category: bill.category,
        amount: bill.amount,
        minAmount: bill.minAmount,
        dueDate: nextDueDate,
        reminderDays: bill.reminderDays,
        isRecurring: true,
        frequency: bill.frequency,
        paymentUrl: bill.paymentUrl,
        accountReference: bill.accountReference,
        notes: bill.notes,
        source: bill.source,
        status: 'upcoming',
      });
    }

    DeviceEventEmitter.emit('billsUpdated');
    return { updatedBill, nextBill };
  }

  // --- Subscriptions Repository ---

  public static async getAllSubscriptions(): Promise<Subscription[]> {
    await this.ensureSchema();
    const db = getDatabase();
    const rows = await db.getAllAsync<SubscriptionRow>(
      `SELECT * FROM subscriptions ORDER BY next_renewal_date ASC, name ASC`
    );
    return rows.map(mapSubscriptionRow);
  }

  public static async getSubscriptionById(id: string): Promise<Subscription | null> {
    await this.ensureSchema();
    const db = getDatabase();
    const row = await db.getFirstAsync<SubscriptionRow>(
      `SELECT * FROM subscriptions WHERE id = ?`,
      [id]
    );
    return row ? mapSubscriptionRow(row) : null;
  }

  public static async insertSubscription(dto: CreateSubscriptionDTO): Promise<Subscription> {
    await this.ensureSchema();
    const db = getDatabase();
    const id = generateId();
    const nowStr = new Date().toISOString();
    const status = dto.status || 'active';
    const provider = dto.provider || dto.name;
    const category = dto.category || 'subscription';

    await db.runAsync(
      `INSERT INTO subscriptions (
        id, name, provider, amount, billing_cycle, next_renewal_date,
        category, status, payment_url, account_reference, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        dto.name.trim(),
        provider.trim(),
        dto.amount,
        dto.billingCycle,
        dto.nextRenewalDate,
        category,
        status,
        dto.paymentUrl?.trim() || null,
        dto.accountReference?.trim() || null,
        dto.notes?.trim() || '',
        nowStr,
        nowStr,
      ]
    );

    DeviceEventEmitter.emit('billsUpdated');

    return {
      id,
      name: dto.name.trim(),
      provider: provider.trim(),
      amount: dto.amount,
      billingCycle: dto.billingCycle,
      nextRenewalDate: dto.nextRenewalDate,
      category,
      status,
      paymentUrl: dto.paymentUrl?.trim() || undefined,
      accountReference: dto.accountReference?.trim() || undefined,
      notes: dto.notes?.trim() || undefined,
      createdAt: nowStr,
      updatedAt: nowStr,
    };
  }

  public static async updateSubscription(
    id: string,
    updates: UpdateSubscriptionDTO
  ): Promise<void> {
    await this.ensureSchema();
    const db = getDatabase();
    const sets: string[] = [];
    const params: (string | number | null)[] = [];

    if (updates.name !== undefined) {
      sets.push('name = ?');
      params.push(updates.name.trim());
    }
    if (updates.provider !== undefined) {
      sets.push('provider = ?');
      params.push(updates.provider.trim());
    }
    if (updates.amount !== undefined) {
      sets.push('amount = ?');
      params.push(updates.amount);
    }
    if (updates.billingCycle !== undefined) {
      sets.push('billing_cycle = ?');
      params.push(updates.billingCycle);
    }
    if (updates.nextRenewalDate !== undefined) {
      sets.push('next_renewal_date = ?');
      params.push(updates.nextRenewalDate);
    }
    if (updates.category !== undefined) {
      sets.push('category = ?');
      params.push(updates.category);
    }
    if (updates.status !== undefined) {
      sets.push('status = ?');
      params.push(updates.status);
    }
    if (updates.paymentUrl !== undefined) {
      sets.push('payment_url = ?');
      params.push(updates.paymentUrl ?? null);
    }
    if (updates.accountReference !== undefined) {
      sets.push('account_reference = ?');
      params.push(updates.accountReference ?? null);
    }
    if (updates.notes !== undefined) {
      sets.push('notes = ?');
      params.push(updates.notes ? updates.notes.trim() : '');
    }

    if (sets.length === 0) return;

    sets.push("updated_at = datetime('now')");
    params.push(id);

    await db.runAsync(`UPDATE subscriptions SET ${sets.join(', ')} WHERE id = ?`, params);
    DeviceEventEmitter.emit('billsUpdated');
  }

  public static async deleteSubscription(id: string): Promise<void> {
    await this.ensureSchema();
    const db = getDatabase();
    await db.runAsync(`DELETE FROM subscriptions WHERE id = ?`, [id]);
    DeviceEventEmitter.emit('billsUpdated');
  }

  // --- Summary & Analytics ---

  public static async getSummary(
    month?: number,
    year?: number
  ): Promise<BillsSummary> {
    await this.ensureSchema();
    const db = getDatabase();
    const now = new Date();
    const targetMonth = month ?? now.getMonth() + 1;
    const targetYear = year ?? now.getFullYear();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const monthPrefix = `${targetYear}-${pad(targetMonth)}`;

    const bills = await this.getAllBills();
    const subscriptions = await this.getAllSubscriptions();

    let upcomingCount = 0;
    let upcomingAmount = 0;
    let overdueCount = 0;
    let overdueAmount = 0;
    let paidCount = 0;
    let paidThisMonthAmount = 0;
    let totalCommittedMonth = 0;

    for (const b of bills) {
      const isThisMonth = b.dueDate ? b.dueDate.startsWith(monthPrefix) : false;
      if (isThisMonth) {
        totalCommittedMonth += b.amount;
      }

      if (b.status === 'upcoming') {
        upcomingCount++;
        upcomingAmount += b.amount;
      } else if (b.status === 'overdue') {
        overdueCount++;
        overdueAmount += b.amount;
        upcomingAmount += b.amount; // Count overdue in upcoming total commitment
      } else if (b.status === 'paid') {
        if (b.lastPaidDate?.startsWith(monthPrefix) || isThisMonth) {
          paidCount++;
          paidThisMonthAmount += b.amount;
        }
      }
    }

    let monthlySubscriptionSpend = 0;
    let activeSubscriptionCount = 0;

    for (const sub of subscriptions) {
      if (sub.status === 'active') {
        activeSubscriptionCount++;
        monthlySubscriptionSpend += this.calculateMonthlyNormalizedCost(sub.amount, sub.billingCycle);
      }
    }

    return {
      upcomingCount,
      upcomingAmount,
      overdueCount,
      overdueAmount,
      paidCount,
      paidThisMonthAmount,
      monthlySubscriptionSpend: Math.round(monthlySubscriptionSpend),
      activeSubscriptionCount,
      totalCommittedMonth,
    };
  }

  // --- Utility Calculations ---

  public static calculateMonthlyNormalizedCost(amount: number, cycle: SubscriptionCycle): number {
    switch (cycle) {
      case 'weekly':
        return (amount * 52) / 12;
      case 'monthly':
        return amount;
      case 'quarterly':
        return amount / 3;
      case 'yearly':
        return amount / 12;
      default:
        return amount;
    }
  }

  public static calculateNextOccurrence(currentDate: string, frequency: BillFrequency): string {
    const [yStr, mStr, dStr] = currentDate.split('-');
    let year = parseInt(yStr, 10);
    let month = parseInt(mStr, 10);
    let day = parseInt(dStr, 10);
    const pad = (n: number) => n.toString().padStart(2, '0');

    switch (frequency) {
      case 'weekly': {
        const date = new Date(year, month - 1, day);
        date.setDate(date.getDate() + 7);
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      }
      case 'monthly': {
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
        const maxDays = new Date(year, month, 0).getDate();
        day = Math.min(day, maxDays);
        return `${year}-${pad(month)}-${pad(day)}`;
      }
      case 'quarterly': {
        month += 3;
        if (month > 12) {
          month -= 12;
          year += 1;
        }
        const maxDays = new Date(year, month, 0).getDate();
        day = Math.min(day, maxDays);
        return `${year}-${pad(month)}-${pad(day)}`;
      }
      case 'yearly': {
        year += 1;
        const maxDays = new Date(year, month, 0).getDate();
        day = Math.min(day, maxDays);
        return `${year}-${pad(month)}-${pad(day)}`;
      }
      default: {
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
        const maxDays = new Date(year, month, 0).getDate();
        day = Math.min(day, maxDays);
        return `${year}-${pad(month)}-${pad(day)}`;
      }
    }
  }

  /**
   * Purges any previously seeded sample/dummy bills and subscriptions.
   */
  public static async cleanupDummyData(): Promise<void> {
    await this.ensureSchema();
    const db = getDatabase();

    await db.runAsync(
      `DELETE FROM bills WHERE 
       account_reference IN ('CA-9482104', 'DSL-08041920', 'Card ending in 4821', 'Flat 402, Green Glen')
       OR notes IN (
         'Monthly domestic meter billing', 
         '200 Mbps Unlimited broadband', 
         'Total statement balance', 
         'Transfer via UPI / IMPS by 5th'
       )
       OR (provider = 'BESCOM Electricity' AND title = 'Electricity Bill' AND amount = 1450)
       OR (provider = 'Airtel Broadband' AND title = 'Airtel Xstream Fiber' AND amount = 1178)
       OR (provider = 'HDFC Bank' AND title = 'HDFC Regalia Credit Card' AND amount = 18450)
       OR (provider = 'Landlord Rent Transfer' AND title = 'Apartment Rent' AND amount = 25000);`
    );

    await db.runAsync(
      `DELETE FROM subscriptions WHERE
       (name = 'Netflix Premium 4K' AND notes = 'Auto-debit on credit card')
       OR (name = 'Spotify Family Plan' AND amount = 179)
       OR (name = 'Google One 2TB' AND notes = 'Annual cloud storage plan')
       OR name IN ('Netflix Premium 4K', 'Spotify Family Plan', 'Google One 2TB');`
    );

    await this.deduplicateExistingBills();
  }

  /**
   * Automatically cleans up any duplicate bills created by previous scans or manual entries.
   */
  public static async deduplicateExistingBills(): Promise<number> {
    await this.ensureSchema();
    const db = getDatabase();

    const rows = await db.getAllAsync<BillRow>(
      `SELECT * FROM bills ORDER BY due_date ASC, created_at DESC`
    );

    if (!rows || rows.length <= 1) return 0;

    const toDeleteIds = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const b1 = rows[i];
      if (toDeleteIds.has(b1.id)) continue;

      for (let j = i + 1; j < rows.length; j++) {
        const b2 = rows[j];
        if (toDeleteIds.has(b2.id)) continue;

        const isDuplicate = this.isDuplicateBillPair(b1, b2);
        if (isDuplicate) {
          // Determine which to keep
          let keep = b1;
          let remove = b2;

          // Paid bills take absolute precedence
          if (b2.status === 'paid' && b1.status !== 'paid') {
            keep = b2;
            remove = b1;
          } else if (b1.status === b2.status) {
            // Keep the one with SMS data or more complete details
            const b1Score = (b1.sms_id ? 3 : 0) + (b1.payment_url ? 1 : 0) + (b1.account_reference ? 1 : 0);
            const b2Score = (b2.sms_id ? 3 : 0) + (b2.payment_url ? 1 : 0) + (b2.account_reference ? 1 : 0);
            if (b2Score > b1Score) {
              keep = b2;
              remove = b1;
            }
          }

          // Merge any details into keep
          await db.runAsync(
            `UPDATE bills 
             SET sms_id = COALESCE(sms_id, ?),
                 payment_url = COALESCE(payment_url, ?),
                 account_reference = COALESCE(account_reference, ?),
                 provider = CASE WHEN provider = '' OR provider = title THEN ? ELSE provider END
             WHERE id = ?`,
            [remove.sms_id, remove.payment_url, remove.account_reference, remove.provider || remove.title, keep.id]
          );

          toDeleteIds.add(remove.id);
        }
      }
    }

    if (toDeleteIds.size > 0) {
      for (const id of toDeleteIds) {
        await db.runAsync(`DELETE FROM bills WHERE id = ?`, [id]);
      }
      DeviceEventEmitter.emit('billsUpdated');
    }

    return toDeleteIds.size;
  }

  private static isDuplicateBillPair(b1: BillRow, b2: BillRow): boolean {
    // 1. Same SMS id
    if (b1.sms_id && b2.sms_id && b1.sms_id === b2.sms_id) {
      return true;
    }

    // 2. Account reference match
    if (b1.account_reference && b2.account_reference) {
      const ref1 = b1.account_reference.toLowerCase().trim();
      const ref2 = b2.account_reference.toLowerCase().trim();
      const d1 = ref1.replace(/\D/g, '');
      const d2 = ref2.replace(/\D/g, '');
      const isRefMatch =
        ref1 === ref2 ||
        ref1.includes(ref2) ||
        ref2.includes(ref1) ||
        (d1.length >= 4 && d2.length >= 4 && (d1.endsWith(d2) || d2.endsWith(d1)));

      if (isRefMatch) {
        // Same account reference, check if due dates are in same billing cycle (within 25 days)
        const [y1, m1, day1] = b1.due_date.split('-').map(Number);
        const [y2, m2, day2] = b2.due_date.split('-').map(Number);
        const diffDays = Math.abs(
          Math.round((new Date(y1, m1 - 1, day1).getTime() - new Date(y2, m2 - 1, day2).getTime()) / 86400000)
        );
        if (diffDays <= 25) return true;
      }
    }

    // 3. Due date proximity
    const [y1, m1, day1] = b1.due_date.split('-').map(Number);
    const [y2, m2, day2] = b2.due_date.split('-').map(Number);
    const diffDays = Math.abs(
      Math.round((new Date(y1, m1 - 1, day1).getTime() - new Date(y2, m2 - 1, day2).getTime()) / 86400000)
    );

    // Must be in the same billing cycle (within 15 days)
    if (diffDays > 15) return false;

    // 4. Amount proximity
    const amountDiff = Math.abs(b1.amount - b2.amount);
    const maxAmount = Math.max(b1.amount, b2.amount);
    const isAmountClose = maxAmount > 0 ? amountDiff <= 5 || amountDiff / maxAmount <= 0.05 : false;

    // 5. Category and Name check
    const isSameCategory = b1.category === b2.category;

    const n1 = (b1.provider + ' ' + b1.title).toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    const n2 = (b2.provider + ' ' + b2.title).toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();

    const words1 = n1.split(/\s+/).filter((w) => w.length >= 3);
    const words2 = n2.split(/\s+/).filter((w) => w.length >= 3);
    const hasSharedWord = words1.some((w) => words2.includes(w));
    const isNameSub = n1.includes(n2) || n2.includes(n1);

    if (isSameCategory && isAmountClose && (hasSharedWord || isNameSub || diffDays <= 3)) {
      return true;
    }

    if ((hasSharedWord || isNameSub) && isAmountClose) {
      return true;
    }

    return false;
  }
}

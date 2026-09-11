import { DeviceEventEmitter } from 'react-native';
import { getDatabase } from './index';
import { insertNotification } from './notification-dao';
import { formatCurrency } from '@/utils/format';
import { calculateNextDate } from '@/utils/date';
import type {
  BillReminder,
  BillerCategory,
  BillStatus,
  BillRepeatFrequency,
  MonthlyBillSummary,
} from '@/types';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface BillReminderRow {
  id: string;
  source: string;
  biller_name: string;
  biller_category: string;
  amount_due: number;
  min_amount_due: number | null;
  due_date: string;
  repeat_frequency: string | null;
  account_reference: string | null;
  status: string;
  reminder_days_before: number;
  paid_date: string | null;
  paid_transaction_id: string | null;
  payment_url: string | null;
  note: string | null;
  sms_id: string | null;
  created_at: string;
}

function mapRow(row: BillReminderRow): BillReminder {
  return {
    id: row.id,
    source: (row.source as 'SMS' | 'MANUAL') || 'MANUAL',
    billerName: row.biller_name,
    billerCategory: (row.biller_category as BillerCategory) || 'other',
    amountDue: row.amount_due,
    minAmountDue: row.min_amount_due ?? undefined,
    dueDate: row.due_date,
    repeatFrequency: (row.repeat_frequency as BillRepeatFrequency) || 'one_time',
    accountReference: row.account_reference ?? undefined,
    status: (row.status as BillStatus) || 'UNPAID',
    reminderDaysBefore: row.reminder_days_before ?? 3,
    paidDate: row.paid_date ?? undefined,
    paidTransactionId: row.paid_transaction_id ?? undefined,
    paymentUrl: row.payment_url ?? undefined,
    note: row.note ?? undefined,
    smsId: row.sms_id ?? undefined,
    createdAt: row.created_at,
  };
}

export async function getAllBills(): Promise<BillReminder[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<BillReminderRow>(
    `SELECT * FROM bill_reminders ORDER BY due_date ASC, created_at DESC`
  );
  return rows.map(mapRow);
}

export async function getUpcomingBills(daysAhead: number = 30): Promise<BillReminder[]> {
  const db = getDatabase();
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  const maxDueDate = `${futureDate.getFullYear()}-${pad(futureDate.getMonth() + 1)}-${pad(futureDate.getDate())}`;

  // Update any UNPAID bills that are past due date to OVERDUE status
  await db.runAsync(
    `UPDATE bill_reminders 
     SET status = 'OVERDUE' 
     WHERE status = 'UNPAID' AND due_date < ?`,
    [today]
  );

  const rows = await db.getAllAsync<BillReminderRow>(
    `SELECT * FROM bill_reminders 
     WHERE (status = 'UNPAID' OR status = 'OVERDUE') 
       AND due_date <= ?
     ORDER BY 
       CASE WHEN status = 'OVERDUE' THEN 0 ELSE 1 END,
       due_date ASC`,
    [maxDueDate]
  );
  return rows.map(mapRow);
}

export async function getPaidBills(limit: number = 50): Promise<BillReminder[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<BillReminderRow>(
    `SELECT * FROM bill_reminders 
     WHERE status = 'PAID' 
     ORDER BY paid_date DESC, due_date DESC 
     LIMIT ?`,
    [limit]
  );
  return rows.map(mapRow);
}

export async function getBillById(id: string): Promise<BillReminder | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<BillReminderRow>(
    `SELECT * FROM bill_reminders WHERE id = ?`,
    [id]
  );
  return row ? mapRow(row) : null;
}

export async function insertBill(
  data: Omit<BillReminder, 'id' | 'createdAt' | 'status' | 'reminderDaysBefore'> & {
    id?: string;
    status?: BillStatus;
    reminderDaysBefore?: number;
  }
): Promise<BillReminder> {
  const db = getDatabase();
  const id = data.id || generateId();
  const status = data.status || 'UNPAID';
  const createdAt = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO bill_reminders 
     (id, source, biller_name, biller_category, amount_due, min_amount_due, due_date, 
      repeat_frequency, account_reference, status, reminder_days_before, paid_date, 
      paid_transaction_id, payment_url, note, sms_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.source || 'MANUAL',
      data.billerName,
      data.billerCategory,
      data.amountDue,
      data.minAmountDue ?? null,
      data.dueDate,
      data.repeatFrequency || 'one_time',
      data.accountReference ?? null,
      status,
      data.reminderDaysBefore ?? 3,
      data.paidDate ?? null,
      data.paidTransactionId ?? null,
      data.paymentUrl ?? null,
      data.note ?? '',
      data.smsId ?? null,
      createdAt,
    ]
  );

  DeviceEventEmitter.emit('billsUpdated');

  // Trigger notification if manual reminder is created
  if ((data.source || 'MANUAL') === 'MANUAL' && status === 'UNPAID') {
    insertNotification({
      title: `Bill Reminder: ${data.billerName}`,
      description: `Reminder for ${data.billerName} of ${formatCurrency(data.amountDue)} due on ${data.dueDate} was scheduled.`,
      type: 'default',
      actionUrl: '/(app)/bills',
    }).catch(() => {});
    DeviceEventEmitter.emit('notificationsUpdated');
  }

  return {
    id,
    source: data.source || 'MANUAL',
    billerName: data.billerName,
    billerCategory: data.billerCategory,
    amountDue: data.amountDue,
    minAmountDue: data.minAmountDue,
    dueDate: data.dueDate,
    repeatFrequency: data.repeatFrequency || 'one_time',
    accountReference: data.accountReference,
    status,
    reminderDaysBefore: data.reminderDaysBefore ?? 3,
    paidDate: data.paidDate,
    paidTransactionId: data.paidTransactionId,
    paymentUrl: data.paymentUrl,
    note: data.note,
    smsId: data.smsId,
    createdAt,
  };
}

export async function updateBill(
  id: string,
  updates: Partial<Omit<BillReminder, 'id' | 'createdAt'>>
): Promise<void> {
  const db = getDatabase();
  const sets: string[] = [];
  const params: (string | number | null)[] = [];

  if (updates.billerName !== undefined) {
    sets.push('biller_name = ?');
    params.push(updates.billerName);
  }
  if (updates.billerCategory !== undefined) {
    sets.push('biller_category = ?');
    params.push(updates.billerCategory);
  }
  if (updates.amountDue !== undefined) {
    sets.push('amount_due = ?');
    params.push(updates.amountDue);
  }
  if (updates.minAmountDue !== undefined) {
    sets.push('min_amount_due = ?');
    params.push(updates.minAmountDue ?? null);
  }
  if (updates.dueDate !== undefined) {
    sets.push('due_date = ?');
    params.push(updates.dueDate);
  }
  if (updates.repeatFrequency !== undefined) {
    sets.push('repeat_frequency = ?');
    params.push(updates.repeatFrequency);
  }
  if (updates.accountReference !== undefined) {
    sets.push('account_reference = ?');
    params.push(updates.accountReference ?? null);
  }
  if (updates.status !== undefined) {
    sets.push('status = ?');
    params.push(updates.status);
  }
  if (updates.reminderDaysBefore !== undefined) {
    sets.push('reminder_days_before = ?');
    params.push(updates.reminderDaysBefore);
  }
  if (updates.paidDate !== undefined) {
    sets.push('paid_date = ?');
    params.push(updates.paidDate ?? null);
  }
  if (updates.paidTransactionId !== undefined) {
    sets.push('paid_transaction_id = ?');
    params.push(updates.paidTransactionId ?? null);
  }
  if (updates.paymentUrl !== undefined) {
    sets.push('payment_url = ?');
    params.push(updates.paymentUrl ?? null);
  }
  if (updates.note !== undefined) {
    sets.push('note = ?');
    params.push(updates.note ?? '');
  }

  if (sets.length === 0) return;

  params.push(id);
  await db.runAsync(`UPDATE bill_reminders SET ${sets.join(', ')} WHERE id = ?`, params);
  DeviceEventEmitter.emit('billsUpdated');
}

export async function deleteBill(id: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM bill_reminders WHERE id = ?', [id]);
  DeviceEventEmitter.emit('billsUpdated');
}

export async function dismissBill(id: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync("UPDATE bill_reminders SET status = 'DISMISSED' WHERE id = ?", [id]);
  DeviceEventEmitter.emit('billsUpdated');
}

/**
 * Mark a bill as PAID.
 * If the bill has a recurring frequency (e.g. 'monthly', 'quarterly', 'yearly'),
 * this schedules the next cycle automatically.
 */
export async function markBillAsPaid(
  id: string,
  paidDate?: string,
  paidTransactionId?: string
): Promise<{ updatedBill: BillReminder; nextBill?: BillReminder }> {
  const db = getDatabase();
  const effectivePaidDate = paidDate || new Date().toISOString().split('T')[0];

  const current = await getBillById(id);
  if (!current) {
    throw new Error(`Bill not found: ${id}`);
  }

  await db.runAsync(
    `UPDATE bill_reminders 
     SET status = 'PAID', paid_date = ?, paid_transaction_id = ? 
     WHERE id = ?`,
    [effectivePaidDate, paidTransactionId || null, id]
  );

  const updatedBill: BillReminder = {
    ...current,
    status: 'PAID',
    paidDate: effectivePaidDate,
    paidTransactionId: paidTransactionId || current.paidTransactionId,
  };

  let nextBill: BillReminder | undefined;

  // Auto-schedule next cycle if recurring
  if (current.repeatFrequency && current.repeatFrequency !== 'one_time') {
    const nextDueDate = calculateNextDate(
      current.dueDate,
      current.repeatFrequency === 'quarterly' ? 'monthly' : (current.repeatFrequency as any)
    );

    // If quarterly, advance 3 months
    const actualNextDueDate =
      current.repeatFrequency === 'quarterly'
        ? calculateNextDate(calculateNextDate(nextDueDate, 'monthly'), 'monthly')
        : nextDueDate;

    nextBill = await insertBill({
      source: current.source,
      billerName: current.billerName,
      billerCategory: current.billerCategory,
      amountDue: current.amountDue,
      minAmountDue: current.minAmountDue,
      dueDate: actualNextDueDate,
      repeatFrequency: current.repeatFrequency,
      accountReference: current.accountReference,
      reminderDaysBefore: current.reminderDaysBefore,
      paymentUrl: current.paymentUrl,
      note: current.note,
    });
  }

  DeviceEventEmitter.emit('billsUpdated');
  return { updatedBill, nextBill };
}

/**
 * Merge or insert a bill extracted from SMS.
 * Prevents duplicates when reminder SMS is received multiple times for same billing cycle.
 */
export async function mergeOrInsertSmsBill(extracted: {
  billerName: string;
  billerCategory: BillerCategory;
  amountDue: number;
  minAmountDue?: number;
  dueDate: string;
  accountReference?: string;
  paymentUrl?: string;
  smsId?: string;
  note?: string;
}): Promise<{ bill: BillReminder; isNew: boolean }> {
  const db = getDatabase();

  // Search for an existing unpaid bill from same biller within 15 days of due date
  const [year, month, day] = extracted.dueDate.split('-').map(Number);
  const dueTime = new Date(year, month - 1, day).getTime();
  const minRange = new Date(dueTime - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const maxRange = new Date(dueTime + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const existing = await db.getFirstAsync<BillReminderRow>(
    `SELECT * FROM bill_reminders 
     WHERE (status = 'UNPAID' OR status = 'OVERDUE')
       AND (biller_name LIKE ? OR biller_category = ?)
       AND due_date BETWEEN ? AND ?
     LIMIT 1`,
    [`%${extracted.billerName}%`, extracted.billerCategory, minRange, maxRange]
  );

  if (existing) {
    // Update existing unpaid bill with latest amount/link/smsId
    await db.runAsync(
      `UPDATE bill_reminders 
       SET amount_due = ?, 
           min_amount_due = COALESCE(?, min_amount_due),
           due_date = ?,
           account_reference = COALESCE(?, account_reference),
           payment_url = COALESCE(?, payment_url),
           sms_id = COALESCE(?, sms_id)
       WHERE id = ?`,
      [
        extracted.amountDue,
        extracted.minAmountDue ?? null,
        extracted.dueDate,
        extracted.accountReference ?? null,
        extracted.paymentUrl ?? null,
        extracted.smsId ?? null,
        existing.id,
      ]
    );

    const updated = await getBillById(existing.id);
    DeviceEventEmitter.emit('billsUpdated');
    return { bill: updated!, isNew: false };
  }

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const todayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.round((dueTime - todayTime) / (1000 * 60 * 60 * 24));

  // If the bill is older than 30 days in the past, ignore it or check if it was already settled
  if (diffDays < -30) {
    // Check if a historical transaction matched it
    const existingPaid = await db.getFirstAsync<BillReminderRow>(
      `SELECT * FROM bill_reminders 
       WHERE biller_name LIKE ? AND due_date BETWEEN ? AND ?
       LIMIT 1`,
      [`%${extracted.billerName}%`, minRange, maxRange]
    );
    if (existingPaid) {
      return { bill: mapRow(existingPaid), isNew: false };
    }

    const matchedTx = await db.getFirstAsync<{ id: string; date: string }>(
      `SELECT id, date FROM transactions 
       WHERE (merchant LIKE ? OR category LIKE ?) 
         AND ABS(amount - ?) <= ? 
         AND type = 'expense'
         AND date BETWEEN ? AND ?
       LIMIT 1`,
      [
        `%${extracted.billerName}%`,
        `%${extracted.billerCategory}%`,
        extracted.amountDue,
        Math.max(1, extracted.amountDue * 0.02),
        minRange,
        maxRange,
      ]
    );

    if (matchedTx) {
      const paidBill = await insertBill({
        source: 'SMS',
        billerName: extracted.billerName,
        billerCategory: extracted.billerCategory,
        amountDue: extracted.amountDue,
        minAmountDue: extracted.minAmountDue,
        dueDate: extracted.dueDate,
        repeatFrequency: 'one_time',
        accountReference: extracted.accountReference,
        paymentUrl: extracted.paymentUrl,
        smsId: extracted.smsId,
        status: 'PAID',
        paidDate: matchedTx.date.split('T')[0],
        paidTransactionId: matchedTx.id,
        note: 'Historical bill matched from transactions',
      });
      return { bill: paidBill, isNew: true };
    }

    // Otherwise skip ancient historical unpaid bills so user is not spammed with old cycles
    return {
      bill: {
        id: 'skipped',
        source: 'SMS',
        billerName: extracted.billerName,
        billerCategory: extracted.billerCategory,
        amountDue: extracted.amountDue,
        dueDate: extracted.dueDate,
        repeatFrequency: 'one_time',
        status: 'DISMISSED',
        reminderDaysBefore: 3,
        createdAt: new Date().toISOString(),
      },
      isNew: false,
    };
  }

  // Check if a payment already exists in transactions for this bill
  const matchedPayment = await db.getFirstAsync<{ id: string; date: string }>(
    `SELECT id, date FROM transactions 
     WHERE (merchant LIKE ? OR category LIKE ?) 
       AND ABS(amount - ?) <= ? 
       AND type = 'expense'
       AND date BETWEEN ? AND ?
     LIMIT 1`,
    [
      `%${extracted.billerName}%`,
      `%${extracted.billerCategory}%`,
      extracted.amountDue,
      Math.max(1, extracted.amountDue * 0.02),
      minRange,
      maxRange,
    ]
  );

  const initialStatus: BillStatus = matchedPayment
    ? 'PAID'
    : diffDays < 0
      ? 'OVERDUE'
      : 'UNPAID';

  // Insert new bill reminder
  const newBill = await insertBill({
    source: 'SMS',
    billerName: extracted.billerName,
    billerCategory: extracted.billerCategory,
    amountDue: extracted.amountDue,
    minAmountDue: extracted.minAmountDue,
    dueDate: extracted.dueDate,
    repeatFrequency: 'one_time',
    accountReference: extracted.accountReference,
    paymentUrl: extracted.paymentUrl,
    smsId: extracted.smsId,
    status: initialStatus,
    paidDate: matchedPayment ? matchedPayment.date.split('T')[0] : undefined,
    paidTransactionId: matchedPayment ? matchedPayment.id : undefined,
    note: extracted.note || 'Auto-detected from SMS',
    reminderDaysBefore: 3,
  });

  // Only send notification for upcoming unpaid bills (never for past or already paid bills)
  if (initialStatus === 'UNPAID' && diffDays >= 0) {
    insertNotification({
      title: `New Bill Detected: ${extracted.billerName}`,
      description: `Bill of ${formatCurrency(extracted.amountDue)} due on ${extracted.dueDate} was auto-detected from SMS.`,
      type: 'default',
      actionUrl: '/(app)/bills',
    }).catch(() => {});
    DeviceEventEmitter.emit('notificationsUpdated');
  }

  return { bill: newBill, isNew: true };
}

/**
 * Finds matching unpaid bill when a payment transaction occurs.
 */
export async function findMatchingUnpaidBill(
  billerOrMerchant: string,
  amount: number,
  transactionDateStr: string,
  toleranceDays: number = 7,
  tolerancePct: number = 0.02
): Promise<BillReminder | null> {
  const db = getDatabase();
  const txDate = transactionDateStr.split('T')[0];
  const [year, month, day] = txDate.split('-').map(Number);
  const targetTime = new Date(year, month - 1, day).getTime();

  const minDueDate = new Date(targetTime - toleranceDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const maxDueDate = new Date(targetTime + toleranceDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const rows = await db.getAllAsync<BillReminderRow>(
    `SELECT * FROM bill_reminders 
     WHERE (status = 'UNPAID' OR status = 'OVERDUE')
       AND due_date BETWEEN ? AND ?`,
    [minDueDate, maxDueDate]
  );

  const cleanMerchant = billerOrMerchant.toLowerCase().trim();

  for (const row of rows) {
    const cleanBiller = row.biller_name.toLowerCase().trim();
    const isNameMatch =
      cleanMerchant.includes(cleanBiller) ||
      cleanBiller.includes(cleanMerchant) ||
      (row.account_reference && cleanMerchant.includes(row.account_reference.toLowerCase()));

    if (!isNameMatch) continue;

    // Check amount match (total due or min amount due with tolerance)
    const matchesTotalDue = Math.abs(row.amount_due - amount) <= Math.max(1, row.amount_due * tolerancePct);
    const matchesMinDue =
      row.min_amount_due != null &&
      Math.abs(row.min_amount_due - amount) <= Math.max(1, row.min_amount_due * tolerancePct);

    if (matchesTotalDue || matchesMinDue) {
      return mapRow(row);
    }
  }

  return null;
}

/**
 * Aggregates monthly bill totals for committed expenses analysis in Budget / Plan.
 */
export async function getMonthlyBillSummary(
  month: number, // 1-12
  year: number
): Promise<MonthlyBillSummary> {
  const db = getDatabase();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const monthStr = `${year}-${pad(month)}`;

  const rows = await db.getAllAsync<BillReminderRow>(
    `SELECT * FROM bill_reminders WHERE due_date LIKE ?`,
    [`${monthStr}%`]
  );

  let totalCommitted = 0;
  let totalPaid = 0;
  let totalPending = 0;
  let totalOverdue = 0;
  let upcomingCount = 0;
  let paidCount = 0;

  for (const row of rows) {
    totalCommitted += row.amount_due;
    if (row.status === 'PAID') {
      totalPaid += row.amount_due;
      paidCount++;
    } else if (row.status === 'OVERDUE') {
      totalOverdue += row.amount_due;
      totalPending += row.amount_due;
      upcomingCount++;
    } else if (row.status === 'UNPAID') {
      totalPending += row.amount_due;
      upcomingCount++;
    }
  }

  return {
    month,
    year,
    totalCommitted,
    totalPaid,
    totalPending,
    totalOverdue,
    upcomingCount,
    paidCount,
  };
}

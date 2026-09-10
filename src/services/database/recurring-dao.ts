import { DeviceEventEmitter } from 'react-native';
import { getDatabase } from './index';
import { insertTransaction } from './transaction-dao';
import { insertNotification } from './notification-dao';
import { evaluateTransactionBudgetAlerts } from '@/services/notifications/alert-engine';
import { queueAutoBackup } from '@/services/cloud/google-drive-service';
import { formatCurrency } from '@/utils/format';
import type {
  RecurringTransaction,
  RecurringTransactionWithAccount,
  TransactionType,
  RecurringFrequency,
} from '@/types';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface RecurringTransactionRow {
  id: string;
  account_id: string;
  to_account_id?: string;
  amount: number;
  type: string;
  merchant: string;
  category: string;
  frequency: string;
  next_process_date: string;
  last_processed_date?: string;
  is_active: number;
  splits_json?: string;
  account_name?: string;
  to_account_name?: string;
}

function mapRow(row: RecurringTransactionRow): RecurringTransactionWithAccount {
  let splits: { category: string; amount: number }[] | undefined;
  if (row.splits_json) {
    try {
      splits = JSON.parse(row.splits_json);
    } catch {
      splits = undefined;
    }
  }

  return {
    id: row.id,
    accountId: row.account_id,
    toAccountId: row.to_account_id,
    amount: row.amount,
    type: row.type as TransactionType,
    merchant: row.merchant,
    category: row.category,
    frequency: row.frequency as RecurringFrequency,
    nextProcessDate: row.next_process_date,
    lastProcessedDate: row.last_processed_date,
    isActive: Boolean(row.is_active),
    splits,
    splits_json: row.splits_json,
    accountName: row.account_name ?? 'Unknown Account',
    toAccountName: row.to_account_name,
  };
}

export async function createRecurringTransaction(
  data: Omit<RecurringTransaction, 'id' | 'isActive'> & {
    isActive?: boolean;
    lastProcessedDate?: string;
  }
): Promise<RecurringTransaction> {
  const db = getDatabase();
  const id = generateId();

  const splitsJson = data.splits_json
    ? data.splits_json
    : data.splits && data.splits.length > 0
      ? JSON.stringify(data.splits)
      : null;

  await db.runAsync(
    `INSERT INTO recurring_transactions 
     (id, account_id, to_account_id, amount, type, merchant, category, frequency, next_process_date, last_processed_date, is_active, splits_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.accountId,
      data.toAccountId || null,
      data.amount,
      data.type,
      data.merchant,
      data.category,
      data.frequency,
      data.nextProcessDate,
      data.lastProcessedDate || null,
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : 1,
      splitsJson,
    ]
  );

  return {
    id,
    ...data,
    isActive: data.isActive !== undefined ? data.isActive : true,
    splits_json: splitsJson || undefined,
  };
}

export async function getActiveRecurringTransactions(): Promise<RecurringTransactionWithAccount[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<RecurringTransactionRow>(
    `SELECT rt.*, a.name as account_name, ta.name as to_account_name
     FROM recurring_transactions rt
     LEFT JOIN accounts a ON rt.account_id = a.id
     LEFT JOIN accounts ta ON rt.to_account_id = ta.id
     WHERE rt.is_active = 1
     ORDER BY rt.next_process_date ASC`
  );
  return rows.map(mapRow);
}

export async function getAllRecurringTransactions(): Promise<RecurringTransactionWithAccount[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<RecurringTransactionRow>(
    `SELECT rt.*, a.name as account_name, ta.name as to_account_name
     FROM recurring_transactions rt
     LEFT JOIN accounts a ON rt.account_id = a.id
     LEFT JOIN accounts ta ON rt.to_account_id = ta.id
     ORDER BY rt.next_process_date ASC`
  );
  return rows.map(mapRow);
}

export async function deleteRecurringTransaction(id: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM recurring_transactions WHERE id = ?', [id]);
}

export async function toggleRecurringTransactionActive(
  id: string,
  isActive: boolean
): Promise<void> {
  const db = getDatabase();
  await db.runAsync('UPDATE recurring_transactions SET is_active = ? WHERE id = ?', [
    isActive ? 1 : 0,
    id,
  ]);
}

/**
 * Deterministic date calculation that handles month-end clamping and avoids timezone drift.
 */
export function calculateNextDate(currentDateStr: string, frequency: RecurringFrequency): string {
  const [yearStr, monthStr, dayStr] = currentDateStr.split('T')[0].split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10); // 1-12
  let day = parseInt(dayStr, 10); // 1-31

  const pad = (n: number) => n.toString().padStart(2, '0');

  switch (frequency) {
    case 'daily': {
      const d = new Date(year, month - 1, day);
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    case 'weekly': {
      const d = new Date(year, month - 1, day);
      d.setDate(d.getDate() + 7);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    case 'monthly': {
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
      // Month-end clamping (e.g. Jan 31 -> Feb 28 or 29, Mar 31 -> Apr 30)
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
  }
}

let isProcessingRecurring = false;

export async function processDueRecurringTransactions(): Promise<number> {
  if (isProcessingRecurring) {
    return 0;
  }

  isProcessingRecurring = true;
  let totalProcessed = 0;

  try {
    const db = getDatabase();

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const dueTransactions = await db.getAllAsync<RecurringTransactionRow>(
      `SELECT * FROM recurring_transactions 
       WHERE is_active = 1 AND next_process_date <= ?`,
      [today]
    );

    for (const rt of dueTransactions) {
      try {
        let currentDate = rt.next_process_date;
        let lastProcessed = rt.last_processed_date || currentDate;
        let count = 0;
        const MAX_CYCLES = 24; // safety guard

        let parsedSplits: { category: string; amount: number }[] | undefined;
        if (rt.splits_json) {
          try {
            parsedSplits = JSON.parse(rt.splits_json);
          } catch {
            parsedSplits = undefined;
          }
        }

        while (currentDate <= today && count < MAX_CYCLES) {
          // Check if an SMS or manual transaction already captured this recurring charge for this cycle
          const existingTx = await db.getFirstAsync<{ id: string; is_recurring: number }>(
            `SELECT id, is_recurring FROM transactions
             WHERE account_id = ?
               AND amount = ?
               AND type = ?
               AND (date(date) = date(?) OR date LIKE ?)
             LIMIT 1`,
            [rt.account_id, rt.amount, rt.type, currentDate, `${currentDate}%`]
          );

          if (existingTx) {
            if (!existingTx.is_recurring) {
              await db.runAsync('UPDATE transactions SET is_recurring = 1 WHERE id = ?', [
                existingTx.id,
              ]);
            }
            lastProcessed = currentDate;
            currentDate = calculateNextDate(currentDate, rt.frequency as RecurringFrequency);
            count++;
            totalProcessed++;
            continue;
          }

          const newTx = await insertTransaction({
            accountId: rt.account_id,
            toAccountId: rt.to_account_id,
            amount: rt.amount,
            type: rt.type as TransactionType,
            merchant: rt.merchant,
            category: rt.category,
            date: currentDate,
            isRecurring: true,
            note: 'Auto-generated recurring transaction',
            splits: parsedSplits,
            source: 'MANUAL',
            status: 'PENDING_MATCH',
          });

          // Evaluate budget alerts if expense
          if (rt.type === 'expense') {
            evaluateTransactionBudgetAlerts(newTx).catch(() => {});
          }

          lastProcessed = currentDate;
          currentDate = calculateNextDate(currentDate, rt.frequency as RecurringFrequency);
          count++;
          totalProcessed++;
        }

        if (count > 0) {
          await insertNotification({
            title: 'Recurring Transaction Processed',
            description: `Scheduled ${rt.type} of ${formatCurrency(rt.amount)} for "${rt.merchant}" was automatically recorded${count > 1 ? ` (${count} cycles)` : ''}.`,
            type: 'default',
            actionUrl: '/(app)/(tabs)/transactions',
          });

          await db.runAsync(
            `UPDATE recurring_transactions 
             SET last_processed_date = ?, next_process_date = ? 
             WHERE id = ?`,
            [lastProcessed, currentDate, rt.id]
          );
        }
      } catch (error) {
        console.error(`Failed to process recurring transaction ${rt.id}:`, error);
      }
    }

    if (totalProcessed > 0) {
      DeviceEventEmitter.emit('transactionsUpdated');
      DeviceEventEmitter.emit('notificationsUpdated');
      queueAutoBackup('recurring-processed');
    }

    return totalProcessed;
  } finally {
    isProcessingRecurring = false;
  }
}

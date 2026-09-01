import { getDatabase } from './index';
import { insertTransaction } from './transaction-dao';
import { insertNotification } from './notification-dao';
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
  account_name?: string;
  to_account_name?: string;
}

function mapRow(row: RecurringTransactionRow): RecurringTransactionWithAccount {
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
    accountName: row.account_name ?? 'Unknown Account',
    toAccountName: row.to_account_name,
  };
}

export async function createRecurringTransaction(
  data: Omit<RecurringTransaction, 'id' | 'lastProcessedDate' | 'isActive'>
): Promise<RecurringTransaction> {
  const db = getDatabase();
  const id = generateId();

  await db.runAsync(
    `INSERT INTO recurring_transactions 
     (id, account_id, to_account_id, amount, type, merchant, category, frequency, next_process_date, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
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
    ]
  );

  return {
    id,
    ...data,
    isActive: true,
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

export async function deleteRecurringTransaction(id: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM recurring_transactions WHERE id = ?', [id]);
}

function calculateNextDate(currentDateStr: string, frequency: RecurringFrequency): string {
  const date = new Date(currentDateStr);
  switch (frequency) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
  }
  return date.toISOString().split('T')[0];
}

export async function processDueRecurringTransactions(): Promise<void> {
  const db = getDatabase();

  const today = new Date().toISOString().split('T')[0];
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

      while (currentDate <= today && count < MAX_CYCLES) {
        // Create the transaction for each due period
        await insertTransaction({
          accountId: rt.account_id,
          toAccountId: rt.to_account_id,
          amount: rt.amount,
          type: rt.type as TransactionType,
          merchant: rt.merchant,
          category: rt.category,
          date: currentDate,
          isRecurring: true,
          note: 'Auto-generated recurring transaction',
        });

        lastProcessed = currentDate;
        currentDate = calculateNextDate(currentDate, rt.frequency as RecurringFrequency);
        count++;
      }

      // Insert single summary notification
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
    } catch (error) {
      console.error(`Failed to process recurring transaction ${rt.id}:`, error);
    }
  }
}

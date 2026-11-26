import { DeviceEventEmitter } from 'react-native';
import { getDatabase } from './index';
import { getAccountById } from './account-dao';
import { insertTransaction } from './transaction-dao';
import { insertNotification } from './notification-dao';
import { evaluateTransactionBudgetAlerts } from '@/services/notifications/alert-engine';
import { queueAutoBackup } from '@/services/cloud/google-drive-service';
import { isLiabilityAccountType } from '@/utils/account-metrics';
import { formatCurrency } from '@/utils/format';
import type {
  RecurringTransaction,
  RecurringTransactionWithAccount,
  TransactionType,
  RecurringFrequency,
} from '@/types';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r % 4) + 8;
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
     ORDER BY rt.is_active DESC, rt.next_process_date ASC`
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

export { calculateNextDate } from '@/utils/date';
import { calculateNextDate } from '@/utils/date';

let isProcessingRecurring = false;

const round2 = (value: number): number => Math.round(value * 100) / 100;

export async function processDueRecurringTransactions(): Promise<number> {
  if (isProcessingRecurring) {
    return 0;
  }

  isProcessingRecurring = true;
  let totalProcessed = 0;
  let stateChanged = false;

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
        const targetDay = parseInt(currentDate.split('-')[2] || '1', 10);
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

        let toAccount: Awaited<ReturnType<typeof getAccountById>> = null;
        let trackedLiabilityDebt: number | null = null;
        if (rt.type === 'transfer' && rt.to_account_id) {
          try {
            toAccount = await getAccountById(rt.to_account_id);
          } catch {
            toAccount = null;
          }
          if (toAccount && isLiabilityAccountType(toAccount.type)) {
            trackedLiabilityDebt = toAccount.balance < 0 ? round2(Math.abs(toAccount.balance)) : 0;
          }
        }

        if (trackedLiabilityDebt !== null && trackedLiabilityDebt <= 0.005) {
          await db.runAsync('UPDATE recurring_transactions SET is_active = 0 WHERE id = ?', [rt.id]);
          await insertNotification({
            title: 'Loan / Debt Already Paid Off',
            description: `Recurring transfer to "${toAccount?.name || rt.merchant || 'Account'}" was paused because the balance is already settled.`,
            type: 'bill',
            actionUrl: '/(app)/(tabs)/transactions',
          });
          stateChanged = true;
          continue;
        }

        let createdTxCount = 0;
        let lastInsertedAmount = rt.amount;
        let shouldAutoPause = false;

        while (currentDate <= today && count < MAX_CYCLES) {
          if (trackedLiabilityDebt !== null && trackedLiabilityDebt <= 0.005) {
            shouldAutoPause = true;
            break;
          }

          const cycleAmount =
            trackedLiabilityDebt !== null ? round2(Math.min(rt.amount, trackedLiabilityDebt)) : rt.amount;

          // Check if an SMS or manual transaction already captured this recurring charge for this cycle
          // Window: within 2 days of scheduled date, matching amount, account, recipient (for transfers), and merchant/category
          const cleanMerchant = (rt.merchant || '').toLowerCase().trim();
          const hasMerchant = cleanMerchant.length > 0;
          const merchantFilter = hasMerchant
            ? `(LOWER(merchant) LIKE ? OR ? LIKE '%' || LOWER(merchant) || '%')`
            : `(category = ?)`;
          const merchantParams = hasMerchant
            ? [`%${cleanMerchant}%`, cleanMerchant]
            : [rt.category];
          const transferRecipientFilter =
            rt.type === 'transfer' && rt.to_account_id ? 'AND to_account_id = ?' : '';
          const transferRecipientParams =
            rt.type === 'transfer' && rt.to_account_id ? [rt.to_account_id] : [];

          const existingTx = await db.getFirstAsync<{ id: string; is_recurring: number }>(
            `SELECT id, is_recurring FROM transactions
             WHERE account_id = ?
               AND ABS(amount - ?) <= 0.01
               AND type = ?
               ${transferRecipientFilter}
               AND (
                 date(date) BETWEEN date(?, '-2 days') AND date(?, '+2 days')
                 OR date LIKE ?
               )
               AND ${merchantFilter}
             LIMIT 1`,
            [
              rt.account_id,
              cycleAmount,
              rt.type,
              ...transferRecipientParams,
              currentDate,
              currentDate,
              `${currentDate}%`,
              ...merchantParams,
            ]
          );

          if (existingTx) {
            if (!existingTx.is_recurring) {
              await db.runAsync('UPDATE transactions SET is_recurring = 1 WHERE id = ?', [
                existingTx.id,
              ]);
            }
            if (trackedLiabilityDebt !== null) {
              trackedLiabilityDebt = round2(Math.max(0, trackedLiabilityDebt - cycleAmount));
            }
            lastProcessed = currentDate;
            currentDate = calculateNextDate(currentDate, rt.frequency as RecurringFrequency, targetDay);
            count++;
            totalProcessed++;
            if (trackedLiabilityDebt !== null && trackedLiabilityDebt <= 0.005) {
              shouldAutoPause = true;
              break;
            }
            continue;
          }

          const newTx = await insertTransaction({
            accountId: rt.account_id,
            toAccountId: rt.to_account_id,
            amount: cycleAmount,
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

          if (trackedLiabilityDebt !== null) {
            trackedLiabilityDebt = round2(Math.max(0, trackedLiabilityDebt - cycleAmount));
          }

          lastInsertedAmount = cycleAmount;
          createdTxCount++;
          lastProcessed = currentDate;
          currentDate = calculateNextDate(currentDate, rt.frequency as RecurringFrequency, targetDay);
          count++;
          totalProcessed++;

          if (trackedLiabilityDebt !== null && trackedLiabilityDebt <= 0.005) {
            shouldAutoPause = true;
            break;
          }
        }

        if (count > 0 || shouldAutoPause) {
          if (createdTxCount > 0 && shouldAutoPause) {
            await insertNotification({
              title: 'Loan / Debt Paid Off!',
              description: `Final recurring payment of ${formatCurrency(lastInsertedAmount)} settled "${toAccount?.name || rt.merchant || 'Account'}". Recurring schedule paused automatically.`,
              type: 'milestone',
              actionUrl: '/(app)/(tabs)/transactions',
            });
          } else if (createdTxCount > 0) {
            await insertNotification({
              title: 'Recurring Transaction Processed',
              description: `Scheduled ${rt.type} of ${formatCurrency(lastInsertedAmount)} for "${rt.merchant}" was automatically recorded${createdTxCount > 1 ? ` (${createdTxCount} cycles)` : ''}.`,
              type: 'bill',
              actionUrl: '/(app)/(tabs)/transactions',
            });
          } else if (shouldAutoPause) {
            await insertNotification({
              title: 'Loan / Debt Paid Off!',
              description: `Recurring transfer to "${toAccount?.name || rt.merchant || 'Account'}" was paused automatically after settling the balance.`,
              type: 'milestone',
              actionUrl: '/(app)/(tabs)/transactions',
            });
          }

          if (shouldAutoPause) {
            await db.runAsync(
              `UPDATE recurring_transactions 
               SET last_processed_date = ?, next_process_date = ?, is_active = 0 
               WHERE id = ?`,
              [lastProcessed, currentDate, rt.id]
            );
            stateChanged = true;
          } else {
            await db.runAsync(
              `UPDATE recurring_transactions 
               SET last_processed_date = ?, next_process_date = ? 
               WHERE id = ?`,
              [lastProcessed, currentDate, rt.id]
            );
          }
        }
      } catch {
        // Failed to process recurring transaction
      }
    }

    if (totalProcessed > 0 || stateChanged) {
      DeviceEventEmitter.emit('transactionsUpdated');
      DeviceEventEmitter.emit('notificationsUpdated');
      queueAutoBackup('recurring-processed');
    }

    return totalProcessed;
  } finally {
    isProcessingRecurring = false;
  }
}

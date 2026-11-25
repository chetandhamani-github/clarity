import { DeviceEventEmitter } from 'react-native';
import { queryClient } from '@/lib/query-client';
import { BillExtractor } from '@/modules/sms/extractor/billExtractor';
import { SmsPipelineService } from '@/modules/sms/services/smsPipelineService';
import { SmsSyncService } from '@/modules/sms/services/smsSyncService';
import { SmsDao } from '@/modules/sms/storage/smsDao';
import { BillService } from '@/modules/bills/services/BillService';
import { mapExternalBillerCategory } from '@/modules/bills/utils/bill-helpers';
import { BillAlertEngine } from '@/services/notifications/bill-alert-engine';
import type { RawSmsMessage } from '@/modules/sms/types';
import type { RawNotificationPayload, NotificationParseResult } from '../types';

const GENERIC_TITLE_REGEX =
  /(?:₹|rs\.?|inr|\$|€|£|\bpaid\b|\breceived\b|\bdebited\b|\bcredited\b|\btransaction\b|\bpayment\b|\balert\b|\bnotification\b|\bbill\b|\botp\b|\breminder\b)/i;

const ACTION_ONLY_TEXT_REGEX =
  /^(?:you\s+)?(?:paid|sent|received)\s+(?:you\s+)?(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d{1,2})?(?:\s|$)/i;

const INCOMING_YOU_REGEX = /^(?:paid|sent|transferred)\s+you\b|^you\s+received\b/i;

function isLikelyCounterpartyTitle(title: string, appName?: string): boolean {
  const clean = title.trim();
  if (clean.length < 2 || clean.length > 60) return false;
  if (appName && clean.toLowerCase() === appName.trim().toLowerCase()) return false;
  if (GENERIC_TITLE_REGEX.test(clean)) return false;
  if (/^\d+$/.test(clean)) return false;
  return true;
}

export function buildNotificationBody(notification: RawNotificationPayload): string {
  const title = (notification.title || '').trim();
  const text = (notification.text || '').trim();
  const bigText = (notification.bigText || '').trim();
  const primaryText = bigText.length >= text.length ? bigText : text;

  // Handle common UPI notification pattern where title is counterparty name ("Chai Point")
  // and text omits "to/from" ("You paid ₹450" or "Paid you ₹500").
  if (
    title &&
    primaryText &&
    isLikelyCounterpartyTitle(title, notification.appName) &&
    ACTION_ONLY_TEXT_REGEX.test(primaryText) &&
    !/\b(?:to|from|at|towards)\b/i.test(primaryText)
  ) {
    const isIncoming = INCOMING_YOU_REGEX.test(primaryText);
    const enrichedLine = isIncoming
      ? `${primaryText} from ${title}`
      : `${primaryText} to ${title}`;
    const remainingParts = [text, bigText].filter(
      (part) => part && part !== primaryText
    );
    return Array.from(new Set([enrichedLine, ...remainingParts])).join('\n').trim();
  }

  const parts = [title, text, bigText].filter(Boolean);
  return Array.from(new Set(parts)).join('\n').trim();
}

function invalidateLedgerQueries(): void {
  try {
    const keys = [
      ['transactions'],
      ['accounts'],
      ['totals'],
      ['cashflow'],
      ['safeToSpend'],
      ['categorySpending'],
      ['budgetPlan'],
      ['bills'],
      ['financial_health_report'],
      ['aiDigest'],
      ['active_debt_list'],
    ];
    for (const queryKey of keys) {
      queryClient.invalidateQueries({ queryKey }).catch(() => {});
    }
  } catch {
    // Ignore when QueryClient is unavailable in isolated unit tests
  }
}

export class NotificationParsingService {
  /**
   * Process an incoming notification payload through Clarity's intelligence engine.
   */
  public static async processNotification(
    notification: RawNotificationPayload,
    options: {
      parseTransactions?: boolean;
      parseBills?: boolean;
    } = {}
  ): Promise<NotificationParseResult> {
    const { parseTransactions = true, parseBills = true } = options;

    const body = buildNotificationBody(notification);
    if (!body) {
      return { type: 'IGNORED', reason: 'EMPTY_NOTIFICATION_BODY' };
    }

    // Idempotency guard: avoid re-processing notifications already saved in SQLite
    try {
      if (typeof SmsDao.getExistingSmsIds === 'function') {
        const existing = await SmsDao.getExistingSmsIds([notification.id]);
        if (existing.has(notification.id)) {
          return { type: 'IGNORED', reason: 'ALREADY_PROCESSED' };
        }
      }
    } catch {
      // Ignore when SQLite is unavailable in isolated tests
    }

    const message: RawSmsMessage = {
      id: notification.id,
      address: notification.appName || notification.packageName,
      body,
      date: notification.postTime || Date.now(),
    };

    // 1. Check for Bill / Statement Due Reminders
    if (parseBills) {
      try {
        const extractedBill = BillExtractor.extractBill(message);
        if (extractedBill) {
          const billCategory = mapExternalBillerCategory(extractedBill.billerCategory);

          const { bill: insertedBill, isNew } = await BillService.mergeOrInsertExternalBill({
            title: extractedBill.billerName,
            provider: extractedBill.billerName,
            category: billCategory,
            amount: extractedBill.amountDue,
            minAmount: extractedBill.minAmountDue,
            dueDate: extractedBill.dueDate,
            accountReference: extractedBill.accountReference,
            paymentUrl: extractedBill.paymentUrl,
            smsId: message.id,
            source: 'sms',
            notes: `Auto-detected from ${notification.appName || 'Push Notification'}`,
          });

          await SmsDao.saveSmsBatch([message]).catch(() => {});

          if (insertedBill && insertedBill.status !== 'paid' && insertedBill.status !== 'dismissed') {
            await BillAlertEngine.scheduleNativeBillReminder({
              id: insertedBill.id,
              billerName: insertedBill.provider || insertedBill.title,
              amountDue: insertedBill.amount,
              dueDate: insertedBill.dueDate,
              status: insertedBill.status,
              reminderDaysBefore: insertedBill.reminderDays ?? 3,
            });
          }

          invalidateLedgerQueries();
          if (isNew) {
            DeviceEventEmitter.emit('billDetected', extractedBill);
          }
          DeviceEventEmitter.emit('notificationsUpdated');

          return { type: 'BILL', bill: extractedBill, isNew, billId: insertedBill?.id };
        }
      } catch {
        // Continue to transaction extraction if bill parsing had non-critical issue
      }
    }

    // 2. Check for Financial Debit / Credit Transaction
    if (parseTransactions) {
      try {
        const pipelineResult = await SmsPipelineService.processMessage(message, {
          checkDatabaseDuplicates: true,
        });

        if (pipelineResult.type === 'PARSED') {
          const tx = pipelineResult.transaction;

          // Save raw message & parsed record
          await SmsDao.saveSmsBatch([message]);
          await SmsDao.saveParsedTransactionsBatch([tx]);

          if (!tx.isDuplicate) {
            // Import immediately into Clarity accounts & transactions ledger
            await SmsSyncService.importParsedTransactions([tx]);
            invalidateLedgerQueries();
            DeviceEventEmitter.emit('transactionParsed', tx);
            DeviceEventEmitter.emit('notificationsUpdated');
          } else if (typeof SmsSyncService.enrichDuplicateTransaction === 'function') {
            const enriched = await SmsSyncService.enrichDuplicateTransaction(tx);
            if (enriched) {
              invalidateLedgerQueries();
            }
          }

          return {
            type: 'TRANSACTION',
            transaction: tx,
            isDuplicate: tx.isDuplicate,
          };
        } else if (pipelineResult.type === 'REVIEW') {
          await SmsDao.saveSmsBatch([message]);
          await SmsDao.saveReviewQueueBatch([pipelineResult.reviewItem]);
          import('@/store/useSmsStore')
            .then(({ useSmsStore }) => useSmsStore.getState().refreshReviewQueueCount())
            .catch(() => {});
          DeviceEventEmitter.emit('notificationsUpdated');
          return {
            type: 'IGNORED',
            reason: `SENT_TO_REVIEW_QUEUE: ${pipelineResult.reviewItem.reason}`,
          };
        } else {
          return {
            type: 'IGNORED',
            reason: pipelineResult.reason,
          };
        }
      } catch (err) {
        return {
          type: 'IGNORED',
          reason: err instanceof Error ? err.message : 'EXTRACTION_FAILED',
        };
      }
    }

    return { type: 'IGNORED', reason: 'PARSING_DISABLED' };
  }
}

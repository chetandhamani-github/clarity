import { queryClient } from '@/lib/query-client';
import { BillService } from '@/modules/bills/services/BillService';
import { mapExternalBillerCategory } from '@/modules/bills/utils/bill-helpers';
import { LocalCategorizerEngine } from '@/modules/sms/categorizer/localCategorizerEngine';
import { SmsClassificationEngine } from '@/modules/sms/classifier/smsClassificationEngine';
import { DuplicateDetectionEngine } from '@/modules/sms/duplicate/duplicateDetectionEngine';
import { createReviewItem } from '@/modules/sms/reviewQueue/reviewItemFactory';
import { SmsDao } from '@/modules/sms/storage/smsDao';
import type {
  ClassificationResult,
  ParsedTransaction,
  RawSmsMessage,
  ReviewQueueItem,
} from '@/modules/sms/types';
import { BillAlertEngine } from '@/services/notifications/bill-alert-engine';
import { useSmsStore } from '@/store/useSmsStore';
import { DeviceEventEmitter } from 'react-native';
import type { NotificationParseResult, RawNotificationPayload } from '../types';
import { NotificationBillExtractor } from './notificationBillExtractor';
import { buildNotificationBody, NotificationExtractor } from './notificationExtractor';
import { NotificationLedgerService } from './notificationLedgerService';

export { buildNotificationBody };

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r % 4) + 8;
    return v.toString(16);
  });
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

export type NotificationCandidateResult =
  | { type: 'PARSED'; transaction: ParsedTransaction }
  | { type: 'REVIEW'; reviewItem: ReviewQueueItem }
  | { type: 'IGNORED'; reason: string; classification?: ClassificationResult };

export class NotificationParsingService {
  private static processingQueue: Promise<void> = Promise.resolve();
  private static isResetInProgress = false;

  public static setResetInProgress(inProgress: boolean): void {
    this.isResetInProgress = inProgress;
  }

  public static async flushPendingWork(timeoutMs: number = 1500): Promise<void> {
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    try {
      await Promise.race([
        this.processingQueue.catch(() => undefined),
        new Promise<void>((resolve) => {
          timeoutHandle = setTimeout(resolve, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  /**
   * Parse and classify a notification transaction candidate without relying on SMS inbox parsers.
   */
  public static async parseTransactionCandidate(
    notification: RawNotificationPayload,
    options: { checkDatabaseDuplicates?: boolean } = {}
  ): Promise<NotificationCandidateResult> {
    const body = buildNotificationBody(notification);
    if (!body) {
      return { type: 'IGNORED', reason: 'EMPTY_NOTIFICATION_BODY' };
    }

    if (NotificationExtractor.isPushNoise(body)) {
      return { type: 'IGNORED', reason: 'PROMOTIONAL' };
    }

    const rawRecord: RawSmsMessage = {
      id: notification.id,
      address: notification.appName || notification.packageName,
      body,
      date: notification.postTime || Date.now(),
    };

    let classification = SmsClassificationEngine.classify(rawRecord);
    if (
      !classification.isFinancial &&
      classification.classification === 'UNKNOWN' &&
      NotificationExtractor.isExecutedPaymentAlert(body)
    ) {
      classification = {
        classification: /\bupi\b/i.test(body) || /\b(?:google pay|phonepe|paytm|bhim|cred)\b/i.test(rawRecord.address)
          ? 'UPI_PAYMENT'
          : 'TRANSACTION_DEBIT',
        confidence: 0.88,
        isFinancial: true,
        reasons: ['Executed payment confirmation notification'],
      };
    }

    if (!classification.isFinancial) {
      return {
        type: 'IGNORED',
        reason: classification.classification,
        classification,
      };
    }

    const extracted = NotificationExtractor.extract(notification, body, classification);
    if (!extracted) {
      return {
        type: 'REVIEW',
        reviewItem: createReviewItem(rawRecord, 'UNRECOGNIZED_FORMAT', classification.confidence),
      };
    }

    if (extracted.amount <= 0) {
      return {
        type: 'REVIEW',
        reviewItem: createReviewItem(rawRecord, 'MISSING_AMOUNT', 0.4, extracted),
      };
    }

    if (!extracted.bank || extracted.bank === 'Other Bank') {
      extracted.bank = 'Bank / UPI';
    }
    const accountSuffix = (extracted.accountMask || '').replace(/[^0-9]/g, '');
    if (!extracted.accountMask || accountSuffix.length < 3) {
      extracted.accountMask =
        extracted.accountMask && extracted.accountMask !== 'XXXX'
          ? extracted.accountMask
          : 'XXXX';
    }

    let category = LocalCategorizerEngine.categorize(extracted, classification.classification);
    if (extracted.merchant) {
      try {
        const { findCategoryForMerchant } = await import('@/services/database/merchant-rule-dao');
        const customCategory = await findCategoryForMerchant(extracted.merchant);
        if (customCategory) {
          category = customCategory;
        }
      } catch {
        // Ignore when SQLite is unavailable in isolated tests
      }
    }

    const dupCheck = await DuplicateDetectionEngine.isDuplicate(extracted, {
      checkDatabase: options.checkDatabaseDuplicates !== false,
    });

    const parsedTx: ParsedTransaction = {
      id: generateId(),
      smsId: notification.id,
      amount: extracted.amount,
      type: extracted.type,
      merchant: extracted.merchant,
      category,
      bank: extracted.bank,
      accountMask: extracted.accountMask,
      referenceNumber: extracted.referenceNumber,
      availableBalance: extracted.availableBalance,
      timestamp: extracted.timestamp,
      confidence: classification.confidence,
      isDuplicate: dupCheck.isDuplicate,
      duplicateOf: dupCheck.duplicateOfId,
      rawBody: body,
      createdAt: new Date().toISOString(),
    };

    DuplicateDetectionEngine.addToCache(parsedTx);

    return {
      type: 'PARSED',
      transaction: parsedTx,
    };
  }

  /**
   * Process an incoming notification payload through Clarity's notification intelligence engine.
   * Serialized to prevent concurrent cross-app notifications from racing duplicate/account checks.
   */
  public static processNotification(
    notification: RawNotificationPayload,
    options: {
      parseTransactions?: boolean;
      parseBills?: boolean;
    } = {}
  ): Promise<NotificationParseResult> {
    if (this.isResetInProgress) {
      return Promise.resolve({ type: 'IGNORED', reason: 'APP_RESET_IN_PROGRESS' });
    }

    const run = this.processingQueue.then(() =>
      this.processNotificationInternal(notification, options)
    );
    this.processingQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private static async processNotificationInternal(
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

    const messageRecord: RawSmsMessage = {
      id: notification.id,
      address: notification.appName || notification.packageName,
      body,
      date: notification.postTime || Date.now(),
    };

    // 1. Check for Bill / Utility / Mandate Due Reminders
    if (parseBills) {
      try {
        const extractedBill = NotificationBillExtractor.extractBill(notification, body);
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
            smsId: messageRecord.id,
            source: 'sms',
            frequency: extractedBill.frequency,
            isRecurring: extractedBill.isRecurring,
            notes: `Auto-detected from ${notification.appName || 'Push Notification'}`,
          });

          await SmsDao.saveSmsBatch([messageRecord]).catch(() => {});

          const isActionableBill =
            insertedBill && insertedBill.status !== 'paid' && insertedBill.status !== 'dismissed';

          if (isActionableBill) {
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
          import('@/modules/bills/store/bills.store')
            .then(({ useBillsStore }) => useBillsStore.getState().loadData())
            .catch(() => {});
          DeviceEventEmitter.emit('billsUpdated');

          const shouldPromptNewBill = Boolean(isNew && (!insertedBill || isActionableBill));
          if (shouldPromptNewBill) {
            DeviceEventEmitter.emit('billDetected', extractedBill);
          }
          DeviceEventEmitter.emit('notificationsUpdated');

          return {
            type: 'BILL',
            bill: extractedBill,
            isNew: shouldPromptNewBill,
            billId: insertedBill?.id,
          };
        }
      } catch {
        // Continue to transaction extraction if bill parsing had non-critical issue
      }
    }

    // 2. Check for Financial Debit / Credit Transaction
    if (parseTransactions) {
      try {
        const pipelineResult = await this.parseTransactionCandidate(notification, {
          checkDatabaseDuplicates: true,
        });

        if (pipelineResult.type === 'PARSED') {
          const tx = pipelineResult.transaction;

          await SmsDao.saveSmsBatch([messageRecord]);
          await SmsDao.saveParsedTransactionsBatch([tx]);

          if (!tx.isDuplicate) {
            let pendingForPrompt = [tx];
            if (typeof SmsDao.getUnlinkedParsedTransactions === 'function') {
              const dbUnlinked = await SmsDao.getUnlinkedParsedTransactions().catch(() => []);
              if (dbUnlinked.length > 0) {
                pendingForPrompt = dbUnlinked;
              }
            }
            try {
              const smsStore = useSmsStore.getState();
              smsStore.setPendingTransactions(pendingForPrompt);
              smsStore.openTransactionPrompt();
            } catch {
              // Ignore when store is unavailable in isolated unit tests
            }
            DeviceEventEmitter.emit('transactionParsed', tx);
            DeviceEventEmitter.emit('notificationsUpdated');
          } else if (typeof NotificationLedgerService.enrichDuplicateTransaction === 'function') {
            const enriched = await NotificationLedgerService.enrichDuplicateTransaction(tx);
            if (enriched) {
              invalidateLedgerQueries();
              if (typeof SmsDao.getUnlinkedParsedTransactions === 'function') {
                const dbUnlinked = await SmsDao.getUnlinkedParsedTransactions().catch(() => []);
                if (dbUnlinked.length > 0) {
                  try {
                    useSmsStore.getState().setPendingTransactions(dbUnlinked);
                  } catch {
                    // Ignore when store is unavailable in isolated unit tests
                  }
                }
              }
            }
          }

          return {
            type: 'TRANSACTION',
            transaction: tx,
            isDuplicate: tx.isDuplicate,
          };
        } else if (pipelineResult.type === 'REVIEW') {
          await SmsDao.saveSmsBatch([messageRecord]);
          await SmsDao.saveReviewQueueBatch([pipelineResult.reviewItem]);
          useSmsStore.getState().refreshReviewQueueCount().catch(() => {});
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

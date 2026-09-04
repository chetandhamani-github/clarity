import { mmkv } from '@/lib/storage';
import type {
  RawSmsMessage,
  ParsedTransaction,
  ReviewQueueItem,
  SmsSyncProgress,
} from '@/modules/sms/types';
import { SmsReaderService } from '@/modules/sms/reader/smsReaderService';
import { SmsPipelineService } from './smsPipelineService';
import { SmsDao } from '@/modules/sms/storage/smsDao';
import { DuplicateDetectionEngine } from '@/modules/sms/duplicate/duplicateDetectionEngine';
import { RecurringDetectionEngine } from '@/modules/sms/recurring/recurringDetectionEngine';
import { getAllAccounts, insertAccount } from '@/services/database/account-dao';
import { insertTransaction } from '@/services/database/transaction-dao';

const LAST_SYNC_KEY = 'clarity_last_sms_sync_timestamp';
const DEFAULT_CHUNK_SIZE = 200;

export interface SyncOptions {
  batchSize?: number;
  autoCreateClarityTransactions?: boolean;
  onProgress?: (progress: SmsSyncProgress) => void;
}

export class SmsSyncService {
  private static isSyncing = false;
  private static shouldCancel = false;

  /**
   * Get the timestamp of the last successful SMS synchronization.
   */
  public static getLastSyncTimestamp(): number | null {
    const val = mmkv.getString(LAST_SYNC_KEY);
    if (val) {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return null;
  }

  /**
   * Set the last sync timestamp.
   */
  public static setLastSyncTimestamp(timestamp: number): void {
    mmkv.set(LAST_SYNC_KEY, timestamp.toString());
  }

  /**
   * Cancel an in-progress synchronization.
   */
  public static cancelSync(): void {
    if (this.isSyncing) {
      this.shouldCancel = true;
    }
  }

  /**
   * Run initial full scan of historical SMS messages.
   */
  public static async runInitialScan(options: SyncOptions = {}): Promise<{
    scannedCount: number;
    parsedCount: number;
    reviewCount: number;
    duplicateCount: number;
  }> {
    if (this.isSyncing) {
      throw new Error('SMS synchronization is already in progress');
    }

    this.isSyncing = true;
    this.shouldCancel = false;
    DuplicateDetectionEngine.clearCache();

    const batchSize = options.batchSize ?? DEFAULT_CHUNK_SIZE;
    let scannedCount = 0;
    let parsedCount = 0;
    let reviewCount = 0;
    let duplicateCount = 0;
    let maxSeenTimestamp = 0;

    const reportProgress = (
      phase: SmsSyncProgress['phase'],
      processed: number,
      total: number,
      batchIndex: number,
      totalBatches: number
    ) => {
      options.onProgress?.({
        phase,
        processed,
        total,
        batchIndex,
        totalBatches,
      });
    };

    try {
      reportProgress('fetching', 0, 0, 0, 0);

      // Fetch all messages (or recent 20,000 for safety limit)
      const allMessages = await SmsReaderService.getAllSms({ limit: 25000 });
      const totalMessages = allMessages.length;

      if (totalMessages === 0) {
        reportProgress('complete', 0, 0, 0, 0);
        return { scannedCount: 0, parsedCount: 0, reviewCount: 0, duplicateCount: 0 };
      }

      const totalBatches = Math.ceil(totalMessages / batchSize);

      for (let i = 0; i < totalMessages; i += batchSize) {
        if (this.shouldCancel) break;

        const batchIndex = Math.floor(i / batchSize) + 1;
        const chunk = allMessages.slice(i, i + batchSize);

        reportProgress('classifying', i, totalMessages, batchIndex, totalBatches);

        const parsedBatch: ParsedTransaction[] = [];
        const reviewBatch: ReviewQueueItem[] = [];

        for (const msg of chunk) {
          if (msg.date > maxSeenTimestamp) {
            maxSeenTimestamp = msg.date;
          }

          const result = await SmsPipelineService.processMessage(msg, {
            checkDatabaseDuplicates: true,
          });

          if (result.type === 'PARSED') {
            parsedBatch.push(result.transaction);
            if (result.transaction.isDuplicate) {
              duplicateCount++;
            } else {
              parsedCount++;
            }
          } else if (result.type === 'REVIEW') {
            reviewBatch.push(result.reviewItem);
            reviewCount++;
          }
        }

        // Save raw SMS batch and parsed results to SQLite
        reportProgress('saving', i + chunk.length, totalMessages, batchIndex, totalBatches);
        await SmsDao.saveSmsBatch(chunk);
        await SmsDao.saveParsedTransactionsBatch(parsedBatch);
        await SmsDao.saveReviewQueueBatch(reviewBatch);

        // Optionally create transactions in Clarity's main transactions table
        if (options.autoCreateClarityTransactions !== false) {
          await this.syncToClarityTransactions(parsedBatch);
        }

        scannedCount += chunk.length;

        // Yield execution to the JavaScript microtask loop to prevent blocking UI
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      // Update sync pointer
      if (maxSeenTimestamp > 0) {
        this.setLastSyncTimestamp(maxSeenTimestamp);
      }

      reportProgress('complete', scannedCount, totalMessages, totalBatches, totalBatches);

      return {
        scannedCount,
        parsedCount,
        reviewCount,
        duplicateCount,
      };
    } finally {
      this.isSyncing = false;
      this.shouldCancel = false;
    }
  }

  /**
   * Run incremental scan for newly arrived SMS messages since last sync.
   */
  public static async runIncrementalScan(options: SyncOptions = {}): Promise<{
    scannedCount: number;
    parsedCount: number;
    reviewCount: number;
    duplicateCount: number;
  }> {
    if (this.isSyncing) {
      throw new Error('SMS synchronization is already in progress');
    }

    let lastSync = this.getLastSyncTimestamp();
    if (!lastSync) {
      // If no stored timestamp, check database maximum date
      lastSync = await SmsDao.getLatestSmsTimestamp();
    }

    if (!lastSync) {
      // First time sync, run initial scan
      return this.runInitialScan(options);
    }

    this.isSyncing = true;
    this.shouldCancel = false;

    let scannedCount = 0;
    let parsedCount = 0;
    let reviewCount = 0;
    let duplicateCount = 0;
    let maxSeenTimestamp = lastSync;

    try {
      const newMessages = await SmsReaderService.getSmsSince(lastSync, { limit: 2000 });
      if (newMessages.length === 0) {
        return { scannedCount: 0, parsedCount: 0, reviewCount: 0, duplicateCount: 0 };
      }

      const parsedBatch: ParsedTransaction[] = [];
      const reviewBatch: ReviewQueueItem[] = [];

      for (const msg of newMessages) {
        if (msg.date > maxSeenTimestamp) {
          maxSeenTimestamp = msg.date;
        }

        const result = await SmsPipelineService.processMessage(msg, {
          checkDatabaseDuplicates: true,
        });

        if (result.type === 'PARSED') {
          parsedBatch.push(result.transaction);
          if (result.transaction.isDuplicate) {
            duplicateCount++;
          } else {
            parsedCount++;
          }
        } else if (result.type === 'REVIEW') {
          reviewBatch.push(result.reviewItem);
          reviewCount++;
        }
      }

      // Save to SQLite
      await SmsDao.saveSmsBatch(newMessages);
      await SmsDao.saveParsedTransactionsBatch(parsedBatch);
      await SmsDao.saveReviewQueueBatch(reviewBatch);

      if (options.autoCreateClarityTransactions !== false) {
        await this.syncToClarityTransactions(parsedBatch);
      }

      scannedCount = newMessages.length;

      if (maxSeenTimestamp > lastSync) {
        this.setLastSyncTimestamp(maxSeenTimestamp);
      }

      return {
        scannedCount,
        parsedCount,
        reviewCount,
        duplicateCount,
      };
    } finally {
      this.isSyncing = false;
      this.shouldCancel = false;
    }
  }

  /**
   * Sync valid non-duplicate parsed transactions into Clarity's main accounts & transactions tables.
   */
  private static async syncToClarityTransactions(
    parsedTransactions: ParsedTransaction[]
  ): Promise<void> {
    const validTransactions = parsedTransactions.filter(
      (tx) => !tx.isDuplicate && !tx.transactionId
    );
    if (validTransactions.length === 0) return;

    // Fetch existing Clarity accounts
    let accounts = await getAllAccounts();

    for (const tx of validTransactions) {
      try {
        // Find matching account by lastFour or institution name
        let matchedAccount = accounts.find(
          (a) =>
            (a.lastFour && tx.accountMask && a.lastFour.endsWith(tx.accountMask)) ||
            (tx.accountMask && a.lastFour && tx.accountMask.endsWith(a.lastFour))
        );

        if (!matchedAccount && tx.bank) {
          matchedAccount = accounts.find(
            (a) =>
              a.institution &&
              (a.institution.toLowerCase().includes(tx.bank.toLowerCase()) ||
                tx.bank.toLowerCase().includes(a.institution.toLowerCase()))
          );
        }

        // If no matching account, use first account or create a default account
        if (!matchedAccount) {
          if (accounts.length > 0) {
            matchedAccount = accounts[0];
          } else {
            // Create a default Bank Account
            matchedAccount = await insertAccount({
              name: `${tx.bank} Account`,
              type: 'savings',
              balance: tx.availableBalance ?? 0,
              institution: tx.bank,
              lastFour: tx.accountMask,
            });
            accounts = await getAllAccounts();
          }
        }

        // Create transaction in Clarity
        const createdTx = await insertTransaction({
          accountId: matchedAccount.id,
          amount: tx.amount,
          type: tx.type === 'DEBIT' ? 'expense' : 'income',
          merchant: tx.merchant,
          category: tx.category,
          date: new Date(tx.timestamp).toISOString(),
          isRecurring: false,
          note: `Imported via SMS (${tx.bank})`,
        });

        // Link the Clarity transaction back to the parsed SMS transaction
        await SmsDao.linkClarityTransaction(tx.id, createdTx.id);
        tx.transactionId = createdTx.id;
      } catch (err) {
        console.warn(`[SmsSyncService] Failed to create Clarity transaction for tx ${tx.id}:`, err);
      }
    }
  }

  /**
   * Analyze all historical transactions to detect recurring patterns.
   */
  public static async detectRecurringTransactions() {
    const history = await SmsDao.getTransactionsForRecurringAnalysis();
    return RecurringDetectionEngine.detectRecurring(history);
  }
}

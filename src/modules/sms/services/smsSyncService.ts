import { mmkv } from '@/lib/storage';
import type {
  ParsedTransaction,
  RawSmsMessage,
  ReviewQueueItem,
  SmsSyncProgress,
} from '@/modules/sms/types';
import { SmsReaderService } from '@/modules/sms/reader/smsReaderService';
import { SmsPipelineService } from './smsPipelineService';
import { SmsDao } from '@/modules/sms/storage/smsDao';
import { DuplicateDetectionEngine } from '@/modules/sms/duplicate/duplicateDetectionEngine';
import { RecurringDetectionEngine } from '@/modules/sms/recurring/recurringDetectionEngine';
import {
  getAllAccounts,
  insertAccount,
  updateAccount,
  updateAccountBalance,
} from '@/services/database/account-dao';
import {
  insertTransaction,
  findManualMatch,
  mergeManualWithSmsTransaction,
} from '@/services/database/transaction-dao';
import { getDatabase } from '@/services/database';
import { TransactionExtractor } from '@/modules/sms/extractor/transactionExtractor';
import { BillExtractor } from '@/modules/sms/extractor/billExtractor';
import { mergeOrInsertSmsBill } from '@/services/database/bill-dao';
import { BillSettlementEngine } from '@/modules/sms/services/billSettlementEngine';
import { BillAlertEngine } from '@/services/notifications/bill-alert-engine';
import { hasMeaningfulMerchant } from '@/utils/transaction-display';

const LAST_SYNC_KEY = 'clarity_last_sms_sync_timestamp';
const DEFAULT_CHUNK_SIZE = 200;

export interface SyncOptions {
  batchSize?: number;
  autoCreateClarityTransactions?: boolean;
  onProgress?: (progress: SmsSyncProgress) => void;
}

type AccountRecord = Awaited<ReturnType<typeof getAllAccounts>>[number];

export class SmsSyncService {
  private static isSyncing = false;
  private static shouldCancel = false;

  public static getLastSyncTimestamp(): number | null {
    const value = mmkv.getString(LAST_SYNC_KEY);
    if (!value) {
      return null;
    }

    const timestamp = parseInt(value, 10);
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
  }

  public static setLastSyncTimestamp(timestamp: number): void {
    mmkv.set(LAST_SYNC_KEY, timestamp.toString());
  }

  public static cancelSync(): void {
    if (this.isSyncing) {
      this.shouldCancel = true;
    }
  }

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
    let batchIndex = 0;

    const reportProgress = (
      phase: SmsSyncProgress['phase'],
      processed: number,
      total: number,
      currentBatch: number,
      totalBatches: number
    ) => {
      options.onProgress?.({
        phase,
        processed,
        total,
        batchIndex: currentBatch,
        totalBatches,
      });
    };

    try {
      reportProgress('fetching', 0, 0, 0, 0);

      if (options.autoCreateClarityTransactions !== false) {
        await this.retryUnlinkedTransactions();
      }

      await SmsReaderService.readInBatches(
        batchSize,
        async (batch, isLastBatch) => {
          if (this.shouldCancel) {
            return false;
          }

          batchIndex += 1;
          reportProgress('classifying', scannedCount, 0, batchIndex, isLastBatch ? batchIndex : 0);

          for (const message of batch) {
            maxSeenTimestamp = Math.max(maxSeenTimestamp, message.date);
          }

          const { parsedBatch, reviewBatch, parsed, review, duplicates } =
            await this.processSmsBatch(batch);

          reportProgress('saving', scannedCount + batch.length, 0, batchIndex, isLastBatch ? batchIndex : 0);
          await SmsDao.saveSmsBatch(batch);
          await SmsDao.saveParsedTransactionsBatch(parsedBatch);
          await SmsDao.saveReviewQueueBatch(reviewBatch);

          if (options.autoCreateClarityTransactions !== false) {
            await this.syncToClarityTransactions(parsedBatch);
          }

          scannedCount += batch.length;
          parsedCount += parsed;
          reviewCount += review;
          duplicateCount += duplicates;

          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          return !this.shouldCancel;
        }
      );

      if (!this.shouldCancel) {
        if (options.autoCreateClarityTransactions !== false) {
          await this.autoRepairMisassignedAccounts();
        }

        if (maxSeenTimestamp > 0) {
          this.setLastSyncTimestamp(maxSeenTimestamp);
        }

        // Evaluate bill reminders for proactive notifications
        BillAlertEngine.evaluateUpcomingBillAlerts().catch(() => {});

        reportProgress('complete', scannedCount, scannedCount, batchIndex, batchIndex);
      }

      return { scannedCount, parsedCount, reviewCount, duplicateCount };
    } finally {
      this.isSyncing = false;
      this.shouldCancel = false;
    }
  }

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
      lastSync = await SmsDao.getLatestSmsTimestamp();
    }

    if (!lastSync) {
      return this.runInitialScan(options);
    }

    this.isSyncing = true;
    this.shouldCancel = false;
    DuplicateDetectionEngine.clearCache();

    const batchSize = options.batchSize ?? DEFAULT_CHUNK_SIZE;
    let scannedCount = 0;
    let parsedCount = 0;
    let reviewCount = 0;
    let duplicateCount = 0;
    let maxSeenTimestamp = lastSync;

    try {
      if (options.autoCreateClarityTransactions !== false) {
        await this.retryUnlinkedTransactions();
      }

      await SmsReaderService.readInBatches(
        batchSize,
        async (batch) => {
          if (this.shouldCancel) {
            return false;
          }

          for (const message of batch) {
            maxSeenTimestamp = Math.max(maxSeenTimestamp, message.date);
          }

          const { parsedBatch, reviewBatch, parsed, review, duplicates } =
            await this.processSmsBatch(batch);

          await SmsDao.saveSmsBatch(batch);
          await SmsDao.saveParsedTransactionsBatch(parsedBatch);
          await SmsDao.saveReviewQueueBatch(reviewBatch);

          if (options.autoCreateClarityTransactions !== false) {
            await this.syncToClarityTransactions(parsedBatch);
          }

          scannedCount += batch.length;
          parsedCount += parsed;
          reviewCount += review;
          duplicateCount += duplicates;

          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          return !this.shouldCancel;
        },
        { sinceTimestamp: lastSync }
      );

      if (!this.shouldCancel) {
        if (options.autoCreateClarityTransactions !== false) {
          await this.autoRepairMisassignedAccounts();
        }

        if (maxSeenTimestamp > lastSync) {
          this.setLastSyncTimestamp(maxSeenTimestamp);
        }

        // Evaluate bill reminders for proactive notifications
        BillAlertEngine.evaluateUpcomingBillAlerts().catch(() => {});
      }

      return { scannedCount, parsedCount, reviewCount, duplicateCount };
    } finally {
      this.isSyncing = false;
      this.shouldCancel = false;
    }
  }

  /**
   * Import a manually verified review item into the main transaction ledger.
   */
  public static async importParsedTransactions(
    parsedTransactions: ParsedTransaction[]
  ): Promise<void> {
    await this.syncToClarityTransactions(parsedTransactions);
    await this.reconcileAvailableBalances();
  }

  private static async processSmsBatch(messages: RawSmsMessage[]): Promise<{
    parsedBatch: ParsedTransaction[];
    reviewBatch: ReviewQueueItem[];
    parsed: number;
    review: number;
    duplicates: number;
  }> {
    const existingSmsIds = await SmsDao.getExistingSmsIds(messages.map((message) => message.id));
    const parsedBatch: ParsedTransaction[] = [];
    const reviewBatch: ReviewQueueItem[] = [];
    let parsed = 0;
    let review = 0;
    let duplicates = 0;

    for (const message of messages) {
      if (existingSmsIds.has(message.id)) {
        continue;
      }

      const result = await SmsPipelineService.processMessage(message, {
        checkDatabaseDuplicates: true,
      });

      if (result.type === 'PARSED') {
        parsedBatch.push(result.transaction);
        if (result.transaction.isDuplicate) {
          duplicates += 1;
        } else {
          parsed += 1;
        }
      } else if (result.type === 'REVIEW') {
        reviewBatch.push(result.reviewItem);
        review += 1;
      }

      // Check if message contains a utility or bill reminder
      try {
        const extractedBill = BillExtractor.extractBill(message);
        if (extractedBill) {
          await mergeOrInsertSmsBill({
            ...extractedBill,
            smsId: message.id,
          });
        }
      } catch (billError) {
        console.warn('[SmsSyncService] Failed to extract bill reminder:', billError);
      }
    }

    return { parsedBatch, reviewBatch, parsed, review, duplicates };
  }

  private static async retryUnlinkedTransactions(): Promise<void> {
    const pendingTransactions = await SmsDao.getUnlinkedParsedTransactions();
    if (pendingTransactions.length > 0) {
      await this.syncToClarityTransactions(pendingTransactions);
    }
  }

  private static isKnownBank(bank: string): boolean {
    return Boolean(bank && bank !== 'Other Bank' && bank.trim().length > 0);
  }

  private static normalizeMask(mask: string | undefined): string {
    if (!mask || mask === 'XXXX') {
      return '';
    }

    const digits = mask.replace(/[^0-9]/g, '');
    return digits.length > 4 ? digits.slice(-4) : digits;
  }

  private static getBankKey(value: string): string {
    const normalized = value.toLowerCase();
    const aliases: Array<[string, string]> = [
      ['kotak', 'kotak'],
      ['baroda', 'bankofbaroda'],
      ['bob', 'bankofbaroda'],
      ['hdfc', 'hdfc'],
      ['sbi', 'sbi'],
      ['state bank', 'sbi'],
      ['icici', 'icici'],
      ['axis', 'axis'],
      ['idfc', 'idfc'],
      ['pnb', 'pnb'],
      ['punjab national', 'pnb'],
      ['canara', 'canara'],
      ['indusind', 'indusind'],
      ['union bank', 'union'],
      ['federal bank', 'federal'],
      ['yes bank', 'yes'],
      ['rbl', 'rbl'],
      ['paytm', 'paytm'],
      ['airtel', 'airtel'],
    ];

    const alias = aliases.find(([needle]) => normalized.includes(needle));
    return alias ? alias[1] : normalized.replace(/[^a-z0-9]/g, '');
  }

  private static findMatchingAccount(
    accounts: AccountRecord[],
    bankName: string,
    mask: string,
    accountType: 'savings' | 'credit'
  ): AccountRecord | undefined {
    const sameType = accounts.filter((account) => account.type === accountType);
    const bankKey = this.getBankKey(bankName);
    const sameBank = sameType.filter((account) => {
      const candidate = account.institution || account.name;
      return this.getBankKey(candidate) === bankKey;
    });

    if (mask) {
      const exactBankAndMask = sameBank.filter(
        (account) => this.normalizeMask(account.lastFour) === mask
      );
      if (exactBankAndMask.length === 1) {
        return exactBankAndMask[0];
      }

      const exactMask = sameType.filter(
        (account) => this.normalizeMask(account.lastFour) === mask
      );
      if (exactMask.length === 1) {
        return exactMask[0];
      }

      const bankAccountWithoutMask = sameBank.filter(
        (account) => !this.normalizeMask(account.lastFour)
      );
      if (sameBank.length === 1 && bankAccountWithoutMask.length === 1) {
        return bankAccountWithoutMask[0];
      }

      return undefined;
    }

    return sameBank.length === 1 ? sameBank[0] : undefined;
  }

  private static async syncToClarityTransactions(
    parsedTransactions: ParsedTransaction[]
  ): Promise<void> {
    const validTransactions = parsedTransactions.filter(
      (transaction) => !transaction.isDuplicate && !transaction.transactionId
    );
    if (validTransactions.length === 0) {
      return;
    }

    const database = getDatabase();
    let accounts = await getAllAccounts();

    for (const transaction of validTransactions) {
      try {
        if (!this.isKnownBank(transaction.bank)) {
          console.warn(
            '[SmsSyncService] Skipped SMS transaction without a known bank:',
            transaction.id
          );
          continue;
        }

        const bankName = transaction.bank.trim();
        const accountMask = this.normalizeMask(transaction.accountMask);
        if (!accountMask) {
          console.warn(
            '[SmsSyncService] Skipped SMS transaction without an account suffix:',
            transaction.id
          );
          continue;
        }

        const isCard =
          (transaction.rawBody && TransactionExtractor.isCreditCard(transaction.rawBody)) ||
          /\b(?:card|crd|credit)\b/i.test(bankName);
        const accountType = isCard ? 'credit' : 'savings';

        let matchedAccount = this.findMatchingAccount(
          accounts,
          bankName,
          accountMask,
          accountType
        );

        if (matchedAccount && !this.normalizeMask(matchedAccount.lastFour)) {
          const accountName = bankName + ' (..' + accountMask + ')';
          await updateAccount(matchedAccount.id, {
            lastFour: accountMask,
            name: accountName,
          });
          matchedAccount = {
            ...matchedAccount,
            lastFour: accountMask,
            name: accountName,
          };
          accounts = accounts.map((account) =>
            account.id === matchedAccount?.id ? matchedAccount : account
          );
        }

        if (!matchedAccount) {
          const starterAccount = accounts.find(
            (account) =>
              account.name === 'Primary Bank Account' &&
              (!account.institution || account.institution === 'Bank / UPI') &&
              !this.normalizeMask(account.lastFour)
          );

          let canUpgradeStarter = false;
          if (starterAccount) {
            const result = await database.getFirstAsync<{ count: number }>(
              'SELECT COUNT(*) as count FROM transactions WHERE account_id = ?',
              [starterAccount.id]
            );
            canUpgradeStarter = (result?.count ?? 0) === 0;
          }

          const accountName = bankName + ' (..' + accountMask + ')';
          if (canUpgradeStarter && starterAccount) {
            await updateAccount(starterAccount.id, {
              name: accountName,
              type: accountType,
              institution: bankName,
              lastFour: accountMask,
            });
            if (accountType === 'credit') {
              await updateAccountBalance(starterAccount.id, 0);
            }
            matchedAccount = {
              ...starterAccount,
              name: accountName,
              type: accountType,
              institution: bankName,
              lastFour: accountMask,
            };
            accounts = accounts.map((account) =>
              account.id === matchedAccount?.id ? matchedAccount : account
            );
          } else {
            matchedAccount = await insertAccount({
              name: accountName,
              type: accountType,
              balance: accountType === 'credit' ? 0 : (transaction.availableBalance ?? 0),
              institution: bankName,
              lastFour: accountMask,
            });
            accounts = [...accounts, matchedAccount];
          }
        }

        const effectiveMerchant =
          transaction.merchant && hasMeaningfulMerchant(transaction)
            ? transaction.merchant.trim()
            : transaction.category;

        const txType = transaction.type === 'DEBIT' ? 'expense' : 'income';

        // 1. Check if a manual transaction exists within a 24-hour window that can be merged
        const manualMatch = await findManualMatch(
          matchedAccount.id,
          transaction.amount,
          txType,
          transaction.timestamp,
          24 // 24-hour merge window
        );

        if (manualMatch) {
          // Merge silently into existing manual record without double-counting balance
          await mergeManualWithSmsTransaction(manualMatch.id, {
            smsId: transaction.smsId,
            parsedTxId: transaction.id,
            merchant: effectiveMerchant,
            date: new Date(transaction.timestamp).toISOString(),
          });
          await SmsDao.linkClarityTransaction(transaction.id, manualMatch.id);
          transaction.transactionId = manualMatch.id;
        } else {
          // Insert brand new verified SMS transaction
          const createdTransaction = await insertTransaction(
            {
              accountId: matchedAccount.id,
              amount: transaction.amount,
              type: txType,
              merchant: effectiveMerchant,
              category: transaction.category,
              date: new Date(transaction.timestamp).toISOString(),
              isRecurring: false,
              note: 'Imported via SMS (' + bankName + ')',
              source: 'SMS',
              status: 'VERIFIED',
              smsId: transaction.smsId,
              parsedTxId: transaction.id,
            },
            { updateAccountBalance: false }
          );

          await SmsDao.linkClarityTransaction(transaction.id, createdTransaction.id);
          transaction.transactionId = createdTransaction.id;
        }

        // Settle any matching unpaid bill for expense transaction
        if (txType === 'expense') {
          BillSettlementEngine.settleBillsForTransaction({
            id: transaction.transactionId || '',
            amount: transaction.amount,
            merchant: effectiveMerchant,
            type: txType,
            date: new Date(transaction.timestamp).toISOString(),
            category: transaction.category,
          }).catch(() => {});
        }
      } catch (error) {
        console.warn(
          '[SmsSyncService] Failed to create Clarity transaction for tx ' +
            transaction.id +
            ':',
          error
        );
      }
    }
  }

  /**
   * Legacy entry point kept for callers. It no longer merges accounts merely
   * because they share a bank name.
   */
  public static async consolidateDuplicateBankAccounts(): Promise<void> {
    await this.reconcileAvailableBalances();
  }

  public static async autoRepairMisassignedAccounts(): Promise<void> {
    await this.consolidateDuplicateBankAccounts();
  }

  private static async reconcileAvailableBalances(): Promise<void> {
    try {
      const database = getDatabase();
      const accounts = await getAllAccounts();

      for (const account of accounts) {
        if (account.type === 'borrowed' || account.type === 'loan' || account.type === 'credit') {
          if (account.type === 'credit') {
            await updateAccountBalance(account.id, 0);
          }
          continue;
        }

        const latestBalance = await database.getFirstAsync<{
          available_balance: number | null;
        }>(
          `SELECT p.available_balance
           FROM parsed_transactions p
           JOIN transactions t ON p.transaction_id = t.id
           WHERE t.account_id = ? AND p.available_balance IS NOT NULL
           ORDER BY p.transaction_date DESC, p.created_at DESC
           LIMIT 1`,
          [account.id]
        );

        if (latestBalance?.available_balance !== null && latestBalance?.available_balance !== undefined) {
          await updateAccountBalance(account.id, latestBalance.available_balance);
        }
      }
    } catch (error) {
      console.warn('[SmsSyncService] Unable to reconcile SMS balances:', error);
    }
  }

  public static async detectRecurringTransactions() {
    const history = await SmsDao.getTransactionsForRecurringAnalysis();
    return RecurringDetectionEngine.detectRecurring(history);
  }
}

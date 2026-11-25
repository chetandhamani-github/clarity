import { mmkv } from '@/lib/storage';
import { BillsRepository } from '@/modules/bills/database/bills.repository';
import { BillService } from '@/modules/bills/services/BillService';
import { mapExternalBillerCategory } from '@/modules/bills/utils/bill-helpers';
import { LocalCategorizerEngine } from '@/modules/sms/categorizer/localCategorizerEngine';
import { DuplicateDetectionEngine } from '@/modules/sms/duplicate/duplicateDetectionEngine';
import { BillExtractor } from '@/modules/sms/extractor/billExtractor';
import { TransactionExtractor } from '@/modules/sms/extractor/transactionExtractor';
import { SmsReaderService } from '@/modules/sms/reader/smsReaderService';
import { RecurringDetectionEngine } from '@/modules/sms/recurring/recurringDetectionEngine';
import { BillSettlementEngine } from '@/modules/sms/services/billSettlementEngine';
import { SmsDao } from '@/modules/sms/storage/smsDao';
import type {
    ParsedTransaction,
    RawSmsMessage,
    ReviewQueueItem,
    SmsSyncProgress,
} from '@/modules/sms/types';
import { getDatabase } from '@/services/database';
import {
    getAllAccounts,
    insertAccount,
    updateAccount,
    updateAccountBalance,
} from '@/services/database/account-dao';
import {
    findManualMatch,
    insertTransaction,
    mergeManualWithSmsTransaction,
} from '@/services/database/transaction-dao';
import { BillAlertEngine } from '@/services/notifications/bill-alert-engine';
import {
  evaluateTransactionBudgetAlerts,
  evaluateAccountBalanceAlerts,
} from '@/services/notifications/alert-engine';
import { formatLocalDate } from '@/utils/format';
import { hasMeaningfulMerchant } from '@/utils/transaction-display';
import { createReviewItem } from '@/modules/sms/reviewQueue/reviewItemFactory';
import { SmsPipelineService } from './smsPipelineService';

const LAST_SYNC_KEY = 'clarity_last_sms_sync_timestamp';
const DEFAULT_CHUNK_SIZE = 200;

export interface SyncOptions {
  batchSize?: number;
  autoCreateClarityTransactions?: boolean;
  skipHistoricalTransactions?: boolean;
  onProgress?: (progress: SmsSyncProgress) => void;
}

export interface SmsScanResult {
  scannedCount: number;
  parsedCount: number;
  reviewCount: number;
  duplicateCount: number;
  newTransactions: ParsedTransaction[];
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

  /**
   * Initializes the SMS sync cursor to the current timestamp (or latest existing SMS)
   * without processing or importing any past historical messages.
   * This ensures that only future transactions received after this point are scanned.
   */
  public static async initializeBaseline(): Promise<number> {
    let baseline = Date.now();
    try {
      const recent = await SmsReaderService.getRecentSms(1);
      if (recent.length > 0 && recent[0].date > 0) {
        baseline = Math.max(baseline, recent[0].date + 1);
      }
    } catch {
      // Fallback to Date.now() if reading SMS fails
    }
    this.setLastSyncTimestamp(baseline);
    return baseline;
  }

  public static cancelSync(): void {
    if (this.isSyncing) {
      this.shouldCancel = true;
    }
  }

  public static async runInitialScan(options: SyncOptions = {}): Promise<SmsScanResult> {
    if (this.isSyncing) {
      throw new Error('SMS synchronization is already in progress');
    }

    this.isSyncing = true;
    this.shouldCancel = false;
    DuplicateDetectionEngine.clearCache();
    await LocalCategorizerEngine.loadDatabaseRules().catch(() => {});

    const batchSize = options.batchSize ?? DEFAULT_CHUNK_SIZE;
    let scannedCount = 0;
    let parsedCount = 0;
    let reviewCount = 0;
    let duplicateCount = 0;
    let maxSeenTimestamp = 0;
    let batchIndex = 0;
    const newTransactions: ParsedTransaction[] = [];

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

      if (options.autoCreateClarityTransactions !== false && !options.skipHistoricalTransactions) {
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

          // 1. Unconditionally auto-fetch and sync bank accounts from SMS messages
          await this.syncBankAccountsFromParsedBatch(parsedBatch);

          // 2. If skipping historical transactions, mark them as skipped so they are not imported or queued
          if (options.skipHistoricalTransactions) {
            for (const tx of parsedBatch) {
              tx.isDuplicate = true;
              tx.duplicateOf = 'HISTORICAL_SKIPPED';
              tx.transactionId = undefined;
            }
          }

          reportProgress('saving', scannedCount + batch.length, 0, batchIndex, isLastBatch ? batchIndex : 0);
          await SmsDao.saveSmsBatch(batch);
          await SmsDao.saveParsedTransactionsBatch(parsedBatch);
          if (!options.skipHistoricalTransactions) {
            await SmsDao.saveReviewQueueBatch(reviewBatch);
          }

          if (!options.skipHistoricalTransactions) {
            if (options.autoCreateClarityTransactions !== false) {
              await this.syncToClarityTransactions(parsedBatch);
            } else {
              for (const tx of parsedBatch) {
                if (!tx.isDuplicate && !tx.transactionId) {
                  newTransactions.push(tx);
                }
              }
            }
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
        if (parsedCount > 0) {
          await this.autoRepairMisassignedAccounts();
        }

        if (options.skipHistoricalTransactions) {
          try {
            const database = getDatabase();
            await database.runAsync(
              "UPDATE parsed_transactions SET is_duplicate = 1, duplicate_of = 'HISTORICAL_SKIPPED' WHERE transaction_id IS NULL"
            );
          } catch {
            // Ignored
          }
        }

        if (maxSeenTimestamp > 0) {
          this.setLastSyncTimestamp(maxSeenTimestamp);
        } else {
          this.setLastSyncTimestamp(Date.now());
        }

        // Reconcile and apply latest statement / available balances across accounts
        await this.reconcileAvailableBalances();

        // Evaluate bill reminders for proactive notifications
        BillAlertEngine.evaluateUpcomingBillAlerts().catch(() => {});
        BillAlertEngine.syncAllNativeBillReminders().catch(() => {});
        BillsRepository.deduplicateExistingBills().catch(() => {});

        reportProgress('complete', scannedCount, scannedCount, batchIndex, batchIndex);
      }

      return { scannedCount, parsedCount, reviewCount, duplicateCount, newTransactions };
    } finally {
      this.isSyncing = false;
      this.shouldCancel = false;
    }
  }

  public static async runIncrementalScan(options: SyncOptions = {}): Promise<SmsScanResult> {
    if (this.isSyncing) {
      throw new Error('SMS synchronization is already in progress');
    }

    let lastSync = this.getLastSyncTimestamp();
    if (!lastSync) {
      lastSync = await SmsDao.getLatestSmsTimestamp();
    }

    if (!lastSync) {
      return this.runInitialScan({
        ...options,
        skipHistoricalTransactions: true,
      });
    }

    this.isSyncing = true;
    this.shouldCancel = false;
    DuplicateDetectionEngine.clearCache();
    await LocalCategorizerEngine.loadDatabaseRules().catch(() => {});

    const batchSize = options.batchSize ?? DEFAULT_CHUNK_SIZE;
    let scannedCount = 0;
    let parsedCount = 0;
    let reviewCount = 0;
    let duplicateCount = 0;
    let maxSeenTimestamp = lastSync;
    const newTransactions: ParsedTransaction[] = [];

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

          // Unconditionally auto-fetch and sync bank accounts from SMS messages
          await this.syncBankAccountsFromParsedBatch(parsedBatch);

          if (options.autoCreateClarityTransactions !== false) {
            await this.syncToClarityTransactions(parsedBatch);
          } else {
            for (const tx of parsedBatch) {
              if (!tx.isDuplicate && !tx.transactionId) {
                newTransactions.push(tx);
              }
            }
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
        if (parsedCount > 0) {
          await this.autoRepairMisassignedAccounts();
        }

        if (maxSeenTimestamp > lastSync) {
          this.setLastSyncTimestamp(maxSeenTimestamp);
        }

        // Reconcile and apply latest statement / available balances across accounts
        await this.reconcileAvailableBalances();

        // Evaluate bill reminders for proactive notifications
        BillAlertEngine.evaluateUpcomingBillAlerts().catch(() => {});
        BillAlertEngine.syncAllNativeBillReminders().catch(() => {});
        BillsRepository.deduplicateExistingBills().catch(() => {});
      }

      return { scannedCount, parsedCount, reviewCount, duplicateCount, newTransactions };
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

      try {
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
      } catch {
        // Fault-isolation: a single corrupt or unparseable SMS must never terminate the sync batch
        try {
          const fallbackReview = createReviewItem(message, 'UNRECOGNIZED_FORMAT', 0.1);
          reviewBatch.push(fallbackReview);
          review += 1;
        } catch {
          // If even creating review item fails, safely continue batch
        }
      }

      // Check if message contains a utility or bill reminder
      try {
        const extractedBill = BillExtractor.extractBill(message);
        if (extractedBill) {
          // 1. Save to modern Bills module (displayed in UI)
          const billCategory = mapExternalBillerCategory(extractedBill.billerCategory);

          await BillService.mergeOrInsertExternalBill({
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
            notes: `Auto-detected from SMS: ${extractedBill.billerName}`,
          });
        }
      } catch {
        // Ignored
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
    return Boolean(bank && bank.trim().length > 0);
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

  /**
   * Auto-fetch and sync bank accounts discovered from parsed SMS messages.
   * Runs unconditionally so accounts and their balances are always auto-fetched.
   */
  public static async syncBankAccountsFromParsedBatch(
    parsedBatch: ParsedTransaction[]
  ): Promise<void> {
    if (parsedBatch.length === 0) return;

    const database = getDatabase();
    let accounts = await getAllAccounts();

    // Sort chronologically (oldest to newest) within batch so the latest balance snapshot wins
    const sortedBatch = [...parsedBatch].sort((a, b) => a.timestamp - b.timestamp);

    for (const transaction of sortedBatch) {
      if (transaction.isDuplicate && transaction.duplicateOf !== 'HISTORICAL_SKIPPED') continue;

      try {
        const rawBank = (transaction.bank || '').trim();
        const bankName = rawBank && rawBank !== 'Other Bank' ? rawBank : 'Bank / UPI';
        const accountMask = this.normalizeMask(transaction.accountMask);

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

        if (!matchedAccount && !accountMask) {
          matchedAccount =
            accounts.find(
              (account) =>
                account.type === accountType &&
                (account.name === 'Primary Bank Account' ||
                  !account.institution ||
                  account.institution === 'Bank / UPI')
            ) || accounts.find((account) => account.type === accountType);
        }

        if (matchedAccount && accountMask && !this.normalizeMask(matchedAccount.lastFour)) {
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

          const accountName = accountMask ? `${bankName} (..${accountMask})` : bankName;
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

        // Auto-update account balance if SMS has available balance snapshot
        if (
          matchedAccount &&
          accountType !== 'credit' &&
          transaction.availableBalance !== undefined &&
          transaction.availableBalance !== null
        ) {
          await updateAccountBalance(matchedAccount.id, transaction.availableBalance);
          evaluateAccountBalanceAlerts({
            id: matchedAccount.id,
            name: matchedAccount.name,
            type: matchedAccount.type,
            balance: transaction.availableBalance,
          }).catch(() => {});
        }
      } catch {
        // Account auto-fetch error ignored
      }
    }
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

    // Ensure accounts exist and are synced first
    await this.syncBankAccountsFromParsedBatch(validTransactions);

    const database = getDatabase();
    let accounts = await getAllAccounts();

    for (const transaction of validTransactions) {
      try {
        const rawBank = (transaction.bank || '').trim();
        const bankName = rawBank && rawBank !== 'Other Bank' ? rawBank : 'Bank / UPI';
        const accountMask = this.normalizeMask(transaction.accountMask);

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

        if (!matchedAccount && !accountMask) {
          // Fall back to a default account (e.g. Primary Bank Account or generic bank account)
          matchedAccount =
            accounts.find(
              (account) =>
                account.type === accountType &&
                (account.name === 'Primary Bank Account' ||
                  !account.institution ||
                  account.institution === 'Bank / UPI')
            ) || accounts.find((account) => account.type === accountType);
        }

        if (matchedAccount && accountMask && !this.normalizeMask(matchedAccount.lastFour)) {
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

          const accountName = accountMask ? `${bankName} (..${accountMask})` : bankName;
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
          // Check if this is a reversal or refund credit that offsets a prior expense
          const isReversal =
            txType === 'income' &&
            /\b(?:revers(?:ed|al)|refund(?:ed)?|credited\s+back)\b/i.test(transaction.rawBody || '');
          let finalCategory = transaction.category;
          let finalNote = 'Imported via SMS (' + bankName + ')';

          if (isReversal) {
            try {
              const priorExpense = await database.getFirstAsync<{
                id: string;
                merchant: string;
                category: string;
              }>(
                `SELECT id, merchant, category FROM transactions 
                 WHERE account_id = ? AND amount = ? AND type = 'expense'
                 ORDER BY date DESC LIMIT 1`,
                [matchedAccount.id, transaction.amount]
              );

              if (priorExpense) {
                finalCategory = priorExpense.category;
                finalNote = `Reversal / Refund for ${priorExpense.merchant || 'prior transaction'}`;
              }
            } catch {
              // Reversal match fallback
            }
          }

          // Insert brand new verified SMS transaction
          const createdTransaction = await insertTransaction(
            {
              accountId: matchedAccount.id,
              amount: transaction.amount,
              type: txType,
              merchant: effectiveMerchant,
              category: finalCategory,
              date: new Date(transaction.timestamp).toISOString(),
              isRecurring: false,
              note: finalNote,
              source: 'SMS',
              status: 'VERIFIED',
              smsId: transaction.smsId,
              parsedTxId: transaction.id,
            },
            { updateAccountBalance: false }
          );

          await SmsDao.linkClarityTransaction(transaction.id, createdTransaction.id);
          transaction.transactionId = createdTransaction.id;

          if (!isReversal) {
            await this.pairCrossAccountTransfer({
              id: createdTransaction.id,
              accountId: matchedAccount.id,
              accountType: matchedAccount.type,
              amount: transaction.amount,
              type: txType,
              timestamp: transaction.timestamp,
              rawBody: transaction.rawBody,
            });
          }
        }

        // Settle any matching unpaid bill & evaluate budget alerts for expense transaction
        if (txType === 'expense') {
          evaluateTransactionBudgetAlerts({
            accountId: matchedAccount.id,
            amount: transaction.amount,
            type: txType,
            merchant: effectiveMerchant,
            category: transaction.category,
            date: new Date(transaction.timestamp).toISOString(),
            isRecurring: false,
            note: 'Imported via SMS (' + bankName + ')',
            source: 'SMS',
          }).catch(() => {});

          BillSettlementEngine.settleBillsForTransaction({
            id: transaction.transactionId || '',
            amount: transaction.amount,
            merchant: effectiveMerchant,
            type: txType,
            date: new Date(transaction.timestamp).toISOString(),
            category: transaction.category,
          }).catch(() => {});
        }
      } catch {
        // Failed to create transaction
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
        if (
          account.type === 'borrowed' ||
          account.type === 'loan' ||
          account.type === 'credit' ||
          account.type === 'lent'
        ) {
          continue;
        }

        let latestBalance = await database.getFirstAsync<{
          available_balance: number | null;
          transaction_date: string | null;
        }>(
          `SELECT p.available_balance, p.transaction_date
           FROM parsed_transactions p
           JOIN transactions t ON p.transaction_id = t.id
           WHERE t.account_id = ? AND p.available_balance IS NOT NULL
           ORDER BY p.transaction_date DESC, p.created_at DESC
           LIMIT 1`,
          [account.id]
        );

        if (!latestBalance && account.lastFour) {
          latestBalance = await database.getFirstAsync<{
            available_balance: number | null;
            transaction_date: string | null;
          }>(
            `SELECT available_balance, transaction_date
             FROM parsed_transactions
             WHERE account_mask LIKE ? AND available_balance IS NOT NULL
             ORDER BY transaction_date DESC, created_at DESC
             LIMIT 1`,
            [`%${account.lastFour}`]
          );
        }

        if (latestBalance?.available_balance !== null && latestBalance?.available_balance !== undefined) {
          await updateAccountBalance(account.id, latestBalance.available_balance);
          evaluateAccountBalanceAlerts({
            id: account.id,
            name: account.name,
            type: account.type,
            balance: latestBalance.available_balance,
          }).catch(() => {});
        }
      }
    } catch {
      // Balance reconciliation error ignored
    }
  }

  /**
   * Enrich an existing parsed transaction (and linked Clarity account) when a richer
   * cross-app notification arrives shortly after a sparse UPI alert.
   */
  public static async enrichDuplicateTransaction(duplicateTx: ParsedTransaction): Promise<boolean> {
    if (!duplicateTx.isDuplicate || !duplicateTx.duplicateOf) return false;
    if (typeof SmsDao.getParsedTransactionById !== 'function') return false;

    try {
      const original = await SmsDao.getParsedTransactionById(duplicateTx.duplicateOf);
      if (!original) return false;

      const originalHasGenericBank =
        !original.bank || original.bank === 'Bank / UPI' || original.bank === 'Other Bank';
      const incomingHasSpecificBank =
        Boolean(duplicateTx.bank) &&
        duplicateTx.bank !== 'Bank / UPI' &&
        duplicateTx.bank !== 'Other Bank';

      const originalHasGenericMask = !this.normalizeMask(original.accountMask);
      const incomingHasMask = Boolean(this.normalizeMask(duplicateTx.accountMask));

      const updates: {
        bank?: string;
        accountMask?: string;
        referenceNumber?: string;
        availableBalance?: number;
      } = {};

      if (originalHasGenericBank && incomingHasSpecificBank) {
        updates.bank = duplicateTx.bank;
      }
      if (originalHasGenericMask && incomingHasMask) {
        updates.accountMask = duplicateTx.accountMask;
      }
      if (!original.referenceNumber && duplicateTx.referenceNumber) {
        updates.referenceNumber = duplicateTx.referenceNumber;
      }
      if (
        (original.availableBalance === undefined || original.availableBalance === null) &&
        duplicateTx.availableBalance !== undefined &&
        duplicateTx.availableBalance !== null
      ) {
        updates.availableBalance = duplicateTx.availableBalance;
      }

      if (Object.keys(updates).length === 0) return false;

      if (typeof SmsDao.enrichParsedTransaction === 'function') {
        await SmsDao.enrichParsedTransaction(original.id, updates);
      }

      const enriched: ParsedTransaction = {
        ...original,
        ...updates,
        isDuplicate: false,
      };

      if (incomingHasSpecificBank && (originalHasGenericBank || originalHasGenericMask)) {
        await this.syncBankAccountsFromParsedBatch([enriched]);

        if (original.transactionId) {
          const accounts = await getAllAccounts();
          const isCard =
            (enriched.rawBody && TransactionExtractor.isCreditCard(enriched.rawBody)) ||
            /\b(?:card|crd|credit)\b/i.test(enriched.bank);
          const targetAccount = this.findMatchingAccount(
            accounts,
            enriched.bank,
            this.normalizeMask(enriched.accountMask),
            isCard ? 'credit' : 'savings'
          );

          if (targetAccount) {
            const database = getDatabase();
            await database.runAsync(
              'UPDATE transactions SET account_id = ? WHERE id = ?',
              [targetAccount.id, original.transactionId]
            );
          }
        }
      } else if (updates.availableBalance !== undefined) {
        await this.reconcileAvailableBalances();
      }

      return true;
    } catch {
      return false;
    }
  }

  private static async pairCrossAccountTransfer(incoming: {
    id: string;
    accountId: string;
    accountType: string;
    amount: number;
    type: 'expense' | 'income';
    timestamp: number;
    rawBody?: string;
  }): Promise<void> {
    if (
      incoming.rawBody &&
      /\b(?:cashback|refund(?:ed)?|revers(?:ed|al)|reward)\b/i.test(incoming.rawBody)
    ) {
      return;
    }

    try {
      const database = getDatabase();
      const oppositeType = incoming.type === 'expense' ? 'income' : 'expense';
      const windowMs = 15 * 60 * 1000;
      const startIso = new Date(incoming.timestamp - windowMs).toISOString();
      const endIso = new Date(incoming.timestamp + windowMs).toISOString();

      const counterpart = await database.getFirstAsync<{
        id: string;
        account_id: string;
        note: string | null;
        merchant: string | null;
      }>(
        `SELECT id, account_id, note, merchant
         FROM transactions
         WHERE account_id != ?
           AND type = ?
           AND source = 'SMS'
           AND ABS(amount - ?) <= 0.01
           AND date BETWEEN ? AND ?
         ORDER BY date DESC
         LIMIT 1`,
        [incoming.accountId, oppositeType, incoming.amount, startIso, endIso]
      );

      if (!counterpart) return;
      if (
        counterpart.note &&
        /\b(?:reversal|refund|cashback|reward)\b/i.test(counterpart.note)
      ) {
        return;
      }

      const outgoingTxId = incoming.type === 'expense' ? incoming.id : counterpart.id;
      const incomingLegTxId = incoming.type === 'expense' ? counterpart.id : incoming.id;
      const toAccountId = incoming.type === 'expense' ? counterpart.account_id : incoming.accountId;

      const applyPairing = async () => {
        await database.runAsync(
          `UPDATE transactions
           SET type = 'transfer',
               to_account_id = ?,
               category = 'Transfer',
               note = 'Auto-paired account transfer'
           WHERE id = ?`,
          [toAccountId, outgoingTxId]
        );
        if (typeof SmsDao.reassignParsedTransactionLink === 'function') {
          await SmsDao.reassignParsedTransactionLink(incomingLegTxId, outgoingTxId);
        }
        await database.runAsync('DELETE FROM transactions WHERE id = ?', [incomingLegTxId]);
      };

      if (typeof database.withTransactionAsync === 'function') {
        await database.withTransactionAsync(applyPairing);
      } else {
        await applyPairing();
      }
    } catch {
      // Transfer pairing must not interrupt ingestion
    }
  }

  public static async detectRecurringTransactions() {
    const history = await SmsDao.getTransactionsForRecurringAnalysis();
    return RecurringDetectionEngine.detectRecurring(history);
  }
}

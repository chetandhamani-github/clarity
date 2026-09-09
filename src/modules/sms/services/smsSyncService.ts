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
import {
  getAllAccounts,
  insertAccount,
  updateAccount,
  updateAccountBalance,
  deleteAccount,
} from '@/services/database/account-dao';
import { insertTransaction } from '@/services/database/transaction-dao';
import { getDatabase } from '@/services/database';
import { TransactionExtractor } from '@/modules/sms/extractor/transactionExtractor';

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

      // Auto-repair any previously misassigned transactions to their proper bank accounts
      if (options.autoCreateClarityTransactions !== false) {
        await this.autoRepairMisassignedAccounts();
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
        await this.autoRepairMisassignedAccounts();
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

    const db = getDatabase();
    let accounts = await getAllAccounts();

    // Map to track the most recent available balance for each account
    const latestBalanceMap = new Map<string, { balance: number; timestamp: number }>();

    for (const tx of validTransactions) {
      try {
        const isKnownBank = Boolean(tx.bank && tx.bank !== 'Other Bank' && tx.bank.trim().length > 0);
        const bankName = isKnownBank ? (tx.bank as string) : '';
        const rawMask = tx.accountMask && tx.accountMask !== 'XXXX' ? tx.accountMask : '';
        const hasValidMask = Boolean(rawMask);
        const canonicalMask = hasValidMask ? (rawMask.length > 4 ? rawMask.slice(-4) : rawMask) : '';

        let matchedAccount: (typeof accounts)[0] | undefined;

        if (bankName) {
          // 1. Match by bank institution or name
          matchedAccount = accounts.find((a) => {
            if (!a.institution) return false;
            return (
              a.institution.toLowerCase() === bankName.toLowerCase() ||
              a.name.toLowerCase().includes(bankName.toLowerCase()) ||
              bankName.toLowerCase().includes(a.institution.toLowerCase())
            );
          });

          // 2. If matched by bank institution, update its mask if missing
          if (matchedAccount) {
            if (hasValidMask && (!matchedAccount.lastFour || matchedAccount.lastFour === '')) {
              const updatedName = `${bankName} (..${canonicalMask})`;
              await updateAccount(matchedAccount.id, {
                lastFour: canonicalMask,
                name: updatedName,
              });
              matchedAccount.lastFour = canonicalMask;
              matchedAccount.name = updatedName;
            }
          }
        }

        // 3. Match by lastFour if unique and valid
        if (!matchedAccount && hasValidMask) {
          matchedAccount = accounts.find(
            (a) => a.lastFour && (a.lastFour.endsWith(canonicalMask) || canonicalMask.endsWith(a.lastFour))
          );
        }

        // 4. If no matching account:
        if (!matchedAccount) {
          if (bankName) {
            // Check if there is an untouched starter "Primary Bank Account" with 0 transactions
            const starterAccount = accounts.find(
              (a) =>
                a.name === 'Primary Bank Account' &&
                (!a.institution || a.institution === 'Bank / UPI') &&
                (!a.lastFour || a.lastFour === '')
            );

            let canUpgradeStarter = false;
            if (starterAccount) {
              try {
                const txCountResult = await db.getFirstAsync<{ count: number }>(
                  'SELECT COUNT(*) as count FROM transactions WHERE account_id = ?',
                  [starterAccount.id]
                );
                if (!txCountResult || txCountResult.count === 0) {
                  canUpgradeStarter = true;
                }
              } catch {
                canUpgradeStarter = false;
              }
            }

            const isCard = tx.rawBody ? TransactionExtractor.isCreditCard(tx.rawBody) : false;
            const accountType = isCard ? 'credit' : 'savings';
            const accountName = hasValidMask
              ? `${bankName} (..${canonicalMask})`
              : `${bankName} Account`;

            if (canUpgradeStarter && starterAccount) {
              await updateAccount(starterAccount.id, {
                name: accountName,
                type: accountType,
                institution: bankName,
                lastFour: canonicalMask,
              });
              matchedAccount = {
                ...starterAccount,
                name: accountName,
                type: accountType,
                institution: bankName,
                lastFour: canonicalMask,
              };
              accounts = await getAllAccounts();
            } else {
              // Create ONE dedicated new bank account
              matchedAccount = await insertAccount({
                name: accountName,
                type: accountType,
                balance: tx.availableBalance ?? 0,
                institution: bankName,
                lastFour: canonicalMask,
              });
              accounts.push(matchedAccount);
            }
          } else {
            // Non-bank or unclassified: attach to the first existing bank account (NEVER create phantom accounts)
            const primaryBankAcc = accounts.find(
              (a) => a.type === 'savings' || a.type === 'credit'
            );
            if (primaryBankAcc) {
              matchedAccount = primaryBankAcc;
            } else {
              matchedAccount = await insertAccount({
                name: 'Primary Bank Account',
                type: 'savings',
                balance: tx.availableBalance ?? 0,
                institution: 'Bank / UPI',
                lastFour: '',
              });
              accounts.push(matchedAccount);
            }
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
          note: `Imported via SMS (${tx.bank || 'Bank'})`,
        });

        // Link the Clarity transaction back to the parsed SMS transaction
        await SmsDao.linkClarityTransaction(tx.id, createdTx.id);
        tx.transactionId = createdTx.id;

        // Track the most recent availableBalance for this account
        if (tx.availableBalance !== undefined && tx.availableBalance !== null) {
          const prev = latestBalanceMap.get(matchedAccount.id);
          if (!prev || tx.timestamp > prev.timestamp) {
            latestBalanceMap.set(matchedAccount.id, {
              balance: tx.availableBalance,
              timestamp: tx.timestamp,
            });
          }
        }
      } catch (err) {
        console.warn(`[SmsSyncService] Failed to create Clarity transaction for tx ${tx.id}:`, err);
      }
    }

    // Apply accurate real-time bank balances from the latest availableBalance in SMS
    for (const [accountId, { balance }] of latestBalanceMap.entries()) {
      try {
        await updateAccountBalance(accountId, balance);
      } catch (err) {
        console.warn(`[SmsSyncService] Failed to update balance for account ${accountId}:`, err);
      }
    }
  }

  /**
   * Consolidate duplicate accounts for the same bank and clean up dummy accounts.
   * Guarantees exactly ONE account per bank institution with the latest real balance.
   */
  public static async consolidateDuplicateBankAccounts(): Promise<void> {
    try {
      const db = getDatabase();
      let accounts = await getAllAccounts();
      if (!accounts || accounts.length === 0) return;

      const getCanonicalBankName = (instOrName: string): string | null => {
        const text = instOrName.toLowerCase();
        if (text.includes('kotak')) return 'Kotak Mahindra Bank';
        if (text.includes('baroda') || text.includes('bob')) return 'Bank of Baroda';
        if (text.includes('hdfc')) return 'HDFC Bank';
        if (text.includes('sbi') || text.includes('state bank')) return 'State Bank of India';
        if (text.includes('icici')) return 'ICICI Bank';
        if (text.includes('axis')) return 'Axis Bank';
        if (text.includes('idfc')) return 'IDFC FIRST Bank';
        if (text.includes('pnb') || text.includes('punjab')) return 'Punjab National Bank';
        if (text.includes('canara')) return 'Canara Bank';
        if (text.includes('indusind')) return 'IndusInd Bank';
        if (text.includes('union bank')) return 'Union Bank of India';
        if (text.includes('federal bank')) return 'Federal Bank';
        if (text.includes('yes bank')) return 'YES Bank';
        if (text.includes('rbl')) return 'RBL Bank';
        if (text.includes('paytm')) return 'Paytm Payments Bank';
        if (text.includes('airtel')) return 'Airtel Payments Bank';
        return null;
      };

      // 1. Move transactions from generic placeholder accounts to detected banks
      const genericAccounts = accounts.filter((a) => {
        if (a.type === 'borrowed' || a.type === 'loan' || a.institution === 'Personal / Friend') {
          return false;
        }
        const inst = (a.institution || '').toLowerCase();
        const name = (a.name || '').toLowerCase();
        return (
          inst === 'bank' ||
          inst === 'bank / upi' ||
          name === 'bank account' ||
          name === 'primary bank account' ||
          name.startsWith('bank (..')
        );
      });

      for (const genAcc of genericAccounts) {
        const txsWithBank = await db.getAllAsync<{
          tx_id: string;
          bank: string;
          account_mask: string | null;
          available_balance: number | null;
          raw_body: string | null;
        }>(
          `SELECT t.id as tx_id, p.bank, p.account_mask, p.available_balance, p.raw_body
           FROM transactions t
           JOIN parsed_transactions p ON p.transaction_id = t.id
           WHERE t.account_id = ?
             AND p.bank IS NOT NULL
             AND p.bank != ''
             AND p.bank != 'Other Bank'`,
          [genAcc.id]
        );

        for (const item of txsWithBank) {
          const canonical = getCanonicalBankName(item.bank) || item.bank;
          let target = accounts.find(
            (a) =>
              (a.institution && a.institution.toLowerCase() === canonical.toLowerCase()) ||
              a.name.toLowerCase().includes(canonical.toLowerCase())
          );

          const hasMask = Boolean(item.account_mask && item.account_mask !== 'XXXX');
          const mask =
            hasMask && item.account_mask
              ? item.account_mask.length > 4
                ? item.account_mask.slice(-4)
                : item.account_mask
              : '';

          if (!target) {
            const isCard = item.raw_body ? TransactionExtractor.isCreditCard(item.raw_body) : false;
            const accName = mask ? `${canonical} (..${mask})` : `${canonical} Account`;
            target = await insertAccount({
              name: accName,
              type: isCard ? 'credit' : 'savings',
              balance: item.available_balance ?? 0,
              institution: canonical,
              lastFour: mask,
            });
            accounts = await getAllAccounts();
          }

          // Move the transaction
          await db.runAsync('UPDATE transactions SET account_id = ? WHERE id = ?', [
            target.id,
            item.tx_id,
          ]);

          if ((!target.lastFour || target.lastFour === '') && mask) {
            await updateAccount(target.id, {
              lastFour: mask,
              name: `${canonical} (..${mask})`,
            });
            target.lastFour = mask;
            target.name = `${canonical} (..${mask})`;
          }
        }
      }

      if (genericAccounts.length > 0) {
        accounts = await getAllAccounts();
      }
      const bankGroups = new Map<string, typeof accounts>();

      for (const acc of accounts) {
        if (acc.type === 'borrowed' || acc.type === 'loan' || acc.institution === 'Personal / Friend') {
          continue;
        }

        const canonical = getCanonicalBankName(acc.institution || acc.name);
        if (!canonical) continue;

        const key = `${canonical}_${acc.type}`;
        const list = bankGroups.get(key) || [];
        list.push(acc);
        bankGroups.set(key, list);
      }

      for (const [key, group] of bankGroups.entries()) {
        const canonical = key.split('_')[0];
        if (group.length <= 1) {
          const single = group[0];
          if (single.lastFour && !single.name.includes(`(..${single.lastFour})`)) {
            await updateAccount(single.id, {
              institution: canonical,
              name: `${canonical} (..${single.lastFour})`,
            });
          }
          continue;
        }

        // Multiple accounts for the same bank! Pick the primary account.
        const sorted = [...group].sort((a, b) => {
          const aHasMask = a.lastFour && a.lastFour.trim().length > 0 ? 1 : 0;
          const bHasMask = b.lastFour && b.lastFour.trim().length > 0 ? 1 : 0;
          if (aHasMask !== bHasMask) return bHasMask - aHasMask;
          return Math.abs(b.balance) - Math.abs(a.balance);
        });

        const primary = sorted[0];
        const duplicates = sorted.slice(1);

        let bestMask = primary.lastFour;
        if (!bestMask) {
          const dupWithMask = duplicates.find((d) => d.lastFour && d.lastFour.trim().length > 0);
          if (dupWithMask) {
            bestMask = dupWithMask.lastFour;
          }
        }

        for (const dup of duplicates) {
          await db.runAsync('UPDATE transactions SET account_id = ? WHERE account_id = ?', [
            primary.id,
            dup.id,
          ]);
          await deleteAccount(dup.id);
        }

        const updatedName = bestMask ? `${canonical} (..${bestMask})` : `${canonical} Account`;
        await updateAccount(primary.id, {
          name: updatedName,
          institution: canonical,
          lastFour: bestMask || '',
        });
        primary.name = updatedName;
        primary.institution = canonical;
        primary.lastFour = bestMask || '';
      }

      // 3. Remove leftover generic dummy accounts (e.g. redundant "Bank Account" rows)
      accounts = await getAllAccounts();
      const realBankAccounts = accounts.filter((a) => {
        if (a.type === 'borrowed' || a.type === 'loan' || a.institution === 'Personal / Friend') {
          return false;
        }
        const inst = (a.institution || '').toLowerCase();
        const name = (a.name || '').toLowerCase();
        return (
          inst !== 'bank' &&
          inst !== 'bank / upi' &&
          name !== 'bank account' &&
          name !== 'primary bank account' &&
          !name.startsWith('bank (..')
        );
      });

      const remainingGeneric = accounts.filter((a) => {
        if (a.type === 'borrowed' || a.type === 'loan' || a.institution === 'Personal / Friend') {
          return false;
        }
        const inst = (a.institution || '').toLowerCase();
        const name = (a.name || '').toLowerCase();
        return (
          inst === 'bank' ||
          inst === 'bank / upi' ||
          name === 'bank account' ||
          name === 'primary bank account' ||
          name.startsWith('bank (..')
        );
      });

      for (const gen of remainingGeneric) {
        const countRes = await db.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM transactions WHERE account_id = ?',
          [gen.id]
        );
        const txCount = countRes?.count ?? 0;

        if (txCount === 0) {
          if (realBankAccounts.length > 0 || remainingGeneric.length > 1) {
            await deleteAccount(gen.id);
          }
        } else if (realBankAccounts.length > 0) {
          const targetBank = realBankAccounts[0];
          await db.runAsync('UPDATE transactions SET account_id = ? WHERE account_id = ?', [
            targetBank.id,
            gen.id,
          ]);
          await deleteAccount(gen.id);
        }
      }

      // 4. Update the latest available balance for all bank accounts
      accounts = await getAllAccounts();
      for (const acc of accounts) {
        if (acc.type === 'borrowed' || acc.type === 'loan') continue;

        const latestBalRes = await db.getFirstAsync<{ available_balance: number }>(
          `SELECT p.available_balance 
           FROM parsed_transactions p
           JOIN transactions t ON p.transaction_id = t.id
           WHERE t.account_id = ? AND p.available_balance IS NOT NULL
           ORDER BY p.timestamp DESC
           LIMIT 1`,
          [acc.id]
        );

        if (
          latestBalRes &&
          latestBalRes.available_balance !== null &&
          latestBalRes.available_balance !== undefined
        ) {
          await updateAccountBalance(acc.id, latestBalRes.available_balance);
        }
      }
    } catch (err) {
      console.warn('[SmsSyncService] consolidateDuplicateBankAccounts failed:', err);
    }
  }

  /**
   * Auto-repair accounts (calls consolidateDuplicateBankAccounts).
   */
  public static async autoRepairMisassignedAccounts(): Promise<void> {
    return this.consolidateDuplicateBankAccounts();
  }

  /**
   * Analyze all historical transactions to detect recurring patterns.
   */
  public static async detectRecurringTransactions() {
    const history = await SmsDao.getTransactionsForRecurringAnalysis();
    return RecurringDetectionEngine.detectRecurring(history);
  }
}

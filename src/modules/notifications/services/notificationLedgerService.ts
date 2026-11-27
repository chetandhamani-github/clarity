import { BillsRepository } from '@/modules/bills/database/bills.repository';
import { BillSettlementEngine } from '@/modules/sms/services/billSettlementEngine';
import { SmsDao } from '@/modules/sms/storage/smsDao';
import type { ParsedTransaction } from '@/modules/sms/types';
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
import {
  evaluateAccountBalanceAlerts,
  evaluateTransactionBudgetAlerts,
} from '@/services/notifications/alert-engine';
import type { Account, AccountType } from '@/types';
import { hasMeaningfulMerchant } from '@/utils/transaction-display';
import { NotificationExtractor } from './notificationExtractor';

export type AccountResolutionReason =
  | 'manual_override'
  | 'exact_bank_and_mask'
  | 'bank_only'
  | 'mask_only_unknown_bank'
  | 'primary_fallback'
  | 'default_fallback'
  | 'will_create';

export interface AccountResolution {
  account: Account | null;
  reason: AccountResolutionReason;
  bankName: string;
  hasKnownBank: boolean;
  accountMask: string;
  accountType: 'savings' | 'credit';
  willCreateAccountName?: string;
  willCreateAccountType?: 'savings' | 'credit';
}

const LIQUID_ACCOUNT_TYPES: ReadonlySet<AccountType> = new Set([
  'savings',
  'current',
  'checking',
  'wallet',
]);

const BANK_KEY_RULES: Array<[RegExp, string]> = [
  [/\bhdfc\b/i, 'hdfc'],
  [/\bicici\b/i, 'icici'],
  [/\bsbi\b|\bstate\s+bank\b/i, 'sbi'],
  [/\baxis\b/i, 'axis'],
  [/\bkotak\b/i, 'kotak'],
  [/\bidfc\b/i, 'idfc'],
  [/\bau\s*small\b|\bau\s*bank\b|\baubank\b|\bausfb\b/i, 'aubank'],
  [/\bfederal\b|\bscapia\b/i, 'federal'],
  [/\bindusind\b/i, 'indusind'],
  [/\bcanara\b/i, 'canara'],
  [/\bbank\s+of\s+baroda\b|\bbaroda\b|\bbobcard\b|\bbob\b/i, 'bankofbaroda'],
  [/\bpnb\b|\bpunjab\s+national\b/i, 'pnb'],
  [/\bbank\s+of\s+india\b|\bboi\b/i, 'boi'],
  [/\bunion\s+bank\b|\bubi\b/i, 'union'],
  [/\bcentral\s+bank\b|\bcbi\b/i, 'cbi'],
  [/\bindian\s+overseas\b|\biob\b/i, 'iob'],
  [/\bindian\s+bank\b/i, 'indianbank'],
  [/\bbank\s+of\s+maharashtra\b|\bmahabank\b|\bbom\b/i, 'maharashtra'],
  [/\bidbi\b/i, 'idbi'],
  [/\buco\b/i, 'uco'],
  [/\byes\s*bank\b|\byesbank\b/i, 'yes'],
  [/\brbl\b/i, 'rbl'],
  [/\bstandard\s+chartered\b|\bscb\b/i, 'scb'],
  [/\bcitibank\b|\bciti\b/i, 'citi'],
  [/\bhsbc\b/i, 'hsbc'],
  [/\bdbs\b/i, 'dbs'],
  [/\bbandhan\b/i, 'bandhan'],
  [/\bpaytm\b/i, 'paytm'],
  [/\bairtel\b/i, 'airtel'],
  [/\bindia\s+post\b|\bippb\b/i, 'ippb'],
  [/\bjupiter\b/i, 'jupiter'],
  [/\bfi\s*money\b/i, 'fimoney'],
  [/\bslice\b/i, 'slice'],
  [/\bone\s*card\b|\bonecard\b/i, 'onecard'],
  [/\bamex\b|\bamerican\s+express\b/i, 'amex'],
];

export function normalizeNotificationMask(mask?: string | null): string {
  if (!mask || mask.toUpperCase() === 'XXXX') {
    return '';
  }
  const digits = mask.replace(/[^0-9]/g, '');
  return digits.length > 4 ? digits.slice(-4) : digits;
}

export function getBankKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  for (const [pattern, key] of BANK_KEY_RULES) {
    if (pattern.test(trimmed)) {
      return key;
    }
  }
  return trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function doesAccountMatchBank(
  account: Pick<Account, 'institution' | 'name'>,
  bankName: string
): boolean {
  const targetKey = getBankKey(bankName);
  if (!targetKey) return false;
  const instKey = account.institution ? getBankKey(account.institution) : '';
  const nameKey = account.name ? getBankKey(account.name) : '';
  return instKey === targetKey || nameKey === targetKey;
}

function masksMatch(accountLastFour?: string, parsedMask?: string): boolean {
  const normAcc = normalizeNotificationMask(accountLastFour);
  const normParsed = normalizeNotificationMask(parsedMask);
  if (!normAcc || !normParsed) return false;
  if (normAcc === normParsed) return true;
  if (normAcc.length === 4 && normParsed.length === 3 && normAcc === `0${normParsed}`) {
    return true;
  }
  if (normParsed.length === 4 && normAcc.length === 3 && normParsed === `0${normAcc}`) {
    return true;
  }
  return false;
}

function isEligibleAccountType(accountType: AccountType, targetCategory: 'savings' | 'credit'): boolean {
  if (targetCategory === 'credit') {
    return accountType === 'credit';
  }
  return LIQUID_ACCOUNT_TYPES.has(accountType);
}

function pickPreferredAccount(candidates: Account[]): Account | undefined {
  return candidates.find((a) => a.isPrimary) || candidates[0];
}

/**
 * Resolve the target Clarity account for a parsed notification transaction without mutating state.
 * Never falls back to cross-bank lastFour matching when a specific bank is known.
 */
export function resolveTargetAccountPreview(
  transaction: Pick<ParsedTransaction, 'bank' | 'accountMask' | 'rawBody'>,
  accounts: Account[],
  overrideAccountId?: string
): AccountResolution {
  const rawBank = (transaction.bank || '').trim();
  const hasKnownBank =
    Boolean(rawBank) && rawBank !== 'Other Bank' && rawBank !== 'Bank / UPI';
  const bankName = hasKnownBank ? rawBank : 'Bank / UPI';
  const accountMask = normalizeNotificationMask(transaction.accountMask);
  const isCard =
    (transaction.rawBody && NotificationExtractor.isCreditCard(transaction.rawBody, bankName)) ||
    /\b(?:card|crd|credit|onecard)\b/i.test(bankName);
  const accountType: 'savings' | 'credit' = isCard ? 'credit' : 'savings';

  if (overrideAccountId) {
    const manualAccount = accounts.find((a) => a.id === overrideAccountId);
    if (manualAccount) {
      return {
        account: manualAccount,
        reason: 'manual_override',
        bankName,
        hasKnownBank,
        accountMask,
        accountType,
      };
    }
  }

  const eligible = accounts.filter((a) => isEligibleAccountType(a.type, accountType));

  if (hasKnownBank) {
    const sameBank = eligible.filter((a) => doesAccountMatchBank(a, bankName));

    if (accountMask) {
      const exactBankAndMask = sameBank.filter((a) => masksMatch(a.lastFour, accountMask));
      const matched = pickPreferredAccount(exactBankAndMask);
      if (matched) {
        return {
          account: matched,
          reason: 'exact_bank_and_mask',
          bankName,
          hasKnownBank,
          accountMask,
          accountType,
        };
      }

      // Only fill in a single maskless account of the same bank if the user didn't enter lastFour yet
      const masklessSameBank = sameBank.filter((a) => !normalizeNotificationMask(a.lastFour));
      if (sameBank.length === 1 && masklessSameBank.length === 1) {
        return {
          account: masklessSameBank[0],
          reason: 'bank_only',
          bankName,
          hasKnownBank,
          accountMask,
          accountType,
        };
      }

      return {
        account: null,
        reason: 'will_create',
        bankName,
        hasKnownBank,
        accountMask,
        accountType,
        willCreateAccountName: `${bankName} (..${accountMask})`,
        willCreateAccountType: accountType,
      };
    }

    // Known bank without mask: match existing bank account rather than creating a duplicate
    if (sameBank.length > 0) {
      const matched = pickPreferredAccount(sameBank)!;
      return {
        account: matched,
        reason: 'bank_only',
        bankName,
        hasKnownBank,
        accountMask,
        accountType,
      };
    }

    return {
      account: null,
      reason: 'will_create',
      bankName,
      hasKnownBank,
      accountMask,
      accountType,
      willCreateAccountName: bankName,
      willCreateAccountType: accountType,
    };
  }

  // Bank is unknown (typical for Google Pay / PhonePe / Paytm alerts without bank name)
  if (accountMask) {
    const exactMask = eligible.filter((a) => masksMatch(a.lastFour, accountMask));
    if (exactMask.length === 1) {
      return {
        account: exactMask[0],
        reason: 'mask_only_unknown_bank',
        bankName,
        hasKnownBank,
        accountMask,
        accountType,
      };
    }
  }

  const primaryEligible = eligible.find((a) => a.isPrimary);
  if (primaryEligible) {
    return {
      account: primaryEligible,
      reason: 'primary_fallback',
      bankName,
      hasKnownBank,
      accountMask,
      accountType,
    };
  }

  const genericOrDefault =
    eligible.find(
      (a) =>
        a.name === 'Primary Bank Account' || !a.institution || a.institution === 'Bank / UPI'
    ) || eligible[0];

  if (genericOrDefault) {
    return {
      account: genericOrDefault,
      reason: 'default_fallback',
      bankName,
      hasKnownBank,
      accountMask,
      accountType,
    };
  }

  return {
    account: null,
    reason: 'will_create',
    bankName,
    hasKnownBank,
    accountMask,
    accountType,
    willCreateAccountName: isCard
      ? accountMask
        ? `Credit Card (..${accountMask})`
        : 'Credit Card'
      : accountMask
        ? `Bank Account (..${accountMask})`
        : 'Primary Bank Account',
    willCreateAccountType: accountType,
  };
}

export interface ImportNotificationsOptions {
  accountOverrides?: Record<string, string>;
}

export class NotificationLedgerService {
  /**
   * Import verified/confirmed notification transactions into the Clarity ledger.
   */
  public static async importParsedTransactions(
    parsedTransactions: ParsedTransaction[],
    options: ImportNotificationsOptions = {}
  ): Promise<void> {
    const { linkedCount, failedCount } = await this.syncToClarityTransactions(
      parsedTransactions,
      options
    );
    await this.reconcileAvailableBalances();
    await BillsRepository.deduplicateExistingBills().catch(() => {});
    if (parsedTransactions.length > 0 && linkedCount === 0 && failedCount > 0) {
      throw new Error('Failed to import transactions into ledger');
    }
  }

  private static async ensureResolvedAccount(
    transaction: ParsedTransaction,
    accounts: Account[],
    overrideAccountId?: string
  ): Promise<{ account: Account; updatedAccounts: Account[] }> {
    const resolution = resolveTargetAccountPreview(transaction, accounts, overrideAccountId);
    let nextAccounts = accounts;

    if (resolution.account) {
      let matched = resolution.account;

      // Only backfill lastFour on a single maskless same-bank account when bank & mask are confidently parsed
      if (
        resolution.reason === 'bank_only' &&
        resolution.hasKnownBank &&
        resolution.accountMask &&
        !normalizeNotificationMask(matched.lastFour)
      ) {
        const shouldUpdateName =
          matched.name === 'Primary Bank Account' ||
          matched.name.trim().toLowerCase() === resolution.bankName.trim().toLowerCase();
        const nextName = shouldUpdateName
          ? `${resolution.bankName} (..${resolution.accountMask})`
          : matched.name;
        await updateAccount(matched.id, {
          lastFour: resolution.accountMask,
          name: nextName,
        });
        matched = {
          ...matched,
          lastFour: resolution.accountMask,
          name: nextName,
        };
        nextAccounts = nextAccounts.map((acc) => (acc.id === matched.id ? matched : acc));
      }

      return { account: matched, updatedAccounts: nextAccounts };
    }

    const database = getDatabase();
    const accountName =
      resolution.willCreateAccountName ||
      (resolution.accountMask
        ? `${resolution.bankName} (..${resolution.accountMask})`
        : resolution.bankName);
    const accountType = resolution.willCreateAccountType || resolution.accountType;

    // Upgrade the unused starter "Primary Bank Account" only when bank + mask are both confidently parsed
    if (resolution.hasKnownBank && resolution.accountMask) {
      const starterAccount = nextAccounts.find(
        (account) =>
          account.name === 'Primary Bank Account' &&
          (!account.institution || account.institution === 'Bank / UPI') &&
          !normalizeNotificationMask(account.lastFour)
      );

      if (starterAccount) {
        const countRow = await database.getFirstAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM transactions WHERE account_id = ?',
          [starterAccount.id]
        );
        if ((countRow?.count ?? 0) === 0) {
          await updateAccount(starterAccount.id, {
            name: accountName,
            type: accountType,
            institution: resolution.bankName,
            lastFour: resolution.accountMask,
          });
          if (accountType === 'credit') {
            await updateAccountBalance(starterAccount.id, 0);
          }
          const upgraded: Account = {
            ...starterAccount,
            name: accountName,
            type: accountType,
            institution: resolution.bankName,
            lastFour: resolution.accountMask,
          };
          nextAccounts = nextAccounts.map((acc) => (acc.id === upgraded.id ? upgraded : acc));
          return { account: upgraded, updatedAccounts: nextAccounts };
        }
      }
    }

    const created = await insertAccount({
      name: accountName,
      type: accountType,
      balance: accountType === 'credit' ? 0 : (transaction.availableBalance ?? 0),
      institution: resolution.bankName,
      lastFour: resolution.accountMask,
    });
    nextAccounts = [...nextAccounts, created];
    return { account: created, updatedAccounts: nextAccounts };
  }

  private static async syncToClarityTransactions(
    parsedTransactions: ParsedTransaction[],
    options: ImportNotificationsOptions = {}
  ): Promise<{ linkedCount: number; failedCount: number }> {
    const validTransactions = parsedTransactions.filter(
      (transaction) => !transaction.isDuplicate && !transaction.transactionId
    );
    if (validTransactions.length === 0) {
      return { linkedCount: 0, failedCount: 0 };
    }

    const database = getDatabase();
    let accounts = await getAllAccounts();
    let linkedCount = 0;
    let failedCount = 0;

    // Sort chronologically so available balance snapshots apply in temporal order
    const sortedTransactions = [...validTransactions].sort((a, b) => a.timestamp - b.timestamp);

    for (const transaction of sortedTransactions) {
      try {
        const overrideAccountId = options.accountOverrides?.[transaction.id];
        const resolved = await this.ensureResolvedAccount(transaction, accounts, overrideAccountId);
        const matchedAccount = resolved.account;
        accounts = resolved.updatedAccounts;

        const bankLabel =
          transaction.bank && transaction.bank !== 'Other Bank' ? transaction.bank : 'Bank / UPI';

        if (
          matchedAccount.type !== 'credit' &&
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

        const effectiveMerchant =
          transaction.merchant && hasMeaningfulMerchant(transaction)
            ? transaction.merchant.trim()
            : transaction.category;

        const txType = transaction.type === 'DEBIT' ? 'expense' : 'income';

        const manualMatch = await findManualMatch(
          matchedAccount.id,
          transaction.amount,
          txType,
          transaction.timestamp,
          24
        );

        if (manualMatch) {
          await mergeManualWithSmsTransaction(manualMatch.id, {
            smsId: transaction.smsId,
            parsedTxId: transaction.id,
            merchant: effectiveMerchant,
            date: new Date(transaction.timestamp).toISOString(),
          });
          await SmsDao.linkClarityTransaction(transaction.id, manualMatch.id);
          transaction.transactionId = manualMatch.id;
          linkedCount += 1;
        } else {
          const isReversal =
            txType === 'income' &&
            /\b(?:revers(?:ed|al)|refund(?:ed)?|credited\s+back)\b/i.test(transaction.rawBody || '');
          let finalCategory = transaction.category;
          let finalNote = `Auto-tracked (${bankLabel})`;

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

          const hasBalanceSnapshot =
            matchedAccount.type !== 'credit' &&
            transaction.availableBalance !== undefined &&
            transaction.availableBalance !== null;

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
            { updateAccountBalance: !hasBalanceSnapshot }
          );

          await SmsDao.linkClarityTransaction(transaction.id, createdTransaction.id);
          transaction.transactionId = createdTransaction.id;
          linkedCount += 1;

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

        if (txType === 'expense') {
          evaluateTransactionBudgetAlerts({
            accountId: matchedAccount.id,
            amount: transaction.amount,
            type: txType,
            merchant: effectiveMerchant,
            category: transaction.category,
            date: new Date(transaction.timestamp).toISOString(),
            isRecurring: false,
            note: `Auto-tracked (${bankLabel})`,
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
        failedCount += 1;
      }
    }

    return { linkedCount, failedCount };
  }

  /**
   * Reconcile account balances using each account's latest verified balance snapshot
   * plus any subsequent transactions. Never pulls balance snapshots from a different bank.
   */
  public static async reconcileAvailableBalances(): Promise<void> {
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
          transaction_id: string | null;
        }>(
          `SELECT p.available_balance, p.transaction_date, p.transaction_id
           FROM parsed_transactions p
           JOIN transactions t ON p.transaction_id = t.id
           WHERE t.account_id = ?
             AND p.available_balance IS NOT NULL
             AND (p.duplicate_of IS NULL OR p.duplicate_of != 'USER_DELETED')
           ORDER BY p.transaction_date DESC, p.created_at DESC
           LIMIT 1`,
          [account.id]
        );

        const accountMask = normalizeNotificationMask(account.lastFour);
        if (!latestBalance && accountMask) {
          const candidates =
            (await database.getAllAsync<{
              available_balance: number | null;
              transaction_date: string | null;
              transaction_id: string | null;
              bank: string;
              account_mask: string;
            }>(
              `SELECT available_balance, transaction_date, transaction_id, bank, account_mask
               FROM parsed_transactions
               WHERE available_balance IS NOT NULL
                 AND (duplicate_of IS NULL OR duplicate_of != 'USER_DELETED')
               ORDER BY transaction_date DESC, created_at DESC
               LIMIT 25`
            )) ?? [];

          const matchingCandidate = candidates.find((row) => {
            if (!masksMatch(accountMask, row.account_mask)) return false;
            const rowHasSpecificBank =
              Boolean(row.bank) && row.bank !== 'Bank / UPI' && row.bank !== 'Other Bank';
            if (rowHasSpecificBank) {
              return doesAccountMatchBank(account, row.bank);
            }
            return !account.institution || account.institution === 'Bank / UPI';
          });

          if (matchingCandidate) {
            latestBalance = {
              available_balance: matchingCandidate.available_balance,
              transaction_date: matchingCandidate.transaction_date,
              transaction_id: matchingCandidate.transaction_id,
            };
          }
        }

        if (
          latestBalance?.available_balance !== null &&
          latestBalance?.available_balance !== undefined
        ) {
          let reconciledBalance = latestBalance.available_balance;
          if (latestBalance.transaction_date) {
            const subsequentTxs =
              (await database.getAllAsync<{
                id: string;
                amount: number;
                type: string;
                account_id: string;
                to_account_id?: string | null;
              }>(
                `SELECT id, amount, type, account_id, to_account_id
                 FROM transactions
                 WHERE (account_id = ? OR to_account_id = ?)
                   AND date > ?
                   AND (id != ? OR ? IS NULL)`,
                [
                  account.id,
                  account.id,
                  latestBalance.transaction_date,
                  latestBalance.transaction_id ?? null,
                  latestBalance.transaction_id ?? null,
                ]
              )) ?? [];

            let deltaSinceSnapshot = 0;
            for (const tx of subsequentTxs) {
              if (tx.type === 'income') {
                deltaSinceSnapshot += tx.amount;
              } else if (tx.type === 'expense') {
                deltaSinceSnapshot -= tx.amount;
              } else if (tx.type === 'transfer') {
                if (tx.account_id === account.id) {
                  deltaSinceSnapshot -= tx.amount;
                } else if (tx.to_account_id === account.id) {
                  deltaSinceSnapshot += tx.amount;
                }
              }
            }
            reconciledBalance =
              Math.round((latestBalance.available_balance + deltaSinceSnapshot) * 100) / 100;
          }

          await updateAccountBalance(account.id, reconciledBalance);
          evaluateAccountBalanceAlerts({
            id: account.id,
            name: account.name,
            type: account.type,
            balance: reconciledBalance,
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

      const originalHasGenericMask = !normalizeNotificationMask(original.accountMask);
      const incomingHasMask = Boolean(normalizeNotificationMask(duplicateTx.accountMask));

      const updates: {
        bank?: string;
        accountMask?: string;
        merchant?: string;
        referenceNumber?: string;
        availableBalance?: number;
      } = {};

      if (originalHasGenericBank && incomingHasSpecificBank) {
        updates.bank = duplicateTx.bank;
      }
      if (originalHasGenericMask && incomingHasMask) {
        updates.accountMask = duplicateTx.accountMask;
      }
      if (
        (!original.merchant || !hasMeaningfulMerchant(original)) &&
        duplicateTx.merchant &&
        hasMeaningfulMerchant(duplicateTx)
      ) {
        updates.merchant = duplicateTx.merchant.trim();
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
        rawBody: duplicateTx.rawBody || original.rawBody,
        isDuplicate: false,
      };

      const shouldReassignAccount =
        (incomingHasSpecificBank && (originalHasGenericBank || originalHasGenericMask)) ||
        (incomingHasMask && originalHasGenericMask);

      if (shouldReassignAccount && original.transactionId) {
        const accounts = await getAllAccounts();
        const { account: targetAccount } = await this.ensureResolvedAccount(enriched, accounts);

        const database = getDatabase();
        const existingTx = await database.getFirstAsync<{
          account_id: string;
          amount: number;
          type: string;
        }>('SELECT account_id, amount, type FROM transactions WHERE id = ?', [
          original.transactionId,
        ]);

        if (existingTx && existingTx.account_id !== targetAccount.id) {
          const previousAccount = accounts.find((a) => a.id === existingTx.account_id);
          if (previousAccount) {
            const revertDelta =
              existingTx.type === 'income'
                ? -existingTx.amount
                : existingTx.type === 'expense'
                  ? existingTx.amount
                  : 0;
            if (revertDelta !== 0) {
              await updateAccountBalance(
                previousAccount.id,
                Math.round((previousAccount.balance + revertDelta) * 100) / 100
              );
            }
          }

          const hasSnapshotOnTarget =
            targetAccount.type !== 'credit' &&
            enriched.availableBalance !== undefined &&
            enriched.availableBalance !== null;

          if (hasSnapshotOnTarget && enriched.availableBalance !== undefined) {
            await updateAccountBalance(targetAccount.id, enriched.availableBalance);
          } else {
            const applyDelta =
              existingTx.type === 'income'
                ? existingTx.amount
                : existingTx.type === 'expense'
                  ? -existingTx.amount
                  : 0;
            if (applyDelta !== 0) {
              await updateAccountBalance(
                targetAccount.id,
                Math.round((targetAccount.balance + applyDelta) * 100) / 100
              );
            }
          }

          await database.runAsync('UPDATE transactions SET account_id = ? WHERE id = ?', [
            targetAccount.id,
            original.transactionId,
          ]);
        } else if (
          targetAccount.type !== 'credit' &&
          enriched.availableBalance !== undefined &&
          enriched.availableBalance !== null
        ) {
          await updateAccountBalance(targetAccount.id, enriched.availableBalance);
        }
      } else if (updates.availableBalance !== undefined) {
        await this.reconcileAvailableBalances();
      }

      if (updates.merchant && original.transactionId) {
        const database = getDatabase();
        await database.runAsync(
          'UPDATE transactions SET merchant = ? WHERE id = ?',
          [updates.merchant, original.transactionId]
        );
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
}


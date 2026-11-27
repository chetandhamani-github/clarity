import { getDatabase } from './index';
import { getAccountById } from './account-dao';
import { insertTransaction } from './transaction-dao';
import { shiftYmdDays } from '@/utils/date';
import { formatLocalDate } from '@/utils/format';
import type { Transaction } from '@/types';

export interface AccountReconciliationStatus {
  accountId: string;
  accountName: string;
  statementBalance: number;
  statementDate: string | null;
  calculatedBalance: number;
  currentBalance: number;
  discrepancy: number; // account.balance - calculatedBalance
  hasDiscrepancy: boolean;
}

/**
 * Determines whether a ledger transaction occurred after an account balance snapshot,
 * handling mixed ISO-8601 timestamps and date-only (`YYYY-MM-DD`) manual/goal/bill entries.
 */
function parseSnapshotCompareMs(raw?: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes('T')) {
    const ms = Date.parse(trimmed);
    return Number.isNaN(ms) ? null : ms;
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    const ms = Date.parse(`${trimmed.replace(' ', 'T')}Z`);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

export function isTransactionAfterSnapshot(
  txDate?: string | null,
  txCreatedAt?: string | null,
  snapshotTxDate?: string | null
): boolean {
  if (!snapshotTxDate) return true;
  if (!txDate && !txCreatedAt) return true;

  const snapshotMs = parseSnapshotCompareMs(snapshotTxDate);
  const snapshotYmd =
    snapshotMs !== null ? formatLocalDate(new Date(snapshotMs)) : snapshotTxDate.slice(0, 10);

  if (txDate) {
    if (txDate.includes('T')) {
      const txMs = parseSnapshotCompareMs(txDate);
      if (txMs !== null && snapshotMs !== null) {
        return txMs > snapshotMs;
      }
      return txDate > snapshotTxDate;
    }

    const txYmd = txDate.slice(0, 10);
    if (txYmd > snapshotYmd) return true;
    if (txYmd < snapshotYmd) return false;

    const createdMs = parseSnapshotCompareMs(txCreatedAt);
    if (createdMs !== null && snapshotMs !== null) {
      return createdMs > snapshotMs;
    }
    return true;
  }

  const createdMs = parseSnapshotCompareMs(txCreatedAt);
  if (createdMs !== null && snapshotMs !== null) {
    return createdMs > snapshotMs;
  }
  return true;
}

/**
 * Calculates reconciliation status between the latest SMS Statement Balance
 * and the reconstructed ledger balance based on subsequent transactions.
 */
export async function getAccountReconciliationStatus(
  accountId: string
): Promise<AccountReconciliationStatus | null> {
  const db = getDatabase();
  const account = await getAccountById(accountId);
  if (!account) return null;

  // Credit cards, loans, and debts have liability limit semantics
  if (['credit', 'loan', 'borrowed', 'lent'].includes(account.type)) {
    return null;
  }

  // 1. Get the latest available_balance parsed from an SMS text for this account
  let latestSms = await db.getFirstAsync<{
    available_balance: number;
    transaction_date: string;
    transaction_id: string | null;
  }>(
    `SELECT p.available_balance, p.transaction_date, p.transaction_id
     FROM parsed_transactions p
     JOIN transactions t ON p.transaction_id = t.id
     WHERE t.account_id = ? AND p.available_balance IS NOT NULL
     ORDER BY p.transaction_date DESC, p.created_at DESC
     LIMIT 1`,
    [accountId]
  );

  // Fallback to match by account mask if transaction was unlinked (e.g. historical scan)
  if (!latestSms && account.lastFour) {
    latestSms = await db.getFirstAsync<{
      available_balance: number;
      transaction_date: string;
      transaction_id: string | null;
    }>(
      `SELECT available_balance, transaction_date, transaction_id
       FROM parsed_transactions
       WHERE account_mask LIKE ? AND available_balance IS NOT NULL
       ORDER BY transaction_date DESC, created_at DESC
       LIMIT 1`,
      [`%${account.lastFour}`]
    );
  }

  if (!latestSms || latestSms.available_balance === null || latestSms.available_balance === undefined) {
    return {
      accountId: account.id,
      accountName: account.name,
      statementBalance: account.balance,
      statementDate: null,
      calculatedBalance: account.balance,
      currentBalance: account.balance,
      discrepancy: 0,
      hasDiscrepancy: false,
    };
  }

  // 2. Fetch transactions from the local snapshot calendar day onward (1-day buffer for TZ shifts)
  const parsedSnapMs = parseSnapshotCompareMs(latestSms.transaction_date);
  const snapshotLocalYmd =
    parsedSnapMs !== null
      ? formatLocalDate(new Date(parsedSnapMs))
      : latestSms.transaction_date.slice(0, 10);
  const candidateStartYmd = shiftYmdDays(snapshotLocalYmd, -1);
  const candidateTxs =
    (await db.getAllAsync<{
      id: string;
      amount: number;
      type: string;
      account_id: string;
      to_account_id?: string;
      date?: string;
      created_at?: string;
    }>(
      `SELECT id, amount, type, account_id, to_account_id, date, created_at
       FROM transactions
       WHERE (account_id = ? OR to_account_id = ?)
         AND SUBSTR(date, 1, 10) >= ?
         AND (id != ? OR ? IS NULL)`,
      [accountId, accountId, candidateStartYmd, latestSms.transaction_id, latestSms.transaction_id]
    )) ?? [];

  const subsequentTxs = candidateTxs.filter((tx) =>
    isTransactionAfterSnapshot(tx.date, tx.created_at, latestSms.transaction_date)
  );

  let deltaSinceStatement = 0;
  for (const tx of subsequentTxs) {
    if (tx.type === 'income') {
      deltaSinceStatement += tx.amount;
    } else if (tx.type === 'expense') {
      deltaSinceStatement -= tx.amount;
    } else if (tx.type === 'transfer') {
      if (tx.account_id === accountId) {
        deltaSinceStatement -= tx.amount;
      } else if (tx.to_account_id === accountId) {
        deltaSinceStatement += tx.amount;
      }
    }
  }

  const calculatedBalance = Math.round((latestSms.available_balance + deltaSinceStatement) * 100) / 100;
  const currentBalance = Math.round(account.balance * 100) / 100;
  const discrepancy = Math.round((currentBalance - calculatedBalance) * 100) / 100;

  return {
    accountId: account.id,
    accountName: account.name,
    statementBalance: latestSms.available_balance,
    statementDate: latestSms.transaction_date,
    calculatedBalance,
    currentBalance,
    discrepancy,
    hasDiscrepancy: Math.abs(discrepancy) >= 1.0, // Ignore floating point cent precision differences
  };
}

/**
 * Creates an adjustment entry in the transaction ledger to reconcile a discrepancy
 * between the bank statement balance and the calculated ledger.
 */
export async function createBalanceAdjustmentEntry(
  accountId: string,
  discrepancyAmount: number
): Promise<Transaction> {
  // If discrepancy < 0 (ledger < statement), income is required to bring ledger up.
  // If discrepancy > 0 (ledger > statement), expense is required to bring ledger down.
  const isIncome = discrepancyAmount < 0;
  const absAmount = Math.abs(discrepancyAmount);

  return insertTransaction(
    {
      accountId,
      amount: absAmount,
      type: isIncome ? 'income' : 'expense',
      merchant: 'Balance Reconciliation',
      category: 'Adjustment',
      date: new Date().toISOString(),
      isRecurring: false,
      note: 'Reconciled ledger with bank statement balance',
      source: 'ADJUSTMENT',
      status: 'VERIFIED',
    },
    { updateAccountBalance: true }
  );
}

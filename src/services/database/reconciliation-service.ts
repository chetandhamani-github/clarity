import { getDatabase } from './index';
import { getAccountById } from './account-dao';
import { insertTransaction } from './transaction-dao';
import type { Transaction } from '@/types';

export interface AccountReconciliationStatus {
  accountId: string;
  accountName: string;
  statementBalance: number;
  statementDate: string | null;
  calculatedBalance: number;
  discrepancy: number; // account.balance - calculatedBalance
  hasDiscrepancy: boolean;
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
  if (['credit', 'loan', 'borrowed'].includes(account.type)) {
    return null;
  }

  // 1. Get the latest available_balance parsed from an SMS text for this account
  const latestSms = await db.getFirstAsync<{
    available_balance: number;
    transaction_date: string;
    transaction_id: string;
  }>(
    `SELECT p.available_balance, p.transaction_date, p.transaction_id
     FROM parsed_transactions p
     JOIN transactions t ON p.transaction_id = t.id
     WHERE t.account_id = ? AND p.available_balance IS NOT NULL
     ORDER BY p.transaction_date DESC, p.created_at DESC
     LIMIT 1`,
    [accountId]
  );

  if (!latestSms || latestSms.available_balance === null || latestSms.available_balance === undefined) {
    return {
      accountId: account.id,
      accountName: account.name,
      statementBalance: account.balance,
      statementDate: null,
      calculatedBalance: account.balance,
      discrepancy: 0,
      hasDiscrepancy: false,
    };
  }

  // 2. Fetch all subsequent transactions recorded after this SMS balance snapshot
  const subsequentTxs = await db.getAllAsync<{
    id: string;
    amount: number;
    type: string;
    account_id: string;
    to_account_id?: string;
  }>(
    `SELECT id, amount, type, account_id, to_account_id
     FROM transactions
     WHERE (account_id = ? OR to_account_id = ?)
       AND date > ?
       AND id != ?`,
    [accountId, accountId, latestSms.transaction_date, latestSms.transaction_id]
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
  const isIncome = discrepancyAmount > 0;
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
    { updateAccountBalance: false }
  );
}

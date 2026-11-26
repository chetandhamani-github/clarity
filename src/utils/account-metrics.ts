import type { Account, AccountType } from '@/types';

const LIABILITY_ACCOUNT_TYPES = new Set<AccountType>(['credit', 'loan', 'borrowed']);
const LIQUID_ACCOUNT_TYPES = new Set<AccountType>(['savings', 'current', 'checking', 'wallet']);

const ACCOUNT_TYPE_SHORT_LABELS: Record<string, string> = {
  savings: 'Bank',
  current: 'Current',
  checking: 'Checking',
  credit: 'Credit Card',
  loan: 'Loan',
  borrowed: 'Borrowed',
  lent: 'Lent',
  investment: 'Investment',
  wallet: 'Wallet',
  other: 'Account',
};

export function isLiabilityAccountType(type: AccountType | string): boolean {
  return LIABILITY_ACCOUNT_TYPES.has(type as AccountType);
}

export function isLiquidAccountType(type: AccountType | string): boolean {
  return LIQUID_ACCOUNT_TYPES.has(type as AccountType);
}

export function getAccountTypeShortLabel(type: AccountType | string): string {
  return ACCOUNT_TYPE_SHORT_LABELS[type] ?? 'Account';
}

export function pickDefaultSourceAccountId(
  accounts: Account[],
  excludeAccountId?: string | null
): string | null {
  const candidates = accounts.filter((acc) => acc.id !== excludeAccountId);
  if (candidates.length === 0) return null;

  const liquid = candidates.find((acc) => isLiquidAccountType(acc.type));
  if (liquid) return liquid.id;

  const nonLiability = candidates.find((acc) => !isLiabilityAccountType(acc.type));
  if (nonLiability) return nonLiability.id;

  return candidates[0].id;
}

export interface TransferImpactPreview {
  fromBefore: number;
  fromAfter: number;
  toBefore: number;
  toAfter: number;
  isToLiability: boolean;
  debtBefore: number;
  debtAfter: number;
  debtReduced: number;
  exceedsDebtBy: number;
}

export function computeTransferImpact(
  fromAccount: Pick<Account, 'balance' | 'type'>,
  toAccount: Pick<Account, 'balance' | 'type'>,
  amount: number
): TransferImpactPreview {
  const safeAmount = Number.isFinite(amount) && amount > 0 ? round2(amount) : 0;
  const fromBefore = Number.isFinite(fromAccount.balance) ? round2(fromAccount.balance) : 0;
  const toBefore = Number.isFinite(toAccount.balance) ? round2(toAccount.balance) : 0;
  const fromAfter = round2(fromBefore - safeAmount);
  const toAfter = round2(toBefore + safeAmount);
  const isToLiability = isLiabilityAccountType(toAccount.type);
  const debtBefore = isToLiability && toBefore < 0 ? round2(Math.abs(toBefore)) : 0;
  const debtAfter = isToLiability && toAfter < 0 ? round2(Math.abs(toAfter)) : 0;
  const debtReduced = round2(Math.max(0, debtBefore - debtAfter));
  const exceedsDebtBy =
    isToLiability && safeAmount > 0 && toAfter > 0
      ? round2(toBefore < 0 ? toAfter : safeAmount)
      : 0;

  return {
    fromBefore,
    fromAfter,
    toBefore,
    toAfter,
    isToLiability,
    debtBefore,
    debtAfter,
    debtReduced,
    exceedsDebtBy,
  };
}

export interface AccountsSummaryMetrics {
  assetAccounts: Account[];
  liabilityAccounts: Account[];
  totalAssets: number;
  totalLiabilities: number;
  netBalance: number;
  assetSectionTotal: number;
  liabilitySectionTotal: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Classifies accounts into assets vs liabilities and computes net totals.
 * Keeps 'lent' receivables in assets and ensures totalAssets - totalLiabilities === netBalance.
 */
export function summarizeAccounts(accounts: Account[]): AccountsSummaryMetrics {
  const assetAccounts: Account[] = [];
  const liabilityAccounts: Account[] = [];
  let totalAssets = 0;
  let totalLiabilities = 0;
  let netBalance = 0;
  let assetSectionTotal = 0;
  let liabilitySectionTotal = 0;

  for (const account of accounts) {
    const balance = Number.isFinite(account.balance) ? account.balance : 0;
    netBalance += balance;

    if (isLiabilityAccountType(account.type)) {
      liabilityAccounts.push(account);
      liabilitySectionTotal += balance;
    } else {
      assetAccounts.push(account);
      assetSectionTotal += balance;
    }

    if (balance > 0) {
      totalAssets += balance;
    } else if (balance < 0) {
      totalLiabilities += Math.abs(balance);
    }
  }

  return {
    assetAccounts,
    liabilityAccounts,
    totalAssets: round2(totalAssets),
    totalLiabilities: round2(totalLiabilities),
    netBalance: round2(netBalance),
    assetSectionTotal: round2(assetSectionTotal),
    liabilitySectionTotal: round2(liabilitySectionTotal),
  };
}


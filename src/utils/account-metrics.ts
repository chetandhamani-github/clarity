import type { Account, AccountType } from '@/types';

const LIABILITY_ACCOUNT_TYPES = new Set<AccountType>(['credit', 'loan', 'borrowed']);

export function isLiabilityAccountType(type: AccountType | string): boolean {
  return LIABILITY_ACCOUNT_TYPES.has(type as AccountType);
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


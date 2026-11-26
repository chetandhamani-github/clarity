import type { TransactionType } from '@/types';

export type DirectionConfidence = 'explicit' | 'inferred' | 'default';

export interface BalanceInferableTransaction {
  date: string;
  amount: number;
  type: TransactionType;
  balance?: number;
}

const BALANCE_TOLERANCE = 0.05;

/**
 * Infers transaction direction from bank narration keywords when column/sign metadata is missing.
 */
export function inferDirectionFromNarration(narration: string): TransactionType | null {
  if (!narration) return null;
  const lower = narration.toLowerCase();

  // Check explicit debit / card-bill phrases first so "TRANSFER TO CREDIT CARD" isn't treated as income.
  if (
    /\bcredit\s+card\s+(?:bill|payment|pay|dues)\b/i.test(lower) ||
    /\b(?:dr|debit|debited|withdrawal|withdrawn|spent|paid\s+out|atm\s*wdl)\b/i.test(lower) ||
    lower.includes('upi/dr') ||
    lower.includes('/dr/') ||
    /\bto\s+(?:transfer|tfr|cash|clearing|clg|neft|imps|rtgs|upi)\b/i.test(lower)
  ) {
    return 'expense';
  }

  if (
    /\b(?:cr|credited|deposit|deposited|salary|payroll|stipend|refund|reversal|cashback|interest|dividend|reimbursement|inward|paid\s+in|cash\s*dep)\b/i.test(
      lower
    ) ||
    /\bcredit\b(?!\s*card)/i.test(lower) ||
    lower.includes('upi/cr') ||
    lower.includes('/cr/') ||
    /\bby\s+(?:transfer|tfr|cash|clearing|clg|neft|imps|rtgs|upi|ach)\b/i.test(lower) ||
    /\b(?:int\.?\s*(?:cr|pd))\b/i.test(lower)
  ) {
    return 'income';
  }

  return null;
}

/**
 * Extracts an opening / brought-forward balance from statement header text when present.
 */
export function extractOpeningBalanceFromText(text: string): number | undefined {
  if (!text) return undefined;
  const match = text.match(
    /(?:opening\s*bal(?:ance)?|brought\s*forward|bal(?:ance)?\s*b\/f|op\.?\s*bal(?:ance)?)\s*(?:is|was|:|-|=)?\s*(?:rs\.?|inr|usd|eur|gbp|₹|\$|€|£)?\s*([+-]?\s*[\d,]+(?:\.\d{1,2})?)\s*(?:\(?\s*(CR|DR)\.?\s*\)?)?/i
  );
  if (!match || !match[1]) return undefined;
  const cleanNum = match[1].replace(/[,\s]/g, '');
  const parsed = parseFloat(cleanNum);
  if (!Number.isFinite(parsed)) return undefined;
  const tag = match[2]?.toUpperCase();
  if (tag === 'DR') return -Math.abs(parsed);
  return parsed;
}

function matchesDelta(delta: number, amount: number): TransactionType | null {
  if (amount <= 0) return null;
  if (Math.abs(delta - amount) <= BALANCE_TOLERANCE) return 'income';
  if (Math.abs(delta + amount) <= BALANCE_TOLERANCE) return 'expense';
  return null;
}

/**
 * Uses consecutive running balances (and optional opening balance) to resolve
 * income vs expense for rows without an explicit debit/credit column or CR/DR marker.
 * Auto-detects chronological (oldest-first) vs reverse-chronological (newest-first) order.
 */
export function resolveDirectionByRunningBalance<T extends BalanceInferableTransaction>(
  transactions: T[],
  confidences: readonly DirectionConfidence[],
  openingBalance?: number
): boolean[] {
  const n = transactions.length;
  const resolved = new Array<boolean>(n).fill(false);
  if (n === 0) return resolved;

  let ascMatches = 0;
  let descMatches = 0;

  for (let i = 1; i < n; i++) {
    const prev = transactions[i - 1];
    const curr = transactions[i];
    if (prev.balance === undefined || curr.balance === undefined) continue;

    if (matchesDelta(curr.balance - prev.balance, curr.amount) !== null) {
      ascMatches++;
    }
    if (matchesDelta(prev.balance - curr.balance, prev.amount) !== null) {
      descMatches++;
    }
  }

  const firstBal = transactions[0].balance;
  if (
    openingBalance !== undefined &&
    firstBal !== undefined &&
    matchesDelta(firstBal - openingBalance, transactions[0].amount) !== null
  ) {
    ascMatches++;
  }
  const lastBal = transactions[n - 1].balance;
  if (
    openingBalance !== undefined &&
    lastBal !== undefined &&
    matchesDelta(lastBal - openingBalance, transactions[n - 1].amount) !== null
  ) {
    descMatches++;
  }

  if (ascMatches === 0 && descMatches === 0) {
    return resolved;
  }

  let order: 'asc' | 'desc' = 'asc';
  if (descMatches > ascMatches) {
    order = 'desc';
  } else if (descMatches === ascMatches && transactions[0].date > transactions[n - 1].date) {
    order = 'desc';
  }

  for (let i = 0; i < n; i++) {
    const curr = transactions[i];
    if (curr.balance === undefined || curr.amount <= 0) continue;

    const priorBalance =
      order === 'asc'
        ? i === 0
          ? openingBalance
          : transactions[i - 1].balance
        : i === n - 1
          ? openingBalance
          : transactions[i + 1].balance;

    if (priorBalance === undefined) continue;

    const deltaType = matchesDelta(curr.balance - priorBalance, curr.amount);
    if (!deltaType) continue;

    if (confidences[i] !== 'explicit') {
      curr.type = deltaType;
    }
    if (confidences[i] !== 'explicit' || curr.type === deltaType) {
      resolved[i] = true;
    }
  }

  return resolved;
}

import type { ParsedTransaction, RecurringCandidate } from '@/modules/sms/types';

export class RecurringDetectionEngine {
  private static readonly KNOWN_RECURRING_KEYWORDS = [
    'netflix',
    'spotify',
    'amazon prime',
    'prime video',
    'hotstar',
    'disney',
    'youtube premium',
    'apple.com',
    'emi',
    'loan',
    'rent',
    'bescom',
    'airtel',
    'jio',
    'act fibernet',
    'maintenance',
    'insurance',
    'lic',
    'salary',
  ];

  /**
   * Analyze transaction history and return detected recurring candidates.
   */
  public static detectRecurring(transactions: ParsedTransaction[]): RecurringCandidate[] {
    const candidates: RecurringCandidate[] = [];

    // Filter out duplicates and group by normalized merchant + accountMask + direction
    const validTransactions = transactions.filter((t) => !t.isDuplicate);
    const groups = new Map<string, ParsedTransaction[]>();

    for (const tx of validTransactions) {
      const normalizedMerchant = this.normalizeMerchantName(tx.merchant);
      if (!normalizedMerchant) {
        continue;
      }
      const key = `${normalizedMerchant}__${tx.accountMask}__${tx.type}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(tx);
    }

    // Evaluate each cluster
    for (const [, txs] of groups.entries()) {
      if (txs.length < 2) {
        // Single occurrences cannot establish recurrence unless known recurring subscription
        continue;
      }

      // Sort by date ascending
      txs.sort((a, b) => a.timestamp - b.timestamp);

      // Check amount consistency (allow 5% variance or exact match)
      const amounts = txs.map((t) => t.amount);
      const avgAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
      const hasReasonableAmountVariance = amounts.every(
        (a) => Math.abs(a - avgAmount) / avgAmount <= 0.1
      );

      if (!hasReasonableAmountVariance) {
        continue;
      }

      // Calculate intervals in days between consecutive transactions
      const intervals: number[] = [];
      for (let i = 1; i < txs.length; i++) {
        const deltaMs = txs[i].timestamp - txs[i - 1].timestamp;
        const deltaDays = Math.round(deltaMs / (1000 * 60 * 60 * 24));
        if (deltaDays > 0) {
          intervals.push(deltaDays);
        }
      }

      if (intervals.length === 0) continue;

      const avgInterval = intervals.reduce((s, i) => s + i, 0) / intervals.length;

      // Determine frequency
      let frequency: RecurringCandidate['frequency'] | null = null;
      let nominalDays = 30;

      if (avgInterval >= 25 && avgInterval <= 35) {
        frequency = 'monthly';
        nominalDays = 30;
      } else if (avgInterval >= 6 && avgInterval <= 8) {
        frequency = 'weekly';
        nominalDays = 7;
      } else if (avgInterval >= 350 && avgInterval <= 380) {
        frequency = 'yearly';
        nominalDays = 365;
      }

      const sampleTx = txs[txs.length - 1];
      const isKnown = this.isKnownRecurringMerchant(sampleTx.merchant);

      // If known subscription merchant and at least 2 occurrences within 20-40 days
      if (!frequency && isKnown && avgInterval >= 20 && avgInterval <= 45) {
        frequency = 'monthly';
        nominalDays = 30;
      }

      if (!frequency) {
        continue;
      }

      // Compute confidence score
      // Base confidence depends on number of successful cycles
      let confidence = Math.min(0.5 + intervals.length * 0.15, 0.9);

      // Variance penalty
      const variance =
        intervals.reduce((sum, intv) => sum + Math.abs(intv - avgInterval), 0) /
        intervals.length;
      if (variance <= 2) {
        confidence += 0.08;
      } else if (variance > 5) {
        confidence -= 0.1;
      }

      // Known recurring merchant boost
      if (isKnown) {
        confidence = Math.max(confidence, 0.85);
      }

      confidence = Math.min(Math.max(confidence, 0.5), 0.99);

      const lastTx = txs[txs.length - 1];
      const lastDate = new Date(lastTx.timestamp);
      const nextDate = new Date(lastDate.getTime() + nominalDays * 24 * 60 * 60 * 1000);

      candidates.push({
        merchant: sampleTx.merchant,
        accountMask: sampleTx.accountMask,
        amount: Math.round(avgAmount * 100) / 100,
        frequency,
        intervalDays: Math.round(avgInterval),
        confidence: Math.round(confidence * 100) / 100,
        transactionCount: txs.length,
        lastDate: lastDate.toISOString().slice(0, 10),
        nextPredictedDate: nextDate.toISOString().slice(0, 10),
        category: sampleTx.category,
      });
    }

    return candidates;
  }

  private static normalizeMerchantName(merchant: string): string {
    const trimmed = merchant.trim();
    if (!trimmed || /^(?:.+\s+)?(?:bank\s+)?transaction$/i.test(trimmed)) {
      return '';
    }
    return trimmed
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 20);
  }

  private static isKnownRecurringMerchant(merchant: string): boolean {
    const lower = merchant.toLowerCase();
    return this.KNOWN_RECURRING_KEYWORDS.some((kw) => lower.includes(kw));
  }
}

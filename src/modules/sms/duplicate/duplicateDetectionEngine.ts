import type { ExtractedTransaction, ParsedTransaction } from '@/modules/sms/types';
import { SmsDao } from '@/modules/sms/storage/smsDao';

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateOfId?: string;
  reason?: string;
}

export class DuplicateDetectionEngine {
  // In-memory lookup tables for high-throughput batch processing
  private static refNumberMap = new Map<string, { id: string; timestamp: number }>();
  private static fingerprintMap = new Map<string, { id: string; timestamp: number }>();

  /**
   * Reset in-memory cache.
   */
  public static clearCache(): void {
    this.refNumberMap.clear();
    this.fingerprintMap.clear();
  }

  /**
   * Add a known or newly processed transaction to in-memory duplicate cache.
   */
  public static addToCache(tx: { id: string; amount: number; accountMask: string; timestamp: number; type: string; referenceNumber?: string }): void {
    if (tx.referenceNumber && tx.referenceNumber.length >= 6) {
      this.refNumberMap.set(tx.referenceNumber.toUpperCase(), {
        id: tx.id,
        timestamp: tx.timestamp,
      });
    }

    const fp = this.generateFingerprint(tx.amount, tx.accountMask, tx.type, tx.timestamp);
    this.fingerprintMap.set(fp, { id: tx.id, timestamp: tx.timestamp });
  }

  /**
   * Generate a normalized deterministic fingerprint:
   * e.g., "500.00_1234_DEBIT_2025-01-15_HOUR14"
   */
  public static generateFingerprint(
    amount: number,
    accountMask: string,
    type: string,
    timestamp: number
  ): string {
    const d = new Date(timestamp);
    const dateStr = d.toISOString().slice(0, 13); // yyyy-mm-ddTHH
    return `${amount.toFixed(2)}_${accountMask}_${type}_${dateStr}`;
  }

  /**
   * Check if a candidate transaction is a duplicate of an existing or newly scanned transaction.
   */
  public static async isDuplicate(
    candidate: ExtractedTransaction,
    options: { checkDatabase?: boolean; windowMinutes?: number } = {}
  ): Promise<DuplicateCheckResult> {
    const { checkDatabase = true, windowMinutes = 15 } = options;

    // 1. Check in-memory reference number match
    if (candidate.referenceNumber && candidate.referenceNumber.length >= 6) {
      const normalizedRef = candidate.referenceNumber.toUpperCase();
      const cached = this.refNumberMap.get(normalizedRef);
      if (cached) {
        // Only treat as duplicate if within 72 hours
        const diffMs = Math.abs(candidate.timestamp - cached.timestamp);
        if (diffMs <= 72 * 60 * 60 * 1000) {
          return {
            isDuplicate: true,
            duplicateOfId: cached.id,
            reason: `Duplicate reference number: ${candidate.referenceNumber}`,
          };
        }
      }
    }

    // 2. Check in-memory fingerprint match (same hour, amount, mask, type)
    const fp = this.generateFingerprint(
      candidate.amount,
      candidate.accountMask,
      candidate.type,
      candidate.timestamp
    );
    const cachedFp = this.fingerprintMap.get(fp);
    if (cachedFp) {
      return {
        isDuplicate: true,
        duplicateOfId: cachedFp.id,
        reason: 'Duplicate amount and account within same time window',
      };
    }

    // 3. Check SQLite database if requested
    if (checkDatabase) {
      const windowMs = windowMinutes * 60 * 1000;
      const windowStart = new Date(candidate.timestamp - windowMs).toISOString();
      const windowEnd = new Date(candidate.timestamp + windowMs).toISOString();

      try {
        const dbMatches = await SmsDao.findPotentialDuplicates(
          candidate.amount,
          candidate.accountMask,
          windowStart,
          windowEnd,
          candidate.referenceNumber
        );

        if (dbMatches.length > 0) {
          const match = dbMatches[0];
          return {
            isDuplicate: true,
            duplicateOfId: match.id,
            reason: match.referenceNumber === candidate.referenceNumber
              ? `Matched database reference number: ${candidate.referenceNumber}`
              : `Matched database transaction within ${windowMinutes}m window`,
          };
        }
      } catch (err) {
        // Fall back gracefully if database is not open (e.g. in standalone tests)
      }
    }

    return {
      isDuplicate: false,
    };
  }
}

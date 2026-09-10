import type { ExtractedTransaction, ParsedTransaction } from '@/modules/sms/types';
import { SmsDao } from '@/modules/sms/storage/smsDao';

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateOfId?: string;
  reason?: string;
}

export class DuplicateDetectionEngine {
  private static refNumberMap = new Map<string, { id: string; timestamp: number }>();
  private static fingerprintMap = new Map<string, { id: string; timestamp: number }>();

  public static clearCache(): void {
    this.refNumberMap.clear();
    this.fingerprintMap.clear();
  }

  public static addToCache(
    tx: {
      id: string;
      amount: number;
      accountMask: string;
      timestamp: number;
      type: string;
      merchant?: string;
      referenceNumber?: string;
    }
  ): void {
    if (tx.referenceNumber && tx.referenceNumber.length >= 6) {
      this.refNumberMap.set(tx.referenceNumber.toUpperCase(), {
        id: tx.id,
        timestamp: tx.timestamp,
      });
    }

    const fingerprint = this.generateFingerprint(
      tx.amount,
      tx.accountMask,
      tx.type,
      tx.merchant
    );
    if (fingerprint) {
      this.fingerprintMap.set(fingerprint, { id: tx.id, timestamp: tx.timestamp });
    }
  }

  public static generateFingerprint(
    amount: number,
    accountMask: string,
    type: string,
    merchant?: string
  ): string | null {
    const normalizedMerchant = merchant?.trim().toLowerCase();
    if (
      !normalizedMerchant ||
      /^(?:.+\s+)?(?:bank\s+)?transaction$/.test(normalizedMerchant)
    ) {
      return null;
    }

    return amount.toFixed(2) + '_' + accountMask + '_' + type + '_' + normalizedMerchant;
  }

  public static async isDuplicate(
    candidate: ExtractedTransaction,
    options: { checkDatabase?: boolean; windowMinutes?: number } = {}
  ): Promise<DuplicateCheckResult> {
    const { checkDatabase = true, windowMinutes = 15 } = options;

    if (candidate.referenceNumber && candidate.referenceNumber.length >= 6) {
      const normalizedRef = candidate.referenceNumber.toUpperCase();
      const cached = this.refNumberMap.get(normalizedRef);
      if (cached) {
        const diffMs = Math.abs(candidate.timestamp - cached.timestamp);
        if (diffMs <= 72 * 60 * 60 * 1000) {
          return {
            isDuplicate: true,
            duplicateOfId: cached.id,
            reason: 'Duplicate reference number: ' + candidate.referenceNumber,
          };
        }
      }
    }

    const fingerprint = this.generateFingerprint(
      candidate.amount,
      candidate.accountMask,
      candidate.type,
      candidate.merchant
    );
    const cachedFingerprint = fingerprint
      ? this.fingerprintMap.get(fingerprint)
      : undefined;
    if (
      cachedFingerprint &&
      Math.abs(candidate.timestamp - cachedFingerprint.timestamp) <=
        windowMinutes * 60 * 1000
    ) {
      return {
        isDuplicate: true,
        duplicateOfId: cachedFingerprint.id,
        reason: 'Matched merchant, amount, account, and direction within the duplicate window',
      };
    }

    if (checkDatabase) {
      const windowMs = windowMinutes * 60 * 1000;
      const windowStart = new Date(candidate.timestamp - windowMs).toISOString();
      const windowEnd = new Date(candidate.timestamp + windowMs).toISOString();

      try {
        const dbMatches = await SmsDao.findPotentialDuplicates(
          candidate.amount,
          candidate.accountMask,
          candidate.type,
          candidate.merchant,
          windowStart,
          windowEnd,
          candidate.referenceNumber
        );

        if (dbMatches.length > 0) {
          const match = dbMatches[0];
          return {
            isDuplicate: true,
            duplicateOfId: match.id,
            reason:
              match.referenceNumber === candidate.referenceNumber
                ? 'Matched database reference number: ' + candidate.referenceNumber
                : 'Matched database transaction within ' + windowMinutes + 'm window',
          };
        }
      } catch {
        // Database access is unavailable in isolated parser tests.
      }
    }

    return { isDuplicate: false };
  }
}

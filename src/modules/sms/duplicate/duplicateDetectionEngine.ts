import type { ExtractedTransaction } from '@/modules/sms/types';
import { SmsDao } from '@/modules/sms/storage/smsDao';

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateOfId?: string;
  reason?: string;
}

interface CachedTransactionEntry {
  id: string;
  amount: number;
  accountMask: string;
  timestamp: number;
  type: string;
  merchant?: string;
  bank?: string;
  referenceNumber?: string;
}

const GENERIC_MERCHANT_REGEX =
  /^(?:(?:.+\s+)?(?:bank\s+)?transaction|bank\s*\/\s*upi|upi\s*payment|upi|other|unknown)$/i;

const NOISE_TOKENS = new Set([
  'upi',
  'p2m',
  'p2p',
  'imps',
  'neft',
  'rtgs',
  'vpa',
  'hdfc',
  'icici',
  'sbi',
  'axis',
  'kotak',
  'idfc',
  'paytm',
  'gpay',
  'phonepe',
  'cred',
  'ltd',
  'pvt',
  'private',
  'limited',
  'india',
  'payments',
  'payment',
  'bank',
  'okicici',
  'okhdfcbank',
  'okaxis',
  'oksbi',
  'ybl',
  'ibl',
  'axl',
]);

export function normalizeAccountMask(mask?: string): string {
  if (!mask || mask.toUpperCase() === 'XXXX') return '';
  const digits = mask.replace(/[^0-9]/g, '');
  return digits.length > 4 ? digits.slice(-4) : digits;
}

export function areAccountMasksCompatible(maskA?: string, maskB?: string): boolean {
  const normA = normalizeAccountMask(maskA);
  const normB = normalizeAccountMask(maskB);
  if (!normA || !normB) return true;
  return normA === normB;
}

export function extractReferenceToken(text?: string): string | null {
  if (!text) return null;
  const labeled = text.match(
    /(?:upi\s*ref(?:\s*no\.?)?|ref(?:\s*no\.?)?|rrn|utr|txn\s*(?:id|no\.?)?)\s*[:\s#-]*([a-zA-Z0-9]{6,25})/i
  );
  if (labeled?.[1]) return labeled[1].toUpperCase();

  const utrMatch = text.match(/\b(\d{12})\b/);
  return utrMatch?.[1] ? utrMatch[1].toUpperCase() : null;
}

export function normalizeMerchantTokens(merchant?: string): string[] {
  if (!merchant) return [];
  const trimmed = merchant.trim().toLowerCase();
  if (!trimmed || GENERIC_MERCHANT_REGEX.test(trimmed)) return [];

  const withoutVpaDomain = trimmed.split('@')[0];
  const tokens = withoutVpaDomain
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2 && !NOISE_TOKENS.has(token) && !/^\d{5,}$/.test(token));

  return Array.from(new Set(tokens));
}

export function areMerchantsCompatible(a?: string, b?: string): boolean {
  const normA = (a || '').trim().toLowerCase();
  const normB = (b || '').trim().toLowerCase();

  if (!normA || !normB || GENERIC_MERCHANT_REGEX.test(normA) || GENERIC_MERCHANT_REGEX.test(normB)) {
    return true;
  }

  if (normA === normB) return true;

  const compactA = normA.split('@')[0].replace(/[^a-z0-9]/g, '');
  const compactB = normB.split('@')[0].replace(/[^a-z0-9]/g, '');
  if (
    compactA.length >= 4 &&
    compactB.length >= 4 &&
    (compactA.includes(compactB) || compactB.includes(compactA))
  ) {
    return true;
  }

  const tokensA = normalizeMerchantTokens(a);
  const tokensB = normalizeMerchantTokens(b);
  if (tokensA.length === 0 || tokensB.length === 0) {
    return true;
  }

  const tokenSetB = new Set(tokensB);
  return tokensA.some((token) => tokenSetB.has(token));
}

function hasCrossAppSignal(
  candidate: { bank?: string; accountMask?: string; referenceNumber?: string },
  existing: { bank?: string; accountMask?: string; referenceNumber?: string }
): boolean {
  const candMask = normalizeAccountMask(candidate.accountMask);
  const existMask = normalizeAccountMask(existing.accountMask);
  if (!candMask || !existMask) return true;

  const candBank = (candidate.bank || '').trim().toLowerCase();
  const existBank = (existing.bank || '').trim().toLowerCase();
  if (candBank && existBank && candBank !== existBank) return true;

  return Boolean(candidate.referenceNumber) !== Boolean(existing.referenceNumber);
}

export class DuplicateDetectionEngine {
  private static refNumberMap = new Map<string, { id: string; timestamp: number }>();
  private static fingerprintMap = new Map<
    string,
    { id: string; timestamp: number; referenceNumber?: string }
  >();
  private static recentEntries: CachedTransactionEntry[] = [];
  private static readonly MAX_RECENT_ENTRIES = 150;

  public static clearCache(): void {
    this.refNumberMap.clear();
    this.fingerprintMap.clear();
    this.recentEntries = [];
  }

  public static addToCache(
    tx: {
      id: string;
      amount: number;
      accountMask: string;
      timestamp: number;
      type: string;
      merchant?: string;
      bank?: string;
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
      this.fingerprintMap.set(fingerprint, {
        id: tx.id,
        timestamp: tx.timestamp,
        referenceNumber: tx.referenceNumber,
      });
    }

    this.recentEntries.push({
      id: tx.id,
      amount: tx.amount,
      accountMask: tx.accountMask,
      timestamp: tx.timestamp,
      type: tx.type,
      merchant: tx.merchant,
      bank: tx.bank,
      referenceNumber: tx.referenceNumber,
    });
    if (this.recentEntries.length > this.MAX_RECENT_ENTRIES) {
      this.recentEntries.shift();
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
    options: { checkDatabase?: boolean; windowMinutes?: number; crossAppWindowMinutes?: number } = {}
  ): Promise<DuplicateCheckResult> {
    const {
      checkDatabase = true,
      windowMinutes = 15,
      crossAppWindowMinutes = 5,
    } = options;

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
    const hasDistinctRefNumbers =
      Boolean(candidate.referenceNumber) &&
      Boolean(cachedFingerprint?.referenceNumber) &&
      candidate.referenceNumber?.toUpperCase() !== cachedFingerprint?.referenceNumber?.toUpperCase();

    if (
      cachedFingerprint &&
      !hasDistinctRefNumbers &&
      Math.abs(candidate.timestamp - cachedFingerprint.timestamp) <=
        windowMinutes * 60 * 1000
    ) {
      return {
        isDuplicate: true,
        duplicateOfId: cachedFingerprint.id,
        reason: 'Matched merchant, amount, account, and direction within the duplicate window',
      };
    }

    const crossAppWindowMs = crossAppWindowMinutes * 60 * 1000;
    for (const entry of this.recentEntries) {
      if (
        entry.type !== candidate.type ||
        Math.abs(entry.amount - candidate.amount) > 0.01 ||
        Math.abs(candidate.timestamp - entry.timestamp) > crossAppWindowMs
      ) {
        continue;
      }

      if (
        candidate.referenceNumber &&
        entry.referenceNumber &&
        candidate.referenceNumber.toUpperCase() !== entry.referenceNumber.toUpperCase()
      ) {
        continue;
      }

      if (
        hasCrossAppSignal(candidate, entry) &&
        areAccountMasksCompatible(candidate.accountMask, entry.accountMask) &&
        areMerchantsCompatible(candidate.merchant, entry.merchant)
      ) {
        return {
          isDuplicate: true,
          duplicateOfId: entry.id,
          reason: 'Matched cross-app alert for same amount and merchant within window',
        };
      }
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
          const validDbMatch = dbMatches.find(
            (match) =>
              !(
                candidate.referenceNumber &&
                match.referenceNumber &&
                candidate.referenceNumber.toUpperCase() !== match.referenceNumber.toUpperCase()
              )
          );
          if (validDbMatch) {
            return {
              isDuplicate: true,
              duplicateOfId: validDbMatch.id,
              reason:
                validDbMatch.referenceNumber === candidate.referenceNumber
                  ? 'Matched database reference number: ' + candidate.referenceNumber
                  : 'Matched database transaction within ' + windowMinutes + 'm window',
            };
          }
        }

        if (typeof SmsDao.findCrossAppDuplicates === 'function') {
          const crossStart = new Date(candidate.timestamp - crossAppWindowMs).toISOString();
          const crossEnd = new Date(candidate.timestamp + crossAppWindowMs).toISOString();
          const crossMatches = await SmsDao.findCrossAppDuplicates(
            candidate.amount,
            candidate.type,
            crossStart,
            crossEnd
          );

          for (const match of crossMatches) {
            if (
              candidate.referenceNumber &&
              match.referenceNumber &&
              candidate.referenceNumber.toUpperCase() !== match.referenceNumber.toUpperCase()
            ) {
              continue;
            }

            if (
              hasCrossAppSignal(candidate, match) &&
              areAccountMasksCompatible(candidate.accountMask, match.accountMask) &&
              areMerchantsCompatible(candidate.merchant, match.merchant)
            ) {
              return {
                isDuplicate: true,
                duplicateOfId: match.id,
                reason: 'Matched cross-app database transaction within ' + crossAppWindowMinutes + 'm window',
              };
            }
          }
        }
      } catch {
        // Database access is unavailable in isolated parser tests.
      }
    }

    return { isDuplicate: false };
  }
}

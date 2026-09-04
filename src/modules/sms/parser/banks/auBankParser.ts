import { BaseBankParser } from './baseBankParser';
import type { RawSmsMessage, ExtractedTransaction, ClassificationResult } from '@/modules/sms/types';

export class AuBankParser extends BaseBankParser {
  readonly bankId = 'AUBANK';
  readonly bankName = 'AU Small Finance Bank';
  protected readonly addressKeywords = ['AUBANK', 'AUSFB'];

  public override parse(
    message: RawSmsMessage,
    classification?: ClassificationResult
  ): ExtractedTransaction | null {
    const extracted = super.parse(message, classification);
    if (!extracted) return null;

    const body = message.body;
    // AU pattern: "AU Bank: A/c **1234 debited by INR 500.00 on ... towards [merchant] ..."
    const towardsMatch = body.match(/towards\s+([A-Za-z0-9*.\-&_\s]+?)(?:\s+on|\s+ref|\.|$)/i);
    if (towardsMatch && towardsMatch[1]) {
      extracted.merchant = towardsMatch[1].trim();
    }

    return extracted;
  }
}

import type { ClassificationResult, ExtractedTransaction, RawSmsMessage } from '@/modules/sms/types';
import { BaseBankParser } from './baseBankParser';

export class KotakParser extends BaseBankParser {
  readonly bankId = 'KOTAK';
  readonly bankName = 'Kotak Mahindra Bank';
  protected readonly addressKeywords = ['KOTAKB', 'KOTAK'];

  public override parse(
    message: RawSmsMessage,
    classification?: ClassificationResult
  ): ExtractedTransaction | null {
    const extracted = super.parse(message, classification);
    if (!extracted) return null;

    const body = message.body;
    // Kotak pattern: "Sent Rs.500.00 from Kotak Bank AC XX1234 to [merchant] on 01-Jan-25..."
    const toMatch = body.match(/\bto\s+([A-Za-z0-9*.\-&_\s]+?)(?:\s+on|\s+Ref|\.|$)/i);
    if (toMatch && toMatch[1]) {
      extracted.merchant = this.pickMerchant(toMatch[1], extracted.merchant);
    }

    return extracted;
  }
}

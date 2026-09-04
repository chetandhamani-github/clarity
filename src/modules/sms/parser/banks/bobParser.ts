import { BaseBankParser } from './baseBankParser';
import type { RawSmsMessage, ExtractedTransaction, ClassificationResult } from '@/modules/sms/types';

export class BobParser extends BaseBankParser {
  readonly bankId = 'BOBTXN';
  readonly bankName = 'Bank of Baroda';
  protected readonly addressKeywords = ['BOBTXN', 'BARODA', 'BOBSMS', 'BOB'];

  public override parse(
    message: RawSmsMessage,
    classification?: ClassificationResult
  ): ExtractedTransaction | null {
    const extracted = super.parse(message, classification);
    if (!extracted) return null;

    const body = message.body;
    // Bank of Baroda pattern: "BOB: Your A/C ... debited by Rs. 500 on ... to [merchant]..."
    const toMatch = body.match(/to\s+([A-Za-z0-9*.\-&_\s]+?)(?:\s+on|\s+ref|\.|$)/i);
    if (toMatch && toMatch[1]) {
      extracted.merchant = toMatch[1].trim();
    }

    return extracted;
  }
}

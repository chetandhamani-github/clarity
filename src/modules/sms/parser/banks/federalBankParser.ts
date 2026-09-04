import { BaseBankParser } from './baseBankParser';
import type { RawSmsMessage, ExtractedTransaction, ClassificationResult } from '@/modules/sms/types';

export class FederalBankParser extends BaseBankParser {
  readonly bankId = 'FEDBNK';
  readonly bankName = 'Federal Bank';
  protected readonly addressKeywords = ['FEDBNK', 'FEDRL', 'FEDERAL'];

  public override parse(
    message: RawSmsMessage,
    classification?: ClassificationResult
  ): ExtractedTransaction | null {
    const extracted = super.parse(message, classification);
    if (!extracted) return null;

    const body = message.body;
    // Federal Bank pattern: "Federal Bank: A/c XX1234 debited for Rs 500 at [merchant]..."
    const atMatch = body.match(/at\s+([A-Za-z0-9*.\-&_\s]+?)(?:\s+on|\s+ref|\.|$)/i);
    if (atMatch && atMatch[1]) {
      extracted.merchant = atMatch[1].trim();
    }

    return extracted;
  }
}

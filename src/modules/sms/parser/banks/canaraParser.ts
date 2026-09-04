import { BaseBankParser } from './baseBankParser';
import type { RawSmsMessage, ExtractedTransaction, ClassificationResult } from '@/modules/sms/types';

export class CanaraParser extends BaseBankParser {
  readonly bankId = 'CANBNK';
  readonly bankName = 'Canara Bank';
  protected readonly addressKeywords = ['CANBNK', 'CANARA'];

  public override parse(
    message: RawSmsMessage,
    classification?: ClassificationResult
  ): ExtractedTransaction | null {
    const extracted = super.parse(message, classification);
    if (!extracted) return null;

    const body = message.body;
    // Canara Bank pattern: "Canara Bank: A/c ... debited for Rs 500 towards [merchant]..."
    const towardsMatch = body.match(/towards\s+([A-Za-z0-9*.\-&_\s]+?)(?:\s+on|\s+ref|\.|$)/i);
    if (towardsMatch && towardsMatch[1]) {
      extracted.merchant = towardsMatch[1].trim();
    }

    return extracted;
  }
}

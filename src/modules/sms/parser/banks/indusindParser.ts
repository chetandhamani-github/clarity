import type { ClassificationResult, ExtractedTransaction, RawSmsMessage } from '@/modules/sms/types';
import { BaseBankParser } from './baseBankParser';

export class IndusindParser extends BaseBankParser {
  readonly bankId = 'INDBNK';
  readonly bankName = 'IndusInd Bank';
  protected readonly addressKeywords = ['INDBNK', 'INDUSB', 'INDUS'];

  public override parse(
    message: RawSmsMessage,
    classification?: ClassificationResult
  ): ExtractedTransaction | null {
    const extracted = super.parse(message, classification);
    if (!extracted) return null;

    const body = message.body;
    // IndusInd pattern: "IndusInd Bank: INR 500 debited from A/C XX1234 on 01-Jan at [merchant]..."
    const atMatch = body.match(/\bat\s+([A-Za-z0-9*.\-&_\s]+?)(?:\s+on|\s+ref|\.|$)/i);
    if (atMatch && atMatch[1]) {
      extracted.merchant = this.pickMerchant(atMatch[1], extracted.merchant);
    }

    return extracted;
  }
}

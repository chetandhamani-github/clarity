import type { ClassificationResult, ExtractedTransaction, RawSmsMessage } from '@/modules/sms/types';
import { BaseBankParser } from './baseBankParser';

export class IciciParser extends BaseBankParser {
  readonly bankId = 'ICICI';
  readonly bankName = 'ICICI Bank';
  protected readonly addressKeywords = ['ICICIB', 'ICICI'];

  public override parse(
    message: RawSmsMessage,
    classification?: ClassificationResult
  ): ExtractedTransaction | null {
    const extracted = super.parse(message, classification);
    if (!extracted) return null;

    const body = message.body;
    // ICICI pattern: "Acct XX123 debited for Rs 500.00 on 01-Jan-25; Swiggy credited. Avl Bal..."
    const creditedMatch = body.match(/;\s*([A-Za-z0-9*.\-&\s]+?)\s+credited/i);
    if (creditedMatch && creditedMatch[1]) {
      extracted.merchant = this.pickMerchant(creditedMatch[1], extracted.merchant);
    } else {
      const atMatch = body.match(/\b(?:at|info:)\s+([A-Za-z0-9*.\-&\s]+?)(?:\.|\s+Avl)/i);
      if (atMatch && atMatch[1]) {
        extracted.merchant = this.pickMerchant(atMatch[1], extracted.merchant);
      }
    }

    return extracted;
  }
}

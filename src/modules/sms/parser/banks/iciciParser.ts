import { BaseBankParser } from './baseBankParser';
import type { RawSmsMessage, ExtractedTransaction, ClassificationResult } from '@/modules/sms/types';

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
      extracted.merchant = creditedMatch[1].trim();
    } else {
      const atMatch = body.match(/(?:at|info:)\s+([A-Za-z0-9*.\-&\s]+?)(?:\.|\s+Avl)/i);
      if (atMatch && atMatch[1]) {
        extracted.merchant = atMatch[1].trim();
      }
    }

    return extracted;
  }
}

import { BaseBankParser } from './baseBankParser';
import type { RawSmsMessage, ExtractedTransaction, ClassificationResult } from '@/modules/sms/types';
import { TransactionExtractor } from '@/modules/sms/extractor/transactionExtractor';

export class HdfcParser extends BaseBankParser {
  readonly bankId = 'HDFC';
  readonly bankName = 'HDFC Bank';
  protected readonly addressKeywords = ['HDFCBK', 'HDFC', 'HDFCCC'];

  public override parse(
    message: RawSmsMessage,
    classification?: ClassificationResult
  ): ExtractedTransaction | null {
    const extracted = super.parse(message, classification);
    if (!extracted) return null;

    // HDFC specific merchant pattern: "... to VPA [vpa] ..." or "... at [merchant] on ..."
    const body = message.body;
    const vpaMatch = body.match(/to\s+VPA\s+([a-zA-Z0-9.\-_@]+)/i);
    if (vpaMatch && vpaMatch[1]) {
      extracted.merchant = vpaMatch[1];
    } else {
      const atMatch = body.match(/at\s+([A-Za-z0-9*.\-&\s]+?)\s+on\s+\d/i);
      if (atMatch && atMatch[1]) {
        extracted.merchant = atMatch[1].trim();
      }
    }

    return extracted;
  }
}

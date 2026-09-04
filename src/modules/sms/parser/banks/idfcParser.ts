import { BaseBankParser } from './baseBankParser';
import type { RawSmsMessage, ExtractedTransaction, ClassificationResult } from '@/modules/sms/types';

export class IdfcParser extends BaseBankParser {
  readonly bankId = 'IDFC';
  readonly bankName = 'IDFC FIRST Bank';
  protected readonly addressKeywords = ['IDFCFB', 'IDFC'];

  public override parse(
    message: RawSmsMessage,
    classification?: ClassificationResult
  ): ExtractedTransaction | null {
    const extracted = super.parse(message, classification);
    if (!extracted) return null;

    const body = message.body;
    // IDFC pattern: "Rs.500.00 debited from IDFC FIRST Bank A/C ... to [merchant] on ..."
    const toMatch = body.match(/to\s+([A-Za-z0-9*.\-&_\s]+?)(?:\s+on|\s+ref|\.|$)/i);
    if (toMatch && toMatch[1]) {
      extracted.merchant = toMatch[1].trim();
    }

    return extracted;
  }
}

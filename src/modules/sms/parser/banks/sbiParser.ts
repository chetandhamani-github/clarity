import { BaseBankParser } from './baseBankParser';
import type { RawSmsMessage, ExtractedTransaction, ClassificationResult } from '@/modules/sms/types';

export class SbiParser extends BaseBankParser {
  readonly bankId = 'SBI';
  readonly bankName = 'State Bank of India';
  protected readonly addressKeywords = ['SBIINB', 'SBIPSG', 'SBMSMS', 'SBIUPI', 'SBI'];

  public override parse(
    message: RawSmsMessage,
    classification?: ClassificationResult
  ): ExtractedTransaction | null {
    const extracted = super.parse(message, classification);
    if (!extracted) return null;

    const body = message.body;
    // SBI pattern: "...debited by 500.0 on 01Jan25 trf to [merchant] Ref No..."
    const trfMatch = body.match(/trf\s+to\s+([A-Za-z0-9*.\-&_\s]+?)(?:\s+Ref|\s+Bal|\.|$)/i);
    if (trfMatch && trfMatch[1]) {
      extracted.merchant = trfMatch[1].trim();
    }

    return extracted;
  }
}

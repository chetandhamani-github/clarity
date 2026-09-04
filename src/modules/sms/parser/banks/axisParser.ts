import { BaseBankParser } from './baseBankParser';
import type { RawSmsMessage, ExtractedTransaction, ClassificationResult } from '@/modules/sms/types';

export class AxisParser extends BaseBankParser {
  readonly bankId = 'AXIS';
  readonly bankName = 'Axis Bank';
  protected readonly addressKeywords = ['AXISBK', 'AXIS'];

  public override parse(
    message: RawSmsMessage,
    classification?: ClassificationResult
  ): ExtractedTransaction | null {
    const extracted = super.parse(message, classification);
    if (!extracted) return null;

    const body = message.body;
    // Axis pattern: "...debited with INR 500.00 on 01-01-25 info: [merchant] Avl Bal..."
    const infoMatch = body.match(/info[:\s]+([A-Za-z0-9*.\-&_\s]+?)(?:\s+Avl|\s+Not|\.|$)/i);
    if (infoMatch && infoMatch[1]) {
      extracted.merchant = infoMatch[1].trim();
    }

    return extracted;
  }
}

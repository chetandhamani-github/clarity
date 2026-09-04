import { BaseBankParser } from './baseBankParser';
import type { RawSmsMessage, ExtractedTransaction, ClassificationResult } from '@/modules/sms/types';
import { TransactionExtractor } from '@/modules/sms/extractor/transactionExtractor';

export class GenericBankParser extends BaseBankParser {
  readonly bankId = 'GENERIC';
  readonly bankName = 'Generic Bank';
  protected readonly addressKeywords = [];

  public override canHandle(_message: RawSmsMessage): boolean {
    // Generic fallback can handle any message
    return true;
  }

  public override parse(
    message: RawSmsMessage,
    classification?: ClassificationResult
  ): ExtractedTransaction | null {
    const extracted = TransactionExtractor.extract(message, classification);
    return extracted;
  }
}

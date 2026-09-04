import type {
  IBankParser,
  RawSmsMessage,
  ExtractedTransaction,
  ClassificationResult,
} from '@/modules/sms/types';
import { TransactionExtractor } from '@/modules/sms/extractor/transactionExtractor';

export abstract class BaseBankParser implements IBankParser {
  abstract readonly bankId: string;
  abstract readonly bankName: string;
  protected abstract readonly addressKeywords: string[];

  public canHandle(message: RawSmsMessage): boolean {
    const addr = message.address.toUpperCase();
    const hasAddressMatch = this.addressKeywords.some((keyword) => addr.includes(keyword));
    if (hasAddressMatch) return true;

    // Secondary check: Bank name in message body
    const bodyLower = message.body.toLowerCase();
    return bodyLower.includes(this.bankName.toLowerCase());
  }

  public parse(
    message: RawSmsMessage,
    classification?: ClassificationResult
  ): ExtractedTransaction | null {
    const extracted = TransactionExtractor.extract(message, classification);
    if (!extracted) return null;

    return {
      ...extracted,
      bank: this.bankName,
    };
  }
}

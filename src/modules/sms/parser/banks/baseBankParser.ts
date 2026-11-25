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
    const addrTokens = addr.split(/[^A-Z0-9]+/).filter(Boolean);
    const hasAddressMatch = this.addressKeywords.some((keyword) =>
      addrTokens.some(
        (token) => token === keyword || (keyword.length >= 4 && token.includes(keyword))
      )
    );
    if (hasAddressMatch) return true;

    // Secondary check: Bank name in message body (avoid hijacking UPI alerts where bank is only the payee)
    const bodyLower = message.body.toLowerCase();
    const bankLower = this.bankName.toLowerCase();
    if (!bodyLower.includes(bankLower)) return false;

    const escapedBank = bankLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const recipientOnlyRegex = new RegExp(
      `\\b(?:paid\\s+to|sent\\s+to|transfer(?:red)?\\s+to|to|towards)\\s+[^.;\\n]*\\b${escapedBank}\\b`,
      'i'
    );
    const accountOrSenderContextRegex = new RegExp(
      `(?:^${escapedBank}\\b|\\b(?:from|on|via|using|at|in|your)\\s+${escapedBank}\\b|\\b${escapedBank}\\s*(?:a\\/c|acct?|account|card|upi|:|-))`,
      'i'
    );

    if (recipientOnlyRegex.test(message.body) && !accountOrSenderContextRegex.test(message.body)) {
      return false;
    }

    return true;
  }

  protected pickMerchant(candidate: string | undefined, fallback: string): string {
    const cleaned = (candidate || '').trim();
    if (
      !cleaned ||
      cleaned.length < 2 ||
      /^(?:your(?:\s+(?:a\/?c|account|card))?|the|a\/?c|account|card|bank|vpa|upi|rs\.?|inr|\d+)$/i.test(
        cleaned
      )
    ) {
      return fallback;
    }
    return cleaned;
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

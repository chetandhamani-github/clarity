import type {
  RawSmsMessage,
  ParsedTransaction,
  ReviewQueueItem,
  ClassificationResult,
} from '@/modules/sms/types';
import { SmsClassificationEngine } from '@/modules/sms/classifier/smsClassificationEngine';
import { ParserRegistry } from '@/modules/sms/parser/parserRegistry';
import { LocalCategorizerEngine } from '@/modules/sms/categorizer/localCategorizerEngine';
import { DuplicateDetectionEngine } from '@/modules/sms/duplicate/duplicateDetectionEngine';
import { ReviewQueueService } from '@/modules/sms/reviewQueue/reviewQueueService';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type PipelineProcessResult =
  | { type: 'PARSED'; transaction: ParsedTransaction }
  | { type: 'REVIEW'; reviewItem: ReviewQueueItem }
  | { type: 'IGNORED'; reason: string; classification: ClassificationResult };

export class SmsPipelineService {
  /**
   * Process a single raw SMS message through the complete intelligence pipeline:
   * 1. Classification & Noise Filtering (OTP, Promo, Spam)
   * 2. Bank Parser Matching & Field Extraction
   * 3. Local Categorization
   * 4. Duplicate Detection
   * 5. Review Queue Routing (if parsing failed or confidence is low)
   */
  public static async processMessage(
    message: RawSmsMessage,
    options: { checkDatabaseDuplicates?: boolean } = {}
  ): Promise<PipelineProcessResult> {
    // 1. Classify message
    const classification = SmsClassificationEngine.classify(message);

    // Filter out non-financial messages
    if (!classification.isFinancial) {
      return {
        type: 'IGNORED',
        reason: classification.classification,
        classification,
      };
    }

    // 2. Parse and extract using registered bank parsers
    const extracted = ParserRegistry.parse(message, classification);

    if (!extracted) {
      // Message appeared financial but parser could not extract crucial fields
      const reviewItem = ReviewQueueService.createReviewItem(
        message,
        'UNRECOGNIZED_FORMAT',
        classification.confidence
      );
      return {
        type: 'REVIEW',
        reviewItem,
      };
    }

    // Check if essential fields are missing
    if (extracted.amount <= 0) {
      const reviewItem = ReviewQueueService.createReviewItem(
        message,
        'MISSING_AMOUNT',
        0.4,
        extracted
      );
      return {
        type: 'REVIEW',
        reviewItem,
      };
    }

    const hasKnownBank = extracted.bank && extracted.bank !== 'Other Bank';
    const accountSuffix = extracted.accountMask.replace(/[^0-9]/g, '');
    if (!hasKnownBank || accountSuffix.length < 3) {
      const reviewItem = ReviewQueueService.createReviewItem(
        message,
        'MISSING_ACCOUNT',
        classification.confidence,
        extracted
      );
      return {
        type: 'REVIEW',
        reviewItem,
      };
    }

    // 3. Local Categorization
    const category = LocalCategorizerEngine.categorize(extracted, classification.classification);

    // 4. Duplicate Check
    const dupCheck = await DuplicateDetectionEngine.isDuplicate(extracted, {
      checkDatabase: options.checkDatabaseDuplicates !== false,
    });

    const parsedTx: ParsedTransaction = {
      id: generateId(),
      smsId: message.id,
      amount: extracted.amount,
      type: extracted.type,
      merchant: extracted.merchant,
      category,
      bank: extracted.bank,
      accountMask: extracted.accountMask,
      referenceNumber: extracted.referenceNumber,
      availableBalance: extracted.availableBalance,
      timestamp: extracted.timestamp,
      confidence: classification.confidence,
      isDuplicate: dupCheck.isDuplicate,
      duplicateOf: dupCheck.duplicateOfId,
      rawBody: message.body,
      createdAt: new Date().toISOString(),
    };

    // Add to in-memory duplicate cache
    DuplicateDetectionEngine.addToCache(parsedTx);

    return {
      type: 'PARSED',
      transaction: parsedTx,
    };
  }
}

import { NotificationLedgerService } from '@/modules/notifications/services/notificationLedgerService';
import { LocalCategorizerEngine } from '@/modules/sms/categorizer/localCategorizerEngine';
import { SmsDao } from '@/modules/sms/storage/smsDao';
import type {
  ExtractedTransaction,
  ParsedTransaction,
  ReviewQueueItem,
} from '@/modules/sms/types';
import { createReviewItem } from './reviewItemFactory';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r % 4) + 8;
    return v.toString(16);
  });
}

export class ReviewQueueService {
  /**
   * Create a review queue item from a failed or ambiguous notification parse attempt.
   */
  public static createReviewItem = createReviewItem;

  /**
   * Fetch pending review items from database.
   */
  public static async getPendingItems(
    limit: number = 50,
    offset: number = 0
  ): Promise<ReviewQueueItem[]> {
    return SmsDao.getReviewQueueItems('pending', limit, offset);
  }

  /**
   * Get count of pending review items.
   */
  public static async getPendingCount(): Promise<number> {
    const stats = await SmsDao.getSmsStats();
    return stats.totalReview;
  }

  /**
   * Resolve an item by supplying user-verified transaction details and optional target account.
   */
  public static async resolveItem(
    reviewItem: ReviewQueueItem,
    verifiedData: ExtractedTransaction,
    overrideAccountId?: string
  ): Promise<ParsedTransaction> {
    const category = LocalCategorizerEngine.categorize(verifiedData);
    const parsedTx: ParsedTransaction = {
      id: generateId(),
      smsId: reviewItem.smsId,
      amount: verifiedData.amount,
      type: verifiedData.type,
      merchant: verifiedData.merchant,
      category,
      bank: verifiedData.bank,
      accountMask: verifiedData.accountMask,
      referenceNumber: verifiedData.referenceNumber,
      availableBalance: verifiedData.availableBalance,
      timestamp: verifiedData.timestamp,
      confidence: 1.0,
      isDuplicate: false,
      rawBody: reviewItem.body,
      createdAt: new Date().toISOString(),
    };

    await SmsDao.saveParsedTransactionsBatch([parsedTx]);

    await NotificationLedgerService.importParsedTransactions(
      [parsedTx],
      overrideAccountId ? { accountOverrides: { [parsedTx.id]: overrideAccountId } } : undefined
    );

    await SmsDao.updateReviewQueueStatus(reviewItem.id, 'resolved');

    return parsedTx;
  }

  /**
   * Dismiss an item from the review queue.
   */
  public static async dismissItem(id: string): Promise<void> {
    await SmsDao.updateReviewQueueStatus(id, 'dismissed');
  }
}

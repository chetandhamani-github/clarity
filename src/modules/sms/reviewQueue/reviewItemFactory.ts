import type {
  ExtractedTransaction,
  RawSmsMessage,
  ReviewQueueItem,
  ReviewReason,
} from '@/modules/sms/types';

function generateReviewItemId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Create a review queue item from a failed or ambiguous SMS parse attempt.
 */
export function createReviewItem(
  message: RawSmsMessage,
  reason: ReviewReason,
  confidence: number = 0.3,
  extractedData?: Partial<ExtractedTransaction>
): ReviewQueueItem {
  return {
    id: generateReviewItemId(),
    smsId: message.id,
    sender: message.address,
    body: message.body,
    reason,
    confidence,
    extractedData,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
}


import { ReviewQueueService } from './reviewQueueService';
import type { RawSmsMessage, ExtractedTransaction } from '@/modules/sms/types';
import { SmsDao } from '@/modules/sms/storage/smsDao';

jest.mock('@/modules/sms/storage/smsDao', () => ({
  SmsDao: {
    saveParsedTransactionsBatch: jest.fn().mockResolvedValue(undefined),
    updateReviewQueueStatus: jest.fn().mockResolvedValue(undefined),
    getReviewQueueItems: jest.fn().mockResolvedValue([]),
  },
}));

describe('ReviewQueueService', () => {
  const sampleMsg: RawSmsMessage = {
    id: 'sms-rev-1',
    address: 'UNKNOWN',
    body: 'Your financial balance updated unexpectedly.',
    date: Date.now(),
  };

  it('creates a review item with pending status', () => {
    const item = ReviewQueueService.createReviewItem(sampleMsg, 'UNRECOGNIZED_FORMAT', 0.2);
    expect(item.smsId).toBe('sms-rev-1');
    expect(item.reason).toBe('UNRECOGNIZED_FORMAT');
    expect(item.status).toBe('pending');
    expect(item.confidence).toBe(0.2);
  });

  it('resolves a review item into a verified parsed transaction', async () => {
    const item = ReviewQueueService.createReviewItem(sampleMsg, 'MISSING_AMOUNT', 0.4);
    const verifiedData: ExtractedTransaction = {
      amount: 450,
      type: 'DEBIT',
      merchant: 'Swiggy',
      bank: 'HDFC Bank',
      accountMask: '1234',
      timestamp: Date.now(),
    };

    const parsedTx = await ReviewQueueService.resolveItem(item, verifiedData);
    expect(parsedTx.amount).toBe(450);
    expect(parsedTx.merchant).toBe('Swiggy');
    expect(parsedTx.confidence).toBe(1.0);
    expect(parsedTx.category).toBe('Food & Dining');

    expect(SmsDao.saveParsedTransactionsBatch).toHaveBeenCalled();
    expect(SmsDao.updateReviewQueueStatus).toHaveBeenCalledWith(item.id, 'resolved');
  });

  it('dismisses a review item', async () => {
    await ReviewQueueService.dismissItem('item-123');
    expect(SmsDao.updateReviewQueueStatus).toHaveBeenCalledWith('item-123', 'dismissed');
  });
});

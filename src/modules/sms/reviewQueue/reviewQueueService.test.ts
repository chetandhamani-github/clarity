import { ReviewQueueService } from './reviewQueueService';
import type { RawSmsMessage, ExtractedTransaction } from '@/modules/sms/types';
import { SmsDao } from '@/modules/sms/storage/smsDao';
import { NotificationLedgerService } from '@/modules/notifications/services/notificationLedgerService';

jest.mock('@/modules/sms/storage/smsDao', () => ({
  SmsDao: {
    saveParsedTransactionsBatch: jest.fn().mockResolvedValue(undefined),
    updateReviewQueueStatus: jest.fn().mockResolvedValue(undefined),
    getReviewQueueItems: jest.fn().mockResolvedValue([]),
    getSmsStats: jest.fn().mockResolvedValue({ totalReview: 3 }),
  },
}));

jest.mock('@/modules/notifications/services/notificationLedgerService', () => ({
  NotificationLedgerService: {
    importParsedTransactions: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('ReviewQueueService', () => {
  const sampleMsg: RawSmsMessage = {
    id: 'notif-rev-1',
    address: 'Google Pay',
    body: 'Your financial balance updated unexpectedly.',
    date: Date.now(),
  };

  it('creates a review item with pending status', () => {
    const item = ReviewQueueService.createReviewItem(sampleMsg, 'UNRECOGNIZED_FORMAT', 0.2);
    expect(item.smsId).toBe('notif-rev-1');
    expect(item.reason).toBe('UNRECOGNIZED_FORMAT');
    expect(item.status).toBe('pending');
    expect(item.confidence).toBe(0.2);
  });

  it('resolves a review item into a verified parsed transaction with optional target account', async () => {
    const item = ReviewQueueService.createReviewItem(sampleMsg, 'MISSING_AMOUNT', 0.4);
    const verifiedData: ExtractedTransaction = {
      amount: 450,
      type: 'DEBIT',
      merchant: 'Swiggy',
      bank: 'HDFC Bank',
      accountMask: '1234',
      timestamp: Date.now(),
    };

    const parsedTx = await ReviewQueueService.resolveItem(item, verifiedData, 'acc-override');
    expect(parsedTx.amount).toBe(450);
    expect(parsedTx.merchant).toBe('Swiggy');
    expect(parsedTx.confidence).toBe(1.0);
    expect(parsedTx.category).toBe('Food & Dining');

    expect(SmsDao.saveParsedTransactionsBatch).toHaveBeenCalled();
    expect(NotificationLedgerService.importParsedTransactions).toHaveBeenCalledWith(
      [parsedTx],
      { accountOverrides: { [parsedTx.id]: 'acc-override' } }
    );
    expect(SmsDao.updateReviewQueueStatus).toHaveBeenCalledWith(item.id, 'resolved');
  });

  it('dismisses a review item', async () => {
    await ReviewQueueService.dismissItem('item-123');
    expect(SmsDao.updateReviewQueueStatus).toHaveBeenCalledWith('item-123', 'dismissed');
  });

  it('gets count of pending review items', async () => {
    const count = await ReviewQueueService.getPendingCount();
    expect(count).toBe(3);
    expect(SmsDao.getSmsStats).toHaveBeenCalled();
  });
});

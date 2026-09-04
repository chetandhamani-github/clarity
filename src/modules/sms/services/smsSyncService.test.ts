import { SmsSyncService } from './smsSyncService';
import { SmsReaderService } from '@/modules/sms/reader/smsReaderService';
import { MockSmsReaderAdapter } from '@/modules/sms/reader/mockSmsReaderAdapter';
import { SmsDao } from '@/modules/sms/storage/smsDao';
import { mmkv } from '@/lib/storage';
import type { RawSmsMessage } from '@/modules/sms/types';

jest.mock('@/modules/sms/storage/smsDao', () => ({
  SmsDao: {
    saveSmsBatch: jest.fn().mockResolvedValue(undefined),
    saveParsedTransactionsBatch: jest.fn().mockResolvedValue(undefined),
    saveReviewQueueBatch: jest.fn().mockResolvedValue(undefined),
    findPotentialDuplicates: jest.fn().mockResolvedValue([]),
    getLatestSmsTimestamp: jest.fn().mockResolvedValue(null),
    linkClarityTransaction: jest.fn().mockResolvedValue(undefined),
    getTransactionsForRecurringAnalysis: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/services/database/account-dao', () => ({
  getAllAccounts: jest.fn().mockResolvedValue([
    {
      id: 'acc-1',
      name: 'HDFC Savings',
      type: 'savings',
      balance: 10000,
      institution: 'HDFC Bank',
      lastFour: '1234',
    },
  ]),
  insertAccount: jest.fn().mockResolvedValue({
    id: 'acc-new',
    name: 'New Account',
  }),
}));

jest.mock('@/services/database/transaction-dao', () => ({
  insertTransaction: jest.fn().mockResolvedValue({
    id: 'clarity-tx-1',
  }),
}));

describe('SmsSyncService', () => {
  const sampleMessages: RawSmsMessage[] = [
    {
      id: 'sms-sync-1',
      address: 'VM-HDFCBK',
      body: 'Rs.350.00 debited from HDFC Bank A/c **1234 on 15-Jan-25 to VPA swiggy@hdfcbank',
      date: 1705315200000,
    },
    {
      id: 'sms-sync-2',
      address: 'VM-HDFCBK',
      body: 'Your OTP is 445566. Do not share.',
      date: 1705315300000,
    },
  ];

  let mockAdapter: MockSmsReaderAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAdapter = new MockSmsReaderAdapter(sampleMessages);
    SmsReaderService.setAdapter(mockAdapter);
    mmkv.remove('clarity_last_sms_sync_timestamp');
  });

  afterAll(() => {
    SmsReaderService.resetAdapter();
  });

  it('runs initial scan, parses financial messages, ignores OTPs, and saves to database', async () => {
    const progressUpdates: any[] = [];
    const result = await SmsSyncService.runInitialScan({
      batchSize: 10,
      autoCreateClarityTransactions: true,
      onProgress: (p) => progressUpdates.push(p),
    });

    expect(result.scannedCount).toBe(2);
    expect(result.parsedCount).toBe(1); // 1 financial transaction parsed
    expect(result.reviewCount).toBe(0);

    expect(SmsDao.saveSmsBatch).toHaveBeenCalled();
    expect(SmsDao.saveParsedTransactionsBatch).toHaveBeenCalled();

    // Progress updates were dispatched
    expect(progressUpdates.length).toBeGreaterThan(0);
    expect(progressUpdates[progressUpdates.length - 1].phase).toBe('complete');

    // Last sync timestamp was saved in MMKV
    const savedTimestamp = SmsSyncService.getLastSyncTimestamp();
    expect(savedTimestamp).toBe(1705315300000);
  });

  it('runs incremental scan only processing new messages', async () => {
    SmsSyncService.setLastSyncTimestamp(1705315200000);

    const result = await SmsSyncService.runIncrementalScan({
      autoCreateClarityTransactions: false,
    });

    expect(result.scannedCount).toBe(1); // only the message newer than 1705315200000
  });
});

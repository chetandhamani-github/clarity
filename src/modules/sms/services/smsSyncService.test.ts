import { SmsSyncService } from './smsSyncService';
import { SmsReaderService } from '@/modules/sms/reader/smsReaderService';
import { MockSmsReaderAdapter } from '@/modules/sms/reader/mockSmsReaderAdapter';
import { SmsDao } from '@/modules/sms/storage/smsDao';
import { mmkv } from '@/lib/storage';
import type { ParsedTransaction, RawSmsMessage } from '@/modules/sms/types';

jest.mock('@/modules/sms/storage/smsDao', () => ({
  SmsDao: {
    saveSmsBatch: jest.fn().mockResolvedValue(undefined),
    saveParsedTransactionsBatch: jest.fn().mockResolvedValue(undefined),
    saveReviewQueueBatch: jest.fn().mockResolvedValue(undefined),
    findPotentialDuplicates: jest.fn().mockResolvedValue([]),
    getLatestSmsTimestamp: jest.fn().mockResolvedValue(null),
    getExistingSmsIds: jest.fn().mockResolvedValue(new Set()),
    getUnlinkedParsedTransactions: jest.fn().mockResolvedValue([]),
    linkClarityTransaction: jest.fn().mockResolvedValue(undefined),
    getTransactionsForRecurringAnalysis: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/services/database', () => ({
  getDatabase: jest.fn().mockReturnValue({
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    runAsync: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('@/services/database/account-dao', () => ({
  getAllAccounts: jest.fn(),
  insertAccount: jest.fn().mockResolvedValue({
    id: 'acc-new',
    name: 'New Account',
    type: 'savings',
    balance: 0,
    institution: 'State Bank of India',
    lastFour: '5678',
  }),
  updateAccount: jest.fn().mockResolvedValue(undefined),
  updateAccountBalance: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/database/transaction-dao', () => ({
  insertTransaction: jest.fn().mockResolvedValue({
    id: 'clarity-tx-1',
  }),
}));

const initialAccounts = [
  {
    id: 'acc-1',
    name: 'HDFC Savings',
    type: 'savings' as const,
    balance: 10000,
    institution: 'HDFC Bank',
    lastFour: '1234',
  },
];

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

  beforeEach(() => {
    jest.clearAllMocks();
    const { getAllAccounts } = require('@/services/database/account-dao');
    getAllAccounts.mockResolvedValue(initialAccounts);
    (SmsDao.getExistingSmsIds as jest.Mock).mockResolvedValue(new Set());
    (SmsDao.getUnlinkedParsedTransactions as jest.Mock).mockResolvedValue([]);
    SmsReaderService.setAdapter(new MockSmsReaderAdapter(sampleMessages));
    mmkv.remove('clarity_last_sms_sync_timestamp');
  });

  afterAll(() => {
    SmsReaderService.resetAdapter();
  });

  it('scans all batches, parses financial messages, and saves a durable cursor', async () => {
    const progressUpdates: Array<{ phase: string }> = [];
    const result = await SmsSyncService.runInitialScan({
      batchSize: 1,
      autoCreateClarityTransactions: true,
      onProgress: (progress) => progressUpdates.push(progress),
    });

    expect(result).toMatchObject({
      scannedCount: 2,
      parsedCount: 1,
      reviewCount: 0,
    });
    expect(SmsDao.saveSmsBatch).toHaveBeenCalledTimes(2);
    expect(SmsDao.saveParsedTransactionsBatch).toHaveBeenCalled();
    expect(progressUpdates.at(-1)?.phase).toBe('complete');
    expect(SmsSyncService.getLastSyncTimestamp()).toBe(1705315300000);
  });

  it('re-reads the cursor boundary but does not process an already saved SMS', async () => {
    SmsSyncService.setLastSyncTimestamp(1705315200000);
    (SmsDao.getExistingSmsIds as jest.Mock).mockResolvedValue(new Set(['sms-sync-1']));

    const result = await SmsSyncService.runIncrementalScan({
      autoCreateClarityTransactions: false,
    });

    expect(result.scannedCount).toBe(2);
    expect(result.parsedCount).toBe(0);
    expect(SmsDao.saveParsedTransactionsBatch).toHaveBeenCalledWith([]);
  });

  it('creates a separate account when the same bank reports a different suffix', async () => {
    SmsReaderService.setAdapter(
      new MockSmsReaderAdapter([
        {
          id: 'sms-hdfc-2',
          address: 'VM-HDFCBK',
          body: 'Rs.1200.00 debited from HDFC Bank A/c **5678 on 16-Jan-25. Avl Bal: Rs. 25,000.00',
          date: 1705315400000,
        },
      ])
    );

    await SmsSyncService.runInitialScan({ autoCreateClarityTransactions: true });

    const { insertAccount } = require('@/services/database/account-dao');
    expect(insertAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        institution: 'HDFC Bank',
        lastFour: '5678',
      })
    );
  });

  it('does not mutate account balances when no explicit SMS balance is available', async () => {
    const { updateAccountBalance } = require('@/services/database/account-dao');

    await SmsSyncService.consolidateDuplicateBankAccounts();

    expect(updateAccountBalance).not.toHaveBeenCalled();
  });

  it('reconciles balances using parsed transaction_date rather than a missing timestamp column', async () => {
    const { getDatabase } = require('@/services/database');
    await SmsSyncService.consolidateDuplicateBankAccounts();

    const queries = getDatabase().getFirstAsync.mock.calls.map(([query]: [string]) => query);
    expect(queries.some((query: string) => query.includes('ORDER BY p.transaction_date DESC'))).toBe(true);
    expect(queries.some((query: string) => query.includes('p.timestamp'))).toBe(false);
  });

  it('retries a previously saved parsed transaction that has no linked main transaction', async () => {
    const pending: ParsedTransaction = {
      id: 'pending-1',
      smsId: 'old-sms',
      amount: 500,
      type: 'DEBIT',
      merchant: 'Swiggy',
      category: 'Food & Dining',
      bank: 'HDFC Bank',
      accountMask: '1234',
      timestamp: 1705000000000,
      confidence: 1,
      isDuplicate: false,
      createdAt: new Date().toISOString(),
    };
    (SmsDao.getUnlinkedParsedTransactions as jest.Mock).mockResolvedValue([pending]);

    await SmsSyncService.runInitialScan({ autoCreateClarityTransactions: true });

    expect(SmsDao.linkClarityTransaction).toHaveBeenCalledWith('pending-1', 'clarity-tx-1');
  });

  it('does not reprocess stored SMS messages during another initial scan', async () => {
    (SmsDao.getExistingSmsIds as jest.Mock).mockResolvedValue(new Set(['sms-sync-1']));

    const result = await SmsSyncService.runInitialScan({
      autoCreateClarityTransactions: false,
    });

    expect(result.scannedCount).toBe(2);
    expect(result.parsedCount).toBe(0);
    expect(SmsDao.saveParsedTransactionsBatch).toHaveBeenCalledWith([]);
  });
});

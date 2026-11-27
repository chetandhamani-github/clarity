import { SmsDao } from '@/modules/sms/storage/smsDao';
import type { ParsedTransaction } from '@/modules/sms/types';
import { SmsSyncService } from './smsSyncService';

jest.mock('@/modules/sms/storage/smsDao', () => ({
  SmsDao: {
    saveSmsBatch: jest.fn().mockResolvedValue(undefined),
    saveParsedTransactionsBatch: jest.fn().mockResolvedValue(undefined),
    saveReviewQueueBatch: jest.fn().mockResolvedValue(undefined),
    findPotentialDuplicates: jest.fn().mockResolvedValue([]),
    getLatestSmsTimestamp: jest.fn().mockResolvedValue(null),
    getExistingSmsIds: jest.fn().mockResolvedValue(new Set()),
    getUnlinkedParsedTransactions: jest.fn().mockResolvedValue([]),
    getParsedTransactionById: jest.fn().mockResolvedValue(null),
    enrichParsedTransaction: jest.fn().mockResolvedValue(undefined),
    reassignParsedTransactionLink: jest.fn().mockResolvedValue(undefined),
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
  findManualMatch: jest.fn().mockResolvedValue(null),
  mergeManualWithSmsTransaction: jest.fn().mockResolvedValue(undefined),
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

describe('SmsSyncService (notification delegation)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { getAllAccounts } = require('@/services/database/account-dao');
    getAllAccounts.mockResolvedValue(initialAccounts);
  });

  it('creates a separate account when the same bank reports a different suffix', async () => {
    const { insertAccount } = require('@/services/database/account-dao');
    const tx: ParsedTransaction = {
      id: 'parsed-hdfc-2',
      smsId: 'notif-hdfc-2',
      amount: 1200,
      type: 'DEBIT',
      merchant: 'Swiggy',
      category: 'Food & Dining',
      bank: 'HDFC Bank',
      accountMask: '5678',
      availableBalance: 25000,
      timestamp: 1705315400000,
      confidence: 0.95,
      isDuplicate: false,
      createdAt: new Date().toISOString(),
    };

    await SmsSyncService.importParsedTransactions([tx]);

    expect(insertAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        institution: 'HDFC Bank',
        lastFour: '5678',
      })
    );
  });

  it('merges parsed notification with an existing manual transaction instead of creating duplicate', async () => {
    const {
      findManualMatch,
      mergeManualWithSmsTransaction,
      insertTransaction,
    } = require('@/services/database/transaction-dao');
    findManualMatch.mockResolvedValueOnce({
      id: 'manual-tx-450',
      accountId: 'acc-1',
      amount: 350,
      type: 'expense',
      merchant: 'Swiggy Food',
      category: 'Dining',
      date: '2025-01-15T09:00:00.000Z',
      source: 'MANUAL',
      status: 'PENDING_MATCH',
    });

    const tx: ParsedTransaction = {
      id: 'parsed-merge-1',
      smsId: 'notif-merge-1',
      amount: 350,
      type: 'DEBIT',
      merchant: 'Swiggy',
      category: 'Food & Dining',
      bank: 'HDFC Bank',
      accountMask: '1234',
      timestamp: 1705315200000,
      confidence: 0.95,
      isDuplicate: false,
      createdAt: new Date().toISOString(),
    };

    await SmsSyncService.importParsedTransactions([tx]);

    expect(findManualMatch).toHaveBeenCalledWith(
      'acc-1',
      350,
      'expense',
      1705315200000,
      24
    );
    expect(mergeManualWithSmsTransaction).toHaveBeenCalledWith(
      'manual-tx-450',
      expect.objectContaining({ smsId: 'notif-merge-1' })
    );
    expect(SmsDao.linkClarityTransaction).toHaveBeenCalledWith('parsed-merge-1', 'manual-tx-450');
    expect(insertTransaction).not.toHaveBeenCalled();
  });

  it('syncs UPI transactions with missing mask to fallback account without skipping', async () => {
    const { insertTransaction } = require('@/services/database/transaction-dao');
    const upiPending: ParsedTransaction = {
      id: 'pending-upi-1',
      smsId: 'notif-upi',
      amount: 250,
      type: 'DEBIT',
      merchant: 'Chai Point',
      category: 'Food & Dining',
      bank: 'Bank / UPI',
      accountMask: 'XXXX',
      timestamp: 1705315200000,
      confidence: 0.9,
      isDuplicate: false,
      createdAt: new Date().toISOString(),
    };

    await SmsSyncService.importParsedTransactions([upiPending]);

    expect(insertTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-1',
        amount: 250,
        type: 'expense',
        merchant: 'Chai Point',
        source: 'SMS',
      }),
      expect.any(Object)
    );
    expect(SmsDao.linkClarityTransaction).toHaveBeenCalledWith('pending-upi-1', 'clarity-tx-1');
  });

  it('enriches an earlier sparse UPI alert when a richer bank notification arrives', async () => {
    const { getDatabase } = require('@/services/database');
    const { getAllAccounts } = require('@/services/database/account-dao');
    getAllAccounts.mockResolvedValue([
      {
        id: 'acc-primary',
        name: 'Primary Bank Account',
        type: 'savings' as const,
        balance: 5000,
        institution: 'Bank / UPI',
        lastFour: '',
      },
      ...initialAccounts,
    ]);
    getDatabase().getFirstAsync.mockResolvedValueOnce({
      account_id: 'acc-primary',
      amount: 450,
      type: 'expense',
    });
    const originalParsed: ParsedTransaction = {
      id: 'parsed-gpay-1',
      smsId: 'notif-gpay-1',
      amount: 450,
      type: 'DEBIT',
      merchant: 'Chai Point',
      category: 'Food & Dining',
      bank: 'Bank / UPI',
      accountMask: 'XXXX',
      timestamp: 1705315200000,
      confidence: 0.9,
      isDuplicate: false,
      transactionId: 'clarity-tx-sparse',
      createdAt: new Date().toISOString(),
    };
    (SmsDao.getParsedTransactionById as jest.Mock).mockResolvedValueOnce(originalParsed);

    const enriched = await SmsSyncService.enrichDuplicateTransaction({
      ...originalParsed,
      id: 'parsed-hdfc-dup',
      smsId: 'notif-hdfc-1',
      bank: 'HDFC Bank',
      accountMask: '1234',
      referenceNumber: '412345678901',
      availableBalance: 9550,
      isDuplicate: true,
      duplicateOf: 'parsed-gpay-1',
    });

    expect(enriched).toBe(true);
    expect(SmsDao.enrichParsedTransaction).toHaveBeenCalledWith('parsed-gpay-1', {
      bank: 'HDFC Bank',
      accountMask: '1234',
      referenceNumber: '412345678901',
      availableBalance: 9550,
    });
    expect(getDatabase().runAsync).toHaveBeenCalledWith(
      'UPDATE transactions SET account_id = ? WHERE id = ?',
      ['acc-1', 'clarity-tx-sparse']
    );
  });

  it('pairs matching cross-account debit and credit within 15 minutes as a transfer', async () => {
    const { getDatabase } = require('@/services/database');
    const { getAllAccounts } = require('@/services/database/account-dao');
    getAllAccounts.mockResolvedValue([
      ...initialAccounts,
      {
        id: 'acc-2',
        name: 'SBI Savings',
        type: 'savings',
        balance: 5000,
        institution: 'State Bank of India',
        lastFour: '5678',
      },
    ]);

    getDatabase().getFirstAsync.mockResolvedValueOnce({
      id: 'tx-debit-hdfc',
      account_id: 'acc-1',
      note: 'Auto-tracked (HDFC Bank)',
      merchant: 'SBI Transfer',
    });

    const creditFromSbi: ParsedTransaction = {
      id: 'parsed-sbi-credit',
      smsId: 'notif-sbi-1',
      amount: 5000,
      type: 'CREDIT',
      merchant: 'HDFC Transfer',
      category: 'Income',
      bank: 'State Bank of India',
      accountMask: '5678',
      timestamp: 1705315200000,
      confidence: 0.95,
      isDuplicate: false,
      createdAt: new Date().toISOString(),
    };

    await SmsSyncService.importParsedTransactions([creditFromSbi]);

    expect(getDatabase().runAsync).toHaveBeenCalledWith(
      expect.stringContaining("SET type = 'transfer'"),
      ['acc-2', 'tx-debit-hdfc']
    );
    expect(SmsDao.reassignParsedTransactionLink).toHaveBeenCalledWith(
      'clarity-tx-1',
      'tx-debit-hdfc'
    );
    expect(getDatabase().runAsync).toHaveBeenCalledWith(
      'DELETE FROM transactions WHERE id = ?',
      ['clarity-tx-1']
    );
  });
});

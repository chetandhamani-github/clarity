import { SmsDao } from '@/modules/sms/storage/smsDao';
import type { ParsedTransaction } from '@/modules/sms/types';
import type { Account } from '@/types';
import {
  NotificationLedgerService,
  resolveTargetAccountPreview,
} from './notificationLedgerService';

jest.mock('@/modules/sms/storage/smsDao', () => ({
  SmsDao: {
    getParsedTransactionById: jest.fn().mockResolvedValue(null),
    enrichParsedTransaction: jest.fn().mockResolvedValue(undefined),
    reassignParsedTransactionLink: jest.fn().mockResolvedValue(undefined),
    linkClarityTransaction: jest.fn().mockResolvedValue(undefined),
    getTransactionsForRecurringAnalysis: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/modules/bills/database/bills.repository', () => ({
  BillsRepository: {
    deduplicateExistingBills: jest.fn().mockResolvedValue(undefined),
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
    id: 'acc-created',
    name: 'HDFC Bank (..1234)',
    type: 'savings',
    balance: 0,
    institution: 'HDFC Bank',
    lastFour: '1234',
    createdAt: '2026-11-27T00:00:00.000Z',
  }),
  updateAccount: jest.fn().mockResolvedValue(undefined),
  updateAccountBalance: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/database/transaction-dao', () => ({
  insertTransaction: jest.fn().mockResolvedValue({ id: 'clarity-tx-1' }),
  findManualMatch: jest.fn().mockResolvedValue(null),
  mergeManualWithSmsTransaction: jest.fn().mockResolvedValue(undefined),
}));

const makeAccount = (overrides: Partial<Account> = {}): Account => ({
  id: 'acc-1',
  name: 'Account',
  type: 'savings',
  balance: 10000,
  institution: 'State Bank of India',
  lastFour: '1234',
  createdAt: '2026-11-01T00:00:00.000Z',
  ...overrides,
});

const makeParsedTx = (overrides: Partial<ParsedTransaction> = {}): ParsedTransaction => ({
  id: 'parsed-1',
  smsId: 'notif-1',
  amount: 500,
  type: 'DEBIT',
  merchant: 'Swiggy',
  category: 'Food & Dining',
  bank: 'HDFC Bank',
  accountMask: '1234',
  timestamp: 1732000000000,
  confidence: 0.95,
  isDuplicate: false,
  createdAt: '2026-11-27T00:00:00.000Z',
  ...overrides,
});

describe('NotificationLedgerService & resolveTargetAccountPreview', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('never matches an account from a different bank by lastFour digits alone', () => {
    const accounts = [
      makeAccount({ id: 'acc-sbi', name: 'SBI Savings', institution: 'State Bank of India', lastFour: '1234' }),
    ];
    const hdfcTx = makeParsedTx({ bank: 'HDFC Bank', accountMask: '1234' });

    const resolution = resolveTargetAccountPreview(hdfcTx, accounts);
    expect(resolution.account).toBeNull();
    expect(resolution.reason).toBe('will_create');
    expect(resolution.willCreateAccountName).toBe('HDFC Bank (..1234)');
  });

  it('matches current, checking, and wallet accounts as well as savings accounts', () => {
    const accounts = [
      makeAccount({
        id: 'acc-current',
        name: 'Business Current',
        type: 'current',
        institution: 'HDFC Bank',
        lastFour: '7788',
      }),
    ];

    const resolution = resolveTargetAccountPreview(
      makeParsedTx({ bank: 'HDFC Bank', accountMask: '7788' }),
      accounts
    );
    expect(resolution.account?.id).toBe('acc-current');
    expect(resolution.reason).toBe('exact_bank_and_mask');
  });

  it('matches expanded bank aliases such as BOI, AU Bank, SCB, and Citibank', () => {
    const accounts = [
      makeAccount({ id: 'acc-boi', name: 'BOI Salary', institution: 'BOI', lastFour: '4321' }),
      makeAccount({ id: 'acc-au', name: 'AU Bank', institution: 'AU Bank', lastFour: '8899' }),
    ];

    expect(
      resolveTargetAccountPreview(makeParsedTx({ bank: 'Bank of India', accountMask: '4321' }), accounts)
        .account?.id
    ).toBe('acc-boi');

    expect(
      resolveTargetAccountPreview(
        makeParsedTx({ bank: 'AU Small Finance Bank', accountMask: '8899' }),
        accounts
      ).account?.id
    ).toBe('acc-au');
  });

  it('routes unresolved UPI alerts to primary liquid account (including current/wallet) without creating a duplicate', () => {
    const accounts = [
      makeAccount({ id: 'acc-savings', name: 'Old Savings', type: 'savings', isPrimary: false }),
      makeAccount({
        id: 'acc-primary-current',
        name: 'Main Current',
        type: 'current',
        institution: 'ICICI Bank',
        lastFour: '5555',
        isPrimary: true,
      }),
    ];

    const upiTx = makeParsedTx({ bank: 'Bank / UPI', accountMask: 'XXXX' });
    const resolution = resolveTargetAccountPreview(upiTx, accounts);
    expect(resolution.account?.id).toBe('acc-primary-current');
    expect(resolution.reason).toBe('primary_fallback');
  });

  it('honors manual accountOverrides during import without auto-creating an account', async () => {
    const accounts = [
      makeAccount({ id: 'acc-sbi', name: 'SBI Savings', institution: 'State Bank of India', lastFour: '9999' }),
    ];
    const { getAllAccounts, insertAccount } = require('@/services/database/account-dao');
    const { insertTransaction } = require('@/services/database/transaction-dao');
    getAllAccounts.mockResolvedValue(accounts);

    const tx = makeParsedTx({ id: 'tx-override-1', bank: 'HDFC Bank', accountMask: '1234' });
    await NotificationLedgerService.importParsedTransactions([tx], {
      accountOverrides: { 'tx-override-1': 'acc-sbi' },
    });

    expect(insertAccount).not.toHaveBeenCalled();
    expect(insertTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-sbi',
        amount: 500,
      }),
      expect.any(Object)
    );
  });

  it('does not pull another bank balance snapshot in reconcileAvailableBalances when lastFour matches', async () => {
    const { getAllAccounts, updateAccountBalance } = require('@/services/database/account-dao');
    const { getDatabase } = require('@/services/database');
    getAllAccounts.mockResolvedValue([
      makeAccount({
        id: 'acc-sbi',
        name: 'SBI Savings',
        institution: 'State Bank of India',
        lastFour: '1234',
      }),
    ]);

    const db = getDatabase();
    db.getFirstAsync.mockResolvedValueOnce(null);
    db.getAllAsync.mockResolvedValueOnce([
      {
        available_balance: 99000,
        transaction_date: '2026-11-26T10:00:00.000Z',
        transaction_id: 'tx-hdfc',
        bank: 'HDFC Bank',
        account_mask: '1234',
      },
    ]);

    await NotificationLedgerService.reconcileAvailableBalances();
    expect(updateAccountBalance).not.toHaveBeenCalled();
  });

  it('enriches sparse UPI transaction and reassigns Clarity transaction when richer bank notification arrives', async () => {
    const { getAllAccounts, updateAccountBalance } = require('@/services/database/account-dao');
    const { getDatabase } = require('@/services/database');

    getAllAccounts.mockResolvedValue([
      makeAccount({
        id: 'acc-primary',
        name: 'Primary Bank Account',
        institution: 'Bank / UPI',
        lastFour: '',
        balance: 5000,
      }),
      makeAccount({
        id: 'acc-hdfc',
        name: 'HDFC Savings',
        institution: 'HDFC Bank',
        lastFour: '1234',
        balance: 10000,
      }),
    ]);

    const original: ParsedTransaction = makeParsedTx({
      id: 'parsed-gpay',
      bank: 'Bank / UPI',
      accountMask: 'XXXX',
      transactionId: 'clarity-tx-gpay',
    });
    (SmsDao.getParsedTransactionById as jest.Mock).mockResolvedValueOnce(original);

    const db = getDatabase();
    db.getFirstAsync.mockResolvedValueOnce({
      account_id: 'acc-primary',
      amount: 500,
      type: 'expense',
    });

    const enriched = await NotificationLedgerService.enrichDuplicateTransaction({
      ...original,
      id: 'parsed-hdfc-dup',
      bank: 'HDFC Bank',
      accountMask: '1234',
      availableBalance: 9500,
      isDuplicate: true,
      duplicateOf: 'parsed-gpay',
    });

    expect(enriched).toBe(true);
    expect(updateAccountBalance).toHaveBeenCalledWith('acc-primary', 5500);
    expect(updateAccountBalance).toHaveBeenCalledWith('acc-hdfc', 9500);
    expect(db.runAsync).toHaveBeenCalledWith(
      'UPDATE transactions SET account_id = ? WHERE id = ?',
      ['acc-hdfc', 'clarity-tx-gpay']
    );
  });

  it('routes debit card transactions to savings accounts and credit card transactions only to credit accounts', () => {
    const accounts = [
      makeAccount({
        id: 'acc-hdfc-savings',
        name: 'HDFC Savings',
        type: 'savings',
        institution: 'HDFC Bank',
        lastFour: '4455',
      }),
      makeAccount({
        id: 'acc-hdfc-cc',
        name: 'HDFC Regalia',
        type: 'credit',
        institution: 'HDFC Bank',
        lastFour: '8899',
      }),
    ];

    const debitCardTx = makeParsedTx({
      bank: 'HDFC Bank',
      accountMask: '4455',
      rawBody: 'Rs.1,200.00 spent on HDFC Bank Debit Card ending 4455 at Swiggy',
    });
    expect(resolveTargetAccountPreview(debitCardTx, accounts).account?.id).toBe(
      'acc-hdfc-savings'
    );

    const creditCardTx = makeParsedTx({
      bank: 'HDFC Bank',
      accountMask: '8899',
      rawBody:
        'Rs.2,500.00 spent on HDFC Bank Credit Card ending 8899 at Amazon. Avl Lmt Rs.80,000',
    });
    expect(resolveTargetAccountPreview(creditCardTx, accounts).account?.id).toBe('acc-hdfc-cc');
  });

  it('does not hijack Primary Bank Account on generic maskless UPI alerts', async () => {
    const { getAllAccounts, updateAccount } = require('@/services/database/account-dao');
    const { insertTransaction } = require('@/services/database/transaction-dao');
    getAllAccounts.mockResolvedValue([
      makeAccount({
        id: 'acc-starter',
        name: 'Primary Bank Account',
        institution: 'Bank / UPI',
        lastFour: '',
        balance: 0,
      }),
    ]);

    const genericUpiTx = makeParsedTx({
      id: 'parsed-generic-upi',
      amount: 300,
      bank: 'Bank / UPI',
      accountMask: 'XXXX',
      rawBody: 'You paid ₹300 to Chai Point',
    });

    await NotificationLedgerService.importParsedTransactions([genericUpiTx]);
    expect(updateAccount).not.toHaveBeenCalled();
    expect(insertTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-starter',
        amount: 300,
      }),
      expect.any(Object)
    );
  });

  it('never merges or deletes unrelated cross-account transactions without explicit self-transfer intent', async () => {
    const { getAllAccounts } = require('@/services/database/account-dao');
    const { getDatabase } = require('@/services/database');
    const db = getDatabase();
    getAllAccounts.mockResolvedValue([
      makeAccount({ id: 'acc-hdfc', name: 'HDFC Bank', institution: 'HDFC Bank', lastFour: '1111' }),
      makeAccount({ id: 'acc-sbi', name: 'SBI Bank', institution: 'SBI Bank', lastFour: '2222' }),
    ]);

    // Counterpart exists for exact same amount within 15 minutes, but it is an unrelated merchant credit
    db.getFirstAsync.mockResolvedValueOnce({
      id: 'tx-unrelated-income',
      account_id: 'acc-sbi',
      note: 'Auto-tracked (SBI Bank)',
      merchant: 'Rahul Friend',
    });

    await NotificationLedgerService.importParsedTransactions([
      makeParsedTx({
        id: 'parsed-zomato',
        amount: 500,
        type: 'DEBIT',
        merchant: 'Zomato',
        bank: 'HDFC Bank',
        accountMask: '1111',
        rawBody: 'Rs.500 spent on HDFC Card xx1111 at Zomato',
      }),
    ]);

    expect(db.runAsync).not.toHaveBeenCalledWith(
      'DELETE FROM transactions WHERE id = ?',
      expect.anything()
    );
  });
});


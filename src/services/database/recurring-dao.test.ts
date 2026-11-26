import {
  calculateNextDate,
  createRecurringTransaction,
  deleteRecurringTransaction,
  toggleRecurringTransactionActive,
  processDueRecurringTransactions,
} from './recurring-dao';
import { getDatabase } from './index';
import { getAccountById } from './account-dao';
import { insertTransaction } from './transaction-dao';
import { insertNotification } from './notification-dao';

jest.mock('./index', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('./account-dao', () => ({
  getAccountById: jest.fn().mockResolvedValue(null),
}));

jest.mock('./transaction-dao', () => ({
  insertTransaction: jest.fn(),
}));

jest.mock('./notification-dao', () => ({
  insertNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/notifications/alert-engine', () => ({
  evaluateTransactionBudgetAlerts: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/cloud/google-drive-service', () => ({
  queueAutoBackup: jest.fn(),
}));

describe('recurring-dao', () => {
  describe('calculateNextDate', () => {
    it('advances daily frequency correctly', () => {
      expect(calculateNextDate('2026-09-03', 'daily')).toBe('2026-09-04');
      expect(calculateNextDate('2026-09-30', 'daily')).toBe('2026-10-01');
      expect(calculateNextDate('2026-12-31', 'daily')).toBe('2027-01-01');
    });

    it('advances weekly frequency correctly', () => {
      expect(calculateNextDate('2026-09-03', 'weekly')).toBe('2026-09-10');
      expect(calculateNextDate('2026-09-28', 'weekly')).toBe('2026-10-05');
    });

    it('advances monthly frequency correctly for regular dates', () => {
      expect(calculateNextDate('2026-09-03', 'monthly')).toBe('2026-10-03');
      expect(calculateNextDate('2026-12-15', 'monthly')).toBe('2027-01-15');
    });

    it('clamps monthly frequency correctly for month-end dates (28/29/30/31 days)', () => {
      // Jan 31 -> Feb 28 in non-leap year (2026)
      expect(calculateNextDate('2026-01-31', 'monthly')).toBe('2026-02-28');

      // Jan 31 -> Feb 29 in leap year (2028)
      expect(calculateNextDate('2028-01-31', 'monthly')).toBe('2028-02-29');

      // March 31 -> April 30 (April has 30 days)
      expect(calculateNextDate('2026-03-31', 'monthly')).toBe('2026-04-30');

      // May 31 -> June 30 (June has 30 days)
      expect(calculateNextDate('2026-05-31', 'monthly')).toBe('2026-06-30');

      // Preserves original 31st targetDay across shorter months (Feb 28 -> Mar 31)
      expect(calculateNextDate('2026-02-28', 'monthly', 31)).toBe('2026-03-31');
    });

    it('advances yearly frequency correctly and clamps leap year', () => {
      expect(calculateNextDate('2026-09-03', 'yearly')).toBe('2027-09-03');
      // Leap day Feb 29 -> Feb 28 in non-leap year
      expect(calculateNextDate('2028-02-29', 'yearly')).toBe('2029-02-28');
    });
  });

  describe('CRUD operations', () => {
    let mockDb: any;

    beforeEach(() => {
      jest.clearAllMocks();
      mockDb = {
        runAsync: jest.fn().mockResolvedValue({}),
        getAllAsync: jest.fn().mockResolvedValue([]),
        getFirstAsync: jest.fn().mockResolvedValue(null),
      };
      (getDatabase as jest.Mock).mockReturnValue(mockDb);
    });

    it('creates recurring transaction with splits_json support', async () => {
      const rec = await createRecurringTransaction({
        accountId: 'acc-1',
        amount: 500,
        type: 'expense',
        merchant: 'Netflix',
        category: 'Entertainment',
        frequency: 'monthly',
        nextProcessDate: '2026-10-03',
        lastProcessedDate: '2026-09-03',
        splits: [{ category: 'Entertainment', amount: 500 }],
      });

      expect(rec.id).toBeDefined();
      expect(rec.isActive).toBe(true);
      expect(rec.splits_json).toBe(JSON.stringify([{ category: 'Entertainment', amount: 500 }]));
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO recurring_transactions'),
        expect.arrayContaining(['acc-1', 500, 'expense', 'Netflix', 'Entertainment', 'monthly', '2026-10-03', '2026-09-03', 1])
      );
    });

    it('deletes recurring transaction by id', async () => {
      await deleteRecurringTransaction('rec-123');
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'DELETE FROM recurring_transactions WHERE id = ?',
        ['rec-123']
      );
    });

    it('toggles recurring transaction active state', async () => {
      await toggleRecurringTransactionActive('rec-123', false);
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'UPDATE recurring_transactions SET is_active = ? WHERE id = ?',
        [0, 'rec-123']
      );
    });
  });

  describe('processDueRecurringTransactions', () => {
    let mockDb: any;

    beforeEach(() => {
      jest.clearAllMocks();
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-09-01T12:00:00Z'));
      mockDb = {
        runAsync: jest.fn().mockResolvedValue({}),
        getAllAsync: jest.fn(),
        getFirstAsync: jest.fn().mockResolvedValue(null),
      };
      (getDatabase as jest.Mock).mockReturnValue(mockDb);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('processes due transactions and advances nextProcessDate', async () => {
      const mockDue = [
        {
          id: 'rec-1',
          account_id: 'acc-1',
          to_account_id: null,
          amount: 200,
          type: 'expense',
          merchant: 'Gym',
          category: 'Health',
          frequency: 'monthly',
          next_process_date: '2026-09-01',
          last_processed_date: '2026-08-01',
          is_active: 1,
        },
      ];

      mockDb.getAllAsync.mockResolvedValueOnce(mockDue);
      (insertTransaction as jest.Mock).mockResolvedValue({
        id: 'tx-new',
        amount: 200,
        type: 'expense',
        category: 'Health',
        date: '2026-09-01',
      });

      const processedCount = await processDueRecurringTransactions();

      expect(processedCount).toBeGreaterThanOrEqual(1);
      expect(insertTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'acc-1',
          amount: 200,
          type: 'expense',
          merchant: 'Gym',
          category: 'Health',
          isRecurring: true,
        })
      );
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE recurring_transactions'),
        expect.arrayContaining(['2026-09-01', '2026-10-01', 'rec-1'])
      );
    });

    it('matches an already recorded transaction within tolerance and avoids duplicate insertion', async () => {
      const mockDue = [
        {
          id: 'rec-netflix',
          account_id: 'acc-1',
          to_account_id: null,
          amount: 649,
          type: 'expense',
          merchant: 'Netflix',
          category: 'Subscriptions',
          frequency: 'monthly',
          next_process_date: '2026-09-01',
          last_processed_date: '2026-08-01',
          is_active: 1,
        },
      ];

      mockDb.getAllAsync.mockResolvedValueOnce(mockDue);
      mockDb.getFirstAsync.mockResolvedValueOnce({
        id: 'tx-existing-sms',
        is_recurring: 0,
      });

      const processedCount = await processDueRecurringTransactions();

      expect(processedCount).toBe(1);
      expect(insertTransaction).not.toHaveBeenCalled();
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'UPDATE transactions SET is_recurring = 1 WHERE id = ?',
        ['tx-existing-sms']
      );
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE recurring_transactions'),
        expect.arrayContaining(['2026-09-01', '2026-10-01', 'rec-netflix'])
      );
    });

    it('scopes recurring transfer deduplication to to_account_id and inserts recurring transfers cleanly', async () => {
      const mockDue = [
        {
          id: 'rec-loan',
          account_id: 'bank-1',
          to_account_id: 'loan-1',
          amount: 2000,
          type: 'transfer',
          merchant: 'Home Loan EMI',
          category: 'Transfer',
          frequency: 'monthly',
          next_process_date: '2026-09-01',
          last_processed_date: '2026-08-01',
          is_active: 1,
        },
      ];

      mockDb.getAllAsync.mockResolvedValueOnce(mockDue);
      (getAccountById as jest.Mock).mockResolvedValueOnce({
        id: 'loan-1',
        name: 'Home Loan',
        type: 'loan',
        balance: -20000,
      });
      (insertTransaction as jest.Mock).mockResolvedValueOnce({
        id: 'tx-loan-1',
        amount: 2000,
        type: 'transfer',
        accountId: 'bank-1',
        toAccountId: 'loan-1',
        category: 'Transfer',
        date: '2026-09-01',
      });

      const processed = await processDueRecurringTransactions();

      expect(processed).toBe(1);
      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining('AND to_account_id = ?'),
        expect.arrayContaining(['bank-1', 2000, 'transfer', 'loan-1'])
      );
      expect(insertTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'bank-1',
          toAccountId: 'loan-1',
          amount: 2000,
          type: 'transfer',
        })
      );
    });

    it('caps final recurring loan payment to remaining debt and auto-pauses settled schedule', async () => {
      const mockDue = [
        {
          id: 'rec-loan-final',
          account_id: 'bank-1',
          to_account_id: 'loan-1',
          amount: 2000,
          type: 'transfer',
          merchant: 'Car Loan EMI',
          category: 'Transfer',
          frequency: 'monthly',
          next_process_date: '2026-09-01',
          last_processed_date: '2026-08-01',
          is_active: 1,
        },
      ];

      mockDb.getAllAsync.mockResolvedValueOnce(mockDue);
      (getAccountById as jest.Mock).mockResolvedValueOnce({
        id: 'loan-1',
        name: 'Car Loan',
        type: 'loan',
        balance: -1500,
      });
      (insertTransaction as jest.Mock).mockResolvedValueOnce({
        id: 'tx-final',
        amount: 1500,
        type: 'transfer',
        accountId: 'bank-1',
        toAccountId: 'loan-1',
        category: 'Transfer',
        date: '2026-09-01',
      });

      const processed = await processDueRecurringTransactions();

      expect(processed).toBe(1);
      expect(insertTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'bank-1',
          toAccountId: 'loan-1',
          amount: 1500,
          type: 'transfer',
        })
      );
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('is_active = 0'),
        ['2026-09-01', '2026-10-01', 'rec-loan-final']
      );
      expect(insertNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Loan / Debt Paid Off!',
        })
      );
    });

    it('auto-pauses recurring loan payment without debiting when debt is already settled', async () => {
      const mockDue = [
        {
          id: 'rec-loan-settled',
          account_id: 'bank-1',
          to_account_id: 'loan-1',
          amount: 2000,
          type: 'transfer',
          merchant: 'Car Loan EMI',
          category: 'Transfer',
          frequency: 'monthly',
          next_process_date: '2026-09-01',
          last_processed_date: '2026-08-01',
          is_active: 1,
        },
      ];

      mockDb.getAllAsync.mockResolvedValueOnce(mockDue);
      (getAccountById as jest.Mock).mockResolvedValueOnce({
        id: 'loan-1',
        name: 'Car Loan',
        type: 'loan',
        balance: 0,
      });

      const processed = await processDueRecurringTransactions();

      expect(processed).toBe(0);
      expect(insertTransaction).not.toHaveBeenCalled();
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'UPDATE recurring_transactions SET is_active = 0 WHERE id = ?',
        ['rec-loan-settled']
      );
    });
  });
});

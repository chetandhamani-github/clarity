import {
  getBackupSummary,
  isMeaningfulDatabaseSnapshot,
  generateDatabaseSnapshot,
  restoreDatabaseFromSnapshot,
  type ClarityBackupPayload,
} from './backup-restore-service';
import { getDatabase } from './index';
import { mmkv } from '@/lib/storage';

jest.mock('./index', () => ({
  getDatabase: jest.fn(),
}));

describe('backup-restore-service', () => {
  it('extracts correct metadata summary from backup payload', () => {
    const mockPayload: ClarityBackupPayload = {
      version: 1,
      appName: 'Clarity',
      exportedAt: '2026-09-01T12:00:00.000Z',
      data: {
        accounts: [{ id: '1', name: 'Savings' }, { id: '2', name: 'Wallet' }],
        transactions: [
          { id: 't1', amount: 50 },
          { id: 't2', amount: 100 },
          { id: 't3', amount: 20 },
        ],
        goals: [{ id: 'g1', name: 'Emergency Fund' }],
        goal_contributions: [],
        budget_plans: [],
        budget_categories: [],
        recurring_transactions: [],
        notifications: [],
      },
    };

    const summary = getBackupSummary(mockPayload);
    expect(summary.version).toBe(1);
    expect(summary.exportedAt).toBe('2026-09-01T12:00:00.000Z');
    expect(summary.accountCount).toBe(2);
    expect(summary.transactionCount).toBe(3);
    expect(summary.goalCount).toBe(1);
  });

  it('computes deterministic checksum for data payload', () => {
    const { computeChecksum } = require('./backup-restore-service');
    const hash1 = computeChecksum('{"test":123}');
    const hash2 = computeChecksum('{"test":123}');
    const hash3 = computeChecksum('{"test":124}');

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1.startsWith('sha256_')).toBe(true);
  });

  it('canonicalizes nested objects deterministically regardless of key insertion order', () => {
    const { canonicalizeData, computeChecksum } = require('./backup-restore-service');
    const objA = { b: 2, a: 1, nested: { y: 20, x: 10 } };
    const objB = { nested: { x: 10, y: 20 }, a: 1, b: 2 };

    const canonA = canonicalizeData(objA);
    const canonB = canonicalizeData(objB);

    expect(canonA).toBe(canonB);
    expect(computeChecksum(canonA)).toBe(computeChecksum(canonB));
  });

  describe('isMeaningfulDatabaseSnapshot', () => {
    it('returns false for newly seeded / cleared database with only default 0-balance accounts', () => {
      const seededEmptyPayload: ClarityBackupPayload = {
        version: 1,
        appName: 'Clarity',
        exportedAt: '2026-09-01T12:00:00.000Z',
        data: {
          accounts: [
            { id: '1', name: 'Primary Bank Account', balance: 0 },
            { id: '2', name: 'Borrowed / Loan', balance: 0 },
            { id: '3', name: 'Lent / Money Given', balance: 0 },
          ],
          transactions: [],
          goals: [],
          goal_contributions: [],
          budget_plans: [{ id: 'p1', monthly_income: 0 }],
          budget_categories: [{ id: 'c1', name: 'Groceries' }],
          recurring_transactions: [],
          notifications: [{ id: 'n1', title: 'Welcome to Clarity' }],
        },
      };

      expect(isMeaningfulDatabaseSnapshot(seededEmptyPayload)).toBe(false);
    });

    it('returns true when transactions exist', () => {
      const payloadWithTx: ClarityBackupPayload = {
        version: 1,
        appName: 'Clarity',
        exportedAt: '2026-09-01T12:00:00.000Z',
        data: {
          accounts: [{ id: '1', name: 'Primary Bank Account', balance: 0 }],
          transactions: [{ id: 't1', amount: 50 }],
          goals: [],
          goal_contributions: [],
          budget_plans: [],
          budget_categories: [],
          recurring_transactions: [],
          notifications: [],
        },
      };

      expect(isMeaningfulDatabaseSnapshot(payloadWithTx)).toBe(true);
    });

    it('returns true when bills or subscriptions exist', () => {
      const payloadWithBills: ClarityBackupPayload = {
        version: 1,
        appName: 'Clarity',
        exportedAt: '2026-09-01T12:00:00.000Z',
        data: {
          accounts: [],
          transactions: [],
          goals: [],
          goal_contributions: [],
          budget_plans: [],
          budget_categories: [],
          recurring_transactions: [],
          notifications: [],
          bills: [{ id: 'b1', title: 'Internet', amount: 999 }],
        },
      };

      expect(isMeaningfulDatabaseSnapshot(payloadWithBills)).toBe(true);
    });

    it('returns true when custom accounts or accounts with non-zero balance exist', () => {
      const payloadWithCustomAccount: ClarityBackupPayload = {
        version: 1,
        appName: 'Clarity',
        exportedAt: '2026-09-01T12:00:00.000Z',
        data: {
          accounts: [{ id: 'acc-1', name: 'HDFC Savings', balance: 25000 }],
          transactions: [],
          goals: [],
          goal_contributions: [],
          budget_plans: [],
          budget_categories: [],
          recurring_transactions: [],
          notifications: [],
        },
      };

      expect(isMeaningfulDatabaseSnapshot(payloadWithCustomAccount)).toBe(true);
    });

    it('returns true when parsed SMS transactions exist', () => {
      const payloadWithSms: ClarityBackupPayload = {
        version: 1,
        appName: 'Clarity',
        exportedAt: '2026-09-01T12:00:00.000Z',
        data: {
          accounts: [],
          transactions: [],
          goals: [],
          goal_contributions: [],
          budget_plans: [],
          budget_categories: [],
          recurring_transactions: [],
          notifications: [],
          parsed_transactions: [{ id: 'pt1', amount: 500, merchant: 'Swiggy' }],
        },
      };

      expect(isMeaningfulDatabaseSnapshot(payloadWithSms)).toBe(true);
    });
  });

  describe('generateDatabaseSnapshot & restoreDatabaseFromSnapshot', () => {
    let mockDb: any;

    beforeEach(() => {
      jest.spyOn(mmkv, 'set');
      mockDb = {
        execAsync: jest.fn().mockResolvedValue(undefined),
        runAsync: jest.fn().mockResolvedValue(undefined),
        getAllAsync: jest.fn().mockImplementation((sql: string) => {
          if (sql.includes('FROM accounts')) {
            return Promise.resolve([{ id: 'a1', name: 'Savings', balance: 5000 }]);
          }
          if (sql.includes('FROM sms_messages')) {
            return Promise.resolve([{ id: 'm1', address: 'HDFCBK', date: 1700000000000 }]);
          }
          return Promise.resolve([]);
        }),
      };
      (getDatabase as jest.Mock).mockReturnValue(mockDb);
    });

    it('generates a snapshot containing all tables, sms data, and preferences', async () => {
      const snapshot = await generateDatabaseSnapshot();
      expect(snapshot.data.accounts).toHaveLength(1);
      expect(snapshot.data.sms_messages).toHaveLength(1);
      expect(snapshot.data.preferences).toBeDefined();
      expect(snapshot.checksum).toBeDefined();
    });

    it('restores snapshot safely normalizing camelCase fields, constraints, and MMKV cursor', async () => {
      const payload: ClarityBackupPayload = {
        version: 1,
        appName: 'Clarity',
        exportedAt: '2026-09-01T12:00:00.000Z',
        data: {
          accounts: [{ id: 'a1', name: 'Primary Bank Account', balance: 1000 }],
          transactions: [
            { id: 't1', accountId: 'a1', amount: 250, type: 'expense', merchant: 'Zomato', category: 'Food', date: '2026-09-01' },
          ],
          goals: [],
          goal_contributions: [],
          budget_plans: [],
          budget_categories: [],
          recurring_transactions: [],
          notifications: [],
          bills: [
            {
              id: 'b1',
              title: 'WiFi',
              amount: 1000,
              dueDate: '2026-09-10',
              status: 'UPCOMING',
              frequency: 'MONTHLY',
              source: 'MANUAL',
            },
          ],
          subscriptions: [
            {
              id: 's1',
              name: 'Netflix',
              amount: 649,
              billingCycle: 'MONTHLY',
              nextRenewalDate: '2026-09-15',
              status: 'ACTIVE',
            },
          ],
          splitwise_debts: [
            {
              id: 'd1',
              personId: 'p1',
              amount: 400,
              type: 'OWE_ME',
              description: 'Dinner',
            },
          ],
          sms_messages: [
            { id: 'sm1', address: 'HDFCBK', body: 'Rs 500 debited', date: 1705300000000 },
          ],
          parsed_transactions: [
            {
              id: 'pt1',
              amount: 500,
              type: 'DEBIT',
              merchant: 'Swiggy',
              category: 'Food',
              bank: 'HDFC Bank',
              accountMask: '1234',
            },
          ],
          preferences: {
            theme: 'dark',
            currency: 'INR',
          },
        },
      };

      await restoreDatabaseFromSnapshot(payload);

      expect(mockDb.execAsync).toHaveBeenCalledWith('PRAGMA foreign_keys = OFF;');
      expect(mockDb.execAsync).toHaveBeenCalledWith('BEGIN TRANSACTION');
      expect(mockDb.execAsync).toHaveBeenCalledWith('COMMIT');
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO transactions'),
        expect.arrayContaining(['t1', 'a1', 250])
      );
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO bills'),
        expect.arrayContaining(['b1', 'WiFi', 1000, '2026-09-10', 'upcoming', 'monthly', 'manual'])
      );
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO subscriptions'),
        expect.arrayContaining(['s1', 'Netflix', 649, 'monthly', '2026-09-15', 'active'])
      );
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO splitwise_debts'),
        expect.arrayContaining(['d1', 'p1', 400])
      );
      expect(mmkv.set).toHaveBeenCalledWith('clarity_last_sms_sync_timestamp', '1705300000000');
    });
  });
});

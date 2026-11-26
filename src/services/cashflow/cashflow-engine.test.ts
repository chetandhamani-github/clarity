import { calculateSafeToSpend } from './cashflow-engine';
import { getDatabase } from '@/services/database';
import { getAllAccounts } from '@/services/database/account-dao';
import { getActiveRecurringTransactions } from '@/services/database/recurring-dao';

jest.mock('@/services/database', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('@/services/database/account-dao', () => ({
  getAllAccounts: jest.fn(),
}));

jest.mock('@/modules/bills/database/bills.repository', () => ({
  BillsRepository: {
    getUpcomingBills: jest.fn().mockResolvedValue([]),
    getAllSubscriptions: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/services/database/bill-dao', () => ({
  getUpcomingBills: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/services/database/recurring-dao', () => ({
  getActiveRecurringTransactions: jest.fn(),
}));

jest.mock('@/services/database/investment-dao', () => ({
  getAllInvestmentHoldings: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/services/database/budget-dao', () => ({
  getCurrentBudgetPlan: jest.fn().mockResolvedValue(null),
}));

describe('cashflow-engine recurring debt transfers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-05T10:00:00Z'));

    (getDatabase as jest.Mock).mockReturnValue({
      getFirstAsync: jest.fn().mockResolvedValue(null),
      getAllAsync: jest.fn().mockResolvedValue([]),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('commits liquid-to-liability recurring transfers up to remaining debt while ignoring internal liquid transfers', async () => {
    (getAllAccounts as jest.Mock).mockResolvedValue([
      {
        id: 'bank-1',
        name: 'Main Bank',
        type: 'savings',
        balance: 30000,
        institution: 'HDFC',
        lastFour: '1111',
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'bank-2',
        name: 'Reserve Savings',
        type: 'savings',
        balance: 10000,
        institution: 'SBI',
        lastFour: '2222',
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'loan-1',
        name: 'Car Loan',
        type: 'loan',
        balance: -1500,
        institution: 'ICICI',
        lastFour: '3333',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);

    (getActiveRecurringTransactions as jest.Mock).mockResolvedValue([
      {
        id: 'rec-debt',
        accountId: 'bank-1',
        toAccountId: 'loan-1',
        amount: 2000,
        type: 'transfer',
        merchant: 'Car Loan EMI',
        category: 'Transfer',
        frequency: 'monthly',
        nextProcessDate: '2026-09-10',
        isActive: true,
        accountName: 'Main Bank',
        toAccountName: 'Car Loan',
      },
      {
        id: 'rec-internal',
        accountId: 'bank-1',
        toAccountId: 'bank-2',
        amount: 5000,
        type: 'transfer',
        merchant: 'Savings Sweep',
        category: 'Transfer',
        frequency: 'monthly',
        nextProcessDate: '2026-09-10',
        isActive: true,
        accountName: 'Main Bank',
        toAccountName: 'Reserve Savings',
      },
    ]);

    const summary = await calculateSafeToSpend(1, 0);

    expect(summary.currentLiquidCash).toBe(40000);
    // Only the remaining 1,500 loan debt is committed; the 5,000 bank-to-bank sweep stays in liquid cash
    expect(summary.committedRecurringTotal).toBe(1500);
    expect(summary.safeToSpendTotal).toBe(38500);

    const sept10 = summary.projections.find((p) => p.date === '2026-09-10');
    expect(sept10?.events).toEqual([
      expect.objectContaining({
        name: 'Car Loan EMI',
        type: 'recurring',
        amount: 1500,
      }),
    ]);
  });
});


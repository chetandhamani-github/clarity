import { getActiveDebtList, simulateDebtStrategy } from './debt-payoff-service';
import { getAllAccounts } from '@/services/database/account-dao';
import { getActiveRecurringTransactions } from '@/services/database/recurring-dao';

jest.mock('@/services/database/account-dao', () => ({
  getAllAccounts: jest.fn(),
}));

jest.mock('@/services/database/recurring-dao', () => ({
  getActiveRecurringTransactions: jest.fn(),
}));

describe('debt-payoff-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('excludes positive credit-card balances as debt and detects recurring transfer EMIs', async () => {
    (getAllAccounts as jest.Mock).mockResolvedValue([
      {
        id: 'cc-overpaid',
        name: 'Overpaid Card',
        type: 'credit',
        balance: 500, // Positive credit surplus, not debt
        institution: 'HDFC',
        lastFour: '1111',
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'loan-1',
        name: 'Home Loan',
        type: 'loan',
        balance: -100000,
        institution: 'SBI',
        lastFour: '2222',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);

    (getActiveRecurringTransactions as jest.Mock).mockResolvedValue([
      {
        id: 'rec-emi',
        accountId: 'bank-1',
        toAccountId: 'loan-1',
        amount: 6500,
        type: 'transfer',
        merchant: 'SBI EMI',
        category: 'Transfer',
        frequency: 'monthly',
        nextProcessDate: '2026-12-01',
        isActive: true,
      },
    ]);

    const debts = await getActiveDebtList();
    expect(debts).toHaveLength(1);
    expect(debts[0].id).toBe('loan-1');
    expect(debts[0].minPayment).toBe(6500);
  });

  it('flags debt as unpayable when monthly payment cannot amortize interest within 30 years', () => {
    const result = simulateDebtStrategy(
      [
        {
          id: 'cc-1',
          name: 'High APR Card',
          type: 'credit',
          balance: 100000,
          interestRate: 42, // ₹3,500/month interest > ₹100 minPayment
          minPayment: 100,
        },
      ],
      'avalanche',
      0
    );

    expect(result.isUnpayableWithCurrentPayment).toBe(true);
    expect(result.debtFreeDate).toBe('30+ yrs (raise payment)');
    expect(result.payoffOrder[0].isUnpayable).toBe(true);
    expect(result.payoffOrder[0].payoffDate).toBe('30+ yrs (raise payment)');
  });

  it('does not skip February when projecting payoff dates from the 31st of a month', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 0, 31, 10, 0, 0));
    try {
      const result = simulateDebtStrategy(
        [
          {
            id: 'loan-feb',
            name: 'Short Loan',
            type: 'loan',
            balance: 1000,
            interestRate: 0,
            minPayment: 1000,
          },
        ],
        'snowball',
        0
      );
      expect(result.totalMonths).toBe(1);
      expect(result.debtFreeDate).toBe('Feb 2026');
    } finally {
      jest.useRealTimers();
    }
  });
});


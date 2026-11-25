import { computeFinancialHealthScore } from './financial-health-engine';
import { getAllAccounts } from '../database/account-dao';
import { getMonthlyReports, getMonthlyTotals } from '../database/transaction-dao';
import { getBudgetPlanForMonth, getCurrentBudgetPlan } from '../database/budget-dao';
import { getActiveDebtList } from '../debt/debt-payoff-service';

jest.mock('../database/account-dao', () => ({
  getAllAccounts: jest.fn(),
}));

jest.mock('../database/transaction-dao', () => ({
  getMonthlyTotals: jest.fn(),
  getMonthlyReports: jest.fn(),
}));

jest.mock('../database/budget-dao', () => ({
  getCurrentBudgetPlan: jest.fn(),
  getBudgetPlanForMonth: jest.fn(),
}));

jest.mock('../debt/debt-payoff-service', () => ({
  getActiveDebtList: jest.fn(),
}));

describe('computeFinancialHealthScore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getMonthlyReports as jest.Mock).mockResolvedValue([]);
    (getCurrentBudgetPlan as jest.Mock).mockResolvedValue(null);
    (getBudgetPlanForMonth as jest.Mock).mockResolvedValue(null);
    (getActiveDebtList as jest.Mock).mockResolvedValue([]);
  });

  it('uses budget plan income when logged income transactions are 0', async () => {
    (getAllAccounts as jest.Mock).mockResolvedValue([
      { id: '1', name: 'Savings', type: 'savings', balance: 200000, institution: '', lastFour: '' },
    ]);
    (getMonthlyTotals as jest.Mock).mockResolvedValue({ income: 0, expenses: 40000 });
    (getCurrentBudgetPlan as jest.Mock).mockResolvedValue({
      id: 'bp1',
      monthlyIncome: 100000,
      needsPercent: 50,
      wantsPercent: 30,
      savingsPercent: 20,
      month: 11,
      year: 2026,
    });

    const report = await computeFinancialHealthScore();

    expect(report.recordedIncome).toBe(0);
    expect(report.effectiveIncome).toBe(100000);
    expect(report.pillars.savingsRate.metricValue).toBe('60%');
    expect(report.pillars.savingsRate.score).toBe(20);
    expect(report.pillars.budgetAdherence.score).toBe(15);
    expect(report.overallScore).toBe(100);
  });

  it('does not award false excellent scores when expenses and debt exist with zero income', async () => {
    (getAllAccounts as jest.Mock).mockResolvedValue([
      { id: '1', name: 'Checking', type: 'checking', balance: 5000, institution: '', lastFour: '' },
      { id: '2', name: 'Loan', type: 'loan', balance: -50000, institution: '', lastFour: '' },
    ]);
    (getMonthlyTotals as jest.Mock).mockResolvedValue({ income: 0, expenses: 30000 });
    (getActiveDebtList as jest.Mock).mockResolvedValue([
      { id: '2', name: 'Loan', type: 'loan', balance: 50000, interestRate: 12, minPayment: 2500 },
    ]);

    const report = await computeFinancialHealthScore();

    expect(report.pillars.savingsRate.status).toBe('poor');
    expect(report.pillars.savingsRate.metricValue).toBe('No income');
    expect(report.pillars.debtBurden.status).toBe('poor');
    expect(report.pillars.debtBurden.score).toBe(3);
    expect(report.pillars.budgetAdherence.status).toBe('poor');
    expect(report.pillars.budgetAdherence.score).toBe(3);
  });

  it('flags missing credit limit instead of awarding full utilization points', async () => {
    (getAllAccounts as jest.Mock).mockResolvedValue([
      { id: '1', name: 'Savings', type: 'savings', balance: 100000, institution: '', lastFour: '' },
      { id: '2', name: 'Visa', type: 'credit', balance: -25000, institution: '', lastFour: '4242' },
    ]);
    (getMonthlyTotals as jest.Mock).mockResolvedValue({ income: 80000, expenses: 40000 });

    const report = await computeFinancialHealthScore();

    expect(report.pillars.creditUtilization.metricValue).toBe('Limit missing');
    expect(report.pillars.creditUtilization.score).toBe(10);
    expect(report.pillars.creditUtilization.status).toBe('fair');
  });

  it('treats positive credit card overpayment balance as 0% utilization', async () => {
    (getAllAccounts as jest.Mock).mockResolvedValue([
      { id: '1', name: 'Savings', type: 'savings', balance: 150000, institution: '', lastFour: '' },
      {
        id: '2',
        name: 'Visa',
        type: 'credit',
        balance: 500,
        creditLimit: 50000,
        institution: '',
        lastFour: '4242',
      },
    ]);
    (getMonthlyTotals as jest.Mock).mockResolvedValue({ income: 80000, expenses: 30000 });

    const report = await computeFinancialHealthScore();

    expect(report.pillars.creditUtilization.metricValue).toBe('0%');
    expect(report.pillars.creditUtilization.score).toBe(20);
  });

  it('uses trailing historical burn for current month runway so day-1 low spend does not inflate runway', async () => {
    const now = new Date();
    const curMonth = now.getMonth() + 1;
    const curYear = now.getFullYear();
    const prevDate = new Date(curYear, curMonth - 2, 1);
    const prevPrefix = `${prevDate.getFullYear()}-${(prevDate.getMonth() + 1)
      .toString()
      .padStart(2, '0')}`;

    (getAllAccounts as jest.Mock).mockResolvedValue([
      { id: '1', name: 'Savings', type: 'savings', balance: 45000, institution: '', lastFour: '' },
    ]);
    (getMonthlyTotals as jest.Mock).mockResolvedValue({ income: 60000, expenses: 1500 });
    (getMonthlyReports as jest.Mock).mockResolvedValue([
      { datePrefix: prevPrefix, income: 60000, expenses: 45000 },
    ]);

    const report = await computeFinancialHealthScore({ month: curMonth, year: curYear });

    // 45000 liquid / (45000 / 30 = 1500 daily burn) = 30 days (not 900 days!)
    expect(report.pillars.runway.metricValue).toBe('30 Days');
    expect(report.pillars.runway.score).toBe(15);
  });

  it('supports evaluating a historical month with getBudgetPlanForMonth', async () => {
    (getAllAccounts as jest.Mock).mockResolvedValue([
      { id: '1', name: 'Savings', type: 'savings', balance: 120000, institution: '', lastFour: '' },
    ]);
    (getMonthlyTotals as jest.Mock).mockResolvedValue({ income: 50000, expenses: 25000 });
    (getBudgetPlanForMonth as jest.Mock).mockResolvedValue({
      id: 'bp-old',
      monthlyIncome: 70000,
      needsPercent: 50,
      wantsPercent: 30,
      savingsPercent: 20,
      month: 5,
      year: 2025,
    });

    const report = await computeFinancialHealthScore({ month: 5, year: 2025 });

    expect(getBudgetPlanForMonth).toHaveBeenCalledWith(5, 2025);
    expect(report.month).toBe(5);
    expect(report.year).toBe(2025);
    expect(report.effectiveIncome).toBe(70000);
  });
});

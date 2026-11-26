import { getMonthlyDailyTotals, getMonthlyTotals, getTopMerchants, getTransactions } from './transaction-dao';
import { getBudgetPlanForMonth, getSpentByCategory } from './budget-dao';
import { getDatabase } from './index';

jest.mock('./index', () => ({
  getDatabase: jest.fn(),
}));

describe('monthly SQL queries', () => {
  let mockDb: {
    getAllAsync: jest.Mock;
    getFirstAsync: jest.Mock;
    execAsync: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      getAllAsync: jest.fn().mockResolvedValue([]),
      getFirstAsync: jest.fn().mockResolvedValue(null),
      execAsync: jest.fn().mockResolvedValue(undefined),
    };
    (getDatabase as jest.Mock).mockReturnValue(mockDb);
  });

  it('getMonthlyTotals uses single-month localtime CASE expression without OR double-matching', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ income: 50000, expenses: 20000 });

    const totals = await getMonthlyTotals(11, 2026);

    expect(totals).toEqual({ income: 50000, expenses: 20000 });
    const [sql, params] = mockDb.getFirstAsync.mock.calls[0];
    expect(sql).toContain("WHEN date LIKE '%T%' THEN SUBSTR(date(date, 'localtime'), 1, 7)");
    expect(sql).not.toContain(' OR ');
    expect(params).toEqual(['2026-11']);
  });

  it('getTopMerchants uses single-month localtime CASE expression', async () => {
    await getTopMerchants(11, 2026, 5);

    const [sql, params] = mockDb.getAllAsync.mock.calls[0];
    expect(sql).toContain("WHEN date LIKE '%T%' THEN SUBSTR(date(date, 'localtime'), 1, 7)");
    expect(sql).not.toContain(' OR ');
    expect(params).toEqual(['2026-11', 5]);
  });

  it('getSpentByCategory uses single-month localtime CASE expression', async () => {
    await getSpentByCategory(11, 2026);

    const [sql, params] = mockDb.getAllAsync.mock.calls[0];
    expect(sql).toContain("WHEN date LIKE '%T%' THEN SUBSTR(date(date, 'localtime'), 1, 7)");
    expect(sql).not.toContain(' OR ');
    expect(params).toEqual(['2026-11']);
  });

  it('getBudgetPlanForMonth rolls forward only from plans at or before target month', async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'bp-10',
        monthly_income: 80000,
        needs_percent: 50,
        wants_percent: 30,
        savings_percent: 20,
        month: 10,
        year: 2026,
      });

    const plan = await getBudgetPlanForMonth(11, 2026);

    expect(plan?.monthlyIncome).toBe(80000);
    const [, secondCallParams] = mockDb.getFirstAsync.mock.calls[1];
    expect(secondCallParams).toEqual([2026, 2026, 11]);
  });

  it('getMonthlyDailyTotals groups local calendar dates and applies active filters', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { date: '2026-11-26', income: 5000, expense: 450, transfer: 0, count: 2 },
    ]);

    const rows = await getMonthlyDailyTotals(11, 2026, {
      accountId: 'acc-1',
      type: 'expense',
    });

    expect(rows).toEqual([
      { date: '2026-11-26', income: 5000, expense: 450, transfer: 0, count: 2 },
    ]);
    const [sql, params] = mockDb.getAllAsync.mock.calls[0];
    expect(sql).toContain("SUBSTR(date(t.date, 'localtime'), 1, 10)");
    expect(sql).toContain("SUBSTR(date(t.date, 'localtime'), 1, 7)");
    expect(sql).toContain('GROUP BY date');
    expect(params).toEqual(['acc-1', 'acc-1', 'expense', '2026-11']);
  });

  it('getTransactions dateFrom/dateTo filters use local calendar date expression', async () => {
    await getTransactions({
      dateFrom: '2026-11-26',
      dateTo: '2026-11-26',
    });

    const [sql, params] = mockDb.getAllAsync.mock.calls[0];
    expect(sql).toContain("SUBSTR(date(t.date, 'localtime'), 1, 10)");
    expect(params).toEqual(['2026-11-26', '2026-11-26']);
  });
});

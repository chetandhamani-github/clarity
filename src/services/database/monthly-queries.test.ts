import { getMonthlyTotals, getTopMerchants } from './transaction-dao';
import { getBudgetPlanForMonth, getSpentByCategory } from './budget-dao';
import { getDatabase } from './index';

jest.mock('./index', () => ({
  getDatabase: jest.fn(),
}));

describe('monthly SQL queries', () => {
  let mockDb: {
    getAllAsync: jest.Mock;
    getFirstAsync: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      getAllAsync: jest.fn().mockResolvedValue([]),
      getFirstAsync: jest.fn().mockResolvedValue(null),
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
});

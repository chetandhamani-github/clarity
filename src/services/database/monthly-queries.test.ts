import {
  getDateRangeTotals,
  getMonthlyDailyTotals,
  getMonthlyTotals,
  getTopMerchants,
  getTransactions,
} from './transaction-dao';
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
    const expectedRow = {
      date: '2026-11-26',
      income: 5000,
      expense: 450,
      transfer: 0,
      count: 2,
    };
    const queryCalls: { sql: string; params: unknown[] }[] = [];
    mockDb.getAllAsync.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('PRAGMA table_info')) return [];
      queryCalls.push({ sql, params });
      return [expectedRow];
    });

    const rows = await getMonthlyDailyTotals(11, 2026, {
      accountId: 'acc-1',
      type: 'expense',
    });

    expect(rows).toEqual([expectedRow]);
    expect(queryCalls).toHaveLength(1);
    expect(queryCalls[0].sql).toContain("SUBSTR(date(t.date, 'localtime'), 1, 10)");
    expect(queryCalls[0].sql).toContain("SUBSTR(date(t.date, 'localtime'), 1, 7)");
    expect(queryCalls[0].sql).toContain('GROUP BY date');
    expect(queryCalls[0].params).toEqual(['acc-1', 'acc-1', 'expense', '2026-11']);
  });

  it('getTransactions dateFrom/dateTo filters use local calendar date expression', async () => {
    const queryCalls: { sql: string; params: unknown[] }[] = [];
    mockDb.getAllAsync.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('PRAGMA table_info')) return [];
      queryCalls.push({ sql, params });
      return [];
    });

    await getTransactions({
      dateFrom: '2026-11-26',
      dateTo: '2026-11-26',
    });

    expect(queryCalls).toHaveLength(1);
    expect(queryCalls[0].sql).toContain("SUBSTR(date(t.date, 'localtime'), 1, 10)");
    expect(queryCalls[0].params).toEqual(['2026-11-26', '2026-11-26']);
  });

  it('getDateRangeTotals aggregates cross-month ranges using local date filters', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({
      income: 12000,
      expense: 3450.25,
      transfer: 500,
      count: 6,
    });

    const totals = await getDateRangeTotals({
      dateFrom: '2026-10-28',
      dateTo: '2026-11-05',
      accountId: 'acc-1',
    });

    expect(totals).toEqual({
      income: 12000,
      expense: 3450.25,
      transfer: 500,
      net: 8549.75,
      count: 6,
    });
    const [sql, params] = mockDb.getFirstAsync.mock.calls[0];
    expect(sql).toContain("SUBSTR(date(t.date, 'localtime'), 1, 10)");
    expect(params).toEqual(['acc-1', 'acc-1', '2026-10-28', '2026-11-05']);
  });

  it('getTransactions with limit scopes tag lookup to returned transaction IDs', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getTransactions } = require('./transaction-dao');
    const prevAllAsyncImpl = mockDb.getAllAsync.getMockImplementation();

    try {
      mockDb.getAllAsync.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM transactions t')) {
          return [
            {
              id: 'tx-1',
              account_id: 'acc-1',
              to_account_id: null,
              amount: 250,
              type: 'expense',
              merchant: 'Swiggy',
              category: 'Food & Dining',
              date: '2026-11-26T12:00:00Z',
              is_recurring: 0,
              note: '',
              splits_json: null,
              source: 'MANUAL',
              status: 'VERIFIED',
              sms_id: null,
              parsed_tx_id: null,
              receipt_uri: null,
              created_at: '2026-11-26T12:00:00Z',
              account_name: 'HDFC Savings',
              to_account_name: null,
            },
            {
              id: 'tx-2',
              account_id: 'acc-1',
              to_account_id: null,
              amount: 99,
              type: 'expense',
              merchant: 'Metro',
              category: 'Transport',
              date: '2026-11-26T09:00:00Z',
              is_recurring: 0,
              note: '',
              splits_json: null,
              source: 'MANUAL',
              status: 'VERIFIED',
              sms_id: null,
              parsed_tx_id: null,
              receipt_uri: null,
              created_at: '2026-11-26T09:00:00Z',
              account_name: 'HDFC Savings',
              to_account_name: null,
            },
          ];
        }

        if (sql.includes('FROM transaction_tags tt')) {
          return [{ transaction_id: 'tx-1', name: 'dinner' }];
        }

        return [];
      });

      const result = await getTransactions({ accountId: 'acc-1', limit: 25, offset: 0 });

      expect(result).toHaveLength(2);
      expect(result[0].tags).toEqual(['dinner']);
      expect(result[1].tags).toEqual([]);

      const tagCall = mockDb.getAllAsync.mock.calls.find(([sql]: [string]) =>
        sql.includes('transaction_tags')
      );
      expect(tagCall).toBeDefined();
      expect(tagCall?.[0]).toContain('WHERE tt.transaction_id IN (?,?)');
      expect(tagCall?.[1]).toEqual(['tx-1', 'tx-2']);
    } finally {
      mockDb.getAllAsync.mockImplementation(prevAllAsyncImpl);
    }
  });
});

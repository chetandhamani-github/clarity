import { getAccountHistory, getNetWorthHistory } from './transaction-dao';
import { getAccountById } from './account-dao';
import { getDatabase } from './index';

jest.mock('./index', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('./account-dao', () => ({
  getAccountById: jest.fn(),
}));

jest.mock('@/utils/date', () => {
  const actual = jest.requireActual('@/utils/date');
  return {
    ...actual,
    getLocalTodayYmd: jest.fn(() => '2026-11-26'),
  };
});

describe('balance history DAOs', () => {
  let mockDb: {
    getAllAsync: jest.Mock;
    getFirstAsync: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      getAllAsync: jest.fn().mockResolvedValue([]),
      getFirstAsync: jest.fn().mockResolvedValue({ total: 0 }),
    };
    (getDatabase as jest.Mock).mockReturnValue(mockDb);
  });

  it('getAccountHistory reconstructs negative credit card balance history accurately in local dates', async () => {
    (getAccountById as jest.Mock).mockResolvedValueOnce({
      id: 'cc-1',
      name: 'Credit Card',
      type: 'credit',
      balance: -1500,
    });
    mockDb.getAllAsync.mockResolvedValueOnce([
      {
        account_id: 'cc-1',
        amount: 500,
        type: 'expense',
        date: '2026-11-26',
      },
      {
        account_id: 'other-bank',
        to_account_id: 'cc-1',
        amount: 2000,
        type: 'transfer',
        date: '2026-11-25',
      },
    ]);

    const history = await getAccountHistory('cc-1', 3);

    expect(history).toEqual([
      { date: '2026-11-24', value: -3000 },
      { date: '2026-11-25', value: -1000 },
      { date: '2026-11-26', value: -1500 },
    ]);

    const [, queryParams] = mockDb.getAllAsync.mock.calls[0];
    expect(queryParams).toEqual(['cc-1', 'cc-1', '2026-11-22']);
  });

  it('getNetWorthHistory includes investments and rounds reversed values cleanly', async () => {
    mockDb.getFirstAsync
      .mockResolvedValueOnce({ total: 10000 })
      .mockResolvedValueOnce({ total: 5000 });
    mockDb.getAllAsync.mockResolvedValueOnce([
      { amount: 2500.55, type: 'income', date: '2026-11-26' },
      { amount: 500.1, type: 'expense', date: '2026-11-25' },
    ]);

    const history = await getNetWorthHistory(3);

    expect(history).toEqual([
      { date: '2026-11-24', value: 12999.55 },
      { date: '2026-11-25', value: 12499.45 },
      { date: '2026-11-26', value: 15000 },
    ]);
  });
});

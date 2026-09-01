import { exportCustomStatement } from './export-service';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: '/mock/cache/',
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: { UTF8: 'utf8' },
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn().mockResolvedValue({ uri: '/mock/cache/statement.pdf' }),
  printAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/database', () => ({
  getDatabase: jest.fn(() => ({
    getAllAsync: jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue({ count: 0 }),
  })),
}));

jest.mock('@/services/database/transaction-dao', () => ({
  getTransactions: jest.fn().mockResolvedValue([
    {
      id: 'tx-1',
      date: '2026-09-01',
      type: 'expense',
      merchant: 'Supermarket',
      category: 'Groceries',
      amount: 75.5,
      accountName: 'Checking',
      isRecurring: false,
    },
    {
      id: 'tx-2',
      date: '2026-09-01',
      type: 'income',
      merchant: 'Company Corp',
      category: 'Salary',
      amount: 3000,
      accountName: 'Savings',
      isRecurring: false,
    },
  ]),
  getMonthlyTotals: jest.fn().mockResolvedValue({ income: 3000, expenses: 75.5 }),
  getTopMerchants: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/services/database/account-dao', () => ({
  getAllAccounts: jest.fn().mockResolvedValue([
    { id: 'acc-1', name: 'Checking', type: 'checking', balance: 500 },
    { id: 'acc-2', name: 'Savings', type: 'savings', balance: 25000 },
  ]),
}));

jest.mock('@/services/database/budget-dao', () => ({
  getCurrentBudgetPlan: jest.fn().mockResolvedValue(null),
  getAllCategories: jest.fn().mockResolvedValue([]),
  getSpentByCategory: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/services/database/goal-dao', () => ({
  getGoals: jest.fn().mockResolvedValue([]),
}));

describe('export-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exports CSV statement and invokes sharing', async () => {
    const res = await exportCustomStatement({
      format: 'csv',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
    });

    expect(res.success).toBe(true);
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      expect.stringContaining('.csv'),
      expect.stringContaining('Supermarket'),
      expect.anything()
    );
    expect(Sharing.shareAsync).toHaveBeenCalled();
  });

  it('exports true PDF statement and invokes sharing', async () => {
    const Print = require('expo-print');
    const res = await exportCustomStatement({
      format: 'pdf',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
    });

    expect(res.success).toBe(true);
    expect(Print.printToFileAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('Official Financial Statement'),
      })
    );
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      '/mock/cache/statement.pdf',
      expect.objectContaining({ mimeType: 'application/pdf' })
    );
  });

  it('triggers native print dialog when action is print', async () => {
    const Print = require('expo-print');
    const res = await exportCustomStatement({
      format: 'pdf',
      action: 'print',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
    });

    expect(res.success).toBe(true);
    expect(Print.printAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('Official Financial Statement'),
      })
    );
  });
});

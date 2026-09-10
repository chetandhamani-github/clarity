import {
  getAccountReconciliationStatus,
  createBalanceAdjustmentEntry,
} from './reconciliation-service';
import { getDatabase } from './index';
import { getAccountById } from './account-dao';
import { insertTransaction } from './transaction-dao';

jest.mock('./index', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('./account-dao', () => ({
  getAccountById: jest.fn(),
}));

jest.mock('./transaction-dao', () => ({
  insertTransaction: jest.fn(),
}));

describe('Reconciliation Service', () => {
  const mockDb = {
    getFirstAsync: jest.fn(),
    getAllAsync: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getDatabase as jest.Mock).mockReturnValue(mockDb);
  });

  it('returns null for non-existent account or liability accounts', async () => {
    (getAccountById as jest.Mock).mockResolvedValueOnce(null);
    expect(await getAccountReconciliationStatus('missing-acc')).toBeNull();

    (getAccountById as jest.Mock).mockResolvedValueOnce({
      id: 'cc-1',
      name: 'HDFC Credit Card',
      type: 'credit',
      balance: -5000,
    });
    expect(await getAccountReconciliationStatus('cc-1')).toBeNull();
  });

  it('returns no discrepancy when no SMS balance exists', async () => {
    (getAccountById as jest.Mock).mockResolvedValueOnce({
      id: 'acc-1',
      name: 'HDFC Savings',
      type: 'savings',
      balance: 10000,
    });
    mockDb.getFirstAsync.mockResolvedValueOnce(null);

    const status = await getAccountReconciliationStatus('acc-1');
    expect(status).toEqual({
      accountId: 'acc-1',
      accountName: 'HDFC Savings',
      statementBalance: 10000,
      statementDate: null,
      calculatedBalance: 10000,
      discrepancy: 0,
      hasDiscrepancy: false,
    });
  });

  it('detects a discrepancy when the reconstructed ledger differs from the latest SMS statement balance', async () => {
    (getAccountById as jest.Mock).mockResolvedValueOnce({
      id: 'acc-1',
      name: 'HDFC Savings',
      type: 'savings',
      balance: 24500, // Account current balance
    });

    // Latest SMS balance snapshot was ₹25,000 on Jan 10
    mockDb.getFirstAsync.mockResolvedValueOnce({
      available_balance: 25000,
      transaction_date: '2025-01-10T10:00:00.000Z',
      transaction_id: 'tx-sms-snap',
    });

    // Subsequent transactions recorded after Jan 10: expense of ₹350
    // Expected calculated balance: 25000 - 350 = 24650
    // Discrepancy: 24500 - 24650 = -150
    mockDb.getAllAsync.mockResolvedValueOnce([
      {
        id: 'tx-subseq-1',
        amount: 350,
        type: 'expense',
        account_id: 'acc-1',
      },
    ]);

    const status = await getAccountReconciliationStatus('acc-1');
    expect(status).not.toBeNull();
    expect(status?.statementBalance).toBe(25000);
    expect(status?.calculatedBalance).toBe(24650);
    expect(status?.discrepancy).toBe(-150);
    expect(status?.hasDiscrepancy).toBe(true);
  });

  it('creates an adjustment entry with source ADJUSTMENT', async () => {
    (insertTransaction as jest.Mock).mockResolvedValueOnce({
      id: 'tx-adj-1',
      accountId: 'acc-1',
      amount: 150,
      type: 'expense',
      source: 'ADJUSTMENT',
      status: 'VERIFIED',
    });

    await createBalanceAdjustmentEntry('acc-1', -150);

    expect(insertTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-1',
        amount: 150,
        type: 'expense',
        category: 'Adjustment',
        source: 'ADJUSTMENT',
        status: 'VERIFIED',
      }),
      { updateAccountBalance: false }
    );
  });
});

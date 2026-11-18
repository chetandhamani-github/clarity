import {
  getAllAccounts,
  getAccountById,
  insertAccount,
  updateAccount,
  updateAccountsOrder,
} from './account-dao';
import { getDatabase } from './index';

jest.mock('./index', () => ({
  getDatabase: jest.fn(),
}));

describe('account-dao and reordering', () => {
  let mockDb: {
    getAllAsync: jest.Mock;
    getFirstAsync: jest.Mock;
    runAsync: jest.Mock;
    execAsync: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      getAllAsync: jest.fn(),
      getFirstAsync: jest.fn(),
      runAsync: jest.fn().mockResolvedValue({}),
      execAsync: jest.fn().mockResolvedValue({}),
    };
    (getDatabase as jest.Mock).mockReturnValue(mockDb);
  });

  it('getAllAccounts orders by sort_order ASC, created_at DESC', async () => {
    const mockRows = [
      {
        id: 'acc-1',
        name: 'HDFC Bank',
        type: 'savings',
        balance: 10000,
        institution: 'HDFC',
        last_four: '1234',
        sort_order: 0,
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'acc-2',
        name: 'Cash Wallet',
        type: 'wallet',
        balance: 2000,
        institution: '',
        last_four: '',
        sort_order: 1,
        created_at: '2026-01-02T00:00:00.000Z',
      },
    ];

    mockDb.getAllAsync.mockResolvedValueOnce(mockRows);

    const accounts = await getAllAccounts();

    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      'SELECT * FROM accounts ORDER BY sort_order ASC, created_at DESC'
    );
    expect(accounts).toHaveLength(2);
    expect(accounts[0].sortOrder).toBe(0);
    expect(accounts[1].sortOrder).toBe(1);
  });

  it('insertAccount assigns the next incremental sort_order if not provided', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ max_order: 2 });

    const newAcc = await insertAccount({
      name: 'ICICI Bank',
      type: 'savings',
      balance: 5000,
      institution: 'ICICI',
      lastFour: '5678',
    });

    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      'SELECT MAX(sort_order) as max_order FROM accounts'
    );
    expect(newAcc.sortOrder).toBe(3);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('sort_order'),
      expect.arrayContaining([3])
    );
  });

  it('updateAccountsOrder sets sort_order for each ID within a transaction', async () => {
    const orderedIds = ['acc-3', 'acc-1', 'acc-2'];

    await updateAccountsOrder(orderedIds);

    expect(mockDb.execAsync).toHaveBeenCalledWith('BEGIN TRANSACTION');
    expect(mockDb.runAsync).toHaveBeenCalledTimes(3);
    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      1,
      'UPDATE accounts SET sort_order = ?, updated_at = ? WHERE id = ?',
      [0, expect.any(String), 'acc-3']
    );
    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      2,
      'UPDATE accounts SET sort_order = ?, updated_at = ? WHERE id = ?',
      [1, expect.any(String), 'acc-1']
    );
    expect(mockDb.runAsync).toHaveBeenNthCalledWith(
      3,
      'UPDATE accounts SET sort_order = ?, updated_at = ? WHERE id = ?',
      [2, expect.any(String), 'acc-2']
    );
    expect(mockDb.execAsync).toHaveBeenCalledWith('COMMIT');
  });

  it('updateAccount updates sort_order when provided', async () => {
    await updateAccount('acc-1', { sortOrder: 5 });

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('sort_order = ?'),
      expect.arrayContaining([5, 'acc-1'])
    );
  });

  it('correctly maps section reordering into the global allAccounts list', () => {
    const allAccounts = [
      { id: 'a1', name: 'Asset 1', type: 'savings' },
      { id: 'l1', name: 'Liability 1', type: 'credit' },
      { id: 'a2', name: 'Asset 2', type: 'savings' },
      { id: 'a3', name: 'Asset 3', type: 'wallet' },
      { id: 'l2', name: 'Liability 2', type: 'loan' },
    ];

    const assetAccounts = [
      { id: 'a1', name: 'Asset 1', type: 'savings' },
      { id: 'a2', name: 'Asset 2', type: 'savings' },
      { id: 'a3', name: 'Asset 3', type: 'wallet' },
    ];

    // Reorder assets: move a3 to the front -> [a3, a1, a2]
    const newSectionOrder = [
      { id: 'a3', name: 'Asset 3', type: 'wallet' },
      { id: 'a1', name: 'Asset 1', type: 'savings' },
      { id: 'a2', name: 'Asset 2', type: 'savings' },
    ];

    const newAll = [...allAccounts];
    let sectionIdx = 0;
    for (let i = 0; i < newAll.length; i++) {
      if (assetAccounts.some((a) => a.id === newAll[i].id)) {
        newAll[i] = newSectionOrder[sectionIdx++];
      }
    }

    expect(newAll.map((a) => a.id)).toEqual(['a3', 'l1', 'a1', 'a2', 'l2']);
  });
});


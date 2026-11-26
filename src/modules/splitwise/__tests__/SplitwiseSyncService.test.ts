jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import { SplitwiseSyncService } from '../services/SplitwiseSyncService';
import { syncSplitwiseData } from '@/services/api/splitwise.api';
import { getDatabase } from '@/services/database';
import { useAuthStore } from '@/store/use-auth-store';
import { SplitwiseRepository } from '../database/splitwise.repository';
import { CURRENT_USER_ID } from '../types/splitwise.types';

jest.mock('@/services/api/splitwise.api', () => ({
  syncSplitwiseData: jest.fn(),
}));

jest.mock('@/services/database', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('@/lib/storage', () => ({
  mmkv: {
    getString: jest.fn(() => undefined),
    set: jest.fn(),
  },
}));

jest.mock('../database/splitwise.repository', () => ({
  SplitwiseRepository: {
    ensureSchema: jest.fn().mockResolvedValue(undefined),
    getAllPeople: jest.fn().mockResolvedValue([]),
    getAllDebts: jest.fn().mockResolvedValue([]),
    getAllSettlements: jest.fn().mockResolvedValue([]),
    getAllGroups: jest.fn().mockResolvedValue([]),
    getAllExpenses: jest.fn().mockResolvedValue([]),
  },
  getDeletedRecords: jest.fn(() => []),
  removeConfirmedDeletedRecords: jest.fn(),
}));

describe('SplitwiseSyncService collaborative group identity mapping', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      user: {
        id: 'u-bob',
        email: 'bob@gmail.com',
        name: 'Bob',
        createdAt: '2026-11-26T00:00:00Z',
      },
      token: 'token-bob',
      isAuthenticated: true,
    });
  });

  it('pushes member emails and maps incoming shared group/expenses to current_user by email', async () => {
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const getFirstAsync = jest.fn().mockResolvedValue(null);
    (getDatabase as jest.Mock).mockReturnValue({
      runAsync,
      getFirstAsync,
      withTransactionAsync: async (fn: () => Promise<void>) => fn(),
    });

    (SplitwiseRepository.getAllPeople as jest.Mock).mockResolvedValue([]);
    (SplitwiseRepository.getAllGroups as jest.Mock).mockResolvedValue([
      {
        id: 'g-local',
        name: 'Local Lunch',
        currency: 'INR',
        isArchived: false,
        createdAt: '2026-11-26T00:00:00Z',
        members: [{ id: 'gm-1', groupId: 'g-local', personId: CURRENT_USER_ID, role: 'admin', joinedAt: '2026-11-26T00:00:00Z' }],
      },
    ]);

    (syncSplitwiseData as jest.Mock).mockResolvedValue({
      success: true,
      syncedAt: '2026-11-26T08:00:00Z',
      people: [],
      debts: [],
      settlements: [],
      groups: [
        {
          id: 'g-trip',
          name: 'Goa Trip',
          currency: 'INR',
          members: [
            { personId: 'user_alice@gmail.com', email: 'alice@gmail.com', name: 'Alice', role: 'admin' },
            { personId: 'p-bob-on-alice', email: 'bob@gmail.com', name: 'Bob', role: 'member' },
          ],
          createdAt: '2026-11-26T07:00:00Z',
          updatedAt: '2026-11-26T07:00:00Z',
        },
      ],
      expenses: [
        {
          id: 'exp-1',
          groupId: 'g-trip',
          payerId: 'user_alice@gmail.com',
          payerEmail: 'alice@gmail.com',
          payerName: 'Alice',
          description: 'Hotel',
          amount: 4000,
          currency: 'INR',
          splitType: 'EQUAL',
          splits: [
            {
              id: 'sp-1',
              personId: 'user_alice@gmail.com',
              personEmail: 'alice@gmail.com',
              personName: 'Alice',
              paidAmount: 4000,
              owedAmount: 2000,
              isPaid: true,
            },
            {
              id: 'sp-2',
              personId: 'p-bob-on-alice',
              personEmail: 'bob@gmail.com',
              personName: 'Bob',
              paidAmount: 0,
              owedAmount: 2000,
              isPaid: false,
            },
          ],
        },
      ],
      confirmedIds: ['g-local'],
    });

    const result = await SplitwiseSyncService.getInstance().syncWithCloud();

    expect(result.success).toBe(true);
    expect(result.appliedCount.groups).toBe(1);
    expect(result.appliedCount.expenses).toBe(1);

    // Pushed group included current user's email & name
    expect(syncSplitwiseData).toHaveBeenCalledWith(
      expect.objectContaining({
        groups: [
          expect.objectContaining({
            id: 'g-local',
            members: [
              expect.objectContaining({
                personId: CURRENT_USER_ID,
                email: 'bob@gmail.com',
                name: 'Bob',
              }),
            ],
          }),
        ],
      })
    );

    // Bob's split was mapped to local CURRENT_USER_ID while Alice was created/linked by email
    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO splitwise_people'),
      ['user_alice@gmail.com', 'Alice', 'alice@gmail.com', expect.any(String)]
    );
    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO splitwise_group_members'),
      ['g-trip_current_user', 'g-trip', CURRENT_USER_ID, 'member', '2026-11-26T07:00:00Z']
    );
    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO splitwise_expense_splits'),
      ['sp-2', 'exp-1', CURRENT_USER_ID, 0, 2000, null, null, 0, expect.any(String)]
    );
  });
});

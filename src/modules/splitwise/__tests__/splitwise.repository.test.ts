import { SplitwiseRepository } from '../database/splitwise.repository';
import { getDatabase } from '@/services/database';

jest.mock('@/services/database', () => ({
  getDatabase: jest.fn(),
}));

describe('SplitwiseRepository', () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      runAsync: jest.fn().mockResolvedValue({}),
      getAllAsync: jest.fn().mockResolvedValue([]),
      getFirstAsync: jest.fn().mockResolvedValue(null),
      execAsync: jest.fn().mockResolvedValue({}),
    };
    (getDatabase as jest.Mock).mockReturnValue(mockDb);
  });

  describe('People CRUD', () => {
    it('creates a new person successfully', async () => {
      const person = await SplitwiseRepository.createPerson({
        name: 'Rahul Sharma',
        phone: '+919876543210',
        notes: 'Flatmate for rent & groceries',
      });

      expect(person.id).toBeDefined();
      expect(person.name).toBe('Rahul Sharma');
      expect(person.phone).toBe('+919876543210');
      expect(person.notes).toBe('Flatmate for rent & groceries');
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO splitwise_people'),
        expect.arrayContaining(['Rahul Sharma', '+919876543210', 'Flatmate for rent & groceries'])
      );
    });

    it('throws error when creating person with empty name', async () => {
      await expect(
        SplitwiseRepository.createPerson({
          name: '   ',
        })
      ).rejects.toThrow('Person name is required');
    });

    it('gets a person by ID', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({
        id: 'p-1',
        name: 'Priya Patel',
        phone: null,
        notes: null,
        created_at: '2026-09-11T12:00:00.000Z',
      });

      const person = await SplitwiseRepository.getPersonById('p-1');
      expect(person).not.toBeNull();
      expect(person?.id).toBe('p-1');
      expect(person?.name).toBe('Priya Patel');
      expect(person?.phone).toBeUndefined();
    });

    it('searches people by query', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        {
          id: 'p-1',
          name: 'Rahul Sharma',
          phone: '+919876543210',
          notes: null,
          created_at: '2026-09-11T12:00:00.000Z',
        },
      ]);

      const results = await SplitwiseRepository.searchPeople('Rahul');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Rahul Sharma');
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        expect.stringContaining('name LIKE ?'),
        ['%Rahul%', '%Rahul%']
      );
    });

    it('updates a person', async () => {
      mockDb.getFirstAsync
        .mockResolvedValueOnce({
          id: 'p-1',
          name: 'Rahul',
          phone: null,
          notes: null,
          created_at: '2026-09-11T12:00:00.000Z',
        })
        .mockResolvedValueOnce({
          id: 'p-1',
          name: 'Rahul S.',
          phone: '+919999999999',
          notes: 'Updated note',
          created_at: '2026-09-11T12:00:00.000Z',
        });

      const updated = await SplitwiseRepository.updatePerson('p-1', {
        name: 'Rahul S.',
        phone: '+919999999999',
        notes: 'Updated note',
      });

      expect(updated.name).toBe('Rahul S.');
      expect(updated.phone).toBe('+919999999999');
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE splitwise_people SET'),
        expect.arrayContaining(['Rahul S.', '+919999999999', 'Updated note', 'p-1'])
      );
    });

    it('deletes a person by ID', async () => {
      await SplitwiseRepository.deletePerson('p-1');
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'DELETE FROM splitwise_people WHERE id = ?',
        ['p-1']
      );
    });
  });

  describe('Debts CRUD', () => {
    it('creates a debt successfully for an existing person', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({
        id: 'p-1',
        name: 'Amit',
        phone: null,
        notes: null,
        created_at: '2026-09-11T12:00:00.000Z',
      });

      const debt = await SplitwiseRepository.createDebt({
        personId: 'p-1',
        amount: 850,
        type: 'OWE_ME',
        description: 'Dinner at Punjabi Rasoi',
      });

      expect(debt.id).toBeDefined();
      expect(debt.personId).toBe('p-1');
      expect(debt.amount).toBe(850);
      expect(debt.type).toBe('OWE_ME');
      expect(debt.description).toBe('Dinner at Punjabi Rasoi');
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO splitwise_debts'),
        expect.arrayContaining(['p-1', 850, 'OWE_ME', 'Dinner at Punjabi Rasoi'])
      );
    });

    it('throws error when person does not exist', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce(null);

      await expect(
        SplitwiseRepository.createDebt({
          personId: 'unknown-id',
          amount: 500,
          type: 'OWE_ME',
          description: 'Movie ticket',
        })
      ).rejects.toThrow('Person with id unknown-id does not exist');
    });

    it('throws error for invalid debt amount or type', async () => {
      await expect(
        SplitwiseRepository.createDebt({
          personId: 'p-1',
          amount: -50,
          type: 'OWE_ME',
          description: 'Snacks',
        })
      ).rejects.toThrow('Debt amount must be a positive number');

      await expect(
        SplitwiseRepository.createDebt({
          personId: 'p-1',
          amount: 50,
          type: 'INVALID' as any,
          description: 'Snacks',
        })
      ).rejects.toThrow("Debt type must be either 'OWE_ME' or 'I_OWE'");
    });

    it('retrieves debts by person ID', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        {
          id: 'd-1',
          person_id: 'p-1',
          amount: 300,
          type: 'OWE_ME',
          description: 'Cab fare',
          created_at: '2026-09-11T10:00:00.000Z',
        },
      ]);

      const debts = await SplitwiseRepository.getDebtsByPersonId('p-1');
      expect(debts).toHaveLength(1);
      expect(debts[0].description).toBe('Cab fare');
      expect(debts[0].amount).toBe(300);
    });

    it('deletes a debt by ID', async () => {
      await SplitwiseRepository.deleteDebt('d-1');
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'DELETE FROM splitwise_debts WHERE id = ?',
        ['d-1']
      );
    });
  });

  describe('Settlements CRUD', () => {
    it('creates a settlement for an existing person', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({
        id: 'p-1',
        name: 'Amit',
        phone: null,
        notes: null,
        created_at: '2026-09-11T12:00:00.000Z',
      });

      const settlement = await SplitwiseRepository.createSettlement({
        personId: 'p-1',
        amount: 850,
        description: 'UPI transfer from GPay',
      });

      expect(settlement.id).toBeDefined();
      expect(settlement.personId).toBe('p-1');
      expect(settlement.amount).toBe(850);
      expect(settlement.description).toBe('UPI transfer from GPay');
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO splitwise_settlements'),
        expect.arrayContaining(['p-1', 850, 'UPI transfer from GPay'])
      );
    });

    it('deletes a settlement by ID', async () => {
      await SplitwiseRepository.deleteSettlement('s-1');
      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'DELETE FROM splitwise_settlements WHERE id = ?',
        ['s-1']
      );
    });
  });

  describe('Balance Calculations and Aggregations', () => {
    it('computes person balance summary accurately', async () => {
      // 1. Person lookup
      mockDb.getFirstAsync
        .mockResolvedValueOnce({
          id: 'p-1',
          name: 'Rohit Verma',
          phone: '9876543210',
          notes: null,
          created_at: '2026-09-01T00:00:00.000Z',
        })
        // 2. Debt stats
        .mockResolvedValueOnce({
          total_owed_to_me: 1500,
          total_i_owe: 300,
        })
        // 3. Settlement stats
        .mockResolvedValueOnce({
          total_settled: 500,
        });

      const summary = await SplitwiseRepository.getPersonBalance('p-1');
      expect(summary).not.toBeNull();
      expect(summary?.person.name).toBe('Rohit Verma');
      expect(summary?.totalOwedToMe).toBe(1500);
      expect(summary?.totalIOwe).toBe(300);
      expect(summary?.totalSettled).toBe(500);
      // Net balance: (1500 - 300) - 500 = 700 (Rohit still owes 700)
      expect(summary?.netBalance).toBe(700);
    });

    it('computes overall portfolio summary', async () => {
      mockDb.getFirstAsync
        .mockResolvedValueOnce({ count: 5 })
        .mockResolvedValueOnce({
          total_owed_to_me: 10000,
          total_i_owe: 4000,
        })
        .mockResolvedValueOnce({
          total_settled: 2000,
        });

      const overall = await SplitwiseRepository.getOverallSummary();
      expect(overall.peopleCount).toBe(5);
      expect(overall.totalOwedToMe).toBe(10000);
      expect(overall.totalIOwe).toBe(4000);
      expect(overall.totalSettled).toBe(2000);
      expect(overall.netBalance).toBe(4000);
    });

    it('retrieves unified person activity feed sorted chronologically', async () => {
      mockDb.getAllAsync.mockResolvedValueOnce([
        {
          id: 's-1',
          activity_type: 'settlement',
          person_id: 'p-1',
          person_name: 'Rohit',
          amount: 500,
          debt_type: null,
          description: 'GPay payment',
          created_at: '2026-09-10T15:00:00.000Z',
        },
        {
          id: 'd-1',
          activity_type: 'debt',
          person_id: 'p-1',
          person_name: 'Rohit',
          amount: 1500,
          debt_type: 'OWE_ME',
          description: 'Weekend trip Airbnb',
          created_at: '2026-09-08T10:00:00.000Z',
        },
      ]);

      const history = await SplitwiseRepository.getPersonActivityHistory('p-1');
      expect(history).toHaveLength(2);
      expect(history[0].activityType).toBe('settlement');
      expect(history[0].amount).toBe(500);
      expect(history[1].activityType).toBe('debt');
      expect(history[1].debtType).toBe('OWE_ME');
      expect(history[1].amount).toBe(1500);
    });
  });
});

import { BillService } from '../services/BillService';
import { BillsRepository } from '../database/bills.repository';
import { ReminderService } from '../services/ReminderService';
import { getDatabase } from '@/services/database';

jest.mock('@/services/database', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('../services/ReminderService', () => ({
  ReminderService: {
    scheduleBillReminder: jest.fn().mockResolvedValue(undefined),
    cancelBillReminder: jest.fn().mockResolvedValue(undefined),
    evaluateAllBillReminders: jest.fn().mockResolvedValue(0),
  },
}));

describe('BillService', () => {
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

  describe('Calculations', () => {
    it('calculates monthly normalized subscription costs correctly', () => {
      // Monthly
      expect(BillService.calculateMonthlyNormalizedCost(649, 'monthly')).toBe(649);
      // Quarterly (e.g. 1500 / 3 = 500)
      expect(BillService.calculateMonthlyNormalizedCost(1500, 'quarterly')).toBe(500);
      // Yearly (e.g. 6000 / 12 = 500)
      expect(BillService.calculateMonthlyNormalizedCost(6000, 'yearly')).toBe(500);
      // Weekly (e.g. 100 * 52 / 12 = 433.33)
      expect(BillService.calculateMonthlyNormalizedCost(100, 'weekly')).toBeCloseTo(433.33, 1);
    });

    it('calculates next recurrence dates accurately', () => {
      expect(BillService.calculateNextOccurrence('2026-05-10', 'monthly')).toBe('2026-06-10');
      expect(BillService.calculateNextOccurrence('2026-01-15', 'quarterly')).toBe('2026-04-15');
      expect(BillService.calculateNextOccurrence('2026-03-01', 'yearly')).toBe('2027-03-01');
      expect(BillService.calculateNextOccurrence('2026-05-10', 'weekly')).toBe('2026-05-17');
    });
  });

  describe('CRUD & Operations', () => {
    it('creates a bill and schedules reminder', async () => {
      const bill = await BillService.createBill({
        title: 'Electricity Bill',
        provider: 'BESCOM',
        category: 'electricity',
        amount: 1450,
        dueDate: '2026-10-15',
        reminderDays: 3,
        isRecurring: true,
        frequency: 'monthly',
      });

      expect(bill.id).toBeDefined();
      expect(bill.title).toBe('Electricity Bill');
      expect(bill.amount).toBe(1450);
      expect(bill.status).toBe('upcoming');
      expect(ReminderService.scheduleBillReminder).toHaveBeenCalledWith(bill);
    });

    it('marks recurring bill as paid and generates next cycle occurrence', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({
        id: 'bill-1',
        title: 'House Rent',
        provider: 'Landlord',
        category: 'rent',
        amount: 25000,
        min_amount: null,
        due_date: '2026-09-05',
        reminder_days: 3,
        status: 'upcoming',
        notes: 'Monthly rent',
        is_recurring: 1,
        frequency: 'monthly',
        last_paid_date: null,
        paid_transaction_id: null,
        payment_url: null,
        account_reference: 'Flat 402',
        source: 'manual',
        sms_id: null,
        created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z',
      });

      const result = await BillService.markBillPaid('bill-1', '2026-09-04');

      expect(result.updatedBill.status).toBe('paid');
      expect(result.updatedBill.lastPaidDate).toBe('2026-09-04');
      expect(result.nextBill).toBeDefined();
      expect(result.nextBill?.dueDate).toBe('2026-10-05');
      expect(result.nextBill?.status).toBe('upcoming');
      expect(ReminderService.cancelBillReminder).toHaveBeenCalledWith('bill-1');
      expect(ReminderService.scheduleBillReminder).toHaveBeenCalledWith(result.nextBill);
    });

    it('creates and manages subscriptions', async () => {
      const sub = await BillService.createSubscription({
        name: 'Netflix Premium',
        provider: 'Netflix',
        amount: 649,
        billingCycle: 'monthly',
        nextRenewalDate: '2026-10-20',
      });

      expect(sub.id).toBeDefined();
      expect(sub.name).toBe('Netflix Premium');
      expect(sub.amount).toBe(649);
      expect(sub.billingCycle).toBe('monthly');
      expect(sub.status).toBe('active');
    });
  });
});

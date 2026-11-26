import { BillService } from '../services/BillService';
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
      expect(BillService.calculateNextOccurrence('2026-01-31', 'monthly')).toBe('2026-02-28');
      expect(BillService.calculateNextOccurrence('2026-08-31', 'quarterly')).toBe('2026-11-30');
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

    describe('mergeOrInsertExternalBill Deduplication', () => {
      it('merges with existing manual bill without creating duplicate', async () => {
        // Mock existing manual bill in database
        mockDb.getAllAsync.mockResolvedValueOnce([
          {
            id: 'bill-manual-1',
            title: 'Electricity',
            provider: 'Electricity',
            category: 'electricity',
            amount: 1450,
            min_amount: null,
            due_date: '2026-10-15',
            status: 'upcoming',
            account_reference: null,
            payment_url: null,
            sms_id: null,
          },
        ]);

        mockDb.getFirstAsync
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'bill-manual-1',
            title: 'Electricity',
            provider: 'BESCOM',
            category: 'electricity',
            amount: 1450,
            due_date: '2026-10-15',
            status: 'upcoming',
            source: 'manual',
          });

        const result = await BillService.mergeOrInsertExternalBill({
          title: 'BESCOM',
          provider: 'BESCOM',
          category: 'electricity',
          amount: 1450,
          dueDate: '2026-10-15',
          source: 'sms',
          smsId: 'sms-bescom-1',
        });

        expect(result.isNew).toBe(false);
        expect(result.bill.id).toBe('bill-manual-1');
        expect(mockDb.runAsync).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE bills SET'),
          expect.anything()
        );
      });

      it('does not resurrect already paid bill as upcoming or overdue duplicate', async () => {
        mockDb.getAllAsync.mockResolvedValueOnce([
          {
            id: 'bill-paid-1',
            title: 'BESCOM',
            provider: 'BESCOM',
            category: 'electricity',
            amount: 1450,
            min_amount: null,
            due_date: '2026-10-15',
            status: 'paid',
            account_reference: null,
            payment_url: null,
            sms_id: null,
          },
        ]);

        mockDb.getFirstAsync
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: 'bill-paid-1',
            title: 'BESCOM',
            provider: 'BESCOM',
            category: 'electricity',
            amount: 1450,
            due_date: '2026-10-15',
            status: 'paid',
            source: 'manual',
          });

        const result = await BillService.mergeOrInsertExternalBill({
          title: 'BESCOM',
          provider: 'BESCOM',
          category: 'electricity',
          amount: 1450,
          dueDate: '2026-10-15',
          source: 'sms',
          smsId: 'sms-bescom-2',
        });

        expect(result.isNew).toBe(false);
        expect(result.bill.status).toBe('paid');
      });

      it('creates a new bill for next billing cycle when previous cycle was already paid', async () => {
        // Mock existing previous month bill (paid) with same account reference
        mockDb.getAllAsync
          .mockResolvedValueOnce([]) // candidates within ±30d
          .mockResolvedValueOnce([
            {
              id: 'bill-prev-paid',
              title: 'Airtel Broadband',
              provider: 'Airtel Xstream Fiber',
              category: 'internet',
              amount: 1178,
              min_amount: null,
              due_date: '2026-10-18',
              status: 'paid',
              account_reference: '08041234567',
              payment_url: null,
              sms_id: 'sms-prev',
            },
          ]);

        mockDb.getFirstAsync
          .mockResolvedValueOnce(null) // no sms_id match
          .mockResolvedValueOnce(null); // no prior payment tx match

        // New bill due in the future (December 2026)
        const result = await BillService.mergeOrInsertExternalBill({
          title: 'Airtel Xstream Fiber',
          provider: 'Airtel Xstream Fiber',
          category: 'internet',
          amount: 1178,
          dueDate: '2026-12-18',
          accountReference: '08041234567',
          source: 'sms',
          smsId: 'sms-dec',
        });

        expect(result.isNew).toBe(true);
        expect(result.bill.dueDate).toBe('2026-12-18');
        expect(result.bill.status).toBe('upcoming');
        expect(mockDb.runAsync).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO bills'),
          expect.anything()
        );
      });

      it('matches early payment 20 days prior to due date using tokenized merchant name', async () => {
        // Unpaid HDFC Credit Card bill due on 2026-10-25
        mockDb.getAllAsync.mockResolvedValueOnce([
          {
            id: 'bill-hdfc-unpaid',
            title: 'HDFC Bank Credit Card',
            provider: 'HDFC Bank Credit Card',
            amount: 18450,
            min_amount: 920,
            account_reference: 'Card ..4821',
          },
        ]);

        mockDb.getFirstAsync.mockResolvedValueOnce({
          id: 'bill-hdfc-unpaid',
          title: 'HDFC Bank Credit Card',
          provider: 'HDFC Bank Credit Card',
          category: 'credit_card',
          amount: 18450,
          due_date: '2026-10-25',
          status: 'upcoming',
        });

        // User pays on 2026-10-05 (20 days early) via CRED UPI
        const matched = await BillService.matchTransactionWithUnpaidBill(
          'UPI/CRED/HDFC/PAYMENT-4821',
          18450,
          '2026-10-05'
        );

        expect(matched).not.toBeNull();
        expect(matched?.id).toBe('bill-hdfc-unpaid');
      });
    });
  });
});

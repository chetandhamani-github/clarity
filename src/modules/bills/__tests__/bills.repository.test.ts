import { BillsRepository } from '../database/bills.repository';
import { getDatabase } from '@/services/database';

jest.mock('@/services/database', () => ({
  getDatabase: jest.fn(),
}));

describe('BillsRepository', () => {
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

  it('inserts bill into SQLite table', async () => {
    const bill = await BillsRepository.insertBill({
      title: 'Airtel Broadband',
      provider: 'Airtel',
      category: 'internet',
      amount: 1178,
      dueDate: '2026-10-18',
      reminderDays: 3,
      isRecurring: true,
      frequency: 'monthly',
      accountReference: 'DSL-12345',
      paymentUrl: 'https://airtel.in',
    });

    expect(bill.id).toBeDefined();
    expect(bill.title).toBe('Airtel Broadband');
    expect(bill.amount).toBe(1178);
    expect(bill.accountReference).toBe('DSL-12345');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO bills'),
      expect.arrayContaining(['Airtel Broadband', 'Airtel', 'internet', 1178, '2026-10-18'])
    );
  });

  it('deletes bill by id', async () => {
    await BillsRepository.deleteBill('bill-xyz');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'DELETE FROM bills WHERE id = ?',
      ['bill-xyz']
    );
  });

  it('purges dummy data and deduplicates existing bills', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      {
        id: 'dup-1',
        title: 'Electricity',
        provider: 'Electricity',
        category: 'electricity',
        amount: 1450,
        due_date: '2026-10-15',
        status: 'upcoming',
        account_reference: null,
        payment_url: null,
        sms_id: null,
      },
      {
        id: 'dup-2',
        title: 'BESCOM',
        provider: 'BESCOM Electricity',
        category: 'electricity',
        amount: 1450,
        due_date: '2026-10-15',
        status: 'upcoming',
        account_reference: null,
        payment_url: 'https://bescom.org',
        sms_id: 'sms-1',
      },
    ]);

    await BillsRepository.cleanupDummyData();
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM bills WHERE')
    );
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM subscriptions WHERE')
    );
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'DELETE FROM bills WHERE id = ?',
      ['dup-1']
    );
  });

  it('calculates summary statistics correctly', async () => {
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        {
          id: '1',
          title: 'Rent',
          provider: 'Landlord',
          category: 'rent',
          amount: 25000,
          due_date: '2026-09-05',
          status: 'paid',
          last_paid_date: '2026-09-05',
          reminder_days: 3,
          is_recurring: 1,
          frequency: 'monthly',
          source: 'manual',
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:00Z',
        },
        {
          id: '2',
          title: 'Power',
          provider: 'BESCOM',
          category: 'electricity',
          amount: 1450,
          due_date: '2026-09-20',
          status: 'upcoming',
          reminder_days: 3,
          is_recurring: 1,
          frequency: 'monthly',
          source: 'manual',
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:00Z',
        },
        {
          id: '3',
          title: 'Card',
          provider: 'HDFC',
          category: 'credit_card',
          amount: 5000,
          due_date: '2026-09-01',
          status: 'overdue',
          reminder_days: 3,
          is_recurring: 1,
          frequency: 'monthly',
          source: 'manual',
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:00Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'sub-1',
          name: 'Netflix',
          provider: 'Netflix',
          amount: 649,
          billing_cycle: 'monthly',
          next_renewal_date: '2026-09-15',
          category: 'subscription',
          status: 'active',
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:00Z',
        },
      ]);

    const summary = await BillsRepository.getSummary(9, 2026);

    expect(summary.paidCount).toBe(1);
    expect(summary.paidThisMonthAmount).toBe(25000);
    expect(summary.upcomingCount).toBe(1);
    expect(summary.overdueCount).toBe(1);
    expect(summary.overdueAmount).toBe(5000);
    expect(summary.monthlySubscriptionSpend).toBe(649);
    expect(summary.activeSubscriptionCount).toBe(1);
  });

  it('preserves anchorDay 31 across short months and prevents double markBillAsPaid', async () => {
    // Jan 31 bill paid -> Feb 28 (anchorDay kept at 31); then Feb 28 bill with anchorDay 31 -> Mar 31
    mockDb.getFirstAsync.mockResolvedValueOnce({
      id: 'bill-feb',
      title: 'Gym',
      provider: 'Cult',
      category: 'subscription',
      amount: 1500,
      due_date: '2026-02-28',
      reminder_days: 3,
      status: 'upcoming',
      is_recurring: 1,
      frequency: 'monthly',
      anchor_day: 31,
      source: 'manual',
      created_at: '2026-01-31T00:00:00Z',
      updated_at: '2026-01-31T00:00:00Z',
    });

    const res = await BillsRepository.markBillAsPaid('bill-feb', '2026-02-28');
    expect(res.nextBill?.dueDate).toBe('2026-03-31');
    expect(res.nextBill?.anchorDay).toBe(31);

    // Calling markBillAsPaid again on an already paid bill is an idempotent no-op
    mockDb.getFirstAsync.mockResolvedValueOnce({
      id: 'bill-feb',
      title: 'Gym',
      provider: 'Cult',
      category: 'subscription',
      amount: 1500,
      due_date: '2026-02-28',
      reminder_days: 3,
      status: 'paid',
      is_recurring: 1,
      frequency: 'monthly',
      anchor_day: 31,
      source: 'manual',
      created_at: '2026-01-31T00:00:00Z',
      updated_at: '2026-01-31T00:00:00Z',
    });

    const dup = await BillsRepository.markBillAsPaid('bill-feb', '2026-02-28');
    expect(dup.nextBill).toBeUndefined();
  });

  it('deduplicates concurrent markBillAsPaid calls so only one recurring cycle is created', async () => {
    mockDb.getFirstAsync.mockResolvedValue({
      id: 'bill-concurrent',
      title: 'Internet',
      provider: 'Jio',
      category: 'internet',
      amount: 999,
      due_date: '2026-10-15',
      reminder_days: 3,
      status: 'upcoming',
      is_recurring: 1,
      frequency: 'monthly',
      anchor_day: 15,
      source: 'manual',
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
    });

    const [first, second] = await Promise.all([
      BillsRepository.markBillAsPaid('bill-concurrent', '2026-10-15'),
      BillsRepository.markBillAsPaid('bill-concurrent', '2026-10-15'),
    ]);

    expect(first).toBe(second);
    const insertCalls = (mockDb.runAsync as jest.Mock).mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO bills')
    );
    expect(insertCalls).toHaveLength(1);
  });
});

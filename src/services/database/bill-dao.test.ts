import {
  insertBill,
  updateBill,
  deleteBill,
  markBillAsPaid,
  dismissBill,
  findMatchingUnpaidBill,
  getMonthlyBillSummary,
} from './bill-dao';
import { getDatabase } from './index';

jest.mock('./index', () => ({
  getDatabase: jest.fn(),
}));

describe('bill-dao', () => {
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      runAsync: jest.fn().mockResolvedValue({}),
      getAllAsync: jest.fn().mockResolvedValue([]),
      getFirstAsync: jest.fn().mockResolvedValue(null),
    };
    (getDatabase as jest.Mock).mockReturnValue(mockDb);
  });

  it('inserts manual bill reminder properly', async () => {
    const bill = await insertBill({
      source: 'MANUAL',
      billerName: 'House Rent',
      billerCategory: 'rent',
      amountDue: 25000,
      dueDate: '2026-10-05',
      repeatFrequency: 'monthly',
      reminderDaysBefore: 3,
    });

    expect(bill.id).toBeDefined();
    expect(bill.billerName).toBe('House Rent');
    expect(bill.billerCategory).toBe('rent');
    expect(bill.amountDue).toBe(25000);
    expect(bill.status).toBe('UNPAID');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO bill_reminders'),
      expect.arrayContaining(['MANUAL', 'House Rent', 'rent', 25000, '2026-10-05', 'monthly'])
    );
  });

  it('deletes bill by id', async () => {
    await deleteBill('bill-123');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      'DELETE FROM bill_reminders WHERE id = ?',
      ['bill-123']
    );
  });

  it('dismisses bill by setting status to DISMISSED', async () => {
    await dismissBill('bill-123');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      "UPDATE bill_reminders SET status = 'DISMISSED' WHERE id = ?",
      ['bill-123']
    );
  });

  it('marks one-time bill as PAID without creating next cycle', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({
      id: 'bill-1',
      source: 'SMS',
      biller_name: 'BESCOM',
      biller_category: 'electricity',
      amount_due: 1200,
      min_amount_due: null,
      due_date: '2026-09-25',
      repeat_frequency: 'one_time',
      status: 'UNPAID',
      reminder_days_before: 3,
      created_at: '2026-09-10T10:00:00Z',
    });

    const result = await markBillAsPaid('bill-1', '2026-09-22', 'tx-999');

    expect(result.updatedBill.status).toBe('PAID');
    expect(result.updatedBill.paidDate).toBe('2026-09-22');
    expect(result.updatedBill.paidTransactionId).toBe('tx-999');
    expect(result.nextBill).toBeUndefined();

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringMatching(/UPDATE bill_reminders\s+SET status = 'PAID'/),
      ['2026-09-22', 'tx-999', 'bill-1']
    );
  });

  it('marks monthly recurring bill as PAID and auto-schedules next cycle', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({
      id: 'bill-rent',
      source: 'MANUAL',
      biller_name: 'House Rent',
      biller_category: 'rent',
      amount_due: 25000,
      min_amount_due: null,
      due_date: '2026-09-05',
      repeat_frequency: 'monthly',
      status: 'UNPAID',
      reminder_days_before: 3,
      created_at: '2026-09-01T10:00:00Z',
    });

    const result = await markBillAsPaid('bill-rent', '2026-09-05');

    expect(result.updatedBill.status).toBe('PAID');
    expect(result.nextBill).toBeDefined();
    expect(result.nextBill?.dueDate).toBe('2026-10-05');
    expect(result.nextBill?.status).toBe('UNPAID');
    expect(result.nextBill?.billerName).toBe('House Rent');
  });

  it('finds matching unpaid bill for auto-settlement', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      {
        id: 'bill-airtel',
        source: 'SMS',
        biller_name: 'Airtel Xstream Fiber',
        biller_category: 'broadband',
        amount_due: 1178,
        min_amount_due: null,
        due_date: '2026-09-18',
        repeat_frequency: 'one_time',
        status: 'UNPAID',
        reminder_days_before: 3,
        created_at: '2026-09-05T10:00:00Z',
      },
    ]);

    const matched = await findMatchingUnpaidBill('Airtel', 1178, '2026-09-17');
    expect(matched).not.toBeNull();
    expect(matched?.id).toBe('bill-airtel');
    expect(matched?.billerName).toBe('Airtel Xstream Fiber');
  });

  it('calculates monthly bill summary correctly', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { amount_due: 25000, status: 'PAID' },
      { amount_due: 1200, status: 'UNPAID' },
      { amount_due: 800, status: 'OVERDUE' },
    ]);

    const summary = await getMonthlyBillSummary(9, 2026);
    expect(summary.month).toBe(9);
    expect(summary.year).toBe(2026);
    expect(summary.totalCommitted).toBe(27000);
    expect(summary.totalPaid).toBe(25000);
    expect(summary.totalPending).toBe(2000);
    expect(summary.totalOverdue).toBe(800);
    expect(summary.upcomingCount).toBe(2);
    expect(summary.paidCount).toBe(1);
  });
});

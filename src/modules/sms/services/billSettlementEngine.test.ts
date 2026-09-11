import { BillSettlementEngine } from './billSettlementEngine';
import { findMatchingUnpaidBill, markBillAsPaid } from '@/services/database/bill-dao';
import { insertNotification } from '@/services/database/notification-dao';

jest.mock('@/services/database/bill-dao', () => ({
  findMatchingUnpaidBill: jest.fn(),
  markBillAsPaid: jest.fn(),
}));

jest.mock('@/services/database/notification-dao', () => ({
  insertNotification: jest.fn().mockResolvedValue(undefined),
}));

describe('BillSettlementEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ignores income transactions', async () => {
    const res = await BillSettlementEngine.settleBillsForTransaction({
      id: 'tx-inc',
      merchant: 'Company Salary',
      amount: 85000,
      type: 'income',
      date: '2026-09-01',
      category: 'Salary',
    });

    expect(res.settled).toBe(false);
    expect(findMatchingUnpaidBill).not.toHaveBeenCalled();
  });

  it('matches expense transaction and marks unpaid bill as paid', async () => {
    (findMatchingUnpaidBill as jest.Mock).mockResolvedValueOnce({
      id: 'bill-bescom',
      billerName: 'BESCOM',
      billerCategory: 'electricity',
      amountDue: 1450,
      dueDate: '2026-09-25',
      status: 'UNPAID',
    });

    (markBillAsPaid as jest.Mock).mockResolvedValueOnce({
      updatedBill: {
        id: 'bill-bescom',
        billerName: 'BESCOM',
        billerCategory: 'electricity',
        amountDue: 1450,
        dueDate: '2026-09-25',
        status: 'PAID',
        paidDate: '2026-09-22',
        paidTransactionId: 'tx-bescom',
      },
    });

    const res = await BillSettlementEngine.settleBillsForTransaction({
      id: 'tx-bescom',
      merchant: 'BESCOM Electricity Bill Pay',
      amount: 1450,
      type: 'expense',
      date: '2026-09-22',
      category: 'Bills & Utilities',
    });

    expect(res.settled).toBe(true);
    expect(markBillAsPaid).toHaveBeenCalledWith('bill-bescom', '2026-09-22', 'tx-bescom');
    expect(insertNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Bill Paid',
        actionUrl: '/(app)/bills',
      })
    );
  });

  it('returns settled false if no matching unpaid bill is found', async () => {
    (findMatchingUnpaidBill as jest.Mock).mockResolvedValueOnce(null);

    const res = await BillSettlementEngine.settleBillsForTransaction({
      id: 'tx-random',
      merchant: 'Swiggy',
      amount: 350,
      type: 'expense',
      date: '2026-09-15',
      category: 'Food',
    });

    expect(res.settled).toBe(false);
    expect(markBillAsPaid).not.toHaveBeenCalled();
  });
});

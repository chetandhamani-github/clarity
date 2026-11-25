import { mmkv } from '@/lib/storage';
import { getNotifications, insertNotification } from '@/services/database/notification-dao';
import { BillsRepository } from '../database/bills.repository';
import { ReminderService } from '../services/ReminderService';
import type { Bill } from '../types/bill.types';

jest.mock('../database/bills.repository', () => ({
  BillsRepository: {
    getUpcomingBills: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/services/database/notification-dao', () => ({
  getNotifications: jest.fn().mockResolvedValue([]),
  insertNotification: jest.fn().mockResolvedValue(undefined),
}));

function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'bill-1',
    title: 'Electricity Bill',
    provider: 'BESCOM',
    category: 'electricity',
    amount: 1450,
    dueDate: '2026-11-27',
    reminderDays: 3,
    status: 'upcoming',
    isRecurring: true,
    frequency: 'monthly',
    source: 'manual',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    ...overrides,
  };
}

describe('ReminderService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mmkv.clearAll();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('alerts once per stage even if notifications table is cleared', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 10, 25, 10, 0, 0));

    (BillsRepository.getUpcomingBills as jest.Mock).mockResolvedValue([makeBill()]);
    (getNotifications as jest.Mock).mockResolvedValue([]);

    // 1. First evaluation -> sends due_soon
    const count1 = await ReminderService.evaluateAllBillReminders();
    expect(count1).toBe(1);
    expect(insertNotification).toHaveBeenCalledTimes(1);

    // 2. User clears in-app notifications and resumes app >24h later (still before due date)
    jest.setSystemTime(new Date(2026, 10, 26, 12, 0, 0));
    (getNotifications as jest.Mock).mockResolvedValue([]);

    const count2 = await ReminderService.evaluateAllBillReminders();
    expect(count2).toBe(0);
    expect(insertNotification).toHaveBeenCalledTimes(1);

    // 3. On actual due date -> fires due_today once
    jest.setSystemTime(new Date(2026, 10, 27, 9, 5, 0));
    const count3 = await ReminderService.evaluateAllBillReminders();
    expect(count3).toBe(1);
    expect(insertNotification).toHaveBeenCalledTimes(2);
    expect(insertNotification).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: 'Bill Due Today: BESCOM',
      })
    );

    // 4. Subsequent runs on due date do not re-fire
    const count4 = await ReminderService.evaluateAllBillReminders();
    expect(count4).toBe(0);
    expect(insertNotification).toHaveBeenCalledTimes(2);
  });

  it('skips bills overdue by more than 14 days', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 10, 25, 10, 0, 0));

    (BillsRepository.getUpcomingBills as jest.Mock).mockResolvedValue([
      makeBill({
        id: 'bill-ancient',
        dueDate: '2026-11-01',
        status: 'overdue',
      }),
    ]);

    const count = await ReminderService.evaluateAllBillReminders();
    expect(count).toBe(0);
    expect(insertNotification).not.toHaveBeenCalled();
  });

  it('does not double-alert between scheduleBillReminder and evaluateAllBillReminders', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 10, 25, 10, 0, 0));

    const bill = makeBill({ dueDate: '2026-11-26' });
    (BillsRepository.getUpcomingBills as jest.Mock).mockResolvedValue([bill]);

    await ReminderService.scheduleBillReminder(bill);
    expect(insertNotification).toHaveBeenCalledTimes(1);

    const count = await ReminderService.evaluateAllBillReminders();
    expect(count).toBe(0);
    expect(insertNotification).toHaveBeenCalledTimes(1);
  });
});

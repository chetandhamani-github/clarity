import { BillsRepository } from '@/modules/bills/database/bills.repository';
import { getAllAccounts } from '@/services/database/account-dao';
import { getGoals } from '@/services/database/goal-dao';
import { RemindersRepository } from '../database/reminders.repository';
import { ReminderScheduler } from '../services/ReminderScheduler';
import { RemindersService } from '../services/RemindersService';

jest.mock('../database/reminders.repository', () => ({
  RemindersRepository: {
    getAllReminders: jest.fn().mockResolvedValue([]),
    insertReminder: jest.fn(),
    updateReminder: jest.fn(),
    markReminderCompleted: jest.fn(),
    snoozeReminder: jest.fn(),
    deleteReminder: jest.fn(),
  },
}));

jest.mock('../services/ReminderScheduler', () => ({
  ReminderScheduler: {
    scheduleReminder: jest.fn().mockResolvedValue(undefined),
    cancelReminder: jest.fn().mockResolvedValue(undefined),
  },
  parseTimeHm: jest.requireActual('../services/ReminderScheduler').parseTimeHm,
}));

jest.mock('@/modules/bills/database/bills.repository', () => ({
  BillsRepository: {
    getUpcomingBills: jest.fn().mockResolvedValue([]),
    getAllSubscriptions: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/services/database/account-dao', () => ({
  getAllAccounts: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/services/database/goal-dao', () => ({
  getGoals: jest.fn().mockResolvedValue([]),
}));

describe('RemindersService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 10, 27, 10, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates custom reminder and schedules native trigger', async () => {
    const created = {
      id: 'rem-tax',
      title: 'File Advance Tax',
      notes: 'Check Form 26AS',
      category: 'tax' as const,
      amount: 12000,
      remindAtDate: '2026-12-15',
      remindAtTime: '09:30',
      repeatRule: 'none' as const,
      advanceDays: 2,
      status: 'pending' as const,
      createdAt: '2026-11-27T00:00:00Z',
      updatedAt: '2026-11-27T00:00:00Z',
    };
    (RemindersRepository.insertReminder as jest.Mock).mockResolvedValueOnce(created);

    const res = await RemindersService.createReminder({
      title: 'File Advance Tax',
      remindAtDate: '2026-12-15',
      remindAtTime: '09:30',
    });

    expect(res).toEqual(created);
    expect(ReminderScheduler.scheduleReminder).toHaveBeenCalledWith(created);
  });

  it('builds sorted unified feed from custom reminders, bills, subscriptions, cards, and goals', async () => {
    (RemindersRepository.getAllReminders as jest.Mock).mockResolvedValueOnce([
      {
        id: 'r-overdue',
        title: 'Cancel OTT Trial',
        notes: 'Before auto-renew',
        category: 'trial',
        amount: 499,
        remindAtDate: '2026-11-25',
        remindAtTime: '10:00',
        repeatRule: 'none',
        advanceDays: 0,
        status: 'pending',
        createdAt: '2026-11-20T00:00:00Z',
        updatedAt: '2026-11-20T00:00:00Z',
      },
      {
        id: 'r-done',
        title: 'Already Done',
        notes: '',
        category: 'general',
        remindAtDate: '2026-11-20',
        remindAtTime: '09:00',
        repeatRule: 'none',
        advanceDays: 0,
        status: 'completed',
        completedAt: '2026-11-20T11:00:00Z',
        createdAt: '2026-11-18T00:00:00Z',
        updatedAt: '2026-11-20T11:00:00Z',
      },
    ]);

    (BillsRepository.getUpcomingBills as jest.Mock).mockResolvedValueOnce([
      {
        id: 'b1',
        title: 'Electricity',
        provider: 'BESCOM',
        category: 'electricity',
        amount: 1450,
        dueDate: '2026-11-29',
        reminderDays: 3,
        status: 'upcoming',
        isRecurring: true,
        frequency: 'monthly',
        source: 'manual',
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      },
    ]);

    (BillsRepository.getAllSubscriptions as jest.Mock).mockResolvedValueOnce([
      {
        id: 's1',
        name: 'Spotify',
        provider: 'Spotify',
        amount: 179,
        billingCycle: 'monthly',
        nextRenewalDate: '2026-11-30',
        category: 'subscription',
        status: 'active',
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      },
    ]);

    (getAllAccounts as jest.Mock).mockResolvedValueOnce([
      {
        id: 'cc1',
        name: 'HDFC Regalia',
        type: 'credit',
        balance: -8200,
        institution: 'HDFC',
        lastFour: '4422',
        dueDay: 28,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);

    (getGoals as jest.Mock).mockResolvedValueOnce([
      {
        id: 'g1',
        name: 'Laptop Fund',
        icon: 'laptop',
        targetAmount: 80000,
        currentAmount: 50000,
        targetDate: '2026-12-05',
        autoSaveAmount: 0,
        category: 'Tech',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);

    const feed = await RemindersService.getUnifiedFeed(45, '09:30');

    expect(feed.completedReminders).toHaveLength(1);
    expect(feed.unifiedUpcoming.map((i) => i.sourceKind)).toEqual([
      'custom',
      'credit_card',
      'bill',
      'subscription',
      'goal',
    ]);
    expect(feed.unifiedUpcoming[0].isOverdue).toBe(true);
    expect(feed.unifiedUpcoming[1].remindTime).toBe('09:30');
  });
});

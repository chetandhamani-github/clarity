import { BillsRepository } from '@/modules/bills/database/bills.repository';
import { getAllAccounts } from '@/services/database/account-dao';
import { getGoals } from '@/services/database/goal-dao';
import { BillAlertEngine } from '@/services/notifications/bill-alert-engine';
import { useAppStore } from '@/store/use-app-store';
import { RemindersRepository } from '../database/reminders.repository';
import {
  buildTriggerDateForReminder,
  REMINDER_TRIGGER_PREFIXES,
  ReminderScheduler,
} from '../services/ReminderScheduler';

const mockScheduleNotificationAsync = jest.fn().mockResolvedValue('notif-id');
const mockCancelScheduledNotificationAsync = jest.fn().mockResolvedValue(undefined);
const mockGetAllScheduledNotificationsAsync = jest.fn().mockResolvedValue([]);
const mockCancelAllScheduledNotificationsAsync = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: {
    DATE: 'date',
    DAILY: 'daily',
  },
  scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotificationAsync(...args),
  cancelScheduledNotificationAsync: (...args: unknown[]) =>
    mockCancelScheduledNotificationAsync(...args),
  getAllScheduledNotificationsAsync: (...args: unknown[]) =>
    mockGetAllScheduledNotificationsAsync(...args),
  cancelAllScheduledNotificationsAsync: (...args: unknown[]) =>
    mockCancelAllScheduledNotificationsAsync(...args),
}));

jest.mock('../database/reminders.repository', () => ({
  RemindersRepository: {
    getActiveReminders: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/modules/bills/database/bills.repository', () => ({
  BillsRepository: {
    getAllSubscriptions: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/services/database/account-dao', () => ({
  getAllAccounts: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/services/database/goal-dao', () => ({
  getGoals: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/services/notifications/bill-alert-engine', () => ({
  BillAlertEngine: {
    syncAllNativeBillReminders: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('ReminderScheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 10, 27, 10, 0, 0));

    useAppStore.setState({
      defaultReminderTime: '09:30',
      dailyPulseEnabled: false,
      dailyPulseTime: '20:15',
      billRemindersEnabled: true,
      cardDueAlertsEnabled: true,
      goalRemindersEnabled: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('computes trigger dates honoring advanceDays and snooze timestamps', () => {
    const futureAdvance = buildTriggerDateForReminder(
      {
        id: 'r1',
        title: 'Tax Filing',
        notes: '',
        category: 'tax',
        remindAtDate: '2026-12-05',
        remindAtTime: '11:00',
        repeatRule: 'none',
        advanceDays: 2,
        status: 'pending',
        createdAt: '',
        updatedAt: '',
      },
      new Date(2026, 10, 27, 10, 0, 0).getTime()
    );
    expect(futureAdvance).toEqual(new Date(2026, 11, 3, 11, 0, 0, 0));

    const snoozed = buildTriggerDateForReminder(
      {
        id: 'r2',
        title: 'Snoozed',
        notes: '',
        category: 'general',
        remindAtDate: '2026-11-26',
        remindAtTime: '09:00',
        repeatRule: 'none',
        advanceDays: 0,
        status: 'snoozed',
        snoozeUntil: new Date(2026, 10, 28, 14, 0, 0, 0).toISOString(),
        createdAt: '',
        updatedAt: '',
      },
      new Date(2026, 10, 27, 10, 0, 0).getTime()
    );
    expect(snoozed).toEqual(new Date(2026, 10, 28, 14, 0, 0, 0));
  });

  it('syncs custom, subscription, credit card, goal, and Daily Pulse schedules using prefix cancellation', async () => {
    useAppStore.setState({ dailyPulseEnabled: true });

    mockGetAllScheduledNotificationsAsync.mockResolvedValueOnce([
      { identifier: `${REMINDER_TRIGGER_PREFIXES.CUSTOM}stale` },
      { identifier: `${REMINDER_TRIGGER_PREFIXES.BILL}keep-bill` },
    ]);

    (RemindersRepository.getActiveReminders as jest.Mock).mockResolvedValueOnce([
      {
        id: 'custom-1',
        title: 'Cancel Prime Trial',
        notes: 'Check Amazon',
        category: 'trial',
        amount: 299,
        remindAtDate: '2026-11-29',
        remindAtTime: '10:30',
        repeatRule: 'none',
        advanceDays: 0,
        status: 'pending',
        createdAt: '',
        updatedAt: '',
      },
    ]);

    (BillsRepository.getAllSubscriptions as jest.Mock).mockResolvedValueOnce([
      {
        id: 'sub-1',
        name: 'Netflix',
        amount: 649,
        billingCycle: 'monthly',
        nextRenewalDate: '2026-11-30',
        status: 'active',
      },
    ]);

    (getAllAccounts as jest.Mock).mockResolvedValueOnce([
      {
        id: 'acc-1',
        name: 'ICICI Amazon',
        type: 'credit',
        balance: -4500,
        dueDay: 29,
      },
    ]);

    (getGoals as jest.Mock).mockResolvedValueOnce([
      {
        id: 'goal-1',
        name: 'Emergency Fund',
        targetAmount: 100000,
        currentAmount: 40000,
        targetDate: '2026-12-04',
      },
    ]);

    await ReminderScheduler.syncAll();

    expect(BillAlertEngine.syncAllNativeBillReminders).toHaveBeenCalledTimes(1);
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith(
      `${REMINDER_TRIGGER_PREFIXES.CUSTOM}stale`
    );
    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalledWith(
      `${REMINDER_TRIGGER_PREFIXES.BILL}keep-bill`
    );
    // 4 date items + 1 repeating daily pulse
    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(5);
    expect(mockScheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: REMINDER_TRIGGER_PREFIXES.DAILY_PULSE,
        trigger: expect.objectContaining({
          type: 'daily',
          hour: 20,
          minute: 15,
        }),
      })
    );
  });

  it('caps rolling scheduled notifications to respect Android alarm quotas', async () => {
    const manyReminders = Array.from({ length: 60 }, (_, idx) => ({
      id: `rem-${idx}`,
      title: `Task ${idx}`,
      notes: '',
      category: 'general' as const,
      remindAtDate: '2026-12-01',
      remindAtTime: '09:00',
      repeatRule: 'none' as const,
      advanceDays: 0,
      status: 'pending' as const,
      createdAt: '',
      updatedAt: '',
    }));
    (RemindersRepository.getActiveReminders as jest.Mock).mockResolvedValueOnce(manyReminders);

    await ReminderScheduler.syncAll();

    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(45);
  });
});

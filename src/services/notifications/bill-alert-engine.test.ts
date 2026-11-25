import { mmkv } from '@/lib/storage';
import { BillsRepository } from '@/modules/bills/database/bills.repository';
import { BillAlertEngine } from './bill-alert-engine';
import { getBillSnoozeUntil } from './reminder-state';

const mockScheduleNotificationAsync = jest.fn().mockResolvedValue('notif-id');
const mockCancelScheduledNotificationAsync = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: {
    DATE: 'date',
  },
  scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotificationAsync(...args),
  cancelScheduledNotificationAsync: (...args: unknown[]) =>
    mockCancelScheduledNotificationAsync(...args),
}));

jest.mock('@/modules/bills/database/bills.repository', () => ({
  BillsRepository: {
    getUpcomingBills: jest.fn().mockResolvedValue([]),
  },
}));

describe('BillAlertEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mmkv.clearAll();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('schedules future bill reminders using typed date trigger input', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 10, 20, 10, 0, 0));

    await BillAlertEngine.scheduleNativeBillReminder({
      id: 'bill-future',
      billerName: 'BESCOM',
      amountDue: 1450,
      dueDate: '2026-11-28',
      reminderDaysBefore: 3,
      status: 'upcoming',
    });

    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mockScheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: 'bill-reminder-bill-future',
        trigger: expect.objectContaining({
          type: 'date',
          date: new Date(2026, 10, 25, 9, 0, 0, 0),
        }),
      })
    );
  });

  it('does not re-schedule a 10-second loop when past 9 AM on the due date', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 10, 25, 18, 30, 0));

    await BillAlertEngine.scheduleNativeBillReminder({
      id: 'bill-today-late',
      billerName: 'Airtel',
      amountDue: 999,
      dueDate: '2026-11-25',
      reminderDaysBefore: 3,
      status: 'upcoming',
    });

    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules once for 9 AM on due date when reminder window already started before today', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 10, 25, 18, 30, 0));

    await BillAlertEngine.scheduleNativeBillReminder({
      id: 'bill-tomorrow',
      billerName: 'JioFiber',
      amountDue: 1178,
      dueDate: '2026-11-26',
      reminderDaysBefore: 3,
      status: 'upcoming',
    });

    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mockScheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: expect.objectContaining({
          type: 'date',
          date: new Date(2026, 10, 26, 9, 0, 0, 0),
        }),
      })
    );
  });

  it('does not redundantly cancel and reschedule when sync runs repeatedly', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 10, 20, 10, 0, 0));

    (BillsRepository.getUpcomingBills as jest.Mock).mockResolvedValue([
      {
        id: 'bill-sync-1',
        title: 'Water Bill',
        provider: 'BWSSB',
        category: 'water',
        amount: 500,
        dueDate: '2026-11-28',
        reminderDays: 3,
        status: 'upcoming',
        isRecurring: false,
        frequency: 'one_time',
        source: 'manual',
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      },
    ]);

    await BillAlertEngine.syncAllNativeBillReminders();
    await BillAlertEngine.syncAllNativeBillReminders();

    expect(mockScheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('preserves active snooze when syncAllNativeBillReminders runs', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 10, 20, 10, 0, 0));

    await BillAlertEngine.snoozeNativeBillReminder(
      {
        id: 'bill-snooze-1',
        billerName: 'HDFC Card',
        amountDue: 15000,
        dueDate: '2026-11-25',
      },
      3
    );

    expect(getBillSnoozeUntil('bill-snooze-1')).not.toBeNull();
    mockScheduleNotificationAsync.mockClear();
    mockCancelScheduledNotificationAsync.mockClear();

    (BillsRepository.getUpcomingBills as jest.Mock).mockResolvedValue([
      {
        id: 'bill-snooze-1',
        title: 'HDFC Card',
        provider: 'HDFC Card',
        category: 'credit_card',
        amount: 15000,
        dueDate: '2026-11-25',
        reminderDays: 7,
        status: 'upcoming',
        isRecurring: false,
        frequency: 'one_time',
        source: 'manual',
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-01T00:00:00Z',
      },
    ]);

    await BillAlertEngine.syncAllNativeBillReminders();

    expect(mockCancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

import { getDatabase } from '@/services/database';
import {
  calculateNextReminderDate,
  RemindersRepository,
} from '../database/reminders.repository';

jest.mock('@/services/database', () => ({
  getDatabase: jest.fn(),
}));

describe('RemindersRepository', () => {
  let mockDb: {
    execAsync: jest.Mock;
    runAsync: jest.Mock;
    getAllAsync: jest.Mock;
    getFirstAsync: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    RemindersRepository.resetSchemaCache();
    mockDb = {
      execAsync: jest.fn().mockResolvedValue(undefined),
      runAsync: jest.fn().mockResolvedValue(undefined),
      getAllAsync: jest.fn().mockResolvedValue([]),
      getFirstAsync: jest.fn().mockResolvedValue(null),
    };
    (getDatabase as jest.Mock).mockReturnValue(mockDb);
  });

  it('calculates next recurring dates accurately including month-end clamping', () => {
    expect(calculateNextReminderDate('2026-11-27', 'daily')).toBe('2026-11-28');
    expect(calculateNextReminderDate('2026-11-27', 'weekly')).toBe('2026-12-04');
    expect(calculateNextReminderDate('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(calculateNextReminderDate('2026-08-31', 'quarterly')).toBe('2026-11-30');
    expect(calculateNextReminderDate('2026-03-01', 'yearly')).toBe('2027-03-01');
  });

  it('inserts a custom reminder with normalized defaults and time', async () => {
    const reminder = await RemindersRepository.insertReminder({
      title: 'Advance Tax Q3',
      category: 'tax',
      amount: 15000,
      remindAtDate: '2026-12-15',
      remindAtTime: '9:05',
      repeatRule: 'quarterly',
      advanceDays: 3,
      notes: 'Income tax portal',
    });

    expect(reminder.id).toBeDefined();
    expect(reminder.title).toBe('Advance Tax Q3');
    expect(reminder.remindAtTime).toBe('09:05');
    expect(reminder.status).toBe('pending');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO reminders'),
      expect.arrayContaining([
        reminder.id,
        'Advance Tax Q3',
        'Income tax portal',
        'tax',
        15000,
        '2026-12-15',
        '09:05',
        'quarterly',
        3,
      ])
    );
  });

  it('marks recurring reminder completed and creates the next occurrence', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({
      id: 'rem-1',
      title: 'Review Monthly Budget',
      notes: '',
      category: 'general',
      amount: null,
      remind_at_date: '2026-11-28',
      remind_at_time: '19:30',
      repeat_rule: 'monthly',
      advance_days: 0,
      status: 'pending',
      snooze_until: null,
      linked_type: null,
      linked_id: null,
      completed_at: null,
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
    });

    const result = await RemindersRepository.markReminderCompleted('rem-1');

    expect(result.completed.status).toBe('completed');
    expect(result.nextReminder).toBeDefined();
    expect(result.nextReminder?.remindAtDate).toBe('2026-12-28');
    expect(result.nextReminder?.remindAtTime).toBe('19:30');
    expect(result.nextReminder?.status).toBe('pending');
  });

  it('advances overdue recurring habit reminder to a non-past occurrence when completed', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 10, 27, 10, 0, 0));

    mockDb.getFirstAsync.mockResolvedValueOnce({
      id: 'rem-daily-overdue',
      title: 'Log daily expenses',
      notes: '',
      category: 'daily_log',
      amount: null,
      remind_at_date: '2026-11-20',
      remind_at_time: '20:00',
      repeat_rule: 'daily',
      advance_days: 0,
      status: 'pending',
      snooze_until: null,
      linked_type: null,
      linked_id: null,
      completed_at: null,
      created_at: '2026-11-19T00:00:00Z',
      updated_at: '2026-11-19T00:00:00Z',
    });

    const result = await RemindersRepository.markReminderCompleted('rem-daily-overdue');
    jest.useRealTimers();

    expect(result.nextReminder?.remindAtDate).toBe('2026-11-27');
  });

  it('expires elapsed snoozes before listing reminders', async () => {
    await RemindersRepository.getAllReminders();

    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'pending', snooze_until = NULL"),
      expect.any(Array)
    );
  });
});


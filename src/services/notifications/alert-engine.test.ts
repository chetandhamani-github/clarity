import { mmkv } from '@/lib/storage';
import { getDatabase } from '@/services/database';
import { insertNotification } from '@/services/database/notification-dao';
import { ReminderService } from '@/modules/bills/services/ReminderService';
import { BillAlertEngine } from './bill-alert-engine';
import {
  checkUpcomingBillReminders,
  resetBillReminderCheckCooldown,
} from './alert-engine';

jest.mock('@/services/database', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('@/services/database/notification-dao', () => ({
  insertNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/modules/bills/services/ReminderService', () => ({
  ReminderService: {
    evaluateAllBillReminders: jest.fn().mockResolvedValue(0),
  },
}));

jest.mock('./bill-alert-engine', () => ({
  BillAlertEngine: {
    evaluateUpcomingBillAlerts: jest.fn().mockResolvedValue(0),
    syncAllNativeBillReminders: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('checkUpcomingBillReminders', () => {
  let mockDb: {
    getAllAsync: jest.Mock;
    getFirstAsync: jest.Mock;
    runAsync: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mmkv.clearAll();
    resetBillReminderCheckCooldown();
    mockDb = {
      getAllAsync: jest.fn().mockResolvedValue([]),
      getFirstAsync: jest.fn().mockResolvedValue(null),
      runAsync: jest.fn().mockResolvedValue(undefined),
    };
    (getDatabase as jest.Mock).mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('evaluates modern ReminderService once without invoking legacy duplicate alert evaluator', async () => {
    await checkUpcomingBillReminders({ force: true });

    expect(ReminderService.evaluateAllBillReminders).toHaveBeenCalledTimes(1);
    expect(BillAlertEngine.evaluateUpcomingBillAlerts).not.toHaveBeenCalled();
    expect(BillAlertEngine.syncAllNativeBillReminders).toHaveBeenCalledTimes(1);
  });

  it('throttles rapid consecutive calls within the cooldown window', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 10, 25, 10, 0, 0));

    await checkUpcomingBillReminders();
    await checkUpcomingBillReminders();

    expect(ReminderService.evaluateAllBillReminders).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(61 * 1000);
    await checkUpcomingBillReminders();

    expect(ReminderService.evaluateAllBillReminders).toHaveBeenCalledTimes(2);
  });

  it('alerts only once per recurring, subscription, and credit card billing cycle', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 10, 25, 10, 0, 0));

    mockDb.getAllAsync
      // recurring_transactions
      .mockResolvedValueOnce([
        {
          id: 'rec-1',
          merchant: 'House Rent',
          amount: 25000,
          next_process_date: '2026-11-27',
        },
      ])
      // subscriptions
      .mockResolvedValueOnce([
        {
          id: 'sub-1',
          name: 'Netflix',
          amount: 649,
          next_renewal_date: '2026-11-27',
        },
      ])
      // credit accounts
      .mockResolvedValueOnce([
        {
          id: 'acc-cc-1',
          name: 'HDFC Regalia',
          type: 'credit',
          balance: -18000,
          credit_limit: 100000,
          due_day: 27,
        },
      ]);

    await checkUpcomingBillReminders({ force: true });
    expect(insertNotification).toHaveBeenCalledTimes(3);

    // 3 days later? No, 1 day later with cleared DB -> still suppressed for same cycle
    jest.setSystemTime(new Date(2026, 10, 26, 10, 0, 0));
    mockDb.getAllAsync
      .mockResolvedValueOnce([
        {
          id: 'rec-1',
          merchant: 'House Rent',
          amount: 25000,
          next_process_date: '2026-11-27',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'sub-1',
          name: 'Netflix',
          amount: 649,
          next_renewal_date: '2026-11-27',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'acc-cc-1',
          name: 'HDFC Regalia',
          type: 'credit',
          balance: -18000,
          credit_limit: 100000,
          due_day: 27,
        },
      ]);

    await checkUpcomingBillReminders({ force: true });
    expect(insertNotification).toHaveBeenCalledTimes(3);
  });
});

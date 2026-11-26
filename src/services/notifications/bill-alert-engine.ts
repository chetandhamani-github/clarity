import { BillsRepository } from '@/modules/bills/database/bills.repository';
import { formatCurrency } from '@/utils/format';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
} from '@/services/notifications/system-notification';
import {
  clearAllReminderState,
  clearReminderStateForBill,
  getBillSnoozeUntil,
  getScheduledBillTrigger,
  setBillSnoozeUntil,
  setScheduledBillTrigger,
} from '@/services/notifications/reminder-state';

interface ExpoNotificationsModule {
  SchedulableTriggerInputTypes?: {
    DATE?: string;
  };
  scheduleNotificationAsync?: (request: {
    identifier?: string;
    content: Record<string, unknown>;
    trigger: Record<string, unknown> | null;
  }) => Promise<string>;
  cancelScheduledNotificationAsync?: (identifier: string) => Promise<void>;
  cancelAllScheduledNotificationsAsync?: () => Promise<void>;
  dismissAllNotificationsAsync?: () => Promise<void>;
}

let Notifications: ExpoNotificationsModule | null = null;
try {
  Notifications = require('expo-notifications') as ExpoNotificationsModule;
} catch {
  // Graceful fallback for test/headless environments
}

export interface SchedulableBill {
  id: string;
  billerName: string;
  amountDue: number;
  dueDate: string;
  reminderDaysBefore?: number;
  status?: string;
}

export class BillAlertEngine {
  /**
   * Evaluates all upcoming and overdue bills via the unified ReminderService.
   */
  public static async evaluateUpcomingBillAlerts(): Promise<number> {
    try {
      const { ReminderService } = await import('@/modules/bills/services/ReminderService');
      return await ReminderService.evaluateAllBillReminders();
    } catch {
      return 0;
    }
  }

  /**
   * Schedules a native system notification trigger for an upcoming bill reminder.
   * Fires at 9:00 AM local time on the reminder target date (or due date if already inside the window).
   * Preserves active snoozes and avoids redundant rescheduling or past-due 10s loops.
   */
  public static async scheduleNativeBillReminder(bill: SchedulableBill): Promise<void> {
    if (!Notifications || typeof Notifications.scheduleNotificationAsync !== 'function') {
      return;
    }

    const normalizedStatus = bill.status?.toUpperCase();
    const isSettled = normalizedStatus === 'PAID' || normalizedStatus === 'DISMISSED';
    if (isSettled) {
      await this.cancelNativeBillReminder(bill.id);
      return;
    }
    if (!bill.dueDate) return;

    try {
      const now = new Date();
      const nowMs = now.getTime();

      // Do not overwrite an active user snooze during foreground syncs
      const snoozeUntil = getBillSnoozeUntil(bill.id, nowMs);
      if (snoozeUntil !== null) {
        return;
      }

      const [bYear, bMonth, bDay] = bill.dueDate.split('-').map(Number);
      if (!bYear || !bMonth || !bDay) return;

      const reminderDays = bill.reminderDaysBefore ?? 1;
      // 9:00 AM on reminder target date
      const targetDate = new Date(bYear, bMonth - 1, bDay, 9, 0, 0, 0);
      targetDate.setDate(targetDate.getDate() - reminderDays);

      // 9:00 AM on the actual due date
      const dueNineAm = new Date(bYear, bMonth - 1, bDay, 9, 0, 0, 0);

      let nextTrigger: Date | null = null;
      if (targetDate.getTime() > nowMs) {
        nextTrigger = targetDate;
      } else if (dueNineAm.getTime() > nowMs) {
        // Advance reminder date already passed, schedule once for 9:00 AM on due date
        nextTrigger = dueNineAm;
      }

      if (!nextTrigger) {
        // Past 9:00 AM on due date (or overdue); clear stale schedule meta and do not loop
        setScheduledBillTrigger(bill.id, null);
        return;
      }

      const nextTriggerMs = nextTrigger.getTime();
      if (getScheduledBillTrigger(bill.id) === nextTriggerMs) {
        return;
      }

      await this.cancelScheduledOnly(bill.id);

      const dateTriggerType = Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date';
      await Notifications.scheduleNotificationAsync({
        identifier: `bill-reminder-${bill.id}`,
        content: {
          title: `Bill Reminder: ${bill.billerName}`,
          body: `${bill.billerName} bill of ${formatCurrency(bill.amountDue)} is due on ${bill.dueDate}.`,
          categoryIdentifier: NOTIFICATION_CATEGORIES.BILL_REMINDER,
          data: { billId: bill.id, url: '/(app)/bills', actionUrl: '/(app)/bills' },
          sound: true,
        },
        trigger: {
          type: dateTriggerType,
          date: nextTrigger,
          channelId: NOTIFICATION_CHANNELS.BILLS_ALERTS,
        },
      });

      setScheduledBillTrigger(bill.id, nextTriggerMs);
    } catch {
      // Ignore notification permission / scheduling errors in test/headless mode
    }
  }

  private static async cancelScheduledOnly(billId: string): Promise<void> {
    if (!Notifications || typeof Notifications.cancelScheduledNotificationAsync !== 'function') {
      return;
    }
    try {
      await Notifications.cancelScheduledNotificationAsync(`bill-reminder-${billId}`);
    } catch {
      // Ignore
    }
  }

  /**
   * Cancels any scheduled native system notification for a bill and clears local reminder meta.
   */
  public static async cancelNativeBillReminder(billId: string): Promise<void> {
    clearReminderStateForBill(billId);
    await this.cancelScheduledOnly(billId);
  }

  /**
   * Cancels all scheduled OS notifications and clears all persisted reminder/snooze state.
   */
  public static async cancelAllNativeBillReminders(): Promise<void> {
    clearAllReminderState();
    if (!Notifications || typeof Notifications.cancelAllScheduledNotificationsAsync !== 'function') {
      return;
    }
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch {
      // Ignore in test/headless mode
    }
  }

  /**
   * Dismisses already-delivered notifications from the device notification tray.
   */
  public static async dismissAllDeliveredNotifications(): Promise<void> {
    if (!Notifications || typeof Notifications.dismissAllNotificationsAsync !== 'function') {
      return;
    }
    try {
      await Notifications.dismissAllNotificationsAsync();
    } catch {
      // Ignore in test/headless mode
    }
  }

  /**
   * Snoozes a scheduled bill reminder by the specified number of hours.
   */
  public static async snoozeNativeBillReminder(
    bill: { id: string; billerName: string; amountDue: number; dueDate: string },
    snoozeHours: number = 3
  ): Promise<Date | null> {
    if (!Notifications || typeof Notifications.scheduleNotificationAsync !== 'function') {
      return null;
    }
    try {
      await this.cancelScheduledOnly(bill.id);
      const snoozeTarget = new Date(Date.now() + snoozeHours * 60 * 60 * 1000);
      const dateTriggerType = Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date';

      await Notifications.scheduleNotificationAsync({
        identifier: `bill-reminder-${bill.id}`,
        content: {
          title: `Snoozed Reminder: ${bill.billerName}`,
          body: `${bill.billerName} bill of ${formatCurrency(bill.amountDue)} is due on ${bill.dueDate}.`,
          categoryIdentifier: NOTIFICATION_CATEGORIES.BILL_REMINDER,
          data: { billId: bill.id, url: '/(app)/bills', actionUrl: '/(app)/bills' },
          sound: true,
        },
        trigger: {
          type: dateTriggerType,
          date: snoozeTarget,
          channelId: NOTIFICATION_CHANNELS.BILLS_ALERTS,
        },
      });

      const snoozeMs = snoozeTarget.getTime();
      setBillSnoozeUntil(bill.id, snoozeMs);
      setScheduledBillTrigger(bill.id, snoozeMs);

      return snoozeTarget;
    } catch {
      return null;
    }
  }

  /**
   * Re-syncs all active upcoming bills from the unified BillsRepository into native scheduled notifications.
   */
  public static async syncAllNativeBillReminders(): Promise<void> {
    try {
      const upcoming = await BillsRepository.getUpcomingBills(30);
      for (const bill of upcoming) {
        if (bill.status !== 'paid' && bill.status !== 'dismissed') {
          await this.scheduleNativeBillReminder({
            id: bill.id,
            billerName: bill.provider || bill.title,
            amountDue: bill.amount,
            dueDate: bill.dueDate,
            reminderDaysBefore: bill.reminderDays ?? 3,
            status: bill.status,
          });
        } else {
          await this.cancelNativeBillReminder(bill.id);
        }
      }
    } catch {
      // Ignore
    }
  }
}

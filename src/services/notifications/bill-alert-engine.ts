import { getUpcomingBills } from '@/services/database/bill-dao';
import { insertNotification, getNotifications } from '@/services/database/notification-dao';
import { formatCurrency, parseDateSafely } from '@/utils/format';
import { DeviceEventEmitter } from 'react-native';
import type { BillReminder } from '@/types';

let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
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
   * Evaluates all upcoming and overdue bills to trigger proactive notifications.
   * Prevents spam by checking existing notifications.
   */
  public static async evaluateUpcomingBillAlerts(): Promise<number> {
    try {
      const upcomingBills = await getUpcomingBills(7); // Check bills due within 7 days or overdue
      if (upcomingBills.length === 0) return 0;

      const existingNotifications = await getNotifications();
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, '0');
      const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const todayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

      let alertedCount = 0;

      for (const bill of upcomingBills) {
        if (bill.status === 'PAID' || bill.status === 'DISMISSED') continue;

        const [bYear, bMonth, bDay] = bill.dueDate.split('-').map(Number);
        const dueTime = new Date(bYear, bMonth - 1, bDay).getTime();
        const diffDays = Math.round((dueTime - todayTime) / (1000 * 60 * 60 * 24));

        let alertTitle = '';
        let alertDesc = '';
        let alertType: 'alert' | 'bill' = 'bill';

        if (diffDays < 0) {
          // Overdue
          alertTitle = `Overdue Bill: ${bill.billerName}`;
          alertDesc = `Your ${bill.billerName} bill of ${formatCurrency(bill.amountDue)} was due on ${bill.dueDate}. Please pay to avoid penalties.`;
          alertType = 'alert';
        } else if (diffDays === 0) {
          // Due Today
          alertTitle = `Bill Due Today: ${bill.billerName}`;
          alertDesc = `Reminder: ${bill.billerName} bill of ${formatCurrency(bill.amountDue)} is due today (${bill.dueDate}).`;
          alertType = 'alert';
        } else if (diffDays <= bill.reminderDaysBefore) {
          // Due Soon
          alertTitle = `Bill Due in ${diffDays} Day${diffDays > 1 ? 's' : ''}: ${bill.billerName}`;
          alertDesc = `Your ${bill.billerName} bill of ${formatCurrency(bill.amountDue)} is due on ${bill.dueDate}.`;
          alertType = 'bill';
        }

        if (!alertTitle) continue;

        // Check if we already sent an alert for this bill recently (in the last 24h)
        const alreadyAlerted = existingNotifications.some((n) => {
          const isSameTitle = n.title.includes(bill.billerName);
          const isRecent =
            now.getTime() - parseDateSafely(n.createdAt).getTime() < 24 * 60 * 60 * 1000;
          return isSameTitle && isRecent;
        });

        if (!alreadyAlerted) {
          await insertNotification({
            title: alertTitle,
            description: alertDesc,
            type: alertType,
            actionUrl: '/(app)/bills',
          });
          alertedCount++;
        }
      }

      if (alertedCount > 0) {
        DeviceEventEmitter.emit('notificationsUpdated');
      }

      return alertedCount;
    } catch {
      return 0;
    }
  }

  /**
   * Schedules a native system notification trigger for an upcoming bill reminder.
   * Fires on the reminder date at 9:00 AM local time, even if the app remains closed.
   */
  public static async scheduleNativeBillReminder(bill: SchedulableBill): Promise<void> {
    if (!Notifications || typeof Notifications.scheduleNotificationAsync !== 'function') {
      return;
    }
    const isSettled =
      bill.status?.toUpperCase() === 'PAID' ||
      bill.status?.toUpperCase() === 'DISMISSED';
    if (isSettled) {
      await this.cancelNativeBillReminder(bill.id);
      return;
    }
    if (!bill.dueDate) return;

    try {
      await this.cancelNativeBillReminder(bill.id);

      const [bYear, bMonth, bDay] = bill.dueDate.split('-').map(Number);
      if (!bYear || !bMonth || !bDay) return;

      const reminderDays = bill.reminderDaysBefore ?? 1;
      // 9:00 AM on reminder target date
      const targetDate = new Date(bYear, bMonth - 1, bDay, 9, 0, 0, 0);
      targetDate.setDate(targetDate.getDate() - reminderDays);

      const now = new Date();
      const dueEnd = new Date(bYear, bMonth - 1, bDay, 23, 59, 59, 999);

      if (dueEnd.getTime() < now.getTime()) {
        // Bill is already past due date, do not schedule a future alarm
        return;
      }

      // If the reminder trigger time has already passed today, but due date is today or future:
      // trigger in 10 seconds so user receives immediate awareness
      const trigger =
        targetDate.getTime() > now.getTime()
          ? targetDate
          : new Date(now.getTime() + 10 * 1000);

      await Notifications.scheduleNotificationAsync({
        identifier: `bill-reminder-${bill.id}`,
        content: {
          title: `Bill Reminder: ${bill.billerName}`,
          body: `${bill.billerName} bill of ${formatCurrency(bill.amountDue)} is due on ${bill.dueDate}.`,
          data: { billId: bill.id, url: '/(app)/bills' },
          sound: true,
        },
        trigger,
      });
    } catch {
      // Ignore notification permission / scheduling errors in test/headless mode
    }
  }

  /**
   * Cancels any scheduled native system notification for a bill.
   */
  public static async cancelNativeBillReminder(billId: string): Promise<void> {
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
      await this.cancelNativeBillReminder(bill.id);
      const snoozeTarget = new Date(Date.now() + snoozeHours * 60 * 60 * 1000);

      await Notifications.scheduleNotificationAsync({
        identifier: `bill-reminder-${bill.id}`,
        content: {
          title: `Snoozed Reminder: ${bill.billerName}`,
          body: `${bill.billerName} bill of ${formatCurrency(bill.amountDue)} is due on ${bill.dueDate}.`,
          data: { billId: bill.id, url: '/(app)/bills' },
          sound: true,
        },
        trigger: snoozeTarget,
      });

      return snoozeTarget;
    } catch {
      return null;
    }
  }

  /**
   * Re-syncs all active upcoming bills into native scheduled notifications.
   */
  public static async syncAllNativeBillReminders(): Promise<void> {
    try {
      const upcoming = await getUpcomingBills(30);
      for (const bill of upcoming) {
        if (bill.status !== 'PAID' && bill.status !== 'DISMISSED') {
          await this.scheduleNativeBillReminder(bill);
        } else {
          await this.cancelNativeBillReminder(bill.id);
        }
      }
    } catch {
      // Ignore
    }
  }
}

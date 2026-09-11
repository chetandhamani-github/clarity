import { DeviceEventEmitter } from 'react-native';
import { formatCurrency } from '@/utils/format';
import { insertNotification, getNotifications } from '@/services/database/notification-dao';
import { BillsRepository } from '../database/bills.repository';
import type { Bill } from '../types/bill.types';

export class ReminderService {
  /**
   * Schedules or updates local in-app notification alerts for a bill.
   */
  public static async scheduleBillReminder(bill: Bill): Promise<void> {
    if (bill.status !== 'upcoming') return;

    const [y, m, d] = bill.dueDate.split('-').map(Number);
    const dueTime = new Date(y, m - 1, d).getTime();
    const now = new Date();
    const todayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const diffDays = Math.round((dueTime - todayTime) / (1000 * 60 * 60 * 24));

    // If bill is due within reminder window, trigger proactive notification immediately
    if (diffDays >= 0 && diffDays <= (bill.reminderDays ?? 3)) {
      const timingText =
        diffDays === 0
          ? 'is due today'
          : diffDays === 1
            ? 'is due tomorrow'
            : `is due in ${diffDays} days (${bill.dueDate})`;

      const title = `Bill Due: ${bill.provider || bill.title}`;
      const description = `${bill.provider || bill.title} bill of ${formatCurrency(bill.amount)} ${timingText}.`;

      // Check if already notified recently
      const existing = await getNotifications();
      const recent = existing.some(
        (n) =>
          n.title.includes(bill.provider || bill.title) &&
          now.getTime() - new Date(n.createdAt).getTime() < 24 * 60 * 60 * 1000
      );

      if (!recent) {
        await insertNotification({
          title,
          description,
          type: diffDays === 0 ? 'alert' : 'default',
          actionUrl: '/(app)/bills',
        });
        DeviceEventEmitter.emit('notificationsUpdated');
      }
    }
  }

  /**
   * Cancels scheduled reminders when a bill is paid or deleted.
   */
  public static async cancelBillReminder(_billId: string): Promise<void> {
    // In-app notifications are stored in SQLite; we do not need to delete past notifications,
    // but future evaluation will skip paid/deleted bills.
  }

  /**
   * Proactively evaluates all upcoming and overdue bills.
   * Called during background sync or on app startup.
   */
  public static async evaluateAllBillReminders(): Promise<number> {
    try {
      const upcomingBills = await BillsRepository.getUpcomingBills(7);
      if (upcomingBills.length === 0) return 0;

      const existingNotifications = await getNotifications();
      const now = new Date();
      const todayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

      let alertedCount = 0;

      for (const bill of upcomingBills) {
        if (bill.status === 'paid' || bill.status === 'dismissed') continue;

        const [y, m, d] = bill.dueDate.split('-').map(Number);
        const dueTime = new Date(y, m - 1, d).getTime();
        const diffDays = Math.round((dueTime - todayTime) / (1000 * 60 * 60 * 24));

        let alertTitle = '';
        let alertDesc = '';
        let alertType: 'alert' | 'default' = 'default';

        const name = bill.provider || bill.title;

        if (diffDays < 0) {
          alertTitle = `Overdue Bill: ${name}`;
          alertDesc = `Your ${name} bill of ${formatCurrency(bill.amount)} was due on ${bill.dueDate}. Please pay to avoid late fees.`;
          alertType = 'alert';
        } else if (diffDays === 0) {
          alertTitle = `Bill Due Today: ${name}`;
          alertDesc = `Reminder: ${name} bill of ${formatCurrency(bill.amount)} is due today.`;
          alertType = 'alert';
        } else if (diffDays === 1) {
          alertTitle = `Bill Due Tomorrow: ${name}`;
          alertDesc = `${name} bill of ${formatCurrency(bill.amount)} is due tomorrow (${bill.dueDate}).`;
          alertType = 'default';
        } else if (diffDays <= (bill.reminderDays ?? 3)) {
          alertTitle = `Bill Due in ${diffDays} Days: ${name}`;
          alertDesc = `${name} bill of ${formatCurrency(bill.amount)} is due on ${bill.dueDate}.`;
          alertType = 'default';
        }

        if (!alertTitle) continue;

        const alreadyAlerted = existingNotifications.some((n) => {
          const isSameTitle = n.title.includes(name);
          const isRecent = now.getTime() - new Date(n.createdAt).getTime() < 24 * 60 * 60 * 1000;
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
    } catch (err) {
      console.warn('[ReminderService] Error evaluating reminders:', err);
      return 0;
    }
  }
}

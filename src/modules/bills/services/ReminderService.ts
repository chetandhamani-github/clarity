import { DeviceEventEmitter } from 'react-native';
import { formatCurrency, parseDateSafely } from '@/utils/format';
import { insertNotification, getNotifications } from '@/services/database/notification-dao';
import {
  clearReminderStateForBill,
  getBillSnoozeUntil,
  hasSentReminder,
  markReminderSent,
} from '@/services/notifications/reminder-state';
import { useAppStore } from '@/store/use-app-store';
import { BillsRepository } from '../database/bills.repository';
import type { Bill } from '../types/bill.types';

const OVERDUE_REMINDER_MAX_DAYS = 14;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function isBillRemindersEnabled(): boolean {
  try {
    return useAppStore.getState?.().billRemindersEnabled !== false;
  } catch {
    return true;
  }
}

export class ReminderService {
  /**
   * Schedules or updates local in-app notification alerts for a bill.
   */
  public static async scheduleBillReminder(bill: Bill): Promise<void> {
    if (bill.status !== 'upcoming' || !isBillRemindersEnabled()) return;

    const [y, m, d] = bill.dueDate.split('-').map(Number);
    if (!y || !m || !d) return;

    const dueTime = new Date(y, m - 1, d).getTime();
    const now = new Date();
    const todayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const diffDays = Math.round((dueTime - todayTime) / ONE_DAY_MS);

    // If bill is due within reminder window, trigger proactive notification once for that stage
    if (diffDays >= 0 && diffDays <= (bill.reminderDays ?? 3)) {
      const name = bill.provider || bill.title;
      const stage = diffDays === 0 ? 'due_today' : 'due_soon';
      const alertKey = `bill:${bill.id}:${bill.dueDate}:${stage}`;

      if (hasSentReminder(alertKey)) {
        return;
      }

      const timingText =
        diffDays === 0
          ? 'is due today'
          : diffDays === 1
            ? 'is due tomorrow'
            : `is due in ${diffDays} days (${bill.dueDate})`;

      const title =
        diffDays === 0
          ? `Bill Due Today: ${name}`
          : diffDays === 1
            ? `Bill Due Tomorrow: ${name}`
            : `Bill Due in ${diffDays} Days: ${name}`;
      const description = `${name} bill of ${formatCurrency(bill.amount)} ${timingText}.`;

      // Fallback check against in-app notifications table in case state predates persistent key tracking
      const existing = await getNotifications();
      const recent = existing.some(
        (n) =>
          (n.title === title || n.title === `Bill Due: ${name}`) &&
          now.getTime() - parseDateSafely(n.createdAt).getTime() < ONE_DAY_MS
      );

      if (!recent) {
        await insertNotification({
          title,
          description,
          type: diffDays === 0 ? 'alert' : 'bill',
          actionUrl: '/(app)/bills',
          metadata: { billId: bill.id },
          // Scheduled OS trigger owns tray notification; avoid double banner on bill save/sync
          notifySystem: false,
        });
        DeviceEventEmitter.emit('notificationsUpdated');
      }

      markReminderSent(alertKey, now.getTime());
    }
  }

  /**
   * Clears reminder state when a bill is paid or deleted.
   */
  public static async cancelBillReminder(billId: string): Promise<void> {
    clearReminderStateForBill(billId);
  }

  /**
   * Proactively evaluates all upcoming and overdue bills.
   * Triggers at most once per milestone stage (due_soon, due_today, overdue) per billing cycle.
   */
  public static async evaluateAllBillReminders(): Promise<number> {
    if (!isBillRemindersEnabled()) return 0;

    try {
      const upcomingBills = await BillsRepository.getUpcomingBills(7);
      if (upcomingBills.length === 0) return 0;

      const existingNotifications = await getNotifications();
      const now = new Date();
      const nowMs = now.getTime();
      const todayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

      let alertedCount = 0;

      for (const bill of upcomingBills) {
        if (bill.status === 'paid' || bill.status === 'dismissed') continue;
        if (getBillSnoozeUntil(bill.id, nowMs) !== null) continue;

        const [y, m, d] = bill.dueDate.split('-').map(Number);
        if (!y || !m || !d) continue;

        const dueTime = new Date(y, m - 1, d).getTime();
        const diffDays = Math.round((dueTime - todayTime) / ONE_DAY_MS);

        let stage: 'overdue' | 'due_today' | 'due_soon' | null = null;
        let alertTitle = '';
        let alertDesc = '';
        let alertType: 'alert' | 'bill' = 'bill';

        const name = bill.provider || bill.title;

        if (diffDays < 0) {
          if (Math.abs(diffDays) > OVERDUE_REMINDER_MAX_DAYS) {
            continue;
          }
          stage = 'overdue';
          alertTitle = `Overdue Bill: ${name}`;
          alertDesc = `Your ${name} bill of ${formatCurrency(bill.amount)} was due on ${bill.dueDate}. Please pay to avoid late fees.`;
          alertType = 'alert';
        } else if (diffDays === 0) {
          stage = 'due_today';
          alertTitle = `Bill Due Today: ${name}`;
          alertDesc = `Reminder: ${name} bill of ${formatCurrency(bill.amount)} is due today.`;
          alertType = 'alert';
        } else if (diffDays <= (bill.reminderDays ?? 3)) {
          stage = 'due_soon';
          if (diffDays === 1) {
            alertTitle = `Bill Due Tomorrow: ${name}`;
            alertDesc = `${name} bill of ${formatCurrency(bill.amount)} is due tomorrow (${bill.dueDate}).`;
          } else {
            alertTitle = `Bill Due in ${diffDays} Days: ${name}`;
            alertDesc = `${name} bill of ${formatCurrency(bill.amount)} is due on ${bill.dueDate}.`;
          }
          alertType = 'bill';
        }

        if (!stage || !alertTitle) continue;

        const alertKey = `bill:${bill.id}:${bill.dueDate}:${stage}`;
        if (hasSentReminder(alertKey)) {
          continue;
        }

        const alreadyAlertedInDb = existingNotifications.some((n) => {
          const isRecent = nowMs - parseDateSafely(n.createdAt).getTime() < ONE_DAY_MS;
          if (!isRecent) return false;
          if (n.title === alertTitle) return true;
          if (
            stage === 'due_soon' &&
            (n.title === `Bill Due: ${name}` ||
              n.title === `Bill Due Tomorrow: ${name}` ||
              (n.title.startsWith('Bill Due in ') && n.title.endsWith(`: ${name}`)))
          ) {
            return true;
          }
          return false;
        });

        if (!alreadyAlertedInDb) {
          await insertNotification({
            title: alertTitle,
            description: alertDesc,
            type: alertType,
            actionUrl: '/(app)/bills',
            metadata: { billId: bill.id },
            // Overdue alerts nudge immediately; due_soon/due_today tray delivery is handled by native scheduled triggers
            notifySystem: stage === 'overdue',
          });
          alertedCount++;
        }

        markReminderSent(alertKey, nowMs);
      }

      if (alertedCount > 0) {
        DeviceEventEmitter.emit('notificationsUpdated');
      }

      return alertedCount;
    } catch {
      return 0;
    }
  }
}

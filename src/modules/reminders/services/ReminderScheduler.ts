import { BillsRepository } from '@/modules/bills/database/bills.repository';
import { getAllAccounts } from '@/services/database/account-dao';
import { getGoals } from '@/services/database/goal-dao';
import { BillAlertEngine } from '@/services/notifications/bill-alert-engine';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
} from '@/services/notifications/system-notification';
import { useAppStore } from '@/store/use-app-store';
import { formatLocalDateYmd, getLocalTodayYmd, shiftYmdDays } from '@/utils/date';
import { formatCurrency } from '@/utils/format';
import { RemindersRepository } from '../database/reminders.repository';
import type { Reminder } from '../types/reminder.types';

export const REMINDER_TRIGGER_PREFIXES = {
  CUSTOM: 'reminder-',
  BILL: 'bill-reminder-',
  SUBSCRIPTION: 'sub-reminder-',
  CREDIT_CARD: 'cc-reminder-',
  GOAL: 'goal-reminder-',
  DAILY_PULSE: 'daily-pulse-scheduled',
} as const;

const ROLLING_WINDOW_DAYS = 45;
const MAX_ROLLING_OS_TRIGGERS = 45;

interface ScheduledNotificationSummary {
  identifier?: string;
}

interface ExpoNotificationsApi {
  SchedulableTriggerInputTypes?: {
    DATE?: string;
    DAILY?: string;
  };
  scheduleNotificationAsync?: (request: {
    identifier?: string;
    content: Record<string, unknown>;
    trigger: Record<string, unknown> | null;
  }) => Promise<string>;
  getAllScheduledNotificationsAsync?: () => Promise<ScheduledNotificationSummary[]>;
  cancelScheduledNotificationAsync?: (identifier: string) => Promise<void>;
  cancelAllScheduledNotificationsAsync?: () => Promise<void>;
}

interface PendingScheduleItem {
  identifier: string;
  triggerDate: Date;
  channelId: string;
  categoryIdentifier?: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

function getNotificationsApi(): ExpoNotificationsApi | null {
  try {
    return require('expo-notifications') as ExpoNotificationsApi;
  } catch {
    return null;
  }
}

export function parseTimeHm(raw: string | undefined, fallbackHour = 9, fallbackMinute = 0): {
  hour: number;
  minute: number;
} {
  if (!raw) return { hour: fallbackHour, minute: fallbackMinute };
  const [hStr, mStr] = raw.split(':');
  const hour = Number(hStr);
  const minute = Number(mStr);
  if (
    Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59
  ) {
    return { hour, minute };
  }
  return { hour: fallbackHour, minute: fallbackMinute };
}

function computeNextCreditCardDueDate(dueDay: number, fromDate = new Date()): Date {
  const today = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const clampedCurMax = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  let candidate = new Date(
    today.getFullYear(),
    today.getMonth(),
    Math.min(Math.max(1, dueDay), clampedCurMax)
  );
  if (candidate < today) {
    const nextMonthMax = new Date(today.getFullYear(), today.getMonth() + 2, 0).getDate();
    candidate = new Date(
      today.getFullYear(),
      today.getMonth() + 1,
      Math.min(Math.max(1, dueDay), nextMonthMax)
    );
  }
  return candidate;
}

export function buildTriggerDateForReminder(reminder: Reminder, nowMs = Date.now()): Date | null {
  if (reminder.status === 'completed' || reminder.status === 'dismissed') {
    return null;
  }

  if (reminder.status === 'snoozed' && reminder.snoozeUntil) {
    const snoozeDate = new Date(reminder.snoozeUntil);
    if (!Number.isNaN(snoozeDate.getTime()) && snoozeDate.getTime() > nowMs) {
      return snoozeDate;
    }
  }

  const [y, m, d] = reminder.remindAtDate.split('-').map(Number);
  if (!y || !m || !d) return null;

  const { hour, minute } = parseTimeHm(reminder.remindAtTime, 9, 0);
  const exactTarget = new Date(y, m - 1, d, hour, minute, 0, 0);

  if (reminder.advanceDays > 0) {
    const advanceTarget = new Date(y, m - 1, d, hour, minute, 0, 0);
    advanceTarget.setDate(advanceTarget.getDate() - reminder.advanceDays);
    if (advanceTarget.getTime() > nowMs) {
      return advanceTarget;
    }
  }

  return exactTarget.getTime() > nowMs ? exactTarget : null;
}

export class ReminderScheduler {
  private static syncInFlight: Promise<void> | null = null;

  public static async cancelByPrefixes(prefixes: string[]): Promise<void> {
    const Notifications = getNotificationsApi();
    if (
      !Notifications ||
      typeof Notifications.getAllScheduledNotificationsAsync !== 'function' ||
      typeof Notifications.cancelScheduledNotificationAsync !== 'function'
    ) {
      return;
    }

    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const req of scheduled) {
        const id = req.identifier;
        if (id && prefixes.some((prefix) => id.startsWith(prefix))) {
          await Notifications.cancelScheduledNotificationAsync(id);
        }
      }
    } catch {
      // Ignore in test/headless mode
    }
  }

  public static async cancelReminder(reminderId: string): Promise<void> {
    const Notifications = getNotificationsApi();
    if (!Notifications || typeof Notifications.cancelScheduledNotificationAsync !== 'function') {
      return;
    }
    try {
      await Notifications.cancelScheduledNotificationAsync(
        `${REMINDER_TRIGGER_PREFIXES.CUSTOM}${reminderId}`
      );
    } catch {
      // Ignore in headless/test environments
    }
  }

  public static async scheduleReminder(reminder: Reminder): Promise<void> {
    const Notifications = getNotificationsApi();
    if (!Notifications || typeof Notifications.scheduleNotificationAsync !== 'function') {
      return;
    }

    await this.cancelReminder(reminder.id);
    const triggerDate = buildTriggerDateForReminder(reminder);
    if (!triggerDate) return;

    const dateTriggerType = Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date';
    const amountSnippet =
      reminder.amount !== undefined && reminder.amount > 0
        ? ` (${formatCurrency(reminder.amount)})`
        : '';

    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `${REMINDER_TRIGGER_PREFIXES.CUSTOM}${reminder.id}`,
        content: {
          title: `Reminder: ${reminder.title}`,
          body: `${reminder.title}${amountSnippet}${reminder.notes ? ` — ${reminder.notes}` : ''}`,
          categoryIdentifier: NOTIFICATION_CATEGORIES.REMINDER,
          data: {
            type: 'reminder',
            reminderId: reminder.id,
            actionUrl: '/(app)/reminders',
          },
          sound: true,
        },
        trigger: {
          type: dateTriggerType,
          date: triggerDate,
          channelId: NOTIFICATION_CHANNELS.REMINDERS,
        },
      });
    } catch {
      // Ignore scheduling failures when permissions are not granted
    }
  }

  public static async syncDailyPulseSchedule(): Promise<void> {
    const Notifications = getNotificationsApi();
    if (!Notifications || typeof Notifications.scheduleNotificationAsync !== 'function') {
      return;
    }

    try {
      if (typeof Notifications.cancelScheduledNotificationAsync === 'function') {
        await Notifications.cancelScheduledNotificationAsync(REMINDER_TRIGGER_PREFIXES.DAILY_PULSE);
      }

      const appState = useAppStore.getState();
      if (!appState.dailyPulseEnabled) return;

      const { hour, minute } = parseTimeHm(appState.dailyPulseTime, 20, 0);
      const dailyTriggerType = Notifications.SchedulableTriggerInputTypes?.DAILY ?? 'daily';

      await Notifications.scheduleNotificationAsync({
        identifier: REMINDER_TRIGGER_PREFIXES.DAILY_PULSE,
        content: {
          title: 'Daily Financial Pulse',
          body: "Check today's Safe-to-Spend, log quick expenses, and review upcoming dues.",
          subtitle: 'Clarity Daily Check-In',
          categoryIdentifier: NOTIFICATION_CATEGORIES.DAILY_PULSE,
          data: {
            type: 'daily_pulse',
            actionUrl: '/(app)/(tabs)',
          },
          sound: true,
        },
        trigger: {
          type: dailyTriggerType,
          hour,
          minute,
          channelId: NOTIFICATION_CHANNELS.PULSE,
        },
      });
    } catch {
      // Ignore in headless/test environments
    }
  }

  /**
   * Synchronizes all upcoming native OS triggers across custom reminders, bills,
   * active subscriptions, credit card due dates, goals, and Daily Pulse.
   */
  public static async syncAll(): Promise<void> {
    if (this.syncInFlight) {
      return this.syncInFlight;
    }

    this.syncInFlight = this.executeSyncAll().finally(() => {
      this.syncInFlight = null;
    });

    return this.syncInFlight;
  }

  private static async executeSyncAll(): Promise<void> {
    const Notifications = getNotificationsApi();
    if (!Notifications || typeof Notifications.scheduleNotificationAsync !== 'function') {
      return;
    }

    const now = new Date();
    const nowMs = now.getTime();
    const todayStr = getLocalTodayYmd();
    const maxDateStr = shiftYmdDays(todayStr, ROLLING_WINDOW_DAYS);
    const appState = useAppStore.getState();
    const { hour, minute } = parseTimeHm(appState.defaultReminderTime, 9, 0);

    // 1. Sync bills through BillAlertEngine (respects bill snoozes & billRemindersEnabled)
    await BillAlertEngine.syncAllNativeBillReminders().catch(() => {});

    // 2. Clear and re-schedule managed rolling items (custom reminders, subs, credit cards, goals)
    await this.cancelByPrefixes([
      REMINDER_TRIGGER_PREFIXES.CUSTOM,
      REMINDER_TRIGGER_PREFIXES.SUBSCRIPTION,
      REMINDER_TRIGGER_PREFIXES.CREDIT_CARD,
      REMINDER_TRIGGER_PREFIXES.GOAL,
    ]);

    const pendingItems: PendingScheduleItem[] = [];

    // 2a. Custom reminders
    try {
      const activeReminders = await RemindersRepository.getActiveReminders(ROLLING_WINDOW_DAYS);
      for (const r of activeReminders) {
        const triggerDate = buildTriggerDateForReminder(r, nowMs);
        if (!triggerDate) continue;
        const amountSnippet =
          r.amount !== undefined && r.amount > 0 ? ` (${formatCurrency(r.amount)})` : '';
        pendingItems.push({
          identifier: `${REMINDER_TRIGGER_PREFIXES.CUSTOM}${r.id}`,
          triggerDate,
          channelId: NOTIFICATION_CHANNELS.REMINDERS,
          categoryIdentifier: NOTIFICATION_CATEGORIES.REMINDER,
          title: `Reminder: ${r.title}`,
          body: `${r.title}${amountSnippet}${r.notes ? ` — ${r.notes}` : ''}`,
          data: {
            type: 'reminder',
            reminderId: r.id,
            actionUrl: '/(app)/reminders',
          },
        });
      }
    } catch {
      // Ignore if reminders table unavailable
    }

    // 2b. Subscriptions
    if (appState.billRemindersEnabled) {
      try {
        const subs = await BillsRepository.getAllSubscriptions();
        for (const sub of subs) {
          if (sub.status !== 'active') continue;
          if (!sub.nextRenewalDate || sub.nextRenewalDate < todayStr || sub.nextRenewalDate > maxDateStr) {
            continue;
          }
          const [y, m, d] = sub.nextRenewalDate.split('-').map(Number);
          if (!y || !m || !d) continue;
          const dayBefore = new Date(y, m - 1, d, hour, minute, 0, 0);
          dayBefore.setDate(dayBefore.getDate() - 1);
          const dueDay = new Date(y, m - 1, d, hour, minute, 0, 0);
          const triggerDate =
            dayBefore.getTime() > nowMs ? dayBefore : dueDay.getTime() > nowMs ? dueDay : null;
          if (!triggerDate) continue;

          pendingItems.push({
            identifier: `${REMINDER_TRIGGER_PREFIXES.SUBSCRIPTION}${sub.id}`,
            triggerDate,
            channelId: NOTIFICATION_CHANNELS.BILLS_ALERTS,
            categoryIdentifier: NOTIFICATION_CATEGORIES.BILL_REMINDER,
            title: `Subscription Renewal: ${sub.name}`,
            body: `${sub.name} (${formatCurrency(sub.amount)}) renews on ${sub.nextRenewalDate}.`,
            data: {
              type: 'subscription_reminder',
              subscriptionId: sub.id,
              actionUrl: '/(app)/bills',
            },
          });
        }
      } catch {
        // Ignore
      }
    }

    // 2c. Credit card due dates
    if (appState.cardDueAlertsEnabled) {
      try {
        const accounts = await getAllAccounts();
        for (const acc of accounts) {
          if (acc.type !== 'credit' || !acc.dueDay || acc.balance >= 0) continue;
          const dueDate = computeNextCreditCardDueDate(acc.dueDay, now);
          const dueDateStr = formatLocalDateYmd(dueDate);
          if (dueDateStr > maxDateStr) continue;

          const threeDaysBefore = new Date(
            dueDate.getFullYear(),
            dueDate.getMonth(),
            dueDate.getDate() - 3,
            hour,
            minute,
            0,
            0
          );
          const dueDayAtTime = new Date(
            dueDate.getFullYear(),
            dueDate.getMonth(),
            dueDate.getDate(),
            hour,
            minute,
            0,
            0
          );
          const triggerDate =
            threeDaysBefore.getTime() > nowMs
              ? threeDaysBefore
              : dueDayAtTime.getTime() > nowMs
                ? dueDayAtTime
                : null;
          if (!triggerDate) continue;

          pendingItems.push({
            identifier: `${REMINDER_TRIGGER_PREFIXES.CREDIT_CARD}${acc.id}`,
            triggerDate,
            channelId: NOTIFICATION_CHANNELS.BILLS_ALERTS,
            title: `Credit Card Due: ${acc.name}`,
            body: `Payment of ${formatCurrency(Math.abs(acc.balance))} is due on ${dueDateStr}.`,
            data: {
              type: 'cc_reminder',
              accountId: acc.id,
              actionUrl: `/(app)/account-details?id=${acc.id}`,
            },
          });
        }
      } catch {
        // Ignore
      }
    }

    // 2d. Goal deadlines
    if (appState.goalRemindersEnabled) {
      try {
        const goals = await getGoals();
        for (const goal of goals) {
          if (
            !goal.targetDate ||
            goal.currentAmount >= goal.targetAmount ||
            goal.targetDate < todayStr ||
            goal.targetDate > maxDateStr
          ) {
            continue;
          }
          const [y, m, d] = goal.targetDate.split('-').map(Number);
          if (!y || !m || !d) continue;
          const threeDaysBefore = new Date(y, m - 1, d - 3, hour, minute, 0, 0);
          const targetDay = new Date(y, m - 1, d, hour, minute, 0, 0);
          const triggerDate =
            threeDaysBefore.getTime() > nowMs
              ? threeDaysBefore
              : targetDay.getTime() > nowMs
                ? targetDay
                : null;
          if (!triggerDate) continue;

          const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
          pendingItems.push({
            identifier: `${REMINDER_TRIGGER_PREFIXES.GOAL}${goal.id}`,
            triggerDate,
            channelId: NOTIFICATION_CHANNELS.REMINDERS,
            title: `Goal Deadline: ${goal.name}`,
            body: `${formatCurrency(remaining)} left to reach "${goal.name}" by ${goal.targetDate}.`,
            data: {
              type: 'goal_reminder',
              goalId: goal.id,
              actionUrl: `/(app)/goal-details?id=${goal.id}`,
            },
          });
        }
      } catch {
        // Ignore
      }
    }

    // Sort soonest first and enforce rolling cap so Android pending alarm quota is respected
    pendingItems.sort((a, b) => a.triggerDate.getTime() - b.triggerDate.getTime());
    const boundedItems = pendingItems.slice(0, MAX_ROLLING_OS_TRIGGERS);
    const dateTriggerType = Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date';

    for (const item of boundedItems) {
      try {
        await Notifications.scheduleNotificationAsync({
          identifier: item.identifier,
          content: {
            title: item.title,
            body: item.body,
            categoryIdentifier: item.categoryIdentifier,
            data: item.data,
            sound: true,
          },
          trigger: {
            type: dateTriggerType,
            date: item.triggerDate,
            channelId: item.channelId,
          },
        });
      } catch {
        // Ignore individual scheduling errors
      }
    }

    // 3. Sync repeating Daily Financial Pulse
    await this.syncDailyPulseSchedule();
  }

  public static async cancelAllNotifications(): Promise<void> {
    const Notifications = getNotificationsApi();
    if (!Notifications) return;

    try {
      if (typeof Notifications.cancelAllScheduledNotificationsAsync === 'function') {
        await Notifications.cancelAllScheduledNotificationsAsync();
      }
    } catch {
      // Ignore in test/headless mode
    }
  }
}

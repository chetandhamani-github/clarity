import { Platform } from 'react-native';
import { formatCurrency } from '@/utils/format';

let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch {
  // Graceful fallback for test or unlinked environments
}

export const NOTIFICATION_CHANNELS = {
  DEFAULT: 'default',
  PULSE: 'lockscreen_pulse',
  BILLS_ALERTS: 'bills_and_alerts',
} as const;

export const NOTIFICATION_CATEGORIES = {
  DAILY_PULSE: 'DAILY_PULSE',
  BILL_REMINDER: 'BILL_REMINDER',
  ANOMALY: 'ANOMALY',
} as const;

export interface SystemNotificationOptions {
  title: string;
  body: string;
  subtitle?: string;
  channelId?: string;
  categoryIdentifier?: string;
  data?: Record<string, unknown>;
}

/**
 * Configures Android notification channels and interactive categories.
 * Configured with PUBLIC lock screen visibility and MAX importance (Uber style).
 */
export async function setupNotificationChannelsAndCategories(): Promise<void> {
  if (!Notifications) return;

  try {
    // 1. Android Channels with PUBLIC lock screen visibility and MAX importance
    if (Platform.OS === 'android' && typeof Notifications.setNotificationChannelAsync === 'function') {
      const publicVisibility =
        Notifications.AndroidNotificationVisibility?.PUBLIC ?? 1;
      const maxImportance =
        Notifications.AndroidImportance?.MAX ?? 7;

      // Lock Screen Pulse (Glanceable Safe-to-Spend & Quick Add)
      await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.PULSE, {
        name: 'Daily Financial Pulse',
        description: 'High-visibility daily budget, safe-to-spend, and quick actions on the lock screen',
        importance: maxImportance,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6366F1',
        lockscreenVisibility: publicVisibility,
        bypassDnd: false,
        showBadge: true,
      });

      // Bill Reminders & Financial Alerts
      await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.BILLS_ALERTS, {
        name: 'Bill Reminders & Critical Alerts',
        description: 'Upcoming bill due dates, price spikes, and money alerts',
        importance: maxImportance,
        vibrationPattern: [0, 300, 200, 300],
        lightColor: '#EF4444',
        lockscreenVisibility: publicVisibility,
        bypassDnd: false,
        showBadge: true,
      });
    }

    // 2. Interactive Notification Categories (Quick Action Buttons on Lock Screen & Tray)
    if (typeof Notifications.setNotificationCategoryAsync === 'function') {
      await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.DAILY_PULSE, [
        {
          identifier: 'ADD_EXPENSE',
          buttonTitle: '+ Add Expense',
          options: {
            opensAppToForeground: true,
          },
        },
        {
          identifier: 'VIEW_PULSE',
          buttonTitle: 'Open Clarity',
          options: {
            opensAppToForeground: true,
          },
        },
      ]);

      await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.BILL_REMINDER, [
        {
          identifier: 'VIEW_BILL',
          buttonTitle: 'View Bill',
          options: {
            opensAppToForeground: true,
          },
        },
        {
          identifier: 'MARK_PAID',
          buttonTitle: 'Mark as Paid',
          options: {
            opensAppToForeground: false,
          },
        },
      ]);

      await Notifications.setNotificationCategoryAsync(NOTIFICATION_CATEGORIES.ANOMALY, [
        {
          identifier: 'REVIEW_CHARGE',
          buttonTitle: 'Review Alert',
          options: {
            opensAppToForeground: true,
          },
        },
        {
          identifier: 'DISMISS',
          buttonTitle: 'Dismiss',
          options: {
            opensAppToForeground: false,
          },
        },
      ]);
    }
  } catch {
    // Suppress configuration errors in testing or headless contexts
  }
}

/**
 * Triggers an immediate native system notification in the device notification tray.
 * Safely fails silently if notifications are disabled or not supported in current environment.
 */
export async function triggerLocalSystemNotification(
  options: SystemNotificationOptions
): Promise<void> {
  if (!Notifications || typeof Notifications.scheduleNotificationAsync !== 'function') {
    return;
  }

  try {
    const channelId = options.channelId || NOTIFICATION_CHANNELS.DEFAULT;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: options.title,
        body: options.body,
        subtitle: options.subtitle,
        categoryIdentifier: options.categoryIdentifier,
        data: {
          ...(options.data ?? {}),
          isLocal: true,
        },
        sound: true,
        channelId,
      },
      // expo-notifications reads trigger.channelId on Android to assign the notification channel immediately
      trigger: Platform.OS === 'android' ? { channelId } : null,
    });
  } catch {
    // Suppress errors if permission is not granted or device is in DND
  }
}

/**
 * Triggers the rich Uber-style Lock Screen Financial Pulse notification.
 */
export async function triggerDailyPulseNotification(params: {
  safeToSpend: number;
  streakDays?: number;
  yesterdaySpend?: number;
  upcomingBillsCount?: number;
}): Promise<void> {
  const streakText =
    params.streakDays && params.streakDays > 1 ? ` • ${params.streakDays}-day streak` : '';
  const yesterdayText =
    params.yesterdaySpend !== undefined
      ? ` • Yesterday: ${formatCurrency(params.yesterdaySpend)}`
      : '';
  const billsText =
    params.upcomingBillsCount && params.upcomingBillsCount > 0
      ? `\n${params.upcomingBillsCount} bill${params.upcomingBillsCount > 1 ? 's' : ''} due in 48h`
      : '';

  await triggerLocalSystemNotification({
    title: `Safe to Spend: ${formatCurrency(params.safeToSpend)}`,
    body: `Daily allowance remaining${streakText}${yesterdayText}${billsText}`,
    subtitle: 'Daily Financial Pulse',
    channelId: NOTIFICATION_CHANNELS.PULSE,
    categoryIdentifier: NOTIFICATION_CATEGORIES.DAILY_PULSE,
    data: {
      type: 'daily_pulse',
      actionUrl: '/(app)/(tabs)',
    },
  });
}

/**
 * Triggers a potential duplicate charge alert with quick actions.
 */
export async function triggerDuplicateChargeAlert(params: {
  merchant: string;
  amount: number;
}): Promise<void> {
  await triggerLocalSystemNotification({
    title: `Potential Duplicate: ${formatCurrency(params.amount)}`,
    body: `Detected 2 identical charges at ${params.merchant} within minutes. Tap to inspect.`,
    channelId: NOTIFICATION_CHANNELS.BILLS_ALERTS,
    categoryIdentifier: NOTIFICATION_CATEGORIES.ANOMALY,
    data: {
      type: 'duplicate_charge',
      actionUrl: '/(app)/(tabs)/transactions',
    },
  });
}

/**
 * Triggers a subscription price-hike alert.
 */
export async function triggerPriceIncreaseAlert(params: {
  merchant: string;
  oldAmount: number;
  newAmount: number;
}): Promise<void> {
  const diff = params.newAmount - params.oldAmount;
  await triggerLocalSystemNotification({
    title: `Price Increase: ${params.merchant}`,
    body: `Charged ${formatCurrency(params.newAmount)} (+${formatCurrency(diff)} more than last month).`,
    channelId: NOTIFICATION_CHANNELS.BILLS_ALERTS,
    categoryIdentifier: NOTIFICATION_CATEGORIES.ANOMALY,
    data: {
      type: 'price_increase',
      actionUrl: '/(app)/bills',
    },
  });
}

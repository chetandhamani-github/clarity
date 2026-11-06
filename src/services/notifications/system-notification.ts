let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch {
  // Graceful fallback for test or unlinked environments
}

export interface SystemNotificationOptions {
  title: string;
  body: string;
  data?: Record<string, unknown>;
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
    await Notifications.scheduleNotificationAsync({
      content: {
        title: options.title,
        body: options.body,
        data: options.data ?? {},
        sound: true,
      },
      trigger: null,
    });
  } catch {
    // Suppress errors if permission is not granted or device is in DND
  }
}

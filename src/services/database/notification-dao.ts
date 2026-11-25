import { DeviceEventEmitter } from 'react-native';
import { getDatabase } from './index';
import type { Notification } from '@/types';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  triggerLocalSystemNotification,
} from '@/services/notifications/system-notification';

export async function getNotifications(): Promise<Notification[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<any>('SELECT * FROM notifications ORDER BY created_at DESC;');
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    type: r.type,
    isRead: Boolean(r.is_read),
    createdAt: r.created_at,
    actionUrl: r.action_url,
  }));
}

export async function markNotificationAsRead(id: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync('UPDATE notifications SET is_read = 1 WHERE id = ?;', [id]);
}

export async function markAllNotificationsAsRead(): Promise<void> {
  const db = getDatabase();
  await db.runAsync('UPDATE notifications SET is_read = 1 WHERE is_read = 0;');
}

export async function deleteNotification(id: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM notifications WHERE id = ?;', [id]);
}

export async function getUnreadNotificationCount(): Promise<number> {
  const db = getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT count(*) as count FROM notifications WHERE is_read = 0;'
  );
  return row?.count ?? 0;
}

export async function clearAllNotifications(): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM notifications;');
}

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type InsertNotificationInput = Omit<Notification, 'id' | 'isRead' | 'createdAt'> & {
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

export async function insertNotification(
  notification: InsertNotificationInput
): Promise<void> {
  const db = getDatabase();
  const id = generateId();
  const createdAt = notification.createdAt || new Date().toISOString();
  const type = notification.type || 'default';
  await db.runAsync(
    `INSERT INTO notifications (id, title, description, type, action_url, created_at) 
     VALUES (?, ?, ?, ?, ?, ?);`,
    [
      id,
      notification.title,
      notification.description,
      type,
      notification.actionUrl || '',
      createdAt,
    ]
  );

  const isBillOrAlert = type === 'bill' || type === 'alert';
  const isBillCategory = type === 'bill' || Boolean(notification.metadata?.billId);

  // Trigger native system notification tray alert with appropriate channel & category
  triggerLocalSystemNotification({
    title: notification.title,
    body: notification.description,
    channelId: isBillOrAlert ? NOTIFICATION_CHANNELS.BILLS_ALERTS : NOTIFICATION_CHANNELS.DEFAULT,
    categoryIdentifier: isBillCategory ? NOTIFICATION_CATEGORIES.BILL_REMINDER : undefined,
    data: {
      ...(notification.metadata ?? {}),
      notificationId: id,
      type,
      actionUrl: notification.actionUrl,
    },
  }).catch(() => {});

  DeviceEventEmitter.emit('notificationsUpdated');
}

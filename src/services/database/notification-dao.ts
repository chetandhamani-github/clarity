import { getDatabase } from './index';
import type { Notification } from '@/types';

export async function getNotifications(): Promise<Notification[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<any>('SELECT * FROM notifications ORDER BY created_at DESC;');
  return rows.map(r => ({
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

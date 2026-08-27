import { useState, useEffect, useCallback } from 'react';
import { DeviceEventEmitter } from 'react-native';
import type { Notification } from '@/types';
import * as notificationDao from '@/services/database/notification-dao';

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await notificationDao.getNotifications();
      setNotifications(data);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
    const subscription = DeviceEventEmitter.addListener('notificationsUpdated', refetch);
    return () => {
      subscription.remove();
    };
  }, [refetch]);

  return { notifications, isLoading, refetch };
}

export function useMarkNotificationAsRead() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (
      id: string,
      options?: { onSuccess?: () => void },
    ) => {
      setIsPending(true);
      try {
        await notificationDao.markNotificationAsRead(id);
        options?.onSuccess?.();
      } catch (error) {
        console.error('Failed to mark notification as read:', error);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [],
  );

  return { mutate, isPending };
}

export function useMarkAllNotificationsAsRead() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (options?: { onSuccess?: () => void }) => {
      setIsPending(true);
      try {
        await notificationDao.markAllNotificationsAsRead();
        options?.onSuccess?.();
      } catch (error) {
        console.error('Failed to mark all notifications as read:', error);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [],
  );

  return { mutate, isPending };
}

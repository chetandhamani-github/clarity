import { useState, useEffect, useCallback } from 'react';
import { DeviceEventEmitter } from 'react-native';
import type { Notification } from '@/types';
import * as notificationDao from '@/services/database/notification-dao';

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = useCallback(async (showLoader = false) => {
    if (showLoader) setIsLoading(true);
    try {
      const data = await notificationDao.getNotifications();
      setNotifications(data);
    } catch {
      // Failed to fetch notifications
    } finally {
      if (showLoader) setIsLoading(false);
    }
  }, []);

  const refetch = useCallback(() => fetchNotifications(false), [fetchNotifications]);

  useEffect(() => {
    fetchNotifications(true);
    const subscription = DeviceEventEmitter.addListener('notificationsUpdated', () =>
      fetchNotifications(false)
    );
    return () => {
      subscription.remove();
    };
  }, [fetchNotifications]);

  return { notifications, setNotifications, isLoading, refetch };
}

export function useMarkNotificationAsRead() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (id: string, options?: { onSuccess?: () => void; onError?: () => void }) => {
      setIsPending(true);
      try {
        await notificationDao.markNotificationAsRead(id);
        DeviceEventEmitter.emit('notificationsUpdated');
        options?.onSuccess?.();
      } catch (error) {
        options?.onError?.();
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    []
  );

  return { mutate, isPending };
}

export function useMarkAllNotificationsAsRead() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (options?: { onSuccess?: () => void; onError?: () => void }) => {
      setIsPending(true);
      try {
        await notificationDao.markAllNotificationsAsRead();
        DeviceEventEmitter.emit('notificationsUpdated');
        options?.onSuccess?.();
      } catch (error) {
        options?.onError?.();
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    []
  );

  return { mutate, isPending };
}

export function useDeleteNotification() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (id: string, options?: { onSuccess?: () => void; onError?: () => void }) => {
      setIsPending(true);
      try {
        await notificationDao.deleteNotification(id);
        DeviceEventEmitter.emit('notificationsUpdated');
        options?.onSuccess?.();
      } catch (error) {
        options?.onError?.();
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    []
  );

  return { mutate, isPending };
}

export function useClearAllNotifications() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (options?: { onSuccess?: () => void; onError?: () => void }) => {
      setIsPending(true);
      try {
        await notificationDao.clearAllNotifications();
        DeviceEventEmitter.emit('notificationsUpdated');
        options?.onSuccess?.();
      } catch (error) {
        options?.onError?.();
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    []
  );

  return { mutate, isPending };
}

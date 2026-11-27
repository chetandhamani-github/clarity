import { useState, useEffect, useRef } from 'react';
import { Platform, DeviceEventEmitter } from 'react-native';
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useRouter } from 'expo-router';
import { insertNotification } from '@/services/database/notification-dao';
import { initDatabase } from '@/services/database';
import { setupNotificationChannelsAndCategories } from '@/services/notifications/system-notification';
import { mmkv } from '@/lib/storage';
import { queryClient } from '@/lib/query-client';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const LAST_RESPONSE_MMKV_KEY = 'clarity_last_handled_notification_response_v1';

let Notifications: any = null;
if (!isExpoGo) {
  try {
    Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    // expo-notifications not available
  }
}

async function setupChannelsAsync(): Promise<void> {
  await setupNotificationChannelsAndCategories().catch(() => {});

  if (Platform.OS === 'android' && Notifications) {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    }).catch(() => {});
  }
}

async function registerForPushNotificationsAsync(allowPrompt: boolean): Promise<string | undefined> {
  let token: string | undefined;

  if (Device.isDevice && Notifications) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted' && allowPrompt) {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return undefined;
    }
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (projectId) {
      try {
        const pushTokenString = (
          await Notifications.getExpoPushTokenAsync({
            projectId,
          })
        ).data;
        token = pushTokenString;
      } catch {
        // Error getting push token
      }
    }
  }

  return token;
}

export interface UsePushNotificationsOptions {
  canRequestPermissions?: boolean;
}

export function usePushNotifications(options: UsePushNotificationsOptions = {}) {
  const { canRequestPermissions = true } = options;
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>('');
  const [notification, setNotification] = useState<any>(undefined);
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (!Notifications) return;

    setupChannelsAsync().catch(() => {});

    const dismissTrayNotification = (identifier?: string) => {
      if (identifier && typeof Notifications?.dismissNotificationAsync === 'function') {
        Notifications.dismissNotificationAsync(identifier).catch(() => {});
      }
    };

    const handleNotificationResponse = async (response: any) => {
      const actionId = response?.actionIdentifier;
      const reqId = response?.notification?.request?.identifier as string | undefined;
      const notifDate = response?.notification?.date ?? '';
      const responseKey = reqId ? `${reqId}:${actionId ?? ''}:${notifDate}` : '';
      if (responseKey) {
        if (mmkv.getString(LAST_RESPONSE_MMKV_KEY) === responseKey) {
          return;
        }
        mmkv.set(LAST_RESPONSE_MMKV_KEY, responseKey);
      }

      const payload = response?.notification?.request?.content;
      const data = payload?.data as
        | { type?: string; actionUrl?: string; billId?: string; reminderId?: string }
        | undefined;

      // Handle interactive notification actions (lock screen / notification buttons)
      if (actionId === 'REMINDER_MARK_DONE') {
        dismissTrayNotification(reqId);
        if (data?.reminderId) {
          try {
            await initDatabase();
            const { RemindersService } = await import('@/modules/reminders/services/RemindersService');
            await RemindersService.completeReminder(data.reminderId);
            await queryClient.invalidateQueries({ queryKey: ['reminders'] });
            DeviceEventEmitter.emit('remindersUpdated');
          } catch {
            // Fall through quietly; background actions should not crash root layout
          }
        }
        return;
      }

      if (actionId === 'REMINDER_SNOOZE_1D') {
        dismissTrayNotification(reqId);
        if (data?.reminderId) {
          try {
            await initDatabase();
            const { RemindersService } = await import('@/modules/reminders/services/RemindersService');
            await RemindersService.snoozeReminder(data.reminderId, 24);
            await queryClient.invalidateQueries({ queryKey: ['reminders'] });
            DeviceEventEmitter.emit('remindersUpdated');
          } catch {
            // Fall through quietly
          }
        }
        return;
      }

      if (actionId === 'REMINDER_OPEN') {
        routerRef.current.navigate(
          data?.actionUrl ? (data.actionUrl as any) : ('/(app)/reminders' as any)
        );
        return;
      }

      if (actionId === 'MARK_PAID') {
        dismissTrayNotification(reqId);
        if (data?.billId) {
          try {
            await initDatabase();
            const { BillService } = await import('@/modules/bills/services/BillService');
            await BillService.markBillPaid(data.billId);
            const { useBillsStore } = await import('@/modules/bills/store/bills.store');
            await useBillsStore.getState().loadData();
            await queryClient.invalidateQueries({ queryKey: ['bills'] });
            await queryClient.invalidateQueries({ queryKey: ['totals'] });
            await queryClient.invalidateQueries({ queryKey: ['transactions'] });
            DeviceEventEmitter.emit('notificationsUpdated');
          } catch {
            // Fall through quietly; background actions should not crash root layout
          }
        } else {
          routerRef.current.navigate('/(app)/bills' as any);
        }
        return;
      }

      if (actionId === 'DISMISS') {
        dismissTrayNotification(reqId);
        return;
      }

      if (actionId === 'ADD_EXPENSE') {
        routerRef.current.navigate('/(app)/add-transaction' as any);
        return;
      }
      if (actionId === 'VIEW_PULSE') {
        routerRef.current.navigate('/(app)/(tabs)' as any);
        return;
      }
      if (actionId === 'VIEW_BILL') {
        routerRef.current.navigate(
          data?.actionUrl ? (data.actionUrl as any) : ('/(app)/bills' as any)
        );
        return;
      }
      if (actionId === 'REVIEW_CHARGE') {
        routerRef.current.navigate(
          data?.actionUrl ? (data.actionUrl as any) : ('/(app)/(tabs)/transactions' as any)
        );
        return;
      }

      // Clicking a notification body should only navigate, never re-insert into the database
      if (data?.actionUrl) {
        routerRef.current.navigate(data.actionUrl as any);
      } else {
        routerRef.current.navigate('/(app)/notifications' as any);
      }
    };

    notificationListener.current = Notifications.addNotificationReceivedListener(
      (incoming: any) => {
        setNotification(incoming);

        const payload = incoming.request?.content;
        const data = payload?.data as { type?: string; actionUrl?: string; isLocal?: boolean } | undefined;

        // Skip locally generated notifications to prevent infinite feedback loops with insertNotification()
        const isLocal =
          data?.isLocal ||
          !incoming.request?.trigger ||
          incoming.request?.trigger?.type !== 'push';
        if (isLocal) {
          return;
        }

        insertNotification({
          title: payload?.title || 'Notification',
          description: payload?.body || '',
          type: (data?.type as any) || 'default',
          actionUrl: data?.actionUrl || '',
        }).catch(() => {});
      }
    );

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response: any) => {
        handleNotificationResponse(response).catch(() => {});
      }
    );

    if (typeof Notifications.getLastNotificationResponseAsync === 'function') {
      Notifications.getLastNotificationResponseAsync()
        .then((lastResponse: any) => {
          if (lastResponse) {
            return handleNotificationResponse(lastResponse);
          }
          return undefined;
        })
        .catch(() => {});
    }

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (!Notifications || !canRequestPermissions) return;

    registerForPushNotificationsAsync(true)
      .then((token) => {
        if (token) {
          setExpoPushToken(token);
        }
      })
      .catch(() => {});
  }, [canRequestPermissions]);

  return { expoPushToken, notification };
}

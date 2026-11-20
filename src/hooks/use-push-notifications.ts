import { useState, useEffect, useRef } from 'react';
import { Platform, DeviceEventEmitter } from 'react-native';
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useRouter } from 'expo-router';
import { insertNotification } from '@/services/database/notification-dao';
import { setupNotificationChannelsAndCategories } from '@/services/notifications/system-notification';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let Notifications: any = null;
if (!isExpoGo) {
  try {
    Notifications = require('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    // expo-notifications not available
  }
}

async function registerForPushNotificationsAsync() {
  let token;

  // Initialize Uber-style high-visibility channels and interactive categories
  await setupNotificationChannelsAndCategories().catch(() => {});

  if (Platform.OS === 'android' && Notifications) {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice && Notifications) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return;
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

export function usePushNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>('');
  const [notification, setNotification] = useState<any>(undefined);
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);
  const router = useRouter();

  useEffect(() => {
    if (!Notifications) return;

    registerForPushNotificationsAsync()
      .then((token) => setExpoPushToken(token))
      .catch(() => {});

    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notification: any) => {
        setNotification(notification);

        const payload = notification.request?.content;
        const data = payload?.data as { type?: string; actionUrl?: string; isLocal?: boolean } | undefined;

        // Skip locally generated notifications to prevent infinite feedback loops with insertNotification()
        const isLocal =
          data?.isLocal ||
          !notification.request?.trigger ||
          notification.request?.trigger?.type !== 'push';
        if (isLocal) {
          return;
        }

        insertNotification({
          title: payload?.title || 'Notification',
          description: payload?.body || '',
          type: (data?.type as any) || 'default',
          actionUrl: data?.actionUrl || '',
        })
          .then(() => {
            DeviceEventEmitter.emit('notificationsUpdated');
          })
          .catch(() => {});
      }
    );

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response: any) => {
        const actionId = response.actionIdentifier;
        const payload = response.notification?.request?.content;
        const data = payload?.data as { type?: string; actionUrl?: string } | undefined;

        // Handle interactive notification actions (lock screen / notification buttons)
        if (actionId === 'ADD_EXPENSE') {
          router.navigate('/add-transaction' as any);
          return;
        }
        if (actionId === 'VIEW_PULSE') {
          router.navigate('/(app)/(tabs)' as any);
          return;
        }
        if (actionId === 'VIEW_BILL') {
          router.navigate(data?.actionUrl ? (data.actionUrl as any) : ('/bills' as any));
          return;
        }
        if (actionId === 'REVIEW_CHARGE') {
          router.navigate(
            data?.actionUrl ? (data.actionUrl as any) : ('/(app)/(tabs)/transactions' as any)
          );
          return;
        }

        // User clicking a notification body should only navigate, never re-insert into the database
        if (data?.actionUrl) {
          router.navigate(data.actionUrl as any);
        } else {
          router.navigate('/notifications');
        }
      }
    );

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  return { expoPushToken, notification };
}

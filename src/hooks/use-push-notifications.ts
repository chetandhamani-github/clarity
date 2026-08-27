import { useState, useEffect, useRef } from 'react';
import { Platform, DeviceEventEmitter } from 'react-native';
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useRouter } from 'expo-router';
import { insertNotification } from '@/services/database/notification-dao';

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
  } catch (e) {
    console.warn('expo-notifications not available', e);
  }
}

async function registerForPushNotificationsAsync() {
  let token;

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
      console.log('Failed to get push token for push notification!');
      return;
    }
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (!projectId) {
      console.log('Project ID not found in app config');
    }
    try {
      const pushTokenString = (
        await Notifications.getExpoPushTokenAsync({
          projectId,
        })
      ).data;
      token = pushTokenString;
    } catch (e: unknown) {
      console.log('Error getting push token', e);
    }
  } else {
    console.log('Must use physical device for Push Notifications or missing Notifications module');
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
      .catch((err) => console.log('registerForPushNotificationsAsync error:', err));

    notificationListener.current = Notifications.addNotificationReceivedListener((notification: any) => {
      setNotification(notification);
      
      const payload = notification.request.content;
      const data = payload.data as { type?: string; actionUrl?: string };

      insertNotification({
        title: payload.title || 'Notification',
        description: payload.body || '',
        type: (data?.type as any) || 'default',
        actionUrl: data?.actionUrl || '',
      }).then(() => {
        DeviceEventEmitter.emit('notificationsUpdated');
      }).catch((err) => console.error('Failed to insert push notification into DB:', err));
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response: any) => {
      const payload = response.notification.request.content;
      const data = payload.data as { type?: string; actionUrl?: string };
      
      insertNotification({
        title: payload.title || 'Notification',
        description: payload.body || '',
        type: (data?.type as any) || 'default',
        actionUrl: data?.actionUrl || '',
      }).then(() => {
        DeviceEventEmitter.emit('notificationsUpdated');
      }).catch((err) => console.error('Failed to insert push notification into DB:', err));

      if (data?.actionUrl) {
        router.push(data.actionUrl as any);
      } else {
        router.push('/notifications');
      }
    });

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

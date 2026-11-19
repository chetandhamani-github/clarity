import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import type { RawNotificationPayload, NotificationPermissionStatus } from '../types';

interface NativeNotificationListenerBridge {
  isAvailable(): Promise<boolean>;
  isPermissionGranted(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  drainPendingNotifications(): Promise<RawNotificationPayload[]>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export class NativeNotificationListenerAdapter {
  private static eventEmitter: NativeEventEmitter | null = null;

  private static getBridge(): NativeNotificationListenerBridge | null {
    if (Platform.OS !== 'android') return null;
    const { NotificationListener } = NativeModules;
    return NotificationListener as NativeNotificationListenerBridge | null;
  }

  public static async isAvailable(): Promise<boolean> {
    const bridge = this.getBridge();
    if (!bridge) return false;
    try {
      return await bridge.isAvailable();
    } catch {
      return false;
    }
  }

  public static async checkPermission(): Promise<NotificationPermissionStatus> {
    if (Platform.OS !== 'android') return 'unavailable';
    const bridge = this.getBridge();
    if (!bridge) return 'unavailable';

    try {
      const granted = await bridge.isPermissionGranted();
      return granted ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }

  public static async requestPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    const bridge = this.getBridge();
    if (!bridge) return false;

    try {
      return await bridge.requestPermission();
    } catch {
      return false;
    }
  }

  public static async drainPendingNotifications(): Promise<RawNotificationPayload[]> {
    const bridge = this.getBridge();
    if (!bridge) return [];

    try {
      const results = await bridge.drainPendingNotifications();
      return results || [];
    } catch {
      return [];
    }
  }

  public static subscribeToNotifications(
    callback: (notification: RawNotificationPayload) => void
  ): () => void {
    if (Platform.OS !== 'android') {
      return () => {};
    }

    const { NotificationListener } = NativeModules;
    if (!NotificationListener) {
      return () => {};
    }

    if (!this.eventEmitter) {
      this.eventEmitter = new NativeEventEmitter(NotificationListener);
    }

    const subscription = this.eventEmitter.addListener('onNotificationReceived', (data) => {
      if (data && typeof data === 'object') {
        callback(data as RawNotificationPayload);
      }
    });

    return () => {
      subscription.remove();
    };
  }
}


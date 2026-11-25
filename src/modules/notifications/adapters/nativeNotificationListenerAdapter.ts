import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type {
  NotificationListenerHealth,
  NotificationPermissionStatus,
  RawNotificationPayload,
} from '../types';

interface NativeNotificationListenerBridge {
  isAvailable(): Promise<boolean>;
  isPermissionGranted(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  isBatteryOptimizationIgnored?(): Promise<boolean>;
  openBatteryOptimizationSettings?(): Promise<boolean>;
  getListenerHealth?(): Promise<NotificationListenerHealth>;
  requestRebind?(): Promise<boolean>;
  setJsListenerReady?(ready: boolean): void;
  clearBridgeState?(): Promise<boolean>;
  peekPendingNotifications?(): Promise<RawNotificationPayload[]>;
  ackPendingNotifications?(ids: string[]): Promise<boolean>;
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

  public static hasTransactionalQueueSupport(): boolean {
    const bridge = this.getBridge();
    return Boolean(
      bridge &&
        typeof bridge.peekPendingNotifications === 'function' &&
        typeof bridge.ackPendingNotifications === 'function'
    );
  }

  public static async peekPendingNotifications(): Promise<RawNotificationPayload[]> {
    const bridge = this.getBridge();
    if (!bridge) return [];

    try {
      if (typeof bridge.peekPendingNotifications === 'function') {
        const results = await bridge.peekPendingNotifications();
        return results || [];
      }
      const results = await bridge.drainPendingNotifications();
      return results || [];
    } catch {
      return [];
    }
  }

  public static async ackPendingNotifications(ids: string[]): Promise<boolean> {
    if (ids.length === 0) return true;
    const bridge = this.getBridge();
    if (!bridge || typeof bridge.ackPendingNotifications !== 'function') return false;

    try {
      return await bridge.ackPendingNotifications(ids);
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

  public static async isBatteryOptimizationIgnored(): Promise<boolean> {
    const bridge = this.getBridge();
    if (!bridge?.isBatteryOptimizationIgnored) return true;

    try {
      return await bridge.isBatteryOptimizationIgnored();
    } catch {
      return false;
    }
  }

  public static async openBatteryOptimizationSettings(): Promise<boolean> {
    const bridge = this.getBridge();
    if (!bridge?.openBatteryOptimizationSettings) return false;

    try {
      return await bridge.openBatteryOptimizationSettings();
    } catch {
      return false;
    }
  }

  public static async getListenerHealth(): Promise<NotificationListenerHealth | null> {
    const bridge = this.getBridge();
    if (!bridge?.getListenerHealth) return null;

    try {
      return await bridge.getListenerHealth();
    } catch {
      return null;
    }
  }

  public static async requestRebind(): Promise<boolean> {
    const bridge = this.getBridge();
    if (!bridge?.requestRebind) return false;

    try {
      return await bridge.requestRebind();
    } catch {
      return false;
    }
  }

  public static setJsListenerReady(ready: boolean): void {
    const bridge = this.getBridge();
    if (!bridge?.setJsListenerReady) return;
    try {
      bridge.setJsListenerReady(ready);
    } catch {
      // Ignore bridge call failures
    }
  }

  public static async clearBridgeState(): Promise<boolean> {
    const bridge = this.getBridge();
    if (!bridge?.clearBridgeState) return false;

    try {
      return await bridge.clearBridgeState();
    } catch {
      return false;
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


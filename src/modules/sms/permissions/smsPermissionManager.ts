import { Platform, PermissionsAndroid, PermissionStatus } from 'react-native';
import type { SmsPermissionStatus } from '@/modules/sms/types';

export class SmsPermissionManager {
  /**
   * Check current SMS read permission status.
   */
  public static async checkSmsPermission(): Promise<SmsPermissionStatus> {
    if (Platform.OS !== 'android') {
      return 'unavailable';
    }

    try {
      const hasPermission = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_SMS
      );
      return hasPermission ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }

  /**
   * Request SMS read permission from user.
   * Handles granted, denied, and permanently denied (never_ask_again).
   */
  public static async requestSmsPermission(): Promise<SmsPermissionStatus> {
    if (Platform.OS !== 'android') {
      return 'unavailable';
    }

    try {
      const result: PermissionStatus = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_SMS,
        {
          title: 'Clarity SMS Access',
          message:
            'Clarity needs read access to your SMS messages to automatically detect bank transactions, bills, and subscriptions completely offline on your device.',
          buttonPositive: 'Allow Access',
          buttonNegative: 'Deny',
          buttonNeutral: 'Ask Later',
        }
      );

      if (result === PermissionsAndroid.RESULTS.GRANTED) {
        return 'granted';
      } else if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        return 'permanently_denied';
      } else {
        return 'denied';
      }
    } catch {
      return 'denied';
    }
  }
}

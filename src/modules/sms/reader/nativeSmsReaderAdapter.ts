import { NativeModules, Platform } from 'react-native';
import type { ISmsReaderAdapter, RawSmsMessage, SmsReadOptions } from '@/modules/sms/types';

interface NativeSmsReaderBridge {
  isAvailable(): Promise<boolean>;
  getSms(options?: Record<string, unknown>): Promise<RawSmsMessage[]>;
  getSmsSince(timestamp: number, limit?: number): Promise<RawSmsMessage[]>;
}

export class NativeSmsReaderAdapter implements ISmsReaderAdapter {
  private getBridge(): NativeSmsReaderBridge | null {
    if (Platform.OS !== 'android') return null;
    const { SmsReader } = NativeModules;
    return SmsReader as NativeSmsReaderBridge | null;
  }

  public async isAvailable(): Promise<boolean> {
    const bridge = this.getBridge();
    if (!bridge) return false;
    try {
      return await bridge.isAvailable();
    } catch {
      return false;
    }
  }

  public async getSms(options?: SmsReadOptions): Promise<RawSmsMessage[]> {
    const bridge = this.getBridge();
    if (!bridge) {
      return [];
    }

    try {
      const results = await bridge.getSms(options as Record<string, unknown>);
      return results || [];
    } catch (err) {
      console.warn('[NativeSmsReaderAdapter] Failed to fetch SMS:', err);
      return [];
    }
  }

  public async getSmsSince(timestamp: number, limit: number = 500): Promise<RawSmsMessage[]> {
    const bridge = this.getBridge();
    if (!bridge) {
      return [];
    }

    try {
      const results = await bridge.getSmsSince(timestamp, limit);
      return results || [];
    } catch (err) {
      console.warn('[NativeSmsReaderAdapter] Failed to fetch SMS since:', err);
      return [];
    }
  }
}

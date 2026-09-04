import type { ISmsReaderAdapter, RawSmsMessage, SmsReadOptions } from '@/modules/sms/types';
import { NativeSmsReaderAdapter } from './nativeSmsReaderAdapter';
import { MockSmsReaderAdapter } from './mockSmsReaderAdapter';

export class SmsReaderService {
  private static adapter: ISmsReaderAdapter = new NativeSmsReaderAdapter();

  /**
   * Set custom reader adapter (e.g. MockSmsReaderAdapter in tests).
   */
  public static setAdapter(customAdapter: ISmsReaderAdapter): void {
    this.adapter = customAdapter;
  }

  /**
   * Get active reader adapter.
   */
  public static getAdapter(): ISmsReaderAdapter {
    return this.adapter;
  }

  /**
   * Reset adapter to default NativeSmsReaderAdapter.
   */
  public static resetAdapter(): void {
    this.adapter = new NativeSmsReaderAdapter();
  }

  /**
   * Check if SMS reader is available on current platform/device.
   */
  public static async isAvailable(): Promise<boolean> {
    return this.adapter.isAvailable();
  }

  /**
   * Read inbox SMS messages with optional query parameters.
   */
  public static async getAllSms(options?: SmsReadOptions): Promise<RawSmsMessage[]> {
    return this.adapter.getSms(options);
  }

  /**
   * Read the most recent N messages.
   */
  public static async getRecentSms(limit: number = 100): Promise<RawSmsMessage[]> {
    return this.adapter.getSms({ limit, offset: 0 });
  }

  /**
   * Read SMS messages newer than a given epoch millisecond timestamp.
   */
  public static async getSmsSince(
    lastTimestamp: number,
    options?: Omit<SmsReadOptions, 'sinceTimestamp'>
  ): Promise<RawSmsMessage[]> {
    return this.adapter.getSms({ ...options, sinceTimestamp: lastTimestamp });
  }

  /**
   * Read SMS messages within a date range.
   */
  public static async getSmsDateRange(
    startDate: number,
    endDate: number,
    options?: Omit<SmsReadOptions, 'startDate' | 'endDate'>
  ): Promise<RawSmsMessage[]> {
    return this.adapter.getSms({ ...options, startDate, endDate });
  }

  /**
   * Memory-efficient batch reader for high-volume historical SMS.
   * Yields messages in batches to avoid high memory spikes.
   */
  public static async readInBatches(
    batchSize: number = 500,
    onBatch: (batch: RawSmsMessage[], isLastBatch: boolean) => Promise<boolean | void>,
    options?: SmsReadOptions
  ): Promise<number> {
    let offset = options?.offset ?? 0;
    let totalRead = 0;
    let hasMore = true;

    while (hasMore) {
      const batch = await this.adapter.getSms({
        ...options,
        limit: batchSize,
        offset,
      });

      if (batch.length === 0) {
        break;
      }

      totalRead += batch.length;
      const isLastBatch = batch.length < batchSize;
      const shouldContinue = await onBatch(batch, isLastBatch);

      if (shouldContinue === false || isLastBatch) {
        hasMore = false;
        break;
      }

      offset += batch.length;
    }

    return totalRead;
  }
}

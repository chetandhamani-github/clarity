import type { ISmsReaderAdapter, RawSmsMessage, SmsReadOptions } from '@/modules/sms/types';

export class MockSmsReaderAdapter implements ISmsReaderAdapter {
  private messages: RawSmsMessage[] = [];

  constructor(initialMessages: RawSmsMessage[] = []) {
    this.messages = [...initialMessages];
  }

  public setMessages(messages: RawSmsMessage[]): void {
    this.messages = [...messages];
  }

  public addMessage(message: RawSmsMessage): void {
    this.messages.unshift(message);
  }

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public async getSms(options?: SmsReadOptions): Promise<RawSmsMessage[]> {
    let filtered = [...this.messages];

    if (options?.sinceTimestamp !== undefined) {
      filtered = filtered.filter((m) => m.date >= options.sinceTimestamp!);
    }
    if (options?.startDate !== undefined) {
      filtered = filtered.filter((m) => m.date >= options.startDate!);
    }
    if (options?.endDate !== undefined) {
      filtered = filtered.filter((m) => m.date <= options.endDate!);
    }
    if (options?.address) {
      const addr = options.address.toLowerCase();
      filtered = filtered.filter((m) => m.address.toLowerCase().includes(addr));
    }

    filtered.sort((a, b) => b.date - a.date);

    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? filtered.length;

    return filtered.slice(offset, offset + limit);
  }

  public async getSmsSince(timestamp: number, limit: number = 500): Promise<RawSmsMessage[]> {
    return this.getSms({ sinceTimestamp: timestamp, limit });
  }
}

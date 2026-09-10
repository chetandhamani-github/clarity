import { SmsReaderService } from './smsReaderService';
import { MockSmsReaderAdapter } from './mockSmsReaderAdapter';
import type { RawSmsMessage } from '@/modules/sms/types';

describe('SmsReaderService', () => {
  const sampleMessages: RawSmsMessage[] = [
    {
      id: '1',
      address: 'VM-HDFCBK',
      body: 'Rs.500.00 debited from A/c XX1234 on 01-Jan-25',
      date: 1704067200000,
    },
    {
      id: '2',
      address: 'AD-ICICIB',
      body: 'Acct XX5678 debited for Rs 1200.00 on 02-Jan-25',
      date: 1704153600000,
    },
    {
      id: '3',
      address: 'VK-SBIINB',
      body: 'A/C 9999 debited by 250.00 on 03-Jan-25',
      date: 1704240000000,
    },
  ];

  let mockAdapter: MockSmsReaderAdapter;

  beforeEach(() => {
    mockAdapter = new MockSmsReaderAdapter(sampleMessages);
    SmsReaderService.setAdapter(mockAdapter);
  });

  afterAll(() => {
    SmsReaderService.resetAdapter();
  });

  it('fetches all messages ordered by date descending', async () => {
    const messages = await SmsReaderService.getAllSms();
    expect(messages).toHaveLength(3);
    expect(messages[0].id).toBe('3');
    expect(messages[1].id).toBe('2');
    expect(messages[2].id).toBe('1');
  });

  it('fetches recent messages with limit', async () => {
    const messages = await SmsReaderService.getRecentSms(2);
    expect(messages).toHaveLength(2);
    expect(messages[0].id).toBe('3');
    expect(messages[1].id).toBe('2');
  });

  it('includes the cursor timestamp so the sync service can de-duplicate safely', async () => {
    const messages = await SmsReaderService.getSmsSince(1704067200000);
    expect(messages).toHaveLength(3);
    expect(messages.map((m) => m.id)).toEqual(['3', '2', '1']);
  });

  it('fetches messages within a date range', async () => {
    const messages = await SmsReaderService.getSmsDateRange(
      1704067200000,
      1704153600000
    );
    expect(messages).toHaveLength(2);
    expect(messages.map((m) => m.id)).toEqual(['2', '1']);
  });

  it('streams messages in batches without exceeding batchSize', async () => {
    const batches: RawSmsMessage[][] = [];
    const totalRead = await SmsReaderService.readInBatches(2, async (batch) => {
      batches.push(batch);
    });

    expect(totalRead).toBe(3);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(2);
    expect(batches[1]).toHaveLength(1);
  });
});

import { RecurringDetectionEngine } from './recurringDetectionEngine';
import type { ParsedTransaction } from '@/modules/sms/types';

describe('RecurringDetectionEngine', () => {
  const createTx = (
    id: string,
    merchant: string,
    amount: number,
    dateStr: string,
    accountMask: string = '1234'
  ): ParsedTransaction => ({
    id,
    smsId: `sms-${id}`,
    amount,
    type: 'DEBIT',
    merchant,
    category: 'Subscriptions',
    bank: 'HDFC Bank',
    accountMask,
    timestamp: new Date(dateStr).getTime(),
    confidence: 1.0,
    isDuplicate: false,
    createdAt: new Date(dateStr).toISOString(),
  });

  it('detects monthly recurring Netflix subscription', () => {
    const transactions: ParsedTransaction[] = [
      createTx('1', 'Netflix', 649, '2025-01-15T10:00:00Z'),
      createTx('2', 'Netflix', 649, '2025-02-14T10:00:00Z'),
      createTx('3', 'Netflix', 649, '2025-03-16T10:00:00Z'),
    ];

    const recurring = RecurringDetectionEngine.detectRecurring(transactions);
    expect(recurring).toHaveLength(1);
    const item = recurring[0];
    expect(item.merchant).toBe('Netflix');
    expect(item.frequency).toBe('monthly');
    expect(item.amount).toBe(649);
    expect(item.transactionCount).toBe(3);
    expect(item.confidence).toBeGreaterThanOrEqual(0.8);
    expect(item.nextPredictedDate).toBeDefined();
  });

  it('detects monthly recurring EMI payments', () => {
    const transactions: ParsedTransaction[] = [
      createTx('1', 'Home Loan EMI', 25000, '2025-01-05T08:00:00Z'),
      createTx('2', 'Home Loan EMI', 25000, '2025-02-05T08:00:00Z'),
    ];

    const recurring = RecurringDetectionEngine.detectRecurring(transactions);
    expect(recurring).toHaveLength(1);
    expect(recurring[0].merchant).toBe('Home Loan EMI');
    expect(recurring[0].frequency).toBe('monthly');
  });

  it('ignores irregular one-off transactions', () => {
    const transactions: ParsedTransaction[] = [
      createTx('1', 'Zara Clothing', 3500, '2025-01-10T12:00:00Z'),
      createTx('2', 'Zara Clothing', 1200, '2025-01-12T15:00:00Z'),
    ];

    const recurring = RecurringDetectionEngine.detectRecurring(transactions);
    expect(recurring).toHaveLength(0);
  });
});

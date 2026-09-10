import { DuplicateDetectionEngine } from './duplicateDetectionEngine';
import type { ExtractedTransaction } from '@/modules/sms/types';

describe('DuplicateDetectionEngine', () => {
  beforeEach(() => {
    DuplicateDetectionEngine.clearCache();
  });

  const baseTx: ExtractedTransaction = {
    amount: 500,
    type: 'DEBIT',
    merchant: 'Swiggy',
    bank: 'HDFC Bank',
    accountMask: '1234',
    referenceNumber: 'REF12345678',
    timestamp: 1705315200000,
  };

  it('detects duplicate by exact reference number within memory cache', async () => {
    DuplicateDetectionEngine.addToCache({
      id: 'tx-original',
      amount: baseTx.amount,
      accountMask: baseTx.accountMask,
      type: baseTx.type,
      merchant: baseTx.merchant,
      referenceNumber: baseTx.referenceNumber,
      timestamp: baseTx.timestamp,
    });

    const result = await DuplicateDetectionEngine.isDuplicate(
      { ...baseTx, timestamp: baseTx.timestamp + 5 * 60 * 1000 },
      { checkDatabase: false }
    );

    expect(result.isDuplicate).toBe(true);
    expect(result.duplicateOfId).toBe('tx-original');
    expect(result.reason).toContain('Duplicate reference number');
  });

  it('detects the same merchant, amount, account, and direction within the duplicate window', async () => {
    DuplicateDetectionEngine.addToCache({
      id: 'tx-original',
      amount: 1250,
      accountMask: '5678',
      type: 'DEBIT',
      merchant: 'Uber',
      timestamp: 1705315200000,
    });

    const result = await DuplicateDetectionEngine.isDuplicate(
      {
        amount: 1250,
        accountMask: '5678',
        type: 'DEBIT',
        merchant: 'Uber',
        bank: 'ICICI Bank',
        timestamp: 1705315200000 + 2 * 60 * 1000,
      },
      { checkDatabase: false }
    );

    expect(result.isDuplicate).toBe(true);
    expect(result.duplicateOfId).toBe('tx-original');
  });

  it('keeps separate same-amount purchases at different merchants', async () => {
    DuplicateDetectionEngine.addToCache({
      id: 'tx-original',
      amount: 500,
      accountMask: '1234',
      type: 'DEBIT',
      merchant: 'Swiggy',
      timestamp: 1705315200000,
    });

    const result = await DuplicateDetectionEngine.isDuplicate(
      {
        ...baseTx,
        merchant: 'Zomato',
        referenceNumber: undefined,
        timestamp: baseTx.timestamp + 2 * 60 * 1000,
      },
      { checkDatabase: false }
    );

    expect(result.isDuplicate).toBe(false);
  });

  it('keeps a matching merchant purchase outside the duplicate window', async () => {
    DuplicateDetectionEngine.addToCache({
      id: 'tx-original',
      amount: baseTx.amount,
      accountMask: baseTx.accountMask,
      type: baseTx.type,
      merchant: baseTx.merchant,
      timestamp: baseTx.timestamp,
    });

    const result = await DuplicateDetectionEngine.isDuplicate(
      { ...baseTx, referenceNumber: undefined, timestamp: baseTx.timestamp + 16 * 60 * 1000 },
      { checkDatabase: false }
    );

    expect(result.isDuplicate).toBe(false);
  });
});

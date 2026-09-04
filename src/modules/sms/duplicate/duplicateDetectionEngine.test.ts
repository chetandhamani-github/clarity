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
      referenceNumber: baseTx.referenceNumber,
      timestamp: baseTx.timestamp,
    });

    const duplicateCandidate: ExtractedTransaction = {
      ...baseTx,
      timestamp: baseTx.timestamp + 5 * 60 * 1000, // 5 minutes later
    };

    const res = await DuplicateDetectionEngine.isDuplicate(duplicateCandidate, {
      checkDatabase: false,
    });
    expect(res.isDuplicate).toBe(true);
    expect(res.duplicateOfId).toBe('tx-original');
    expect(res.reason).toContain('Duplicate reference number');
  });

  it('detects duplicate by amount and account within sliding time window', async () => {
    DuplicateDetectionEngine.addToCache({
      id: 'tx-orig-2',
      amount: 1250,
      accountMask: '5678',
      type: 'DEBIT',
      timestamp: 1705315200000,
    });

    const candidate: ExtractedTransaction = {
      amount: 1250,
      accountMask: '5678',
      type: 'DEBIT',
      merchant: 'Uber',
      bank: 'ICICI Bank',
      timestamp: 1705315200000 + 2 * 60 * 1000, // 2 minutes later
    };

    const res = await DuplicateDetectionEngine.isDuplicate(candidate, {
      checkDatabase: false,
    });
    expect(res.isDuplicate).toBe(true);
    expect(res.duplicateOfId).toBe('tx-orig-2');
  });

  it('does not flag distinct transactions with different amounts as duplicates', async () => {
    DuplicateDetectionEngine.addToCache({
      id: 'tx-orig-3',
      amount: 500,
      accountMask: '1234',
      type: 'DEBIT',
      timestamp: 1705315200000,
    });

    const differentCandidate: ExtractedTransaction = {
      amount: 750,
      accountMask: '1234',
      type: 'DEBIT',
      merchant: 'Zomato',
      bank: 'HDFC Bank',
      timestamp: 1705315200000,
    };

    const res = await DuplicateDetectionEngine.isDuplicate(differentCandidate, {
      checkDatabase: false,
    });
    expect(res.isDuplicate).toBe(false);
  });
});

import type { Transaction } from '@/types';
import { deduplicateStatementTransactions } from './statement-import-helpers';

describe('deduplicateStatementTransactions', () => {
  it('separates genuine duplicates from new transactions and exposes duplicateTransactions', () => {
    const existing: Transaction[] = [
      {
        id: 'tx-1',
        accountId: 'acc-1',
        amount: 450,
        type: 'expense',
        merchant: 'Swiggy',
        category: 'Dining',
        date: '2026-11-20',
        isRecurring: false,
        note: '',
      },
    ];

    const items = [
      {
        date: '2026-11-20',
        merchant: 'Swiggy Order',
        amount: 450,
        type: 'expense' as const,
        category: 'Dining',
        note: 'UPI/SWIGGY',
      },
      {
        date: '2026-11-21',
        merchant: 'Zomato',
        amount: 320,
        type: 'expense' as const,
        category: 'Dining',
        note: '',
      },
    ];

    const res = deduplicateStatementTransactions(items, existing);
    expect(res.duplicateCount).toBe(1);
    expect(res.duplicateTransactions).toHaveLength(1);
    expect(res.duplicateTransactions[0].merchant).toBe('Swiggy Order');
    expect(res.newTransactions).toHaveLength(1);
    expect(res.newTransactions[0].merchant).toBe('Zomato');
  });

  it('does not falsely mark cross-day transactions as duplicates when merchants have no distinctive tokens', () => {
    const existing: Transaction[] = [
      {
        id: 'tx-1',
        accountId: 'acc-1',
        amount: 100,
        type: 'expense',
        merchant: 'UPI',
        category: 'Other',
        date: '2026-11-19',
        isRecurring: false,
        note: '',
      },
    ];

    const items = [
      {
        date: '2026-11-20',
        merchant: 'Statement Transaction',
        amount: 100,
        type: 'expense' as const,
        category: 'Other',
        note: '',
      },
    ];

    const res = deduplicateStatementTransactions(items, existing);
    expect(res.duplicateCount).toBe(0);
    expect(res.duplicateTransactions).toHaveLength(0);
    expect(res.newTransactions).toHaveLength(1);
  });
});


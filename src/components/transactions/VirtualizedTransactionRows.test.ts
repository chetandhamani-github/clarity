import {
  SECTION_HEADER_HEIGHT,
  TRANSACTION_ROW_HEIGHT,
  buildFlatTransactionListItems,
  getPreparedTransactionRow,
  getTransactionListItemLayout,
  prepareTransactionRow,
} from './VirtualizedTransactionRows';
import type { TransactionWithAccount } from '@/types';

jest.mock('@expo/vector-icons', () => ({
  MaterialIcons: 'MaterialIcons',
}));

jest.mock('@/store/use-app-store', () => ({
  useAppStore: {
    getState: () => ({
      currency: 'INR',
      hideBalances: false,
    }),
  },
}));

function makeTx(overrides: Partial<TransactionWithAccount> = {}): TransactionWithAccount {
  return {
    id: 'tx-1',
    accountId: 'acc-1',
    amount: 250,
    type: 'expense',
    merchant: 'Swiggy',
    category: 'Food & Dining',
    date: '2026-11-26T12:00:00Z',
    isRecurring: false,
    note: '',
    accountName: 'HDFC Savings',
    ...overrides,
  };
}

describe('VirtualizedTransactionRows helpers', () => {
  it('prepares expense and income rows with generic merchant fallback and tag summary', () => {
    const row = prepareTransactionRow(
      makeTx({
        merchant: 'HDFC Bank Transaction',
        category: 'Groceries',
        tags: ['essentials', 'monthly', 'home'],
        splits: [
          { category: 'Groceries', amount: 200 },
          { category: 'Household', amount: 50 },
        ],
        receiptUri: 'file:///receipt.jpg',
      })
    );

    expect(row.title).toBe('Groceries');
    expect(row.isCredit).toBe(false);
    expect(row.amountText.startsWith('-')).toBe(true);
    expect(row.tagLabel).toBe('#essentials +2');
    expect(row.splitCount).toBe(2);
    expect(row.hasReceipt).toBe(true);
    expect(row.subtitle).toContain('HDFC Savings');
  });

  it('determines transfer sign and credit state relative to locked/filtered accountId', () => {
    const transfer = makeTx({
      id: 'tx-transfer',
      type: 'transfer',
      accountId: 'acc-src',
      accountName: 'Checking',
      toAccountId: 'acc-dst',
      toAccountName: 'Savings',
      amount: 1500,
    });

    const outgoing = getPreparedTransactionRow(transfer, 'INR', 'acc-src');
    const incoming = getPreparedTransactionRow(transfer, 'INR', 'acc-dst');
    const unfiltered = getPreparedTransactionRow(transfer, 'INR');

    expect(outgoing.isCredit).toBe(false);
    expect(outgoing.amountText.startsWith('-')).toBe(true);
    expect(incoming.isCredit).toBe(true);
    expect(incoming.amountText.startsWith('+')).toBe(true);
    expect(unfiltered.isCredit).toBe(false);
    expect(unfiltered.amountText.startsWith('+')).toBe(false);
    expect(unfiltered.amountText.startsWith('-')).toBe(false);
    expect(incoming.subtitle).toContain('Checking → Savings');
  });

  it('builds flattened sectioned list items with accurate cumulative offsets and item layouts', () => {
    const txs: TransactionWithAccount[] = [
      makeTx({ id: 'tx-a', date: '2026-11-26', amount: 100 }),
      makeTx({ id: 'tx-b', date: '2026-11-26', amount: 200 }),
      makeTx({ id: 'tx-c', date: '2026-11-25', amount: 300 }),
    ];

    const items = buildFlatTransactionListItems(txs, 'INR');

    expect(items).toHaveLength(5);
    expect(items[0]).toMatchObject({
      kind: 'header',
      key: 'header:2026-11-26',
      isFirst: true,
      offset: 0,
      length: SECTION_HEADER_HEIGHT,
    });
    expect(items[1]).toMatchObject({
      kind: 'row',
      key: 'tx-a',
      isLastInSection: false,
      isVeryLast: false,
      offset: SECTION_HEADER_HEIGHT,
      length: TRANSACTION_ROW_HEIGHT,
    });
    expect(items[2]).toMatchObject({
      kind: 'row',
      key: 'tx-b',
      isLastInSection: true,
      isVeryLast: false,
      offset: SECTION_HEADER_HEIGHT + TRANSACTION_ROW_HEIGHT,
      length: TRANSACTION_ROW_HEIGHT,
    });
    expect(items[3]).toMatchObject({
      kind: 'header',
      key: 'header:2026-11-25',
      isFirst: false,
      offset: SECTION_HEADER_HEIGHT + TRANSACTION_ROW_HEIGHT * 2,
      length: SECTION_HEADER_HEIGHT,
    });
    expect(items[4]).toMatchObject({
      kind: 'row',
      key: 'tx-c',
      isLastInSection: true,
      isVeryLast: true,
      offset: SECTION_HEADER_HEIGHT * 2 + TRANSACTION_ROW_HEIGHT * 2,
      length: TRANSACTION_ROW_HEIGHT,
    });

    expect(getTransactionListItemLayout(items, 4)).toEqual({
      length: TRANSACTION_ROW_HEIGHT,
      offset: SECTION_HEADER_HEIGHT * 2 + TRANSACTION_ROW_HEIGHT * 2,
      index: 4,
    });
    expect(getTransactionListItemLayout(items, 99)).toEqual({
      length: TRANSACTION_ROW_HEIGHT,
      offset: 99 * TRANSACTION_ROW_HEIGHT,
      index: 99,
    });
  });

  it('reuses cached prepared row within the same context and tx reference', () => {
    const tx = makeTx({ id: 'tx-cache' });
    const first = getPreparedTransactionRow(tx, 'INR', 'acc-1');
    const second = getPreparedTransactionRow(tx, 'INR', 'acc-1');
    const differentCurrency = getPreparedTransactionRow(tx, 'USD', 'acc-1');

    expect(second).toBe(first);
    expect(differentCurrency).not.toBe(first);
  });
});

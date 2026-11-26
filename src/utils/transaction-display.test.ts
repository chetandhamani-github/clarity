import {
  getTransactionDisplayName,
  hasMeaningfulMerchant,
} from './transaction-display';

describe('transaction display helpers', () => {
  it('uses the category when an SMS parser stored a generic bank transaction label', () => {
    const transaction = {
      type: 'expense' as const,
      merchant: 'HDFC Bank Transaction',
      category: 'Food & Dining',
    };

    expect(hasMeaningfulMerchant(transaction)).toBe(false);
    expect(getTransactionDisplayName(transaction)).toBe('Food & Dining');
  });

  it('keeps a meaningful merchant name', () => {
    const transaction = {
      type: 'expense' as const,
      merchant: 'Swiggy',
      category: 'Food & Dining',
    };

    expect(hasMeaningfulMerchant(transaction)).toBe(true);
    expect(getTransactionDisplayName(transaction)).toBe('Swiggy');
  });

  it('shows meaningful transfer labels while falling back to Transfer for generic labels', () => {
    expect(
      getTransactionDisplayName({
        type: 'transfer',
        merchant: 'Home Loan EMI',
        category: 'Transfer',
      })
    ).toBe('Home Loan EMI');

    expect(
      getTransactionDisplayName({
        type: 'transfer',
        merchant: 'Transfer',
        category: 'Transfer',
      })
    ).toBe('Transfer');
  });
});

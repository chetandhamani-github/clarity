import {
  computeTransferImpact,
  getAccountTypeShortLabel,
  isLiabilityAccountType,
  isLiquidAccountType,
  pickDefaultAccountId,
  pickDefaultSourceAccountId,
  summarizeAccounts,
} from './account-metrics';
import type { Account } from '@/types';

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-1',
    name: 'Main Bank',
    type: 'savings',
    balance: 50000,
    institution: 'HDFC',
    lastFour: '1234',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('account-metrics helpers', () => {
  it('classifies liability and liquid account types accurately', () => {
    expect(isLiabilityAccountType('loan')).toBe(true);
    expect(isLiabilityAccountType('credit')).toBe(true);
    expect(isLiabilityAccountType('borrowed')).toBe(true);
    expect(isLiabilityAccountType('savings')).toBe(false);

    expect(isLiquidAccountType('savings')).toBe(true);
    expect(isLiquidAccountType('current')).toBe(true);
    expect(isLiquidAccountType('wallet')).toBe(true);
    expect(isLiquidAccountType('loan')).toBe(false);
    expect(getAccountTypeShortLabel('loan')).toBe('Loan');
  });

  it('picks a liquid non-liability account as default paying source when target is a loan', () => {
    const loan = makeAccount({ id: 'loan-1', name: 'Car Loan', type: 'loan', balance: -20000 });
    const card = makeAccount({ id: 'cc-1', name: 'Credit Card', type: 'credit', balance: -4000 });
    const bank = makeAccount({ id: 'bank-1', name: 'Main Bank', type: 'savings', balance: 50000 });

    expect(pickDefaultSourceAccountId([loan, card, bank], loan.id)).toBe('bank-1');
    expect(pickDefaultSourceAccountId([loan, card], loan.id)).toBe('cc-1');
    expect(pickDefaultSourceAccountId([loan], loan.id)).toBeNull();
  });

  it('prefers primary account in pickDefaultAccountId and pickDefaultSourceAccountId', () => {
    const bank1 = makeAccount({ id: 'bank-1', name: 'Bank 1', type: 'savings', isPrimary: false });
    const bank2 = makeAccount({ id: 'bank-2', name: 'Bank 2', type: 'savings', isPrimary: true });
    const loan = makeAccount({ id: 'loan-1', name: 'Loan', type: 'loan', balance: -10000 });

    expect(pickDefaultAccountId([bank1, bank2])).toBe('bank-2');
    expect(pickDefaultAccountId([bank1])).toBe('bank-1');
    expect(pickDefaultAccountId([loan, bank1])).toBe('bank-1');
    const lent = makeAccount({ id: 'lent-1', name: 'Lent Money', type: 'lent', isPrimary: false });
    expect(pickDefaultAccountId([lent, loan, bank1])).toBe('bank-1');
    expect(pickDefaultAccountId([])).toBeNull();
    expect(pickDefaultSourceAccountId([bank1, bank2, loan], loan.id)).toBe('bank-2');
  });

  it('computes transfer balance preview for paying 2k from main bank to 20k debt account', () => {
    const bank = makeAccount({ id: 'bank-1', type: 'savings', balance: 50000 });
    const loan = makeAccount({ id: 'loan-1', type: 'loan', balance: -20000 });

    const impact = computeTransferImpact(bank, loan, 2000);
    expect(impact).toEqual({
      fromBefore: 50000,
      fromAfter: 48000,
      toBefore: -20000,
      toAfter: -18000,
      isToLiability: true,
      debtBefore: 20000,
      debtAfter: 18000,
      debtReduced: 2000,
      exceedsDebtBy: 0,
    });
  });

  it('flags overpayment amount when payment exceeds remaining loan debt', () => {
    const bank = makeAccount({ id: 'bank-1', type: 'savings', balance: 50000 });
    const loan = makeAccount({ id: 'loan-1', type: 'loan', balance: -1500 });

    const impact = computeTransferImpact(bank, loan, 2000);
    expect(impact.debtReduced).toBe(1500);
    expect(impact.debtAfter).toBe(0);
    expect(impact.toAfter).toBe(500);
    expect(impact.exceedsDebtBy).toBe(500);
  });

  it('summarizes assets and liabilities consistently', () => {
    const metrics = summarizeAccounts([
      makeAccount({ id: 'bank-1', type: 'savings', balance: 50000 }),
      makeAccount({ id: 'loan-1', type: 'loan', balance: -20000 }),
    ]);

    expect(metrics.totalAssets).toBe(50000);
    expect(metrics.totalLiabilities).toBe(20000);
    expect(metrics.netBalance).toBe(30000);
  });
});


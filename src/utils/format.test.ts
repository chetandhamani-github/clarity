import { formatPercentage, getTransactionSign, groupTransactionsByDate } from './format';

describe('format utilities', () => {
  it('formats percentages correctly', () => {
    expect(formatPercentage(50.25, 1)).toBe('50.3%');
    expect(formatPercentage(100, 0)).toBe('100%');
  });

  it('returns correct transaction sign', () => {
    expect(getTransactionSign('expense')).toBe('-');
    expect(getTransactionSign('income')).toBe('+');
    expect(getTransactionSign('transfer')).toBe('');
  });

  it('groups transactions by date properly', () => {
    const mockTxs = [
      { id: '1', date: '2026-09-01', amount: 100 },
      { id: '2', date: '2026-09-01', amount: 50 },
      { id: '3', date: '2026-08-30', amount: 200 },
    ];

    const groups = groupTransactionsByDate(mockTxs);
    expect(groups.length).toBe(2);
    expect(groups[0].date).toBe('2026-09-01');
    expect(groups[0].items.length).toBe(2);
    expect(groups[1].date).toBe('2026-08-30');
    expect(groups[1].items.length).toBe(1);
  });
});

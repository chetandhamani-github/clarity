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

  it('masks currency when privacy mode is active', () => {
    const { formatCurrencyPrivacy, formatCurrencyWholePrivacy } = require('./format');
    expect(formatCurrencyPrivacy(1500, false, true)).toBe('••••••');
    expect(formatCurrencyWholePrivacy(1500, true)).toBe('••••••');
    expect(formatCurrencyPrivacy(1500, false, false)).not.toBe('••••••');
  });

  describe('parseDateSafely', () => {
    const { parseDateSafely, formatTime, getRelativeTime } = require('./format');

    it('parses calendar dates "YYYY-MM-DD" as local date without timezone shift', () => {
      const d = parseDateSafely('2026-11-18');
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(10); // 0-indexed: 10 = November
      expect(d.getDate()).toBe(18);
    });

    it('parses SQLite UTC timestamps ("YYYY-MM-DD HH:MM:SS") as UTC', () => {
      // 09:30:00 UTC
      const d = parseDateSafely('2026-11-18 09:30:00');
      expect(d.toISOString()).toContain('2026-11-18T09:30:00');
    });

    it('parses ISO timestamps without Z as UTC', () => {
      const d = parseDateSafely('2026-11-18T09:30:00');
      expect(d.toISOString()).toContain('2026-11-18T09:30:00');
    });

    it('parses ISO timestamps with Z correctly', () => {
      const d = parseDateSafely('2026-11-18T09:30:00.000Z');
      expect(d.getTime()).toBe(new Date('2026-11-18T09:30:00.000Z').getTime());
    });

    it('calculates relative time correctly for recent SQLite timestamps', () => {
      // Created 2 minutes ago
      const twoMinutesAgoUtc = new Date(Date.now() - 2 * 60 * 1000)
        .toISOString()
        .replace('T', ' ')
        .split('.')[0];
      expect(getRelativeTime(twoMinutesAgoUtc)).toBe('2m ago');
    });
  });
});

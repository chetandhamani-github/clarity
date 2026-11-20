import { formatPercentage, formatTransactionTime, getTransactionSign, groupTransactionsByDate } from './format';

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

  it('groups transactions by date properly and ensures latest entry on same day is first', () => {
    const mockTxs = [
      { id: '1', date: '2026-09-01T09:00:00.000Z', amount: 100 },
      { id: '2', date: '2026-09-01T14:30:00.000Z', amount: 50 },
      { id: '3', date: '2026-08-30', amount: 200 },
    ];

    const groups = groupTransactionsByDate(mockTxs);
    expect(groups.length).toBe(2);
    expect(groups[0].date).toBe('2026-09-01');
    expect(groups[0].items.length).toBe(2);
    // Entry with 14:30 must be first, not last
    expect(groups[0].items[0].id).toBe('2');
    expect(groups[0].items[1].id).toBe('1');
    expect(groups[1].date).toBe('2026-08-30');
    expect(groups[1].items.length).toBe(1);
  });

  it('sorts same-day transactions by createdAt when date has no time component', () => {
    const mockTxs = [
      { id: 'tx-early', date: '2026-11-20', createdAt: '2026-11-20T08:00:00.000Z', amount: 30 },
      { id: 'tx-late', date: '2026-11-20', createdAt: '2026-11-20T17:00:00.000Z', amount: 80 },
    ];

    const groups = groupTransactionsByDate(mockTxs);
    expect(groups[0].items[0].id).toBe('tx-late');
    expect(groups[0].items[1].id).toBe('tx-early');
  });

  describe('formatTransactionTime', () => {
    it('formats time from ISO date string with time component', () => {
      const time = formatTransactionTime('2026-11-20T14:30:00.000Z');
      expect(time).toBeTruthy();
      expect(typeof time).toBe('string');
    });

    it('formats time from createdAt when date is plain YYYY-MM-DD', () => {
      const time = formatTransactionTime('2026-11-20', '2026-11-20T10:15:00.000Z');
      expect(time).toBeTruthy();
    });

    it('returns null when date has no time and no createdAt', () => {
      expect(formatTransactionTime('2026-11-20')).toBeNull();
    });

    it('returns null when neither date nor createdAt has time component', () => {
      expect(formatTransactionTime('2026-11-10', '2026-11-20')).toBeNull();
    });
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

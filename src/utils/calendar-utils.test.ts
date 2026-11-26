import {
  buildMonthCalendarGrid,
  formatCompactCalendarAmount,
  getMonthDateBounds,
  nextCalendarDateRange,
  summarizeMonthDailyTotals,
} from './calendar-utils';

describe('calendar-utils', () => {
  it('getMonthDateBounds handles leap years and 30/31-day months', () => {
    expect(getMonthDateBounds(2024, 2)).toEqual({
      dateFrom: '2024-02-01',
      dateTo: '2024-02-29',
    });
    expect(getMonthDateBounds(2026, 11)).toEqual({
      dateFrom: '2026-11-01',
      dateTo: '2026-11-30',
    });
  });

  it('buildMonthCalendarGrid builds a 7-column padded grid with local today flag', () => {
    // November 1, 2026 is a Sunday (weekday 0), 30 days -> 35 cells (trailing 5 Dec days)
    const cells = buildMonthCalendarGrid(2026, 11, '2026-11-26');
    expect(cells).toHaveLength(35);
    expect(cells[0]).toEqual({
      day: 1,
      dateStr: '2026-11-01',
      isCurrentMonth: true,
      isToday: false,
    });
    const todayCell = cells.find((c) => c.dateStr === '2026-11-26');
    expect(todayCell).toEqual({
      day: 26,
      dateStr: '2026-11-26',
      isCurrentMonth: true,
      isToday: true,
    });
    expect(cells[34]).toEqual({
      day: 5,
      dateStr: '2026-12-05',
      isCurrentMonth: false,
      isToday: false,
    });
  });

  it('formatCompactCalendarAmount formats compact amounts for INR and USD', () => {
    expect(formatCompactCalendarAmount(450, '₹', 'INR')).toBe('₹450');
    expect(formatCompactCalendarAmount(1250, '₹', 'INR')).toBe('₹1.3k');
    expect(formatCompactCalendarAmount(48000, '₹', 'INR')).toBe('₹48k');
    expect(formatCompactCalendarAmount(150000, '₹', 'INR')).toBe('₹1.5L');
    expect(formatCompactCalendarAmount(1500000, '$', 'USD')).toBe('$1.5M');
  });

  it('summarizeMonthDailyTotals aggregates income, expense, net, and count', () => {
    const summary = summarizeMonthDailyTotals([
      { date: '2026-11-01', income: 50000, expense: 1200, transfer: 0, count: 2 },
      { date: '2026-11-10', income: 0, expense: 350.5, transfer: 1000, count: 2 },
    ]);
    expect(summary).toEqual({
      income: 50000,
      expense: 1550.5,
      transfer: 1000,
      net: 48449.5,
      count: 4,
    });
  });

  it('nextCalendarDateRange handles single-day, forward/backward range, clear, and restart', () => {
    const first = nextCalendarDateRange(null, '2026-11-10');
    expect(first).toEqual({ start: '2026-11-10', end: '2026-11-10' });

    // Tapping same single date clears back to null
    expect(nextCalendarDateRange(first, '2026-11-10')).toBeNull();

    // Tapping later date forms forward range
    const forward = nextCalendarDateRange(first, '2026-11-18');
    expect(forward).toEqual({ start: '2026-11-10', end: '2026-11-18' });

    // Tapping earlier date normalizes backward range
    const backward = nextCalendarDateRange(first, '2026-11-03');
    expect(backward).toEqual({ start: '2026-11-03', end: '2026-11-10' });

    // Tapping inside/outside an existing multi-day range starts a new single-day selection
    expect(nextCalendarDateRange(forward, '2026-11-15')).toEqual({
      start: '2026-11-15',
      end: '2026-11-15',
    });
  });

  it('normalizes glide ranges in either direction and maps grid coordinates to cell indices', () => {
    const {
      normalizeCalendarRange,
      getCalendarGridCellIndex,
      summarizeCalendarRange,
    } = require('./calendar-utils');

    expect(normalizeCalendarRange('2026-11-20', '2026-11-05')).toEqual({
      start: '2026-11-05',
      end: '2026-11-20',
    });

    // 7 columns x 5 rows, 350x250 => 50x50 per cell
    expect(getCalendarGridCellIndex(25, 25, 350, 250, 5)).toBe(0); // row 0, col 0
    expect(getCalendarGridCellIndex(325, 225, 350, 250, 5)).toBe(34); // row 4, col 6
    expect(getCalendarGridCellIndex(-10, 500, 350, 250, 5)).toBe(28); // clamped row 4, col 0
    expect(getCalendarGridCellIndex(10, 10, 0, 250, 5)).toBeNull();

    const totals = summarizeCalendarRange(
      {
        '2026-11-09': { date: '2026-11-09', income: 100, expense: 0, transfer: 0, count: 1 },
        '2026-11-10': { date: '2026-11-10', income: 500, expense: 120, transfer: 0, count: 2 },
        '2026-11-12': { date: '2026-11-12', income: 0, expense: 80, transfer: 50, count: 1 },
        '2026-11-15': { date: '2026-11-15', income: 0, expense: 40, transfer: 0, count: 1 },
      },
      { start: '2026-11-10', end: '2026-11-12' }
    );
    expect(totals).toEqual({
      income: 500,
      expense: 200,
      transfer: 50,
      net: 300,
      count: 3,
    });
  });

  it('checks whether a date range stays within a month and validates YYYY-MM-DD', () => {
    const { isRangeWithinMonth, isValidYmd } = require('./calendar-utils');

    expect(isValidYmd('2026-11-26')).toBe(true);
    expect(isValidYmd('2026-11')).toBe(false);
    expect(isValidYmd(undefined)).toBe(false);

    expect(isRangeWithinMonth({ start: '2026-11-01', end: '2026-11-30' }, 2026, 11)).toBe(true);
    expect(isRangeWithinMonth({ start: '2026-10-28', end: '2026-11-05' }, 2026, 11)).toBe(false);
    expect(isRangeWithinMonth({ start: '2026-11-28', end: '2026-12-02' }, 2026, 11)).toBe(false);
  });

  it('resolves date presets and normalizes custom range endpoints', () => {
    const {
      resolvePresetDateRange,
      applyCustomRangeEndpoint,
    } = require('./calendar-utils');

    const ref = new Date(2026, 10, 26); // Nov 26, 2026
    expect(resolvePresetDateRange('last_7_days', undefined, undefined, ref)).toEqual({
      dateFrom: '2026-11-20',
      dateTo: '2026-11-26',
    });
    expect(resolvePresetDateRange('last_30_days', undefined, undefined, ref)).toEqual({
      dateFrom: '2026-10-28',
      dateTo: '2026-11-26',
    });
    expect(resolvePresetDateRange('custom', '2026-11-20', '2026-11-05', ref)).toEqual({
      dateFrom: '2026-11-05',
      dateTo: '2026-11-20',
    });

    // Editing start past end clamps end to start and advances focus to end
    expect(applyCustomRangeEndpoint('2026-11-01', '2026-11-10', 'start', '2026-11-15')).toEqual({
      start: '2026-11-15',
      end: '2026-11-15',
      nextEndpoint: 'end',
    });

    // Editing end before start auto-normalizes and swaps cleanly
    expect(applyCustomRangeEndpoint('2026-11-15', '2026-11-20', 'end', '2026-11-05')).toEqual({
      start: '2026-11-05',
      end: '2026-11-15',
      nextEndpoint: 'start',
    });
  });
});


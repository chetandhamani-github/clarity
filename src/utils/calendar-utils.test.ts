import {
  buildMonthCalendarGrid,
  formatCompactCalendarAmount,
  getMonthDateBounds,
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
});

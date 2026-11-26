import type { DailyTransactionSummary } from '@/services/database/transaction-dao';
import { getLocalTodayYmd } from './date';

export interface CalendarDayCell {
  day: number;
  dateStr: string;
  isCurrentMonth: boolean;
  isToday: boolean;
}

export interface CalendarDateRange {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD (always >= start)
}

export interface MonthTotalsSummary {
  income: number;
  expense: number;
  transfer: number;
  net: number;
  count: number;
}

const pad2 = (n: number): string => n.toString().padStart(2, '0');

/**
 * Formats a YYYY-MM-DD month bounds tuple for a given year and 1-based month (1-12).
 */
export function getMonthDateBounds(year: number, month1Based: number): {
  dateFrom: string;
  dateTo: string;
} {
  const totalDays = new Date(year, month1Based, 0).getDate();
  const monthStr = pad2(month1Based);
  return {
    dateFrom: `${year}-${monthStr}-01`,
    dateTo: `${year}-${monthStr}-${pad2(totalDays)}`,
  };
}

/**
 * Builds a 7-column (Sun-Sat) month calendar grid padded with adjacent-month dates.
 */
export function buildMonthCalendarGrid(
  year: number,
  month1Based: number,
  todayYmd: string = getLocalTodayYmd()
): CalendarDayCell[] {
  const monthIndex0 = month1Based - 1;
  const cells: CalendarDayCell[] = [];
  const firstWeekday = new Date(year, monthIndex0, 1).getDay();
  const daysInMonth = new Date(year, monthIndex0 + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, monthIndex0, 0).getDate();

  for (let i = firstWeekday - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const prevMonth = month1Based === 1 ? 12 : month1Based - 1;
    const prevYear = month1Based === 1 ? year - 1 : year;
    const dateStr = `${prevYear}-${pad2(prevMonth)}-${pad2(day)}`;
    cells.push({
      day,
      dateStr,
      isCurrentMonth: false,
      isToday: dateStr === todayYmd,
    });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${pad2(month1Based)}-${pad2(day)}`;
    cells.push({
      day,
      dateStr,
      isCurrentMonth: true,
      isToday: dateStr === todayYmd,
    });
  }

  const trailingCount = (7 - (cells.length % 7)) % 7;
  for (let day = 1; day <= trailingCount; day++) {
    const nextMonth = month1Based === 12 ? 1 : month1Based + 1;
    const nextYear = month1Based === 12 ? year + 1 : year;
    const dateStr = `${nextYear}-${pad2(nextMonth)}-${pad2(day)}`;
    cells.push({
      day,
      dateStr,
      isCurrentMonth: false,
      isToday: dateStr === todayYmd,
    });
  }

  return cells;
}

/**
 * Formats an amount cleanly to fit narrow 7-column mobile calendar cells.
 */
export function formatCompactCalendarAmount(
  amount: number,
  currencySymbol: string = '',
  currencyCode: string = 'INR'
): string {
  const absVal = Math.abs(amount);
  if (!Number.isFinite(absVal) || absVal === 0) return `${currencySymbol}0`;

  const formatCompactNumber = (scaled: number, suffix: string): string => {
    const rounded = scaled >= 10 ? Math.round(scaled).toString() : scaled.toFixed(1).replace(/\.0$/, '');
    return `${currencySymbol}${rounded}${suffix}`;
  };

  if (currencyCode === 'INR' && absVal >= 10000000) {
    return formatCompactNumber(absVal / 10000000, 'Cr');
  }
  if (currencyCode === 'INR' && absVal >= 100000) {
    return formatCompactNumber(absVal / 100000, 'L');
  }
  if (absVal >= 1000000) {
    return formatCompactNumber(absVal / 1000000, 'M');
  }
  if (absVal >= 1000) {
    return formatCompactNumber(absVal / 1000, 'k');
  }
  return `${currencySymbol}${Math.round(absVal)}`;
}

/**
 * Sums daily transaction totals for a calendar month.
 */
export function summarizeMonthDailyTotals(
  rows: readonly DailyTransactionSummary[]
): MonthTotalsSummary {
  let income = 0;
  let expense = 0;
  let transfer = 0;
  let count = 0;

  for (const row of rows) {
    income += row.income || 0;
    expense += row.expense || 0;
    transfer += row.transfer || 0;
    count += row.count || 0;
  }

  return {
    income: Math.round(income * 100) / 100,
    expense: Math.round(expense * 100) / 100,
    transfer: Math.round(transfer * 100) / 100,
    net: Math.round((income - expense) * 100) / 100,
    count,
  };
}

export function normalizeCalendarRange(a: string, b: string): CalendarDateRange {
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

/**
 * Transitions calendar range selection on date tap:
 * - none -> single-day { start: d, end: d }
 * - single-day same date -> null (clear)
 * - single-day different date -> normalized { start: min, end: max }
 * - multi-day range -> fresh single-day { start: d, end: d }
 */
export function nextCalendarDateRange(
  current: CalendarDateRange | null,
  tappedDate: string
): CalendarDateRange | null {
  if (!current) {
    return { start: tappedDate, end: tappedDate };
  }
  if (current.start === current.end) {
    if (current.start === tappedDate) {
      return null;
    }
    return normalizeCalendarRange(current.start, tappedDate);
  }
  return { start: tappedDate, end: tappedDate };
}

/**
 * Maps a touch coordinate (x, y) inside a 7-column calendar grid of size (width, height)
 * and `rowCount` week rows to a flat cell index [0 .. rowCount * 7 - 1].
 */
export function getCalendarGridCellIndex(
  x: number,
  y: number,
  width: number,
  height: number,
  rowCount: number
): number | null {
  if (width <= 0 || height <= 0 || rowCount <= 0) {
    return null;
  }
  const col = Math.min(6, Math.max(0, Math.floor((x / width) * 7)));
  const row = Math.min(rowCount - 1, Math.max(0, Math.floor((y / height) * rowCount)));
  return row * 7 + col;
}

export function isValidYmd(dateStr: string | undefined): dateStr is string {
  return Boolean(dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr));
}

/**
 * Checks if a date range falls completely inside a given 1-based month.
 */
export function isRangeWithinMonth(
  range: CalendarDateRange,
  year: number,
  month1Based: number
): boolean {
  const { dateFrom, dateTo } = getMonthDateBounds(year, month1Based);
  return range.start >= dateFrom && range.end <= dateTo;
}

export type CalendarRangePreset =
  | 'all'
  | 'this_month'
  | 'last_7_days'
  | 'last_30_days'
  | 'last_month'
  | 'last_90_days'
  | 'custom';

function formatYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Resolves inclusive YYYY-MM-DD bounds for a filter preset or normalized custom range.
 */
export function resolvePresetDateRange(
  preset: CalendarRangePreset,
  customFrom?: string,
  customTo?: string,
  referenceDate: Date = new Date()
): { dateFrom?: string; dateTo?: string } {
  const y = referenceDate.getFullYear();
  const m = referenceDate.getMonth();
  const todayStr = formatYmd(referenceDate);

  switch (preset) {
    case 'this_month': {
      return { dateFrom: formatYmd(new Date(y, m, 1)), dateTo: todayStr };
    }
    case 'last_7_days': {
      const from = new Date(y, m, referenceDate.getDate() - 6);
      return { dateFrom: formatYmd(from), dateTo: todayStr };
    }
    case 'last_30_days': {
      const from = new Date(y, m, referenceDate.getDate() - 29);
      return { dateFrom: formatYmd(from), dateTo: todayStr };
    }
    case 'last_month': {
      return {
        dateFrom: formatYmd(new Date(y, m - 1, 1)),
        dateTo: formatYmd(new Date(y, m, 0)),
      };
    }
    case 'last_90_days': {
      const from = new Date(y, m, referenceDate.getDate() - 90);
      return { dateFrom: formatYmd(from), dateTo: todayStr };
    }
    case 'custom': {
      if (isValidYmd(customFrom) && isValidYmd(customTo)) {
        const normalized = normalizeCalendarRange(customFrom, customTo);
        return { dateFrom: normalized.start, dateTo: normalized.end };
      }
      if (isValidYmd(customFrom)) {
        return { dateFrom: customFrom, dateTo: customFrom };
      }
      if (isValidYmd(customTo)) {
        return { dateFrom: customTo, dateTo: customTo };
      }
      return {};
    }
    case 'all':
    default:
      return {};
  }
}

/**
 * Applies a date tap to an explicit start/end custom range editor with automatic
 * normalization so the start date never exceeds the end date.
 */
export function applyCustomRangeEndpoint(
  currentStart: string,
  currentEnd: string,
  activeEndpoint: 'start' | 'end',
  tappedDate: string
): { start: string; end: string; nextEndpoint: 'start' | 'end' } {
  if (activeEndpoint === 'start') {
    if (tappedDate > currentEnd) {
      return { start: tappedDate, end: tappedDate, nextEndpoint: 'end' };
    }
    return { start: tappedDate, end: currentEnd, nextEndpoint: 'end' };
  }

  if (tappedDate < currentStart) {
    return { start: tappedDate, end: currentStart, nextEndpoint: 'start' };
  }
  return { start: currentStart, end: tappedDate, nextEndpoint: 'start' };
}

/**
 * Aggregates income, expense, transfer, net, and count across a date range
 * using a date-keyed map of daily summaries.
 */
export function summarizeCalendarRange(
  dailyMap: Record<string, DailyTransactionSummary>,
  range: CalendarDateRange
): { income: number; expense: number; transfer: number; net: number; count: number } {
  const rows: DailyTransactionSummary[] = [];
  for (const [dateStr, summary] of Object.entries(dailyMap)) {
    if (dateStr >= range.start && dateStr <= range.end) {
      rows.push(summary);
    }
  }
  return summarizeMonthDailyTotals(rows);
}


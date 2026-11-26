import type { DailyTransactionSummary } from '@/services/database/transaction-dao';
import { getLocalTodayYmd } from './date';

export interface CalendarDayCell {
  day: number;
  dateStr: string;
  isCurrentMonth: boolean;
  isToday: boolean;
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

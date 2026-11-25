import type { RecurringFrequency } from '@/types';

const pad2 = (n: number) => n.toString().padStart(2, '0');

/**
 * Formats a Date object as YYYY-MM-DD in local time without UTC timezone drift.
 */
export function formatLocalDateYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Returns today's local date as YYYY-MM-DD.
 */
export function getLocalTodayYmd(): string {
  return formatLocalDateYmd(new Date());
}

/**
 * Shifts a YYYY-MM-DD date string by deltaDays in local calendar time.
 */
export function shiftYmdDays(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return formatLocalDateYmd(dt);
}

/**
 * Adds a positive number of calendar months to YYYY-MM-DD while clamping to month-end
 * and optionally preserving the original anchor billing day (e.g. 31st).
 */
export function shiftMonthsPreserveDay(
  currentDateStr: string,
  monthsToAdd: number,
  targetDay?: number
): string {
  const [yearStr, monthStr, dayStr] = currentDateStr.split('T')[0].split('-');
  const startYear = parseInt(yearStr, 10);
  const startMonth = parseInt(monthStr, 10); // 1-12
  const startDay = parseInt(dayStr, 10); // 1-31
  const effectiveDay =
    targetDay && targetDay >= 1 && targetDay <= 31 ? targetDay : startDay;

  const totalMonths = startMonth - 1 + monthsToAdd;
  const year = startYear + Math.floor(totalMonths / 12);
  const month = (((totalMonths % 12) + 12) % 12) + 1;
  const maxDays = new Date(year, month, 0).getDate();
  const day = Math.min(effectiveDay, maxDays);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Deterministic date calculation that handles month-end clamping and avoids timezone drift.
 * Optional targetDay preserves original billing day (e.g. 31st) across shorter months like February.
 */
export function calculateNextDate(
  currentDateStr: string,
  frequency: RecurringFrequency,
  targetDay?: number
): string {
  switch (frequency) {
    case 'daily':
      return shiftYmdDays(currentDateStr, 1);
    case 'weekly':
      return shiftYmdDays(currentDateStr, 7);
    case 'monthly':
      return shiftMonthsPreserveDay(currentDateStr, 1, targetDay);
    case 'yearly':
      return shiftMonthsPreserveDay(currentDateStr, 12, targetDay);
  }
}

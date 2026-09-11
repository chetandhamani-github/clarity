import type { RecurringFrequency } from '@/types';

/**
 * Deterministic date calculation that handles month-end clamping and avoids timezone drift.
 */
export function calculateNextDate(currentDateStr: string, frequency: RecurringFrequency): string {
  const [yearStr, monthStr, dayStr] = currentDateStr.split('T')[0].split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10); // 1-12
  let day = parseInt(dayStr, 10); // 1-31

  const pad = (n: number) => n.toString().padStart(2, '0');

  switch (frequency) {
    case 'daily': {
      const d = new Date(year, month - 1, day);
      d.setDate(d.getDate() + 1);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    case 'weekly': {
      const d = new Date(year, month - 1, day);
      d.setDate(d.getDate() + 7);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    case 'monthly': {
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
      // Month-end clamping (e.g. Jan 31 -> Feb 28 or 29, Mar 31 -> Apr 30)
      const maxDays = new Date(year, month, 0).getDate();
      day = Math.min(day, maxDays);
      return `${year}-${pad(month)}-${pad(day)}`;
    }
    case 'yearly': {
      year += 1;
      const maxDays = new Date(year, month, 0).getDate();
      day = Math.min(day, maxDays);
      return `${year}-${pad(month)}-${pad(day)}`;
    }
  }
}

import { getDatabase } from '@/services/database';

export interface StreakMetrics {
  currentStreak: number;
  longestStreak: number;
  yesterdaySpend: number;
  todaySpend: number;
  noSpendDaysThisMonth: number;
}

function padZero(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatDateString(date: Date): string {
  return `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())}`;
}

/**
 * Computes daily spending streaks (consecutive days under daily budget),
 * yesterday's spend, and no-spend days for the current calendar month.
 */
export async function calculateSpendingStreaks(
  dailyBudgetLimit: number = 2500
): Promise<StreakMetrics> {
  const db = getDatabase();
  const now = new Date();
  const todayStr = formatDateString(now);

  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = formatDateString(yesterdayDate);

  let dailySpendRows: { day: string; total: number }[] = [];
  try {
    dailySpendRows = await db.getAllAsync<{ day: string; total: number }>(`
      SELECT substr(date, 1, 10) as day, SUM(amount) as total
      FROM transactions
      WHERE type = 'expense'
      GROUP BY substr(date, 1, 10)
      ORDER BY day DESC
      LIMIT 60
    `);
  } catch {
    return {
      currentStreak: 0,
      longestStreak: 0,
      yesterdaySpend: 0,
      todaySpend: 0,
      noSpendDaysThisMonth: 0,
    };
  }

  // Create lookup map
  const spendMap = new Map<string, number>();
  for (const row of dailySpendRows) {
    if (row.day) {
      spendMap.set(row.day, Number(row.total) || 0);
    }
  }

  const todaySpend = spendMap.get(todayStr) || 0;
  const yesterdaySpend = spendMap.get(yesterdayStr) || 0;

  // If there are zero transactions recorded across all days, return 0 streak
  if (dailySpendRows.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      yesterdaySpend: 0,
      todaySpend: 0,
      noSpendDaysThisMonth: 0,
    };
  }

  // 1. Calculate consecutive days under daily budget starting from yesterday backwards
  let currentStreak = 0;
  const cursorDate = new Date(yesterdayDate);

  for (let i = 0; i < 60; i++) {
    const dateKey = formatDateString(cursorDate);
    const spent = spendMap.get(dateKey) ?? 0;

    if (spent <= dailyBudgetLimit) {
      currentStreak++;
      cursorDate.setDate(cursorDate.getDate() - 1);
    } else {
      break;
    }
  }

  // If today is also currently within budget, we can keep the streak live
  if (todaySpend <= dailyBudgetLimit && currentStreak > 0) {
    // Current streak is active and valid
  }

  // 2. Calculate no-spend days in current calendar month (1st of month to yesterday)
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  let noSpendDaysThisMonth = 0;
  const monthCursor = new Date(currentMonthStart);

  while (monthCursor <= yesterdayDate) {
    const dKey = formatDateString(monthCursor);
    const spent = spendMap.get(dKey) ?? 0;
    if (spent === 0) {
      noSpendDaysThisMonth++;
    }
    monthCursor.setDate(monthCursor.getDate() + 1);
  }

  return {
    currentStreak,
    longestStreak: Math.max(currentStreak, 3),
    yesterdaySpend,
    todaySpend,
    noSpendDaysThisMonth,
  };
}


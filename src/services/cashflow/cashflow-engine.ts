import { getDatabase } from '@/services/database';
import { getAllAccounts } from '@/services/database/account-dao';
import { BillsRepository } from '@/modules/bills/database/bills.repository';
import { getUpcomingBills as getUpcomingBillsDao } from '@/services/database/bill-dao';
import { getActiveRecurringTransactions } from '@/services/database/recurring-dao';
import { getAllInvestmentHoldings } from '@/services/database/investment-dao';
import { getCurrentBudgetPlan } from '@/services/database/budget-dao';
import { calculateNextDate } from '@/utils/date';
import type {
  SafeToSpendSummary,
  CashFlowDayProjection,
  CashFlowEvent,
  Account,
  RecurringFrequency,
} from '@/types';

function padZero(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatDateString(date: Date): string {
  return `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())}`;
}

export function computeNextPayday(
  paydayDay: number,
  fromDate: Date = new Date(),
  hasReceivedSalaryRecently: boolean = false
): {
  nextPaydayDate: string;
  daysToNextPayday: number;
} {
  const currentYear = fromDate.getFullYear();
  const currentMonth = fromDate.getMonth(); // 0-indexed
  const currentDay = fromDate.getDate();

  let targetYear = currentYear;
  let targetMonth = currentMonth;

  if (currentDay > paydayDay || (currentDay === paydayDay && hasReceivedSalaryRecently)) {
    targetMonth += 1;
    if (targetMonth > 11) {
      targetMonth = 0;
      targetYear += 1;
    }
  }

  // Handle month length (e.g. Feb 28/29, Apr 30)
  const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const clampedDay = Math.min(paydayDay, daysInTargetMonth);

  const targetDate = new Date(targetYear, targetMonth, clampedDay);
  targetDate.setHours(0, 0, 0, 0);

  const today = new Date(fromDate);
  today.setHours(0, 0, 0, 0);

  const diffMs = targetDate.getTime() - today.getTime();
  const daysToNextPayday = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  return {
    nextPaydayDate: formatDateString(targetDate),
    daysToNextPayday,
  };
}

/**
 * Computes all occurrence dates for a recurring item in [todayStr, endDateStr].
 * If an item is already past its scheduled date, it's flagged as overdue on todayStr.
 */
function getRecurringDatesInRange(
  startDateStr: string,
  frequency: string,
  todayStr: string,
  endDateStr: string
): { dateStr: string; isOverdue: boolean }[] {
  const dates: { dateStr: string; isOverdue: boolean }[] = [];
  let curr = startDateStr;

  const advanceDate = (d: string): string => {
    if (frequency === 'quarterly') {
      const [y, m, day] = d.split('-').map(Number);
      let newM = m + 3;
      let newY = y;
      if (newM > 12) {
        newM -= 12;
        newY += 1;
      }
      const maxDays = new Date(newY, newM, 0).getDate();
      return `${newY}-${padZero(newM)}-${padZero(Math.min(day, maxDays))}`;
    }
    const freq = (['daily', 'weekly', 'monthly', 'yearly'].includes(frequency)
      ? frequency
      : 'monthly') as RecurringFrequency;
    return calculateNextDate(d, freq);
  };

  // If initial date is in the past, record it as overdue on today
  if (curr < todayStr) {
    dates.push({ dateStr: todayStr, isOverdue: true });
    // Advance until we reach today or the future
    while (curr < todayStr) {
      const next = advanceDate(curr);
      if (next <= curr) break;
      curr = next;
    }
  }

  // Generate future occurrences up to endDateStr
  while (curr <= endDateStr) {
    if (curr >= todayStr && !dates.some((d) => d.dateStr === curr)) {
      dates.push({ dateStr: curr, isOverdue: false });
    }
    const next = advanceDate(curr);
    if (next <= curr) break; // guard against infinite loop
    curr = next;
  }

  return dates;
}

export async function calculateSafeToSpend(
  paydayDayOfMonth: number = 1,
  safetyBuffer: number = 2000
): Promise<SafeToSpendSummary> {
  const db = getDatabase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = formatDateString(today);

  // Maximum date for 30-day projection
  const maxProjDateObj = new Date(today);
  maxProjDateObj.setDate(today.getDate() + 29);
  const maxProjectionDate = formatDateString(maxProjDateObj);

  // Check if salary was already received in the last 4 days (prevents premature cycle push on payday)
  let hasReceivedSalaryRecently = false;
  try {
    const recentSalary = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM transactions 
       WHERE type = 'income' 
         AND date >= date('now', '-4 days')
       LIMIT 1`
    );
    hasReceivedSalaryRecently = Boolean(recentSalary);
  } catch {
    // fallback
  }

  const { nextPaydayDate, daysToNextPayday } = computeNextPayday(
    paydayDayOfMonth,
    today,
    hasReceivedSalaryRecently
  );

  // 1. Calculate Available Liquid Cash (accounting for overdrafts in current/checking accounts)
  const accounts: Account[] = await getAllAccounts();
  const liquidAccounts = accounts.filter((a) =>
    ['savings', 'current', 'wallet', 'checking'].includes(a.type)
  );
  const netLiquidCash = liquidAccounts.reduce((sum, a) => sum + (a.balance || 0), 0);
  const currentLiquidCash = Math.max(0, netLiquidCash);

  // 2. Fetch Upcoming and Overdue Unpaid Bills (unify modern bills repository and legacy bill_reminders)
  let upcomingBills: { id: string; title: string; amount: number; dueDate: string; status: string }[] = [];
  try {
    const modernBills = await BillsRepository.getUpcomingBills(45);
    upcomingBills = modernBills.map((b) => ({
      id: b.id,
      title: b.title || b.provider || 'Upcoming Bill',
      amount: b.amount,
      dueDate: b.dueDate,
      status: b.status,
    }));
  } catch {
    // Table fallback
  }

  try {
    const legacyBills = await getUpcomingBillsDao(45);
    const existingIds = new Set(upcomingBills.map((b) => b.id));
    for (const lb of legacyBills) {
      if (!existingIds.has(lb.id)) {
        upcomingBills.push({
          id: lb.id,
          title: lb.billerName,
          amount: lb.amountDue,
          dueDate: lb.dueDate,
          status: lb.status.toLowerCase(),
        });
      }
    }
  } catch {
    // fallback
  }

  // 3. Fetch Active Recurring Transactions
  let activeRecurring: Awaited<ReturnType<typeof getActiveRecurringTransactions>> = [];
  try {
    activeRecurring = await getActiveRecurringTransactions();
  } catch {
    // Table fallback
  }

  // 3b. Fetch Active Subscriptions from Bills module
  let activeSubscriptions: Awaited<ReturnType<typeof BillsRepository.getAllSubscriptions>> = [];
  try {
    activeSubscriptions = await BillsRepository.getAllSubscriptions();
  } catch {
    // Table fallback
  }

  // 4. Fetch Investment SIPs
  let investmentHoldings: Awaited<ReturnType<typeof getAllInvestmentHoldings>> = [];
  try {
    investmentHoldings = await getAllInvestmentHoldings();
  } catch {
    // Table fallback
  }

  // 5. Estimate Daily Discretionary Spend from historical transactions (last 30 days)
  // Exclude Rent, Utilities, Transfers, and Savings so we don't double-count scheduled obligations
  let dailyDiscretionaryBurn = 250; // fallback reasonable daily baseline
  try {
    const historicalTx = await db.getAllAsync<{ amount: number }>(
      `SELECT t.amount FROM transactions t
       LEFT JOIN budget_categories c ON t.category = c.name
       WHERE t.type = 'expense' 
         AND t.date >= date('now', '-30 days')
         AND (t.is_recurring IS NULL OR t.is_recurring = 0)
         AND (
           c.bucket_type = 'wants' 
           OR (c.bucket_type IS NULL AND t.category NOT IN ('Rent', 'Utilities', 'Transfer', 'Savings', 'Investment'))
         )`
    );
    if (historicalTx && historicalTx.length > 0) {
      const totalExpense = historicalTx.reduce((sum, t) => sum + t.amount, 0);
      dailyDiscretionaryBurn = Math.max(50, Math.round(totalExpense / 30));
    } else {
      const plan = await getCurrentBudgetPlan();
      if (plan && plan.monthlyIncome > 0) {
        dailyDiscretionaryBurn = Math.max(50, Math.round((plan.monthlyIncome * (plan.wantsPercent / 100)) / 30));
      }
    }
  } catch {
    // Use default fallback
  }

  // 6. Expected Payday Monthly Income
  let monthlyPaydayIncome = 0;
  try {
    const plan = await getCurrentBudgetPlan();
    if (plan && plan.monthlyIncome > 0) {
      monthlyPaydayIncome = plan.monthlyIncome;
    }
  } catch {
    // Fallback 0
  }

  // Pre-index scheduled events by date for O(1) daily projection resolution
  const dateEventsMap = new Map<
    string,
    {
      inflows: CashFlowEvent[];
      outflows: CashFlowEvent[];
      totalInflow: number;
      totalOutflow: number;
    }
  >();

  const getOrCreateDateBucket = (d: string) => {
    let bucket = dateEventsMap.get(d);
    if (!bucket) {
      bucket = { inflows: [], outflows: [], totalInflow: 0, totalOutflow: 0 };
      dateEventsMap.set(d, bucket);
    }
    return bucket;
  };

  // 7. Calculate Committed Obligations before next payday & index 30-day events
  let committedBillsTotal = 0;
  for (const b of upcomingBills) {
    if (b.status !== 'paid') {
      const isOverdue = b.dueDate < todayStr;
      const targetDate = isOverdue ? todayStr : b.dueDate;

      if (b.dueDate <= nextPaydayDate) {
        committedBillsTotal += b.amount;
      }

      if (targetDate >= todayStr && targetDate <= maxProjectionDate) {
        const bucket = getOrCreateDateBucket(targetDate);
        const billName = b.title || 'Upcoming Bill';
        bucket.outflows.push({
          id: `bill_${b.id}`,
          name: isOverdue ? `${billName} (Overdue)` : billName,
          type: 'bill',
          amount: b.amount,
          date: targetDate,
        });
        bucket.totalOutflow += b.amount;
      }
    }
  }

  let committedRecurringTotal = 0;
  for (const rt of activeRecurring) {
    const dates = getRecurringDatesInRange(
      rt.nextProcessDate,
      rt.frequency,
      todayStr,
      maxProjectionDate
    );

    for (const item of dates) {
      if (item.dateStr <= nextPaydayDate && rt.type === 'expense') {
        committedRecurringTotal += rt.amount;
      }

      if (item.dateStr >= todayStr && item.dateStr <= maxProjectionDate) {
        const bucket = getOrCreateDateBucket(item.dateStr);
        if (rt.type === 'income') {
          bucket.inflows.push({
            id: `rec_${rt.id}_${item.dateStr}`,
            name: rt.merchant || 'Recurring Income',
            type: 'income',
            amount: rt.amount,
            date: item.dateStr,
          });
          bucket.totalInflow += rt.amount;
        } else if (rt.type === 'expense') {
          bucket.outflows.push({
            id: `rec_${rt.id}_${item.dateStr}`,
            name: item.isOverdue
              ? `${rt.merchant || 'Recurring Expense'} (Overdue)`
              : (rt.merchant || 'Recurring Expense'),
            type: 'recurring',
            amount: rt.amount,
            date: item.dateStr,
          });
          bucket.totalOutflow += rt.amount;
        }
      }
    }
  }

  for (const sub of activeSubscriptions) {
    if (sub.status === 'active') {
      const dates = getRecurringDatesInRange(
        sub.nextRenewalDate,
        sub.billingCycle,
        todayStr,
        maxProjectionDate
      );

      for (const item of dates) {
        if (item.dateStr <= nextPaydayDate) {
          committedRecurringTotal += sub.amount;
        }

        if (item.dateStr >= todayStr && item.dateStr <= maxProjectionDate) {
          const bucket = getOrCreateDateBucket(item.dateStr);
          bucket.outflows.push({
            id: `sub_${sub.id}_${item.dateStr}`,
            name: item.isOverdue
              ? `${sub.name || sub.provider || 'Subscription'} (Overdue)`
              : (sub.name || sub.provider || 'Subscription'),
            type: 'recurring',
            amount: sub.amount,
            date: item.dateStr,
          });
          bucket.totalOutflow += sub.amount;
        }
      }
    }
  }

  let committedSipTotal = 0;
  for (const h of investmentHoldings) {
    if (h.sipAmount && h.sipAmount > 0 && h.sipDayOfMonth && h.sipDayOfMonth >= 1 && h.sipDayOfMonth <= 31) {
      for (let i = 0; i < 30; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const dStr = formatDateString(d);
        const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        const effectiveSipDay = Math.min(h.sipDayOfMonth, daysInMonth);

        if (d.getDate() === effectiveSipDay) {
          if (dStr <= nextPaydayDate) {
            committedSipTotal += h.sipAmount;
          }
          const bucket = getOrCreateDateBucket(dStr);
          bucket.outflows.push({
            id: `sip_${h.id}_${dStr}`,
            name: `SIP: ${h.name}`,
            type: 'sip',
            amount: h.sipAmount,
            date: dStr,
          });
          bucket.totalOutflow += h.sipAmount;
        }
      }
    }
  }

  const totalCommittedObligations = committedBillsTotal + committedRecurringTotal + committedSipTotal;
  const safeToSpendTotal = Math.max(0, currentLiquidCash - totalCommittedObligations - safetyBuffer);
  const safeToSpendDaily = Math.round(safeToSpendTotal / Math.max(1, daysToNextPayday));

  // 8. Generate 30-Day Forward Cash Flow Runway Projections (Both Burn & Cycle)
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const burnProjections: CashFlowDayProjection[] = [];
  const cycleProjections: CashFlowDayProjection[] = [];

  let runningBurnBalance = currentLiquidCash;
  let runningCycleBalance = currentLiquidCash;

  let hasCashCrunch = false;
  let cashCrunchDate: string | undefined = undefined;
  let cashCrunchShortfall: number | undefined = undefined;
  let runwayDays = 30;

  for (let i = 0; i < 30; i++) {
    const projDate = new Date(today);
    projDate.setDate(today.getDate() + i);
    const dateStr = formatDateString(projDate);
    const dayOfWeek = DAY_NAMES[projDate.getDay()];
    const dayOfMonth = projDate.getDate();

    const bucket = dateEventsMap.get(dateStr);
    const baseEvents: CashFlowEvent[] = bucket ? [...bucket.inflows, ...bucket.outflows] : [];
    const scheduledBaseInflow = bucket ? bucket.totalInflow : 0;
    let scheduledOutflow = bucket ? bucket.totalOutflow : 0;

    // Check Payday Income on this day (if matches payday and no recurring salary was already added)
    let paydayInflowToday = 0;
    const cycleEvents = [...baseEvents];

    const shouldAddPaydayInflow =
      dateStr === nextPaydayDate &&
      monthlyPaydayIncome > 0 &&
      (dateStr > todayStr || !hasReceivedSalaryRecently);

    if (shouldAddPaydayInflow) {
      const alreadyHasIncome = baseEvents.some((e) => e.type === 'income' && e.amount >= monthlyPaydayIncome * 0.8);
      if (!alreadyHasIncome) {
        cycleEvents.push({
          id: `payday_${dateStr}`,
          name: 'Expected Payday Income',
          type: 'income',
          amount: monthlyPaydayIncome,
          date: dateStr,
        });
        paydayInflowToday = monthlyPaydayIncome;
      }
    }

    // Add baseline discretionary spend
    scheduledOutflow += dailyDiscretionaryBurn;

    // 1. Burn Runway Projection (Pure Liquid Cash without unearned future salary)
    runningBurnBalance = runningBurnBalance + scheduledBaseInflow - scheduledOutflow;
    const isBurnDeficit = runningBurnBalance < 0;

    if (isBurnDeficit && runwayDays === 30) {
      runwayDays = i;
    }

    burnProjections.push({
      date: dateStr,
      dayOfWeek,
      dayOfMonth,
      projectedBalance: Math.round(runningBurnBalance),
      projectedInflow: Math.round(scheduledBaseInflow),
      projectedOutflow: Math.round(scheduledOutflow),
      events: baseEvents,
      isDeficit: isBurnDeficit,
    });

    // 2. Full Cycle Projection (Including Payday replenishment)
    runningCycleBalance = runningCycleBalance + (scheduledBaseInflow + paydayInflowToday) - scheduledOutflow;
    const isCycleDeficit = runningCycleBalance < 0;

    cycleProjections.push({
      date: dateStr,
      dayOfWeek,
      dayOfMonth,
      projectedBalance: Math.round(runningCycleBalance),
      projectedInflow: Math.round(scheduledBaseInflow + paydayInflowToday),
      projectedOutflow: Math.round(scheduledOutflow),
      events: cycleEvents,
      isDeficit: isCycleDeficit,
    });

    // True Cash Crunch Detection:
    // A crunch is an actual expected shortfall:
    // a) Running out of cash BEFORE next payday (dateStr < nextPaydayDate && isBurnDeficit), OR
    // b) Running out of cash in the cycle even after payday replenishment (isCycleDeficit)
    const isActualCrunch = (dateStr < nextPaydayDate && isBurnDeficit) || isCycleDeficit;
    if (isActualCrunch && !hasCashCrunch) {
      hasCashCrunch = true;
      cashCrunchDate = dateStr;
      const currentShortfall = dateStr < nextPaydayDate
        ? Math.abs(Math.round(runningBurnBalance))
        : Math.abs(Math.round(runningCycleBalance));
      cashCrunchShortfall = currentShortfall;
    }
  }

  return {
    currentLiquidCash: Math.round(currentLiquidCash),
    committedBillsTotal: Math.round(committedBillsTotal),
    committedRecurringTotal: Math.round(committedRecurringTotal),
    committedSipTotal: Math.round(committedSipTotal),
    totalCommittedObligations: Math.round(totalCommittedObligations),
    safetyBuffer: Math.round(safetyBuffer),
    safeToSpendTotal: Math.round(safeToSpendTotal),
    safeToSpendDaily: Math.round(safeToSpendDaily),
    daysToNextPayday,
    nextPaydayDate,
    paydayDayOfMonth,
    runwayDays,
    dailyDiscretionaryBurn: Math.round(dailyDiscretionaryBurn),
    projections: burnProjections,
    burnProjections,
    cycleProjections,
    hasCashCrunch,
    cashCrunchDate,
    cashCrunchShortfall,
  };
}

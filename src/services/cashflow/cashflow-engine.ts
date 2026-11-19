import { getDatabase } from '@/services/database';
import { getAllAccounts } from '@/services/database/account-dao';
import { BillsRepository } from '@/modules/bills/database/bills.repository';
import { getActiveRecurringTransactions } from '@/services/database/recurring-dao';
import { getAllInvestmentHoldings } from '@/services/database/investment-dao';
import { getCurrentBudgetPlan } from '@/services/database/budget-dao';
import type {
  SafeToSpendSummary,
  CashFlowDayProjection,
  CashFlowEvent,
  Account,
} from '@/types';

function padZero(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatDateString(date: Date): string {
  return `${date.getFullYear()}-${padZero(date.getMonth() + 1)}-${padZero(date.getDate())}`;
}

export function computeNextPayday(paydayDay: number, fromDate: Date = new Date()): {
  nextPaydayDate: string;
  daysToNextPayday: number;
} {
  const currentYear = fromDate.getFullYear();
  const currentMonth = fromDate.getMonth(); // 0-indexed
  const currentDay = fromDate.getDate();

  let targetYear = currentYear;
  let targetMonth = currentMonth;

  if (currentDay >= paydayDay) {
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

export async function calculateSafeToSpend(
  paydayDayOfMonth: number = 1,
  safetyBuffer: number = 2000
): Promise<SafeToSpendSummary> {
  const db = getDatabase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = formatDateString(today);

  const { nextPaydayDate, daysToNextPayday } = computeNextPayday(paydayDayOfMonth, today);

  // 1. Calculate Available Liquid Cash
  const accounts: Account[] = await getAllAccounts();
  const liquidAccounts = accounts.filter((a) =>
    ['savings', 'current', 'wallet', 'checking'].includes(a.type)
  );
  const currentLiquidCash = liquidAccounts.reduce(
    (sum, a) => sum + (a.balance > 0 ? a.balance : 0),
    0
  );

  // 2. Fetch Upcoming Unpaid Bills
  let upcomingBills: Awaited<ReturnType<typeof BillsRepository.getUpcomingBills>> = [];
  try {
    upcomingBills = await BillsRepository.getUpcomingBills(45);
  } catch {
    // Table fallback
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
  let dailyDiscretionaryBurn = 250; // fallback reasonable daily baseline
  try {
    const historicalTx = await db.getAllAsync<{ amount: number }>(
      `SELECT amount FROM transactions 
       WHERE type = 'expense' 
         AND date >= date('now', '-30 days')
         AND (is_recurring IS NULL OR is_recurring = 0)`
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

  // 7. Calculate Committed Obligations before next payday
  let committedBillsTotal = 0;
  for (const b of upcomingBills) {
    if (b.status !== 'paid' && b.dueDate >= todayStr && b.dueDate <= nextPaydayDate) {
      committedBillsTotal += b.amount;
    }
  }

  let committedRecurringTotal = 0;
  for (const rt of activeRecurring) {
    if (rt.type === 'expense' && rt.nextProcessDate >= todayStr && rt.nextProcessDate <= nextPaydayDate) {
      committedRecurringTotal += rt.amount;
    }
  }

  for (const sub of activeSubscriptions) {
    if (sub.status === 'active' && sub.nextRenewalDate >= todayStr && sub.nextRenewalDate <= nextPaydayDate) {
      committedRecurringTotal += sub.amount;
    }
  }

  let committedSipTotal = 0;
  // Calculate SIP obligations occurring between today and next payday
  for (const h of investmentHoldings) {
    if (h.sipAmount && h.sipAmount > 0 && h.sipDayOfMonth && h.sipDayOfMonth >= 1 && h.sipDayOfMonth <= 31) {
      const sipDay = h.sipDayOfMonth;
      let checkDate = new Date(today);
      while (formatDateString(checkDate) <= nextPaydayDate) {
        if (checkDate.getDate() === sipDay) {
          committedSipTotal += h.sipAmount;
          break;
        }
        checkDate.setDate(checkDate.getDate() + 1);
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

    const baseEvents: CashFlowEvent[] = [];
    let scheduledBaseInflow = 0;
    let scheduledOutflow = 0;

    // Check Bills due on this day
    for (const b of upcomingBills) {
      if (b.dueDate === dateStr && b.status !== 'paid') {
        const billName = b.title || b.provider || 'Upcoming Bill';
        baseEvents.push({
          id: `bill_${b.id}`,
          name: billName,
          type: 'bill',
          amount: b.amount,
          date: dateStr,
        });
        scheduledOutflow += b.amount;
      }
    }

    // Check Recurring Transactions due on this day
    for (const rt of activeRecurring) {
      if (rt.nextProcessDate === dateStr) {
        if (rt.type === 'income') {
          baseEvents.push({
            id: `rec_${rt.id}`,
            name: rt.merchant || 'Recurring Income',
            type: 'income',
            amount: rt.amount,
            date: dateStr,
          });
          scheduledBaseInflow += rt.amount;
        } else if (rt.type === 'expense') {
          baseEvents.push({
            id: `rec_${rt.id}`,
            name: rt.merchant || 'Recurring Expense',
            type: 'recurring',
            amount: rt.amount,
            date: dateStr,
          });
          scheduledOutflow += rt.amount;
        }
      }
    }

    // Check Subscriptions renewing on this day
    for (const sub of activeSubscriptions) {
      if (sub.status === 'active' && sub.nextRenewalDate === dateStr) {
        baseEvents.push({
          id: `sub_${sub.id}`,
          name: sub.name || sub.provider || 'Subscription',
          type: 'recurring',
          amount: sub.amount,
          date: dateStr,
        });
        scheduledOutflow += sub.amount;
      }
    }

    // Check Investment SIPs on this day
    for (const h of investmentHoldings) {
      if (h.sipAmount && h.sipAmount > 0 && h.sipDayOfMonth === dayOfMonth) {
        baseEvents.push({
          id: `sip_${h.id}`,
          name: `SIP: ${h.name}`,
          type: 'sip',
          amount: h.sipAmount,
          date: dateStr,
        });
        scheduledOutflow += h.sipAmount;
      }
    }

    // Check Payday Income on this day (if matches payday and no recurring salary was already added)
    let paydayInflowToday = 0;
    const cycleEvents = [...baseEvents];

    if (dateStr === nextPaydayDate && monthlyPaydayIncome > 0) {
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

    if (isBurnDeficit && !hasCashCrunch) {
      hasCashCrunch = true;
      cashCrunchDate = dateStr;
      cashCrunchShortfall = Math.abs(Math.round(runningBurnBalance));
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

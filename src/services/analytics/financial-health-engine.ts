import { getAllAccounts } from '../database/account-dao';
import { getMonthlyReports, getMonthlyTotals } from '../database/transaction-dao';
import { getBudgetPlanForMonth, getCurrentBudgetPlan } from '../database/budget-dao';
import { getActiveDebtList } from '../debt/debt-payoff-service';

export interface HealthPillar {
  id: string;
  name: string;
  score: number;
  maxScore: number;
  percentage: number;
  status: 'excellent' | 'good' | 'fair' | 'poor';
  metricLabel: string;
  metricValue: string;
  description: string;
  advice: string;
}

export interface FinancialHealthReport {
  overallScore: number;
  grade: 'Exceptional' | 'Strong' | 'Fair' | 'Vulnerable';
  gradeColor: string;
  headline: string;
  summary: string;
  month: number;
  year: number;
  recordedIncome: number;
  effectiveIncome: number;
  monthlyExpenses: number;
  pillars: {
    runway: HealthPillar;
    savingsRate: HealthPillar;
    creditUtilization: HealthPillar;
    debtBurden: HealthPillar;
    budgetAdherence: HealthPillar;
  };
  actionableTips: string[];
}

export interface FinancialHealthOptions {
  month?: number;
  year?: number;
}

function estimateDailyBurn(
  monthlyExpenses: number,
  effectiveIncome: number,
  monthlyReports: { datePrefix: string; income: number; expenses: number }[],
  targetPrefix: string,
  isCurrentMonth: boolean
): number {
  const activeReports = monthlyReports
    .filter((r) => r.expenses > 0)
    .sort((a, b) => b.datePrefix.localeCompare(a.datePrefix));

  const priorCompleted = activeReports.filter((r) => r.datePrefix < targetPrefix).slice(0, 3);
  const priorAvgMonthly =
    priorCompleted.length > 0
      ? priorCompleted.reduce((sum, r) => sum + r.expenses, 0) / priorCompleted.length
      : 0;

  if (isCurrentMonth) {
    // Prevent early-month partial expenses from inflating runway above historical burn
    if (priorAvgMonthly > 0) {
      return Math.max(priorAvgMonthly, monthlyExpenses) / 30;
    }
    if (monthlyExpenses > 0) {
      return monthlyExpenses / 30;
    }
  } else {
    const trailing = activeReports.filter((r) => r.datePrefix <= targetPrefix).slice(0, 3);
    if (trailing.length > 0) {
      const trailingAvg = trailing.reduce((sum, r) => sum + r.expenses, 0) / trailing.length;
      return trailingAvg / 30;
    }
    if (monthlyExpenses > 0) {
      return monthlyExpenses / 30;
    }
  }

  if (effectiveIncome > 0) {
    return (effectiveIncome * 0.7) / 30;
  }
  return 0;
}

export async function computeFinancialHealthScore(
  options?: FinancialHealthOptions
): Promise<FinancialHealthReport> {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const targetMonth = options?.month ?? currentMonth;
  const targetYear = options?.year ?? currentYear;
  const isCurrentMonth = targetMonth === currentMonth && targetYear === currentYear;
  const targetPrefix = `${targetYear}-${targetMonth.toString().padStart(2, '0')}`;

  const [accounts, monthlyTotals, debts, monthlyReports, budgetPlan] = await Promise.all([
    getAllAccounts(),
    getMonthlyTotals(targetMonth, targetYear),
    getActiveDebtList(),
    getMonthlyReports().catch(() => []),
    (isCurrentMonth
      ? getCurrentBudgetPlan()
      : getBudgetPlanForMonth(targetMonth, targetYear)
    ).catch(() => null),
  ]);

  const recordedIncome = Math.max(0, monthlyTotals.income);
  const plannedIncome =
    budgetPlan && budgetPlan.monthlyIncome > 0 ? budgetPlan.monthlyIncome : 0;
  const effectiveIncome = Math.max(recordedIncome, plannedIncome);
  const monthlyExpenses = Math.max(0, monthlyTotals.expenses);

  // 1. Emergency Runway (25 points)
  const liquidAccounts = accounts.filter((a) =>
    ['savings', 'checking', 'current', 'wallet'].includes(a.type)
  );
  const totalLiquid = liquidAccounts.reduce((sum, a) => sum + Math.max(0, a.balance), 0);
  const dailyBurn = estimateDailyBurn(
    monthlyExpenses,
    effectiveIncome,
    Array.isArray(monthlyReports) ? monthlyReports : [],
    targetPrefix,
    isCurrentMonth
  );

  let runwayDays = 0;
  let runwayScore = 5;
  let runwayStatus: HealthPillar['status'] = 'poor';
  let runwayMetricValue = '0 Days';
  let runwayAdvice =
    'Aim to build a 3-month reserve to guard against unexpected life emergencies.';

  if (dailyBurn <= 0) {
    if (totalLiquid > 0) {
      runwayScore = 15;
      runwayStatus = 'fair';
      runwayMetricValue = 'No spend data';
      runwayAdvice =
        'Track expenses or configure a budget plan to measure your emergency runway days accurately.';
    }
  } else {
    runwayDays = Math.round(totalLiquid / dailyBurn);
    runwayMetricValue = `${runwayDays} Days`;
    if (runwayDays >= 90) {
      runwayScore = 25;
      runwayStatus = 'excellent';
      runwayAdvice = 'Great job! You have a robust 3+ month cash reserve.';
    } else if (runwayDays >= 60) {
      runwayScore = 20;
      runwayStatus = 'good';
    } else if (runwayDays >= 30) {
      runwayScore = 15;
      runwayStatus = 'fair';
    } else if (runwayDays >= 14) {
      runwayScore = 10;
      runwayStatus = 'fair';
    }
  }

  const runwayPillar: HealthPillar = {
    id: 'runway',
    name: 'Emergency Buffer',
    score: runwayScore,
    maxScore: 25,
    percentage: Math.round((runwayScore / 25) * 100),
    status: runwayStatus,
    metricLabel: 'Liquid Runway',
    metricValue: runwayMetricValue,
    description: 'Covers essential expenses without incoming income.',
    advice: runwayAdvice,
  };

  // 2. Savings Rate (20 points)
  let savingsRate = 0;
  let savingsScore = 2;
  let savingsStatus: HealthPillar['status'] = 'poor';
  let savingsMetricValue = '0%';
  let savingsAdvice =
    'Try trimming non-essential dining and shopping to push savings toward 20%.';

  if (effectiveIncome <= 0) {
    if (monthlyExpenses > 0) {
      savingsScore = 2;
      savingsStatus = 'poor';
      savingsMetricValue = 'No income';
      savingsAdvice =
        'Log monthly income or set your expected income in the Plan tab to calculate your savings rate.';
    } else {
      savingsScore = 10;
      savingsStatus = 'fair';
      savingsMetricValue = 'N/A';
      savingsAdvice =
        'Add income and expense transactions or a budget plan to track your savings rate.';
    }
  } else {
    const netSavings = Math.max(0, effectiveIncome - monthlyExpenses);
    savingsRate = Math.round((netSavings / effectiveIncome) * 100);
    savingsMetricValue = `${savingsRate}%`;

    if (savingsRate >= 30) {
      savingsScore = 20;
      savingsStatus = 'excellent';
      savingsAdvice = 'Your savings rate meets or exceeds the golden 20% benchmark.';
    } else if (savingsRate >= 20) {
      savingsScore = 17;
      savingsStatus = 'good';
      savingsAdvice = 'Your savings rate meets or exceeds the golden 20% benchmark.';
    } else if (savingsRate >= 10) {
      savingsScore = 12;
      savingsStatus = 'fair';
    } else if (savingsRate >= 1) {
      savingsScore = 7;
      savingsStatus = 'fair';
    }
  }

  const savingsPillar: HealthPillar = {
    id: 'savings',
    name: 'Savings Rate',
    score: savingsScore,
    maxScore: 20,
    percentage: Math.round((savingsScore / 20) * 100),
    status: savingsStatus,
    metricLabel: 'Monthly Savings',
    metricValue: savingsMetricValue,
    description: 'Percentage of monthly income saved or invested.',
    advice: savingsAdvice,
  };

  // 3. Credit Utilization (20 points)
  const creditCards = accounts.filter((a) => a.type === 'credit');
  const totalCreditLimit = creditCards.reduce((sum, c) => sum + Math.max(0, c.creditLimit || 0), 0);
  const totalCreditBalance = creditCards.reduce(
    (sum, c) => sum + (c.balance < 0 ? Math.abs(c.balance) : 0),
    0
  );

  let creditUtilPercent = 0;
  let creditScore = 20;
  let creditStatus: HealthPillar['status'] = 'excellent';
  let creditMetricValue = creditCards.length > 0 ? '0%' : 'N/A';
  let creditAdvice =
    'Your credit utilization is well under 30%, protecting your credit score.';

  if (creditCards.length > 0 && totalCreditLimit > 0) {
    creditUtilPercent = Math.round((totalCreditBalance / totalCreditLimit) * 100);
    creditMetricValue = `${creditUtilPercent}%`;

    if (creditUtilPercent <= 10) {
      creditScore = 20;
      creditStatus = 'excellent';
    } else if (creditUtilPercent <= 29) {
      creditScore = 17;
      creditStatus = 'good';
    } else if (creditUtilPercent <= 49) {
      creditScore = 11;
      creditStatus = 'fair';
      creditAdvice =
        'Keep credit card balances below 30% of your total limit to maintain a healthy score.';
    } else if (creditUtilPercent <= 74) {
      creditScore = 6;
      creditStatus = 'poor';
      creditAdvice =
        'Keep credit card balances below 30% of your total limit to maintain a healthy score.';
    } else {
      creditScore = 2;
      creditStatus = 'poor';
      creditAdvice =
        'High credit utilization is hurting your score. Pay down card balances below 30%.';
    }
  } else if (creditCards.length > 0 && totalCreditLimit <= 0 && totalCreditBalance > 0) {
    creditScore = 10;
    creditStatus = 'fair';
    creditMetricValue = 'Limit missing';
    creditAdvice = 'Add your credit limit on credit card accounts to track utilization accurately.';
  }

  const creditPillar: HealthPillar = {
    id: 'credit',
    name: 'Credit Card Utilization',
    score: creditScore,
    maxScore: 20,
    percentage: Math.round((creditScore / 20) * 100),
    status: creditStatus,
    metricLabel: 'Credit Ratio',
    metricValue: creditMetricValue,
    description: 'Total credit balances relative to overall credit limit.',
    advice: creditAdvice,
  };

  // 4. Debt Burden / DTI (20 points)
  const totalDebtBalance = debts.reduce((sum, d) => sum + d.balance, 0);
  const totalMonthlyMinDebt = debts.reduce((sum, d) => sum + d.minPayment, 0);

  let dtiPercent = 0;
  let debtScore = 20;
  let debtStatus: HealthPillar['status'] = 'excellent';
  let debtMetricValue = debts.length > 0 ? '0%' : '0%';
  let debtAdvice = 'Your debt load is manageable and well within safe limits.';

  if (totalDebtBalance > 0) {
    if (effectiveIncome <= 0) {
      dtiPercent = 100;
      debtScore = 3;
      debtStatus = 'poor';
      debtMetricValue = 'No income';
      debtAdvice =
        'Log monthly income or set a budget plan to evaluate your debt-to-income burden.';
    } else {
      dtiPercent = Math.round((totalMonthlyMinDebt / effectiveIncome) * 100);
      debtMetricValue = `${dtiPercent}%`;

      if (dtiPercent <= 10) {
        debtScore = 20;
        debtStatus = 'excellent';
      } else if (dtiPercent <= 20) {
        debtScore = 17;
        debtStatus = 'good';
      } else if (dtiPercent <= 35) {
        debtScore = 12;
        debtStatus = 'fair';
        debtAdvice = 'Explore our Debt Strategist (Snowball/Avalanche) to speed up payoff.';
      } else if (dtiPercent <= 50) {
        debtScore = 7;
        debtStatus = 'poor';
        debtAdvice = 'Explore our Debt Strategist (Snowball/Avalanche) to speed up payoff.';
      } else {
        debtScore = 3;
        debtStatus = 'poor';
        debtAdvice = 'Debt obligations exceed 50% of income. Prioritize high-APR debt payoff.';
      }
    }
  }

  const debtPillar: HealthPillar = {
    id: 'debt',
    name: 'Debt-to-Income',
    score: debtScore,
    maxScore: 20,
    percentage: Math.round((debtScore / 20) * 100),
    status: debtStatus,
    metricLabel: 'DTI Burden',
    metricValue: debtMetricValue,
    description: 'Monthly loan and credit debt commitments vs. income.',
    advice: debtAdvice,
  };

  // 5. Budget Adherence (15 points)
  let spendVsIncomeRatio = 0;
  let budgetScore = 15;
  let budgetStatus: HealthPillar['status'] = 'excellent';
  let budgetMetricValue = '0%';
  let budgetAdvice = 'Living below your means allows strong compound wealth growth.';

  if (effectiveIncome <= 0) {
    if (monthlyExpenses > 0) {
      spendVsIncomeRatio = 1.5;
      budgetScore = 3;
      budgetStatus = 'poor';
      budgetMetricValue = 'No income';
      budgetAdvice =
        'Spending occurred without recorded or planned income. Set monthly income in the Plan tab.';
    } else {
      budgetScore = 8;
      budgetStatus = 'fair';
      budgetMetricValue = 'N/A';
      budgetAdvice =
        'Add monthly transactions or configure a budget plan to evaluate spending discipline.';
    }
  } else {
    spendVsIncomeRatio = monthlyExpenses / effectiveIncome;
    budgetMetricValue = `${Math.round(spendVsIncomeRatio * 100)}%`;

    if (spendVsIncomeRatio <= 0.8) {
      budgetScore = 15;
      budgetStatus = 'excellent';
    } else if (spendVsIncomeRatio <= 0.95) {
      budgetScore = 11;
      budgetStatus = 'good';
      budgetAdvice =
        'Spending is close to your monthly income. Review discretionary categories to widen your margin.';
    } else if (spendVsIncomeRatio <= 1.05) {
      budgetScore = 7;
      budgetStatus = 'fair';
      budgetAdvice =
        'Spending is at or slightly above income this month. Review discretionary categories.';
    } else {
      budgetScore = 3;
      budgetStatus = 'poor';
      budgetAdvice =
        'Monthly spending exceeds income. Pause non-essential wants in the Plan tab.';
    }
  }

  const budgetPillar: HealthPillar = {
    id: 'budget',
    name: 'Budget Discipline',
    score: budgetScore,
    maxScore: 15,
    percentage: Math.round((budgetScore / 15) * 100),
    status: budgetStatus,
    metricLabel: 'Spend / Income',
    metricValue: budgetMetricValue,
    description: 'Adherence to living comfortably within monthly income.',
    advice: budgetAdvice,
  };

  // Overall Score Calculation
  const overallScore = Math.min(
    100,
    Math.max(0, runwayScore + savingsScore + creditScore + debtScore + budgetScore)
  );

  let grade: FinancialHealthReport['grade'] = 'Fair';
  let gradeColor = '#F59E0B';
  let headline = 'Stable Financial Foundation';
  let summary = 'You have stable fundamentals with clear opportunities to accelerate growth.';

  if (overallScore >= 88) {
    grade = 'Exceptional';
    gradeColor = '#10B981';
    headline = 'Financial Fortress';
    summary =
      'Your finances are exceptionally resilient across cash flow, low debt, and savings discipline.';
  } else if (overallScore >= 72) {
    grade = 'Strong';
    gradeColor = '#3B82F6';
    headline = 'Resilient & Healthy';
    summary = 'You are consistently managing expenses well and keeping liabilities under control.';
  } else if (overallScore < 55) {
    grade = 'Vulnerable';
    gradeColor = '#EF4444';
    headline = 'Needs Attention';
    summary = 'Cash buffer or debt commitments are putting pressure on monthly peace of mind.';
  }

  // Prioritized actionable recommendations
  const actionableTips: string[] = [];
  if (effectiveIncome <= 0 && (monthlyExpenses > 0 || totalDebtBalance > 0)) {
    actionableTips.push(
      'Log monthly income transactions or set your monthly income in the Plan tab for accurate scoring.'
    );
  }
  if (dailyBurn > 0 && runwayDays < 60) {
    actionableTips.push(
      `Build your emergency cash buffer to at least 60 days (+${20 - runwayScore} pts).`
    );
  }
  if (effectiveIncome > 0 && savingsRate < 20) {
    actionableTips.push(
      `Aim to save or invest at least 20% of monthly earnings (+${17 - savingsScore} pts).`
    );
  }
  if (creditCards.length > 0 && totalCreditLimit <= 0 && totalCreditBalance > 0) {
    actionableTips.push(
      'Set a credit limit on your credit card accounts to enable accurate utilization tracking.'
    );
  } else if (creditUtilPercent > 30) {
    actionableTips.push(
      `Bring credit card utilization down below 30% (+${17 - creditScore} pts).`
    );
  }
  if (effectiveIncome > 0 && dtiPercent > 20) {
    actionableTips.push(
      `Accelerate debt payoff using Avalanche order to lower monthly DTI (+${17 - debtScore} pts).`
    );
  }
  if (effectiveIncome > 0 && spendVsIncomeRatio > 0.9) {
    actionableTips.push(
      'Review non-essential discretionary spending in the Plan tab to stay within 80% of income.'
    );
  }
  if (actionableTips.length === 0) {
    actionableTips.push(
      'Keep investing surpluses regularly into diversified asset classes in your Wealth Cockpit.'
    );
    actionableTips.push('Set automated monthly rules to streamline expense categorization.');
  }

  return {
    overallScore,
    grade,
    gradeColor,
    headline,
    summary,
    month: targetMonth,
    year: targetYear,
    recordedIncome,
    effectiveIncome,
    monthlyExpenses,
    pillars: {
      runway: runwayPillar,
      savingsRate: savingsPillar,
      creditUtilization: creditPillar,
      debtBurden: debtPillar,
      budgetAdherence: budgetPillar,
    },
    actionableTips,
  };
}

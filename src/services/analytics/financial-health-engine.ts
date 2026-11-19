import { getAllAccounts } from '../database/account-dao';
import { getMonthlyTotals } from '../database/transaction-dao';
import { getCurrentBudgetPlan } from '../database/budget-dao';
import { getActiveDebtList } from '../debt/debt-payoff-service';

export interface HealthPillar {
  id: string;
  name: string;
  score: number; // current points earned
  maxScore: number; // max possible points
  percentage: number; // 0 - 100
  status: 'excellent' | 'good' | 'fair' | 'poor';
  metricLabel: string;
  metricValue: string;
  description: string;
  advice: string;
}

export interface FinancialHealthReport {
  overallScore: number; // 0 - 100
  grade: 'Exceptional' | 'Strong' | 'Fair' | 'Vulnerable';
  gradeColor: string;
  headline: string;
  summary: string;
  pillars: {
    runway: HealthPillar;
    savingsRate: HealthPillar;
    creditUtilization: HealthPillar;
    debtBurden: HealthPillar;
    budgetAdherence: HealthPillar;
  };
  actionableTips: string[];
}

export async function computeFinancialHealthScore(): Promise<FinancialHealthReport> {
  const accounts = await getAllAccounts();
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const monthlyTotals = await getMonthlyTotals(currentMonth, currentYear);
  const debts = await getActiveDebtList();

  let monthlyIncome = monthlyTotals.income;
  try {
    const budgetPlan = await getCurrentBudgetPlan();
    if (budgetPlan && budgetPlan.monthlyIncome > 0) {
      monthlyIncome = Math.max(monthlyIncome, budgetPlan.monthlyIncome);
    }
  } catch {
    // ignore
  }

  const monthlyExpenses = monthlyTotals.expenses;

  // 1. Emergency Runway (25 points)
  const liquidAccounts = accounts.filter((a) =>
    ['savings', 'checking', 'current', 'wallet'].includes(a.type)
  );
  const totalLiquid = liquidAccounts.reduce((sum, a) => sum + Math.max(0, a.balance), 0);
  const dailyBurn = monthlyExpenses > 0 ? monthlyExpenses / 30 : 100;
  const runwayDays = Math.round(totalLiquid / dailyBurn);

  let runwayScore = 5;
  let runwayStatus: HealthPillar['status'] = 'poor';
  if (runwayDays >= 90) {
    runwayScore = 25;
    runwayStatus = 'excellent';
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

  const runwayPillar: HealthPillar = {
    id: 'runway',
    name: 'Emergency Buffer',
    score: runwayScore,
    maxScore: 25,
    percentage: Math.round((runwayScore / 25) * 100),
    status: runwayStatus,
    metricLabel: 'Liquid Runway',
    metricValue: `${runwayDays} Days`,
    description: 'Covers essential expenses without incoming income.',
    advice:
      runwayDays >= 90
        ? 'Great job! You have a robust 3+ month cash reserve.'
        : 'Aim to build a 3-month reserve to guard against unexpected life emergencies.',
  };

  // 2. Savings Rate (20 points)
  const netSavings = Math.max(0, monthlyIncome - monthlyExpenses);
  const savingsRate = monthlyIncome > 0 ? Math.round((netSavings / monthlyIncome) * 100) : 0;

  let savingsScore = 2;
  let savingsStatus: HealthPillar['status'] = 'poor';
  if (savingsRate >= 30) {
    savingsScore = 20;
    savingsStatus = 'excellent';
  } else if (savingsRate >= 20) {
    savingsScore = 17;
    savingsStatus = 'good';
  } else if (savingsRate >= 10) {
    savingsScore = 12;
    savingsStatus = 'fair';
  } else if (savingsRate >= 1) {
    savingsScore = 7;
    savingsStatus = 'fair';
  }

  const savingsPillar: HealthPillar = {
    id: 'savings',
    name: 'Savings Rate',
    score: savingsScore,
    maxScore: 20,
    percentage: Math.round((savingsScore / 20) * 100),
    status: savingsStatus,
    metricLabel: 'Monthly Savings',
    metricValue: `${savingsRate}%`,
    description: 'Percentage of monthly income saved or invested.',
    advice:
      savingsRate >= 20
        ? 'Your savings rate meets or exceeds the golden 20% benchmark.'
        : 'Try trimming non-essential dining and shopping to push savings toward 20%.',
  };

  // 3. Credit Utilization (20 points)
  const creditCards = accounts.filter((a) => a.type === 'credit');
  const totalCreditLimit = creditCards.reduce((sum, c) => sum + (c.creditLimit || 0), 0);
  const totalCreditBalance = creditCards.reduce((sum, c) => sum + Math.max(0, Math.abs(c.balance)), 0);

  let creditUtilPercent = 0;
  if (totalCreditLimit > 0) {
    creditUtilPercent = Math.round((totalCreditBalance / totalCreditLimit) * 100);
  }

  let creditScore = 20;
  let creditStatus: HealthPillar['status'] = 'excellent';
  if (creditCards.length > 0 && totalCreditLimit > 0) {
    if (creditUtilPercent <= 10) {
      creditScore = 20;
      creditStatus = 'excellent';
    } else if (creditUtilPercent <= 29) {
      creditScore = 17;
      creditStatus = 'good';
    } else if (creditUtilPercent <= 49) {
      creditScore = 11;
      creditStatus = 'fair';
    } else if (creditUtilPercent <= 74) {
      creditScore = 6;
      creditStatus = 'poor';
    } else {
      creditScore = 2;
      creditStatus = 'poor';
    }
  }

  const creditPillar: HealthPillar = {
    id: 'credit',
    name: 'Credit Card Utilization',
    score: creditScore,
    maxScore: 20,
    percentage: Math.round((creditScore / 20) * 100),
    status: creditStatus,
    metricLabel: 'Credit Ratio',
    metricValue: creditCards.length > 0 ? `${creditUtilPercent}%` : 'N/A',
    description: 'Total credit balances relative to overall credit limit.',
    advice:
      creditUtilPercent <= 30
        ? 'Your credit utilization is well under 30%, protecting your CIBIL score.'
        : 'Keep credit card balances below 30% of your total limit to maintain a healthy score.',
  };

  // 4. Debt Burden / DTI (20 points)
  const totalDebtBalance = debts.reduce((sum, d) => sum + d.balance, 0);
  const totalMonthlyMinDebt = debts.reduce((sum, d) => sum + d.minPayment, 0);
  const dtiPercent = monthlyIncome > 0 ? Math.round((totalMonthlyMinDebt / monthlyIncome) * 100) : 0;

  let debtScore = 20;
  let debtStatus: HealthPillar['status'] = 'excellent';
  if (totalDebtBalance > 0) {
    if (dtiPercent <= 10) {
      debtScore = 20;
      debtStatus = 'excellent';
    } else if (dtiPercent <= 20) {
      debtScore = 17;
      debtStatus = 'good';
    } else if (dtiPercent <= 35) {
      debtScore = 12;
      debtStatus = 'fair';
    } else if (dtiPercent <= 50) {
      debtScore = 7;
      debtStatus = 'poor';
    } else {
      debtScore = 3;
      debtStatus = 'poor';
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
    metricValue: debts.length > 0 ? `${dtiPercent}%` : '0%',
    description: 'Monthly loan and credit debt commitments vs. income.',
    advice:
      dtiPercent <= 20
        ? 'Your debt load is manageable and well within safe limits.'
        : 'Explore our Debt Strategist (Snowball/Avalanche) to speed up payoff.',
  };

  // 5. Budget Adherence (15 points)
  const spendVsIncomeRatio = monthlyIncome > 0 ? monthlyExpenses / monthlyIncome : 0.8;
  let budgetScore = 15;
  let budgetStatus: HealthPillar['status'] = 'excellent';

  if (spendVsIncomeRatio <= 0.8) {
    budgetScore = 15;
    budgetStatus = 'excellent';
  } else if (spendVsIncomeRatio <= 0.95) {
    budgetScore = 11;
    budgetStatus = 'good';
  } else if (spendVsIncomeRatio <= 1.05) {
    budgetScore = 7;
    budgetStatus = 'fair';
  } else {
    budgetScore = 3;
    budgetStatus = 'poor';
  }

  const budgetPillar: HealthPillar = {
    id: 'budget',
    name: 'Budget Discipline',
    score: budgetScore,
    maxScore: 15,
    percentage: Math.round((budgetScore / 15) * 100),
    status: budgetStatus,
    metricLabel: 'Spend / Income',
    metricValue: `${Math.round(spendVsIncomeRatio * 100)}%`,
    description: 'Adherence to living comfortably within monthly income.',
    advice:
      spendVsIncomeRatio <= 0.8
        ? 'Living below your means allows strong compound wealth growth.'
        : 'Spending is close to or exceeding income this month. Review discretionary categories.',
  };

  // Overall Score Calculation
  const overallScore = Math.min(
    100,
    Math.max(
      0,
      runwayScore + savingsScore + creditScore + debtScore + budgetScore
    )
  );

  let grade: FinancialHealthReport['grade'] = 'Fair';
  let gradeColor = '#F59E0B';
  let headline = 'Stable Financial Foundation';
  let summary = 'You have stable fundamentals with clear opportunities to accelerate growth.';

  if (overallScore >= 88) {
    grade = 'Exceptional';
    gradeColor = '#10B981';
    headline = 'Financial Fortress';
    summary = 'Your finances are exceptionally resilient across cash flow, low debt, and savings discipline.';
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
  if (runwayDays < 60) {
    actionableTips.push(`Build your emergency cash buffer to at least 60 days (+${20 - runwayScore} pts).`);
  }
  if (savingsRate < 20) {
    actionableTips.push(`Aim to save or invest at least 20% of monthly earnings (+${17 - savingsScore} pts).`);
  }
  if (creditUtilPercent > 30) {
    actionableTips.push(`Bring credit card utilization down below 30% (+${17 - creditScore} pts).`);
  }
  if (dtiPercent > 20) {
    actionableTips.push(`Accelerate debt payoff using Avalanche order to lower monthly DTI (+${17 - debtScore} pts).`);
  }
  if (spendVsIncomeRatio > 0.9) {
    actionableTips.push('Review non-essential discretionary spending in the Plan tab to stay within 80% of income.');
  }
  if (actionableTips.length === 0) {
    actionableTips.push('Keep investing surpluses regularly into diversified asset classes in your Wealth Cockpit.');
    actionableTips.push('Set automated monthly rules to streamline expense categorization.');
  }

  return {
    overallScore,
    grade,
    gradeColor,
    headline,
    summary,
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

import { getAllAccounts } from '../database/account-dao';
import { getActiveRecurringTransactions } from '../database/recurring-dao';

export interface DebtItem {
  id: string;
  name: string;
  institution?: string;
  type: 'credit' | 'loan' | 'borrowed' | 'splitwise';
  balance: number; // Positive number representing outstanding debt
  interestRate: number; // Annual % (e.g. 36 for credit card, 12 for personal loan)
  minPayment: number; // Monthly minimum payment
  creditLimit?: number;
}

export interface DebtPayoffStep {
  monthIndex: number;
  dateStr: string; // "Jan 2027"
  totalRemainingBalance: number;
  totalInterestPaid: number;
  debtsPaidOffThisMonth: string[];
}

export interface DebtStrategyResult {
  strategy: 'snowball' | 'avalanche';
  totalMonths: number;
  isUnpayableWithCurrentPayment?: boolean;
  debtFreeDate: string; // e.g. "Oct 2027"
  totalInterestPaid: number;
  totalPrincipalPaid: number;
  totalCost: number;
  monthlySteps: DebtPayoffStep[];
  payoffOrder: {
    id: string;
    name: string;
    balance: number;
    interestRate: number;
    payoffMonth: number;
    isUnpayable?: boolean;
    payoffDate: string;
  }[];
}

export interface DebtPayoffComparison {
  totalDebt: number;
  activeDebts: DebtItem[];
  extraMonthlyPayment: number;
  snowball: DebtStrategyResult;
  avalanche: DebtStrategyResult;
  baseline: {
    totalMonths: number;
    debtFreeDate: string;
    totalInterestPaid: number;
  };
  interestSavedWithAvalanche: number;
  interestSavedWithSnowball: number;
  monthsSaved: number;
}

const DEFAULT_APR_BY_TYPE: Record<string, number> = {
  credit: 36, // Standard credit card APR
  loan: 12.5, // Standard personal/auto/education loan APR
  borrowed: 0,
  splitwise: 0,
};

function formatMonthYear(monthsFromNow: number): string {
  const d = new Date();
  const targetMonth = d.getMonth() + monthsFromNow;
  d.setDate(1);
  d.setMonth(targetMonth);
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Discovers and formats all active liabilities and debt accounts from the database.
 */
export async function getActiveDebtList(): Promise<DebtItem[]> {
  const accounts = await getAllAccounts();
  const activeRecurring = await getActiveRecurringTransactions();

  const liabilityAccounts = accounts.filter(
    (a) => ['credit', 'loan', 'borrowed'].includes(a.type) && a.balance < 0
  );

  const debts: DebtItem[] = [];

  for (const acc of liabilityAccounts) {
    const rawBalance = Math.abs(acc.balance);
    if (rawBalance <= 0) continue;

    // Match recurring EMIs / payments (Clarity logs debt payments as transfers to liability accounts or expenses)
    const matchedRecurring = activeRecurring.find(
      (r) =>
        (r.type === 'transfer' && r.toAccountId === acc.id) ||
        (r.accountId === acc.id && r.type === 'expense')
    );

    // Compute minimum monthly payment
    let minPayment = 0;
    if (matchedRecurring && matchedRecurring.amount > 0) {
      minPayment = matchedRecurring.amount;
    } else if (acc.type === 'credit') {
      // Standard 5% minimum payment on credit card balance, min ₹500
      minPayment = Math.max(500, Math.round(rawBalance * 0.05));
    } else {
      // Standard loan amortized estimate: approx 3% of principal
      minPayment = Math.max(1000, Math.round(rawBalance * 0.035));
    }

    const defaultApr = DEFAULT_APR_BY_TYPE[acc.type] ?? 12;

    debts.push({
      id: acc.id,
      name: acc.name,
      institution: acc.institution,
      type: (acc.type as any) || 'loan',
      balance: rawBalance,
      interestRate: defaultApr,
      minPayment,
      creditLimit: acc.creditLimit,
    });
  }

  return debts;
}

/**
 * Simulates debt payoff for a given ordering (Snowball or Avalanche).
 */
export function simulateDebtStrategy(
  debts: DebtItem[],
  strategy: 'snowball' | 'avalanche',
  extraMonthlyPayment: number = 0
): DebtStrategyResult {
  if (debts.length === 0) {
    return {
      strategy,
      totalMonths: 0,
      debtFreeDate: 'Debt Free!',
      totalInterestPaid: 0,
      totalPrincipalPaid: 0,
      totalCost: 0,
      monthlySteps: [],
      payoffOrder: [],
    };
  }

  // Clone debt list
  const active = debts.map((d) => ({
    id: d.id,
    name: d.name,
    balance: d.balance,
    interestRate: d.interestRate,
    minPayment: Math.max(10, d.minPayment),
    originalMinPayment: Math.max(10, d.minPayment),
    payoffMonth: 0,
    isPaid: false,
  }));

  // Sort debts based on strategy
  if (strategy === 'snowball') {
    // Lowest balance first
    active.sort((a, b) => a.balance - b.balance);
  } else {
    // Highest interest rate first
    active.sort((a, b) => b.interestRate - a.interestRate);
  }

  const initialPrincipal = debts.reduce((acc, d) => acc + d.balance, 0);
  let totalInterestAccumulated = 0;
  let rolledOverExtra = 0;
  let month = 0;
  const maxMonths = 360; // 30-year safety ceiling

  const steps: DebtPayoffStep[] = [];

  while (active.some((d) => !d.isPaid) && month < maxMonths) {
    month++;
    const paidOffThisMonth: string[] = [];

    // 1. Accrue monthly interest on all remaining active debts
    for (const d of active) {
      if (!d.isPaid) {
        const monthlyRate = d.interestRate / 100 / 12;
        const interest = d.balance * monthlyRate;
        d.balance += interest;
        totalInterestAccumulated += interest;
      }
    }

    // 2. Pay minimums on all active debts
    let freedUpFromPayoff = 0;
    for (const d of active) {
      if (!d.isPaid) {
        const payment = Math.min(d.balance, d.minPayment);
        d.balance -= payment;

        if (d.balance <= 0.01) {
          d.isPaid = true;
          d.balance = 0;
          d.payoffMonth = month;
          paidOffThisMonth.push(d.name);
          freedUpFromPayoff += d.originalMinPayment;
        }
      }
    }

    // 3. Roll extra cash + freed minimums into the top priority active debt
    let extraAvailable = extraMonthlyPayment + rolledOverExtra;
    rolledOverExtra += freedUpFromPayoff;

    for (const d of active) {
      if (!d.isPaid && extraAvailable > 0) {
        const extraPayment = Math.min(d.balance, extraAvailable);
        d.balance -= extraPayment;
        extraAvailable -= extraPayment;

        if (d.balance <= 0.01) {
          d.isPaid = true;
          d.balance = 0;
          d.payoffMonth = month;
          paidOffThisMonth.push(d.name);
          rolledOverExtra += d.originalMinPayment;
        }
      }
    }

    const totalRemaining = active.reduce((sum, d) => sum + d.balance, 0);

    // Save periodic step data (every 3 months or on final month)
    if (month % 3 === 0 || totalRemaining <= 0 || paidOffThisMonth.length > 0) {
      steps.push({
        monthIndex: month,
        dateStr: formatMonthYear(month),
        totalRemainingBalance: Math.round(totalRemaining),
        totalInterestPaid: Math.round(totalInterestAccumulated),
        debtsPaidOffThisMonth: paidOffThisMonth,
      });
    }
  }

  const hasUnpaidDebt = active.some((d) => !d.isPaid);
  const payoffOrder = active.map((d) => ({
    id: d.id,
    name: d.name,
    balance: debts.find((orig) => orig.id === d.id)?.balance || 0,
    interestRate: d.interestRate,
    payoffMonth: d.isPaid ? d.payoffMonth : maxMonths,
    isUnpayable: !d.isPaid,
    payoffDate: d.isPaid ? formatMonthYear(d.payoffMonth) : '30+ yrs (raise payment)',
  }));

  return {
    strategy,
    totalMonths: month,
    isUnpayableWithCurrentPayment: hasUnpaidDebt,
    debtFreeDate: hasUnpaidDebt ? '30+ yrs (raise payment)' : formatMonthYear(month),
    totalInterestPaid: Math.round(totalInterestAccumulated),
    totalPrincipalPaid: Math.round(initialPrincipal),
    totalCost: Math.round(initialPrincipal + totalInterestAccumulated),
    monthlySteps: steps,
    payoffOrder,
  };
}

/**
 * Compares Snowball vs. Avalanche side-by-side against a baseline of paying minimums with ₹0 extra.
 */
export function calculateDebtComparison(
  debts: DebtItem[],
  extraMonthlyPayment: number
): DebtPayoffComparison {
  const totalDebt = debts.reduce((sum, d) => sum + d.balance, 0);

  const baseline = simulateDebtStrategy(debts, 'snowball', 0);
  const snowball = simulateDebtStrategy(debts, 'snowball', extraMonthlyPayment);
  const avalanche = simulateDebtStrategy(debts, 'avalanche', extraMonthlyPayment);

  const interestSavedWithAvalanche = Math.max(
    0,
    baseline.totalInterestPaid - avalanche.totalInterestPaid
  );
  const interestSavedWithSnowball = Math.max(
    0,
    baseline.totalInterestPaid - snowball.totalInterestPaid
  );
  const monthsSaved = Math.max(0, baseline.totalMonths - avalanche.totalMonths);

  return {
    totalDebt: Math.round(totalDebt),
    activeDebts: debts,
    extraMonthlyPayment,
    snowball,
    avalanche,
    baseline: {
      totalMonths: baseline.totalMonths,
      debtFreeDate: baseline.debtFreeDate,
      totalInterestPaid: baseline.totalInterestPaid,
    },
    interestSavedWithAvalanche: Math.round(interestSavedWithAvalanche),
    interestSavedWithSnowball: Math.round(interestSavedWithSnowball),
    monthsSaved,
  };
}

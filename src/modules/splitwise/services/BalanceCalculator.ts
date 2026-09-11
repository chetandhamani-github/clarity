import type {
  Person,
  Debt,
  Settlement,
  Expense,
  ExpenseWithSplits,
  ParticipantShare,
  SplitCalculationResult,
  EqualSplitRequest,
  PercentageSplitRequest,
  ExactSplitRequest,
  SharesSplitRequest,
  GroupBalanceSummary,
  PersonBalanceSummary,
} from '../types/splitwise.types';
import { DebtType, SplitType } from '../types/splitwise.types';

export type BalanceStatus = 'OWED_TO_ME' | 'YOU_OWE' | 'SETTLED';

export interface DetailedPersonBalance {
  personId: string;
  personName?: string;
  totalReceivable: number; // Total money this person owes you (OWE_ME debts)
  totalPayable: number; // Total money you owe this person (I_OWE debts)
  totalSettled: number; // Total settlements recorded for this person
  grossBalance: number; // totalReceivable - totalPayable (before settlements)
  netBalance: number; // (totalReceivable - totalPayable) - totalSettled
  remainingReceivable: number; // Remaining amount owed to you after settlements
  status: BalanceStatus;
  statusLabel: string;
}

export interface DetailedOverallSummary {
  totalReceivable: number;
  totalPayable: number;
  totalSettled: number;
  netBalance: number;
  activePeopleCount: number;
  settledPeopleCount: number;
  totalPeopleCount: number;
}

/**
 * Rounds a number safely to 2 decimal places to avoid IEEE-754 precision bugs.
 */
export function roundCurrency(amount: number): number {
  if (isNaN(amount) || !isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates total receivable amount (debts where type is OWE_ME).
 */
export function calculateTotalReceivable(debts: Debt[]): number {
  const sum = debts.reduce((acc, debt) => {
    if (debt.type === DebtType.OWE_ME) {
      return acc + (Number(debt.amount) || 0);
    }
    return acc;
  }, 0);
  return roundCurrency(sum);
}

/**
 * Calculates total payable amount (debts where type is I_OWE).
 */
export function calculateTotalPayable(debts: Debt[]): number {
  const sum = debts.reduce((acc, debt) => {
    if (debt.type === DebtType.I_OWE) {
      return acc + (Number(debt.amount) || 0);
    }
    return acc;
  }, 0);
  return roundCurrency(sum);
}

/**
 * Calculates total settlements recorded.
 */
export function calculateTotalSettled(settlements: Settlement[]): number {
  const sum = settlements.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
  return roundCurrency(sum);
}

/**
 * Calculates net balance: (totalReceivable - totalPayable) - totalSettled.
 * - Positive (> 0): The person owes you money.
 * - Negative (< 0): You owe the person money.
 * - Zero (=== 0): Fully settled.
 */
export function calculateNetBalance(
  totalReceivable: number,
  totalPayable: number,
  totalSettled: number
): number {
  const gross = totalReceivable - totalPayable;
  return roundCurrency(gross - totalSettled);
}

/**
 * Calculates remaining receivable after settlements.
 * Example: OWE_ME ₹5,000 and Settlement ₹1,000 -> Remaining ₹4,000.
 */
export function calculateRemainingReceivable(
  totalReceivable: number,
  totalSettled: number
): number {
  return roundCurrency(Math.max(0, totalReceivable - totalSettled));
}

/**
 * Determines the balance status (OWED_TO_ME | YOU_OWE | SETTLED).
 */
export function determineBalanceStatus(netBalance: number): BalanceStatus {
  if (Math.abs(netBalance) < 0.01) {
    return 'SETTLED';
  }
  return netBalance > 0 ? 'OWED_TO_ME' : 'YOU_OWE';
}

/**
 * Generates a user-friendly status label.
 */
export function getStatusLabel(status: BalanceStatus, netBalance: number): string {
  switch (status) {
    case 'OWED_TO_ME':
      return 'Owes you';
    case 'YOU_OWE':
      return 'You owe';
    case 'SETTLED':
    default:
      return 'Settled up';
  }
}

/**
 * Calculates full detailed balance metrics for a single person.
 */
export function calculatePersonBalance(
  personId: string,
  debts: Debt[],
  settlements: Settlement[],
  person?: Person
): DetailedPersonBalance {
  const personDebts = debts.filter((d) => d.personId === personId);
  const personSettlements = settlements.filter((s) => s.personId === personId);

  const totalReceivable = calculateTotalReceivable(personDebts);
  const totalPayable = calculateTotalPayable(personDebts);
  const totalSettled = calculateTotalSettled(personSettlements);
  const grossBalance = roundCurrency(totalReceivable - totalPayable);
  const netBalance = calculateNetBalance(totalReceivable, totalPayable, totalSettled);
  const remainingReceivable = calculateRemainingReceivable(totalReceivable, totalSettled);
  const status = determineBalanceStatus(netBalance);
  const statusLabel = getStatusLabel(status, netBalance);

  return {
    personId,
    personName: person?.name,
    totalReceivable,
    totalPayable,
    totalSettled,
    grossBalance,
    netBalance,
    remainingReceivable,
    status,
    statusLabel,
  };
}

/**
 * Calculates balance breakdowns for a collection of people.
 */
export function calculatePeopleBalances(
  people: Person[],
  debts: Debt[],
  settlements: Settlement[]
): DetailedPersonBalance[] {
  return people.map((person) => calculatePersonBalance(person.id, debts, settlements, person));
}

/**
 * Computes overall portfolio summary across all people.
 */
export function calculateOverallSummary(
  people: Person[],
  debts: Debt[],
  settlements: Settlement[]
): DetailedOverallSummary {
  const peopleBalances = calculatePeopleBalances(people, debts, settlements);

  let totalReceivable = 0;
  let totalPayable = 0;
  let totalSettled = 0;
  let netBalance = 0;
  let activePeopleCount = 0;
  let settledPeopleCount = 0;

  for (const pb of peopleBalances) {
    totalReceivable += pb.totalReceivable;
    totalPayable += pb.totalPayable;
    totalSettled += pb.totalSettled;
    netBalance += pb.netBalance;

    if (pb.status === 'SETTLED') {
      settledPeopleCount++;
    } else {
      activePeopleCount++;
    }
  }

  return {
    totalReceivable: roundCurrency(totalReceivable),
    totalPayable: roundCurrency(totalPayable),
    totalSettled: roundCurrency(totalSettled),
    netBalance: roundCurrency(netBalance),
    activePeopleCount,
    settledPeopleCount,
    totalPeopleCount: people.length,
  };
}

// ============================================================================
// Future Support Architecture: Split Calculation Engines (Equal, Percentage, Exact, Shares)
// ============================================================================

/**
 * Calculates equal splits among participants, distributing penny rounding remainders.
 * Example: ₹100 split among 3 people -> 2 people owe ₹33.33, 1 person owes ₹33.34 (Total ₹100.00).
 */
export function calculateEqualSplits(request: EqualSplitRequest): SplitCalculationResult {
  const { totalAmount, payerId, participantIds } = request;
  const count = participantIds.length;

  if (count === 0) {
    return {
      splitType: SplitType.EQUAL,
      totalAmount,
      shares: [],
      isValid: false,
      roundingDifference: 0,
      errorMessage: 'At least one participant is required for split',
    };
  }

  const roundedTotal = roundCurrency(totalAmount);
  if (roundedTotal <= 0) {
    return {
      splitType: SplitType.EQUAL,
      totalAmount: roundedTotal,
      shares: [],
      isValid: false,
      roundingDifference: 0,
      errorMessage: 'Total amount must be greater than zero',
    };
  }

  const totalCents = Math.round(roundedTotal * 100);
  const baseCents = Math.floor(totalCents / count);
  const remainderCents = totalCents % count;

  const shares: ParticipantShare[] = participantIds.map((personId, index) => {
    // Distribute remainder cents to first N participants
    const shareCents = baseCents + (index < remainderCents ? 1 : 0);
    const owedAmount = roundCurrency(shareCents / 100);
    const paidAmount = personId === payerId ? roundedTotal : 0;
    const netOwed = roundCurrency(owedAmount - paidAmount);

    return {
      personId,
      paidAmount,
      owedAmount,
      percentage: roundCurrency((owedAmount / roundedTotal) * 100),
      netOwed,
    };
  });

  return {
    splitType: SplitType.EQUAL,
    totalAmount: roundedTotal,
    shares,
    isValid: true,
    roundingDifference: 0,
  };
}

/**
 * Calculates percentage splits with sum validation and remainder correction.
 * Example: 50% / 30% / 20% on ₹1,000 -> ₹500, ₹300, ₹200.
 */
export function calculatePercentageSplits(request: PercentageSplitRequest): SplitCalculationResult {
  const { totalAmount, payerId, splits } = request;
  const roundedTotal = roundCurrency(totalAmount);

  if (splits.length === 0) {
    return {
      splitType: SplitType.PERCENTAGE,
      totalAmount: roundedTotal,
      shares: [],
      isValid: false,
      roundingDifference: 0,
      errorMessage: 'At least one participant split is required',
    };
  }

  const totalPercentage = roundCurrency(splits.reduce((acc, s) => acc + s.percentage, 0));
  if (Math.abs(totalPercentage - 100) > 0.01) {
    return {
      splitType: SplitType.PERCENTAGE,
      totalAmount: roundedTotal,
      shares: [],
      isValid: false,
      roundingDifference: roundCurrency(100 - totalPercentage),
      errorMessage: `Total percentage must equal 100%. Current sum: ${totalPercentage}%`,
    };
  }

  let allocatedCents = 0;
  const shares: ParticipantShare[] = splits.map((s, index) => {
    const isLast = index === splits.length - 1;
    let shareCents: number;

    if (isLast) {
      // Last participant absorbs any 1-cent discrepancy from rounding
      const totalCents = Math.round(roundedTotal * 100);
      shareCents = totalCents - allocatedCents;
    } else {
      shareCents = Math.round((roundedTotal * (s.percentage / 100)) * 100);
      allocatedCents += shareCents;
    }

    const owedAmount = roundCurrency(shareCents / 100);
    const paidAmount = s.personId === payerId ? roundedTotal : 0;
    const netOwed = roundCurrency(owedAmount - paidAmount);

    return {
      personId: s.personId,
      paidAmount,
      owedAmount,
      percentage: s.percentage,
      netOwed,
    };
  });

  return {
    splitType: SplitType.PERCENTAGE,
    totalAmount: roundedTotal,
    shares,
    isValid: true,
    roundingDifference: 0,
  };
}

/**
 * Calculates exact amount splits with total validation.
 */
export function calculateExactSplits(request: ExactSplitRequest): SplitCalculationResult {
  const { totalAmount, payerId, splits } = request;
  const roundedTotal = roundCurrency(totalAmount);
  const totalAllocated = roundCurrency(splits.reduce((acc, s) => acc + (Number(s.amount) || 0), 0));

  const difference = roundCurrency(roundedTotal - totalAllocated);
  const isValid = Math.abs(difference) < 0.01;

  const shares: ParticipantShare[] = splits.map((s) => {
    const owedAmount = roundCurrency(s.amount);
    const paidAmount = s.personId === payerId ? roundedTotal : 0;
    const netOwed = roundCurrency(owedAmount - paidAmount);

    return {
      personId: s.personId,
      paidAmount,
      owedAmount,
      percentage: roundedTotal > 0 ? roundCurrency((owedAmount / roundedTotal) * 100) : 0,
      netOwed,
    };
  });

  return {
    splitType: SplitType.EXACT,
    totalAmount: roundedTotal,
    shares,
    isValid,
    roundingDifference: difference,
    errorMessage: isValid
      ? undefined
      : `Sum of exact splits (${totalAllocated}) does not match total expense amount (${roundedTotal})`,
  };
}

/**
 * Calculates share/ratio splits (e.g. 2 shares vs 1 share).
 */
export function calculateSharesSplits(request: SharesSplitRequest): SplitCalculationResult {
  const { totalAmount, payerId, splits } = request;
  const roundedTotal = roundCurrency(totalAmount);
  const totalShares = splits.reduce((acc, s) => acc + s.shares, 0);

  if (totalShares <= 0) {
    return {
      splitType: SplitType.SHARES,
      totalAmount: roundedTotal,
      shares: [],
      isValid: false,
      roundingDifference: 0,
      errorMessage: 'Total shares must be greater than zero',
    };
  }

  let allocatedCents = 0;
  const totalCents = Math.round(roundedTotal * 100);

  const shares: ParticipantShare[] = splits.map((s, index) => {
    const isLast = index === splits.length - 1;
    let shareCents: number;

    if (isLast) {
      shareCents = totalCents - allocatedCents;
    } else {
      shareCents = Math.round((totalCents * s.shares) / totalShares);
      allocatedCents += shareCents;
    }

    const owedAmount = roundCurrency(shareCents / 100);
    const paidAmount = s.personId === payerId ? roundedTotal : 0;
    const netOwed = roundCurrency(owedAmount - paidAmount);

    return {
      personId: s.personId,
      paidAmount,
      owedAmount,
      shares: s.shares,
      percentage: roundCurrency((s.shares / totalShares) * 100),
      netOwed,
    };
  });

  return {
    splitType: SplitType.SHARES,
    totalAmount: roundedTotal,
    shares,
    isValid: true,
    roundingDifference: 0,
  };
}

/**
 * Computes group net balance summary for future Groups architecture.
 */
export function calculateGroupBalances(
  groupId: string,
  groupName: string,
  members: Person[],
  expenses: ExpenseWithSplits[],
  settlements: Settlement[]
): GroupBalanceSummary {
  const memberBalances: Record<string, { totalPaid: number; totalOwed: number; totalSettled: number }> = {};

  for (const m of members) {
    memberBalances[m.id] = { totalPaid: 0, totalOwed: 0, totalSettled: 0 };
  }

  let totalGroupSpend = 0;

  for (const exp of expenses) {
    totalGroupSpend += exp.amount;
    if (memberBalances[exp.payerId]) {
      memberBalances[exp.payerId].totalPaid += exp.amount;
    }

    for (const split of exp.splits) {
      if (memberBalances[split.personId]) {
        memberBalances[split.personId].totalOwed += split.owedAmount;
      }
    }
  }

  for (const set of settlements) {
    if (memberBalances[set.personId]) {
      memberBalances[set.personId].totalSettled += set.amount;
    }
  }

  const memberSummaries: PersonBalanceSummary[] = members.map((m) => {
    const b = memberBalances[m.id] || { totalPaid: 0, totalOwed: 0, totalSettled: 0 };
    const netBalance = roundCurrency(b.totalPaid - b.totalOwed - b.totalSettled);

    return {
      person: m,
      totalOwedToMe: b.totalPaid > b.totalOwed ? roundCurrency(b.totalPaid - b.totalOwed) : 0,
      totalIOwe: b.totalOwed > b.totalPaid ? roundCurrency(b.totalOwed - b.totalPaid) : 0,
      totalSettled: roundCurrency(b.totalSettled),
      netBalance,
    };
  });

  const groupNetBalance = memberSummaries.reduce((acc, ms) => acc + ms.netBalance, 0);

  return {
    groupId,
    groupName,
    members: memberSummaries,
    totalGroupSpend: roundCurrency(totalGroupSpend),
    netBalance: roundCurrency(groupNetBalance),
  };
}

export const BalanceCalculator = {
  roundCurrency,
  calculateTotalReceivable,
  calculateTotalPayable,
  calculateTotalSettled,
  calculateNetBalance,
  calculateRemainingReceivable,
  determineBalanceStatus,
  getStatusLabel,
  calculatePersonBalance,
  calculatePeopleBalances,
  calculateOverallSummary,
  // Split arithmetic for future support
  calculateEqualSplits,
  calculatePercentageSplits,
  calculateExactSplits,
  calculateSharesSplits,
  calculateGroupBalances,
};

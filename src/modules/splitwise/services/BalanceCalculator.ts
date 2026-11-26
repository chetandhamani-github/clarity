import type {
  Person,
  Debt,
  Settlement,
  ExpenseWithSplits,
  ParticipantShare,
  SplitCalculationResult,
  EqualSplitRequest,
  PercentageSplitRequest,
  ExactSplitRequest,
  SharesSplitRequest,
  GroupBalanceSummary,
  PersonBalanceSummary,
  SimplifiedDebt,
} from '../types/splitwise.types';
import { DebtType, SplitType } from '../types/splitwise.types';

export type BalanceStatus = 'OWED_TO_ME' | 'YOU_OWE' | 'SETTLED';

export interface DetailedPersonBalance {
  personId: string;
  personName?: string;
  totalReceivable: number; // Total money this person owes you (OWE_ME debts)
  totalPayable: number; // Total money you owe this person (I_OWE debts)
  totalSettled: number; // Total settlements recorded for this person
  settledByThem?: number;
  settledByYou?: number;
  grossBalance: number; // totalReceivable - totalPayable (before settlements)
  netBalance: number; // remainingReceivable - remainingPayable
  remainingReceivable: number; // Remaining amount owed to you after settlements
  remainingPayable: number; // Remaining amount you owe after settlements
  status: BalanceStatus;
  statusLabel: string;
}

export interface DetailedOverallSummary {
  totalReceivable: number;
  totalPayable: number;
  remainingReceivable: number;
  remainingPayable: number;
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
 * Calculates remaining receivable after settlements received from the person.
 * Example: OWE_ME ₹5,000 and Settlement (THEY_PAID) ₹1,000 -> Remaining ₹4,000.
 */
export function calculateRemainingReceivable(
  totalReceivable: number,
  settledByThem: number
): number {
  return roundCurrency(Math.max(0, totalReceivable - settledByThem));
}

/**
 * Calculates remaining payable after settlements paid by user to the person.
 * Example: I_OWE ₹500 and Settlement (YOU_PAID) ₹500 -> Remaining ₹0.
 */
export function calculateRemainingPayable(
  totalPayable: number,
  settledByYou: number
): number {
  return roundCurrency(Math.max(0, totalPayable - settledByYou));
}

/**
 * Calculates net balance:
 * (totalReceivable - settledByThem) - (totalPayable - settledByYou)
 * - Positive (> 0): The person owes you money.
 * - Negative (< 0): You owe the person money.
 * - Zero (=== 0): Fully settled.
 */
export function calculateNetBalance(
  totalReceivable: number,
  totalPayable: number,
  settledByThemOrTotalSettled: number,
  settledByYou?: number
): number {
  let byThem = settledByThemOrTotalSettled;
  let byYou = settledByYou ?? 0;

  // If settledByYou is not explicitly provided, infer direction from receivable vs payable
  if (settledByYou === undefined) {
    if (totalPayable > totalReceivable) {
      byYou = settledByThemOrTotalSettled;
      byThem = 0;
    } else {
      byThem = settledByThemOrTotalSettled;
      byYou = 0;
    }
  }

  const remainingReceivable = Math.max(0, totalReceivable - byThem);
  const remainingPayable = Math.max(0, totalPayable - byYou);
  return roundCurrency(remainingReceivable - remainingPayable);
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
export function getStatusLabel(status: BalanceStatus, _netBalance: number): string {
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
 * Optionally includes shared group expenses where the person was involved.
 */
export function calculatePersonBalance(
  personId: string,
  debts: Debt[],
  settlements: Settlement[],
  person?: Person,
  sharedExpenses?: ExpenseWithSplits[]
): DetailedPersonBalance {
  const personDebts = debts.filter((d) => d.personId === personId);
  const personSettlements = settlements.filter((s) => s.personId === personId);

  let expenseReceivable = 0;
  let expensePayable = 0;

  if (sharedExpenses && sharedExpenses.length > 0) {
    for (const exp of sharedExpenses) {
      if (exp.payerId === 'current_user' && exp.splits) {
        const split = exp.splits.find((s) => s.personId === personId);
        if (split) {
          expenseReceivable += split.owedAmount;
        }
      } else if (exp.payerId === personId && exp.splits) {
        const split = exp.splits.find((s) => s.personId === 'current_user');
        if (split) {
          expensePayable += split.owedAmount;
        }
      }
    }
  }

  const totalReceivable = roundCurrency(calculateTotalReceivable(personDebts) + expenseReceivable);
  const totalPayable = roundCurrency(calculateTotalPayable(personDebts) + expensePayable);

  let settledByThem = 0;
  let settledByYou = 0;

  for (const s of personSettlements) {
    const amt = Number(s.amount) || 0;
    if (s.settlementType === 'YOU_PAID') {
      settledByYou += amt;
    } else if (s.settlementType === 'THEY_PAID') {
      settledByThem += amt;
    } else {
      // Inferred for legacy or untyped settlements
      if (totalPayable > totalReceivable) {
        settledByYou += amt;
      } else {
        settledByThem += amt;
      }
    }
  }

  settledByThem = roundCurrency(settledByThem);
  settledByYou = roundCurrency(settledByYou);
  const totalSettled = roundCurrency(settledByThem + settledByYou);

  const grossBalance = roundCurrency(totalReceivable - totalPayable);
  const remainingReceivable = calculateRemainingReceivable(totalReceivable, settledByThem);
  const remainingPayable = calculateRemainingPayable(totalPayable, settledByYou);
  const netBalance = roundCurrency(remainingReceivable - remainingPayable);
  const status = determineBalanceStatus(netBalance);
  const statusLabel = getStatusLabel(status, netBalance);

  return {
    personId,
    personName: person?.name,
    totalReceivable,
    totalPayable,
    totalSettled,
    settledByThem,
    settledByYou,
    grossBalance,
    netBalance,
    remainingReceivable,
    remainingPayable,
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
  settlements: Settlement[],
  sharedExpenses?: ExpenseWithSplits[]
): DetailedPersonBalance[] {
  return people.map((person) =>
    calculatePersonBalance(person.id, debts, settlements, person, sharedExpenses)
  );
}

/**
 * Computes overall portfolio summary across all people.
 */
export function calculateOverallSummary(
  people: Person[],
  debts: Debt[],
  settlements: Settlement[],
  sharedExpenses?: ExpenseWithSplits[]
): DetailedOverallSummary {
  const peopleBalances = calculatePeopleBalances(people, debts, settlements, sharedExpenses);

  let totalReceivable = 0;
  let totalPayable = 0;
  let remainingReceivable = 0;
  let remainingPayable = 0;
  let totalSettled = 0;
  let netBalance = 0;
  let activePeopleCount = 0;
  let settledPeopleCount = 0;

  for (const pb of peopleBalances) {
    totalReceivable += pb.totalReceivable;
    totalPayable += pb.totalPayable;
    remainingReceivable += pb.remainingReceivable;
    remainingPayable += pb.remainingPayable;
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
    remainingReceivable: roundCurrency(remainingReceivable),
    remainingPayable: roundCurrency(remainingPayable),
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
    const amt = Number(set.amount) || 0;
    if (set.settlementType === 'YOU_PAID') {
      if (memberBalances.current_user) {
        memberBalances.current_user.totalSettled -= amt;
      }
      if (memberBalances[set.personId]) {
        memberBalances[set.personId].totalSettled += amt;
      }
    } else {
      if (memberBalances.current_user) {
        memberBalances.current_user.totalSettled += amt;
      }
      if (memberBalances[set.personId]) {
        memberBalances[set.personId].totalSettled -= amt;
      }
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
  const mySummary = memberSummaries.find((m) => m.person.id === 'current_user');
  const myBalance = mySummary ? mySummary.netBalance : 0;

  return {
    groupId,
    groupName,
    members: memberSummaries,
    totalGroupSpend: roundCurrency(totalGroupSpend),
    netBalance: roundCurrency(groupNetBalance),
    myBalance,
  };
}

/**
 * Minimizes inter-member transactions using a greedy debt simplification algorithm.
 * Pairs the largest debtor with the largest creditor until all balances are settled.
 */
export function simplifyDebts(
  memberBalances: { personId: string; personName?: string; netBalance: number }[]
): SimplifiedDebt[] {
  const debtors: { personId: string; personName?: string; amount: number }[] = [];
  const creditors: { personId: string; personName?: string; amount: number }[] = [];

  for (const mb of memberBalances) {
    const net = roundCurrency(mb.netBalance);
    if (net < -0.009) {
      debtors.push({ personId: mb.personId, personName: mb.personName, amount: -net });
    } else if (net > 0.009) {
      creditors.push({ personId: mb.personId, personName: mb.personName, amount: net });
    }
  }

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transactions: SimplifiedDebt[] = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];
    const settleAmount = roundCurrency(Math.min(debtor.amount, creditor.amount));

    if (settleAmount > 0.009) {
      transactions.push({
        fromPersonId: debtor.personId,
        fromPersonName: debtor.personName,
        toPersonId: creditor.personId,
        toPersonName: creditor.personName,
        amount: settleAmount,
      });
    }

    debtor.amount = roundCurrency(debtor.amount - settleAmount);
    creditor.amount = roundCurrency(creditor.amount - settleAmount);

    if (debtor.amount <= 0.009) {
      dIdx++;
    }
    if (creditor.amount <= 0.009) {
      cIdx++;
    }
  }

  return transactions;
}

export const BalanceCalculator = {
  roundCurrency,
  calculateTotalReceivable,
  calculateTotalPayable,
  calculateTotalSettled,
  calculateNetBalance,
  calculateRemainingReceivable,
  calculateRemainingPayable,
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
  simplifyDebts,
};

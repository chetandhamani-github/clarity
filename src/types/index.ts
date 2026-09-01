export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  institution: string;
  lastFour: string;
  createdAt: string;
}

export type AccountType =
  | 'savings'
  | 'current'
  | 'credit'
  | 'loan'
  | 'borrowed'
  | 'investment'
  | 'wallet'
  | 'checking'
  | 'other';

export const ACCOUNT_TYPES: { label: string; value: AccountType }[] = [
  { label: 'Savings Account', value: 'savings' },
  { label: 'Current Account', value: 'current' },
  { label: 'Credit Card', value: 'credit' },
  { label: 'Loan / Debt', value: 'loan' },
  { label: 'Borrowed / Money Owed', value: 'borrowed' },
  { label: 'Investment', value: 'investment' },
  { label: 'Cash / Wallet', value: 'wallet' },
  { label: 'Other', value: 'other' },
];

export interface Transaction {
  id: string;
  accountId: string;
  toAccountId?: string;
  amount: number;
  type: TransactionType;
  merchant: string;
  category: string;
  date: string;
  isRecurring: boolean;
  note: string;
}

export type TransactionType = 'expense' | 'income' | 'transfer';
export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurringTransaction {
  id: string;
  accountId: string;
  toAccountId?: string;
  amount: number;
  type: TransactionType;
  merchant: string;
  category: string;
  frequency: RecurringFrequency;
  nextProcessDate: string;
  lastProcessedDate?: string;
  isActive: boolean;
}

export interface TransactionFilters {
  category?: string;
  search?: string;
  accountId?: string;
  type?: TransactionType;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

export interface TransactionWithAccount extends Transaction {
  accountName: string;
  toAccountName?: string;
}

export interface RecurringTransactionWithAccount extends RecurringTransaction {
  accountName: string;
  toAccountName?: string;
}

export interface Goal {
  id: string;
  name: string;
  icon: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  autoSaveAmount: number;
  category: string;
  createdAt: string;
}

export interface GoalContribution {
  id: string;
  goalId: string;
  amount: number;
  description: string;
  date: string;
}

export interface BudgetPlan {
  id: string;
  monthlyIncome: number;
  needsPercent: number;
  wantsPercent: number;
  savingsPercent: number;
  month: number;
  year: number;
}

export type BucketType = 'needs' | 'wants' | 'savings';

export interface BudgetCategory {
  id: string;
  name: string;
  icon: string;
  limit: number;
  bucketType: BucketType;
  sortOrder: number;
}

export interface CategorySpending {
  category: string;
  icon: string;
  limit: number;
  spent: number;
  bucketType: BucketType;
}

export interface Notification {
  id: string;
  title: string;
  description: string;
  type: 'alert' | 'milestone' | 'default';
  isRead: boolean;
  createdAt: string;
  actionUrl: string;
}

export interface DashboardSummary {
  netWorth: number;
  netWorthChangePct: number;
  income: number;
  expenses: number;
  saved: number;
  recentTransactions: TransactionWithAccount[];
  budgetAllocations: {
    type: BucketType;
    label: string;
    spent: number;
    allocated: number;
    percentage: number;
  }[];
}

export interface MonthlyTotals {
  income: number;
  expenses: number;
}

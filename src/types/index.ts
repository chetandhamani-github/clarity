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
  | 'lent'
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
  { label: 'Lent / Money Given', value: 'lent' },
  { label: 'Investment', value: 'investment' },
  { label: 'Cash / Wallet', value: 'wallet' },
  { label: 'Other', value: 'other' },
];

export interface TransactionSplit {
  category: string;
  amount: number;
  note?: string;
}

export type TransactionSource = 'SMS' | 'MANUAL' | 'ADJUSTMENT';
export type TransactionStatus = 'VERIFIED' | 'PENDING_MATCH';

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
  splits?: TransactionSplit[];
  source?: TransactionSource;
  status?: TransactionStatus;
  smsId?: string;
  parsedTxId?: string;
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
  splits?: { category: string; amount: number }[];
  splits_json?: string;
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

export type BillerCategory =
  | 'credit_card'
  | 'electricity'
  | 'broadband'
  | 'mobile_postpaid'
  | 'gas'
  | 'water'
  | 'loan_emi'
  | 'dth'
  | 'insurance'
  | 'rent'
  | 'staff'
  | 'gym'
  | 'tuition'
  | 'maintenance'
  | 'other';

export const BILLER_CATEGORIES: { label: string; value: BillerCategory; icon: string }[] = [
  { label: 'Credit Card', value: 'credit_card', icon: 'credit-card' },
  { label: 'Electricity', value: 'electricity', icon: 'flash-on' },
  { label: 'Broadband / Wi-Fi', value: 'broadband', icon: 'wifi' },
  { label: 'Mobile Postpaid', value: 'mobile_postpaid', icon: 'smartphone' },
  { label: 'House Rent', value: 'rent', icon: 'home' },
  { label: 'Staff / Maid Salary', value: 'staff', icon: 'people' },
  { label: 'Gym & Fitness', value: 'gym', icon: 'fitness-center' },
  { label: 'School / Tuition', value: 'tuition', icon: 'school' },
  { label: 'Piped Gas / LPG', value: 'gas', icon: 'local-gas-station' },
  { label: 'Water Bill', value: 'water', icon: 'water-drop' },
  { label: 'Loan EMI', value: 'loan_emi', icon: 'account-balance' },
  { label: 'DTH / Cable TV', value: 'dth', icon: 'tv' },
  { label: 'Insurance', value: 'insurance', icon: 'shield' },
  { label: 'Society Maintenance', value: 'maintenance', icon: 'apartment' },
  { label: 'Other Bill', value: 'other', icon: 'receipt' },
];

export type BillStatus = 'UNPAID' | 'PAID' | 'OVERDUE' | 'DISMISSED';
export type BillRepeatFrequency = 'one_time' | 'monthly' | 'quarterly' | 'yearly';

export interface BillReminder {
  id: string;
  source: 'SMS' | 'MANUAL';
  billerName: string;
  billerCategory: BillerCategory;
  amountDue: number;
  minAmountDue?: number;
  dueDate: string; // YYYY-MM-DD
  repeatFrequency: BillRepeatFrequency;
  accountReference?: string;
  status: BillStatus;
  reminderDaysBefore: number;
  paidDate?: string;
  paidTransactionId?: string;
  paymentUrl?: string;
  note?: string;
  smsId?: string;
  createdAt: string;
}

export interface MonthlyBillSummary {
  month: number;
  year: number;
  totalCommitted: number;
  totalPaid: number;
  totalPending: number;
  totalOverdue: number;
  upcomingCount: number;
  paidCount: number;
}

export * from '@/modules/sms/types';
export * from '@/modules/splitwise/types/splitwise.navigation';
export type {
  Bill,
  Subscription,
  CreateBillDTO,
  UpdateBillDTO,
  CreateSubscriptionDTO,
  UpdateSubscriptionDTO,
  BillsSummary,
  SubscriptionCycle,
  SubscriptionStatus,
} from '@/modules/bills/types/bill.types';


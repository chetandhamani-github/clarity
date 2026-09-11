export type BillCategory =
  | 'electricity'
  | 'water'
  | 'mobile'
  | 'internet'
  | 'credit_card'
  | 'emi'
  | 'insurance'
  | 'rent'
  | 'education'
  | 'subscription'
  | 'other';

export type BillStatus = 'upcoming' | 'paid' | 'overdue' | 'dismissed';

export type BillSource = 'manual' | 'sms' | 'email' | 'future_api';

export type BillFrequency = 'one_time' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface Bill {
  id: string;
  title: string;
  provider: string;
  category: BillCategory;
  amount: number;
  minAmount?: number;
  dueDate: string; // YYYY-MM-DD
  reminderDays: number; // 0, 1, 3, 7
  status: BillStatus;
  notes?: string;
  isRecurring: boolean;
  frequency: BillFrequency;
  lastPaidDate?: string;
  paidTransactionId?: string;
  paymentUrl?: string;
  accountReference?: string;
  source: BillSource;
  smsId?: string;
  createdAt: string;
  updatedAt: string;
}

export type SubscriptionCycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled';

export interface Subscription {
  id: string;
  name: string;
  provider: string;
  amount: number;
  billingCycle: SubscriptionCycle;
  nextRenewalDate: string; // YYYY-MM-DD
  category: BillCategory;
  status: SubscriptionStatus;
  paymentUrl?: string;
  accountReference?: string;
  notes?: string;
  billId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBillDTO {
  title: string;
  provider?: string;
  category: BillCategory;
  amount: number;
  minAmount?: number;
  dueDate: string;
  reminderDays?: number;
  notes?: string;
  isRecurring?: boolean;
  frequency?: BillFrequency;
  paymentUrl?: string;
  accountReference?: string;
  source?: BillSource;
  smsId?: string;
  status?: BillStatus;
}

export interface UpdateBillDTO {
  title?: string;
  provider?: string;
  category?: BillCategory;
  amount?: number;
  minAmount?: number;
  dueDate?: string;
  reminderDays?: number;
  status?: BillStatus;
  notes?: string;
  isRecurring?: boolean;
  frequency?: BillFrequency;
  lastPaidDate?: string;
  paidTransactionId?: string;
  paymentUrl?: string;
  accountReference?: string;
  source?: BillSource;
  smsId?: string;
}

export interface CreateSubscriptionDTO {
  name: string;
  provider?: string;
  amount: number;
  billingCycle: SubscriptionCycle;
  nextRenewalDate: string;
  category?: BillCategory;
  status?: SubscriptionStatus;
  paymentUrl?: string;
  accountReference?: string;
  notes?: string;
}

export interface UpdateSubscriptionDTO {
  name?: string;
  provider?: string;
  amount?: number;
  billingCycle?: SubscriptionCycle;
  nextRenewalDate?: string;
  category?: BillCategory;
  status?: SubscriptionStatus;
  paymentUrl?: string;
  accountReference?: string;
  notes?: string;
}

export interface BillsSummary {
  upcomingCount: number;
  upcomingAmount: number;
  overdueCount: number;
  overdueAmount: number;
  paidCount: number;
  paidThisMonthAmount: number;
  monthlySubscriptionSpend: number;
  activeSubscriptionCount: number;
  totalCommittedMonth: number;
}

export interface CategoryOption {
  label: string;
  value: BillCategory;
  icon: string;
  color: string;
  bgColor: string;
}

export const BILL_CATEGORIES: CategoryOption[] = [
  { label: 'Electricity', value: 'electricity', icon: 'flash-on', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.12)' },
  { label: 'Water', value: 'water', icon: 'water-drop', color: '#06b6d4', bgColor: 'rgba(6, 182, 212, 0.12)' },
  { label: 'Mobile Recharge', value: 'mobile', icon: 'smartphone', color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.12)' },
  { label: 'Internet / Wi-Fi', value: 'internet', icon: 'wifi', color: '#8b5cf6', bgColor: 'rgba(139, 92, 246, 0.12)' },
  { label: 'Credit Card', value: 'credit_card', icon: 'credit-card', color: '#ec4899', bgColor: 'rgba(236, 72, 153, 0.12)' },
  { label: 'Loan EMI', value: 'emi', icon: 'account-balance', color: '#6366f1', bgColor: 'rgba(99, 102, 241, 0.12)' },
  { label: 'Insurance', value: 'insurance', icon: 'shield', color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.12)' },
  { label: 'House Rent', value: 'rent', icon: 'home', color: '#f97316', bgColor: 'rgba(249, 115, 22, 0.12)' },
  { label: 'Education / School', value: 'education', icon: 'school', color: '#14b8a6', bgColor: 'rgba(20, 184, 166, 0.12)' },
  { label: 'Subscription / OTT', value: 'subscription', icon: 'subscriptions', color: '#a855f7', bgColor: 'rgba(168, 85, 247, 0.12)' },
  { label: 'Other Utilities', value: 'other', icon: 'receipt', color: '#64748b', bgColor: 'rgba(100, 116, 139, 0.12)' },
];

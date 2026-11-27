export type ReminderCategory =
  | 'general'
  | 'tax'
  | 'insurance'
  | 'trial'
  | 'investment'
  | 'splitwise'
  | 'daily_log'
  | 'bill_custom';

export type ReminderRepeatRule =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly';

export type ReminderStatus = 'pending' | 'snoozed' | 'completed' | 'dismissed';

export type ReminderLinkedType =
  | 'bill'
  | 'account'
  | 'goal'
  | 'subscription'
  | 'splitwise_person';

export interface Reminder {
  id: string;
  title: string;
  notes: string;
  category: ReminderCategory;
  amount?: number;
  remindAtDate: string; // YYYY-MM-DD
  remindAtTime: string; // HH:mm
  repeatRule: ReminderRepeatRule;
  advanceDays: number;
  status: ReminderStatus;
  snoozeUntil?: string;
  linkedType?: ReminderLinkedType;
  linkedId?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReminderDTO {
  title: string;
  notes?: string;
  category?: ReminderCategory;
  amount?: number;
  remindAtDate: string;
  remindAtTime?: string;
  repeatRule?: ReminderRepeatRule;
  advanceDays?: number;
  linkedType?: ReminderLinkedType;
  linkedId?: string;
}

export interface UpdateReminderDTO {
  title?: string;
  notes?: string;
  category?: ReminderCategory;
  amount?: number | null;
  remindAtDate?: string;
  remindAtTime?: string;
  repeatRule?: ReminderRepeatRule;
  advanceDays?: number;
  status?: ReminderStatus;
  snoozeUntil?: string | null;
  linkedType?: ReminderLinkedType | null;
  linkedId?: string | null;
  completedAt?: string | null;
}

export type UnifiedReminderSourceKind =
  | 'custom'
  | 'bill'
  | 'subscription'
  | 'credit_card'
  | 'goal';

export interface UnifiedReminderItem {
  id: string;
  sourceKind: UnifiedReminderSourceKind;
  sourceId: string;
  title: string;
  subtitle: string;
  category: string;
  amount?: number;
  dueDate: string;
  remindTime: string;
  isOverdue: boolean;
  isSnoozed: boolean;
  snoozeUntil?: string;
  repeatRule: ReminderRepeatRule;
  status: 'pending' | 'snoozed' | 'overdue' | 'completed';
  actionUrl: string;
  linkedType?: ReminderLinkedType;
  linkedId?: string;
  notes?: string;
}

export interface ReminderCategoryMeta {
  value: ReminderCategory;
  label: string;
  icon: string;
  color: string;
}

export const REMINDER_CATEGORIES: ReminderCategoryMeta[] = [
  { value: 'bill_custom', label: 'Custom Bill', icon: 'receipt-long', color: '#4f46e5' },
  { value: 'tax', label: 'Tax & Filing', icon: 'account-balance', color: '#dc2626' },
  { value: 'insurance', label: 'Insurance', icon: 'verified-user', color: '#059669' },
  { value: 'investment', label: 'Investment / SIP', icon: 'trending-up', color: '#2563eb' },
  { value: 'trial', label: 'Free Trial', icon: 'hourglass-bottom', color: '#d97706' },
  { value: 'splitwise', label: 'IOU / Follow-up', icon: 'people-outline', color: '#9333ea' },
  { value: 'daily_log', label: 'Daily Habit', icon: 'edit-calendar', color: '#0891b2' },
  { value: 'general', label: 'General', icon: 'notifications-none', color: '#6366f1' },
];

export const REMINDER_REPEAT_OPTIONS: { value: ReminderRepeatRule; label: string }[] = [
  { value: 'none', label: 'One-time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];


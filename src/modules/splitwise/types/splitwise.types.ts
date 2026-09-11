/**
 * ============================================================================
 * Splitwise Module - TypeScript Type Definitions
 * ============================================================================
 * Defines core domain models, DTOs, calculation structures, and forward-looking
 * architecture interfaces for Groups, Shared Expenses, Split Strategies,
 * and Cloud Sync.
 */

// ----------------------------------------------------------------------------
// Enums & Constants
// ----------------------------------------------------------------------------

export const DebtType = {
  OWE_ME: 'OWE_ME',
  I_OWE: 'I_OWE',
} as const;

export type DebtType = (typeof DebtType)[keyof typeof DebtType];

export const SplitType = {
  EQUAL: 'EQUAL',
  EXACT: 'EXACT',
  PERCENTAGE: 'PERCENTAGE',
  SHARES: 'SHARES',
  ADJUSTMENT: 'ADJUSTMENT',
} as const;

export type SplitType = (typeof SplitType)[keyof typeof SplitType];

export const GroupRole = {
  ADMIN: 'admin',
  MEMBER: 'member',
  VIEWER: 'viewer',
} as const;

export type GroupRole = (typeof GroupRole)[keyof typeof GroupRole];

export const SyncStatus = {
  PENDING_SYNC: 'PENDING_SYNC',
  SYNCED: 'SYNCED',
  SYNC_FAILED: 'SYNC_FAILED',
  LOCAL_ONLY: 'LOCAL_ONLY',
} as const;

export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus];

export type SplitwiseActivityType = 'debt' | 'settlement' | 'expense';

// ----------------------------------------------------------------------------
// Core Domain Models: People, Debts, Settlements
// ----------------------------------------------------------------------------

export interface Person {
  id: string;
  name: string;
  phone?: string;
  notes?: string;
  avatarUrl?: string;
  syncStatus?: SyncStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface Debt {
  id: string;
  personId: string;
  amount: number;
  type: DebtType;
  description: string;
  groupId?: string;
  expenseId?: string;
  syncStatus?: SyncStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface Settlement {
  id: string;
  personId: string;
  amount: number;
  description?: string;
  groupId?: string;
  expenseId?: string;
  syncStatus?: SyncStatus;
  createdAt: string;
  updatedAt?: string;
}

// ----------------------------------------------------------------------------
// Future Support Architecture: Groups & Members
// ----------------------------------------------------------------------------

export interface GroupMember {
  id?: string;
  groupId: string;
  personId: string;
  role: GroupRole;
  joinedAt: string;
  syncStatus?: SyncStatus;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  category?: string;
  currency?: string;
  createdBy?: string;
  memberIds: string[];
  members?: GroupMember[];
  isArchived?: boolean;
  syncStatus?: SyncStatus;
  syncVersion?: number;
  createdAt: string;
  updatedAt?: string;
}

// ----------------------------------------------------------------------------
// Future Support Architecture: Shared Expenses & Splits
// ----------------------------------------------------------------------------

export interface ExpenseSplit {
  id?: string;
  expenseId?: string;
  personId: string;
  paidAmount: number;
  owedAmount: number;
  percentage?: number;
  shares?: number;
  isPaid?: boolean;
  createdAt?: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  currency?: string;
  category?: string;
  date: string;
  payerId: string;
  groupId?: string;
  splitType: SplitType;
  splits: ExpenseSplit[];
  notes?: string;
  receiptUrl?: string;
  createdById?: string;
  syncStatus?: SyncStatus;
  syncVersion?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface ExpenseWithSplits extends Expense {
  payer?: Person;
  group?: Group;
  splitsWithPeople?: (ExpenseSplit & { person?: Person })[];
}

// ----------------------------------------------------------------------------
// Split Calculation Types & Results
// ----------------------------------------------------------------------------

export interface ParticipantShare {
  personId: string;
  paidAmount: number;
  owedAmount: number;
  percentage?: number;
  shares?: number;
  netOwed: number; // owedAmount - paidAmount
}

export interface SplitCalculationResult {
  splitType: SplitType;
  totalAmount: number;
  shares: ParticipantShare[];
  isValid: boolean;
  roundingDifference: number; // Remainder adjusted
  errorMessage?: string;
}

export interface EqualSplitRequest {
  totalAmount: number;
  payerId: string;
  participantIds: string[];
}

export interface PercentageSplitRequest {
  totalAmount: number;
  payerId: string;
  splits: { personId: string; percentage: number }[];
}

export interface ExactSplitRequest {
  totalAmount: number;
  payerId: string;
  splits: { personId: string; amount: number }[];
}

export interface SharesSplitRequest {
  totalAmount: number;
  payerId: string;
  splits: { personId: string; shares: number }[];
}

// ----------------------------------------------------------------------------
// Cloud Sync Architecture Interfaces
// ----------------------------------------------------------------------------

export interface SplitwiseSyncMetadata {
  lastSyncedAt?: string;
  syncInProgress: boolean;
  pendingChangesCount: number;
  clientVersion: number;
  deviceId: string;
}

export interface SplitwiseSyncPayload {
  people: Person[];
  debts: Debt[];
  settlements: Settlement[];
  groups: Group[];
  groupMembers: GroupMember[];
  expenses: Expense[];
  expenseSplits: ExpenseSplit[];
  exportedAt: string;
  schemaVersion: number;
  deviceId?: string;
}

export interface SplitwiseSyncResult {
  success: boolean;
  syncedAt: string;
  appliedCount: {
    people: number;
    debts: number;
    settlements: number;
    groups: number;
    expenses: number;
  };
  conflictsCount: number;
  error?: string;
}

export interface ISplitwiseCloudSyncService {
  getSyncMetadata(): Promise<SplitwiseSyncMetadata>;
  exportPayload(): Promise<SplitwiseSyncPayload>;
  importPayload(payload: SplitwiseSyncPayload): Promise<SplitwiseSyncResult>;
  syncWithCloud(): Promise<SplitwiseSyncResult>;
}

// ----------------------------------------------------------------------------
// Data Transfer Objects (DTOs)
// ----------------------------------------------------------------------------

export interface CreatePerson {
  name: string;
  phone?: string;
  notes?: string;
  avatarUrl?: string;
}

export interface UpdatePerson {
  name?: string;
  phone?: string;
  notes?: string;
  avatarUrl?: string;
}

export interface CreateDebt {
  personId: string;
  amount: number;
  type: DebtType;
  description: string;
  groupId?: string;
  expenseId?: string;
  createdAt?: string;
}

export interface UpdateDebt {
  personId?: string;
  amount?: number;
  type?: DebtType;
  description?: string;
  groupId?: string;
  expenseId?: string;
  createdAt?: string;
}

export interface CreateSettlement {
  personId: string;
  amount: number;
  description?: string;
  groupId?: string;
  expenseId?: string;
  createdAt?: string;
}

export interface UpdateSettlement {
  personId?: string;
  amount?: number;
  description?: string;
  groupId?: string;
  expenseId?: string;
  createdAt?: string;
}

export interface CreateGroup {
  name: string;
  description?: string;
  icon?: string;
  category?: string;
  currency?: string;
  memberIds: string[];
}

export interface UpdateGroup {
  name?: string;
  description?: string;
  icon?: string;
  category?: string;
  currency?: string;
  memberIds?: string[];
  isArchived?: boolean;
}

export interface AddGroupMemberDTO {
  groupId: string;
  personId: string;
  role?: GroupRole;
}

export interface CreateExpense {
  description: string;
  amount: number;
  date: string;
  payerId: string;
  groupId?: string;
  splitType: SplitType;
  splits: ExpenseSplit[];
  category?: string;
  notes?: string;
  receiptUrl?: string;
}

export interface UpdateExpense {
  description?: string;
  amount?: number;
  date?: string;
  payerId?: string;
  groupId?: string;
  splitType?: SplitType;
  splits?: ExpenseSplit[];
  category?: string;
  notes?: string;
  receiptUrl?: string;
}

// ----------------------------------------------------------------------------
// DTO & Interface Aliases (for backward/repository compatibility)
// ----------------------------------------------------------------------------

export type SplitwisePerson = Person;
export type SplitwiseDebt = Debt;
export type SplitwiseSettlement = Settlement;
export type SplitwiseGroup = Group;
export type SplitwiseExpense = Expense;

export type CreatePersonDTO = CreatePerson;
export type UpdatePersonDTO = UpdatePerson;
export type CreateDebtDTO = CreateDebt;
export type UpdateDebtDTO = UpdateDebt;
export type CreateSettlementDTO = CreateSettlement;
export type UpdateSettlementDTO = UpdateSettlement;
export type CreateGroupDTO = CreateGroup;
export type UpdateGroupDTO = UpdateGroup;
export type CreateExpenseDTO = CreateExpense;
export type UpdateExpenseDTO = UpdateExpense;

// ----------------------------------------------------------------------------
// Balance & Activity Summaries
// ----------------------------------------------------------------------------

export interface PersonBalanceSummary {
  person: Person;
  totalOwedToMe: number;
  totalIOwe: number;
  totalSettled: number;
  netBalance: number;
}

export interface GroupBalanceSummary {
  groupId: string;
  groupName: string;
  members: PersonBalanceSummary[];
  totalGroupSpend: number;
  netBalance: number;
  myBalance?: number;
}

export interface SplitwiseOverallSummary {
  totalOwedToMe: number;
  totalIOwe: number;
  totalSettled: number;
  netBalance: number;
  peopleCount: number;
  groupCount?: number;
}

export interface SplitwiseActivityItem {
  id: string;
  activityType: SplitwiseActivityType;
  personId: string;
  personName?: string;
  amount: number;
  debtType?: DebtType;
  description: string;
  groupId?: string;
  groupName?: string;
  createdAt: string;
}

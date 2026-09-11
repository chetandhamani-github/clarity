/**
 * ============================================================================
 * Splitwise Module - Repository Interface Contract
 * ============================================================================
 * Defines the contract for local SQLite data access and future cloud-synced storage.
 */

import type {
  Person,
  Debt,
  Settlement,
  Group,
  GroupMember,
  Expense,
  ExpenseSplit,
  CreatePersonDTO,
  UpdatePersonDTO,
  CreateDebtDTO,
  UpdateDebtDTO,
  CreateSettlementDTO,
  UpdateSettlementDTO,
  CreateGroupDTO,
  UpdateGroupDTO,
  CreateExpenseDTO,
  UpdateExpenseDTO,
  PersonBalanceSummary,
  SplitwiseOverallSummary,
  SplitwiseActivityItem,
  DebtType,
  SplitwiseSyncPayload,
} from './splitwise.types';

export interface ISplitwiseRepository {
  // Schema
  ensureSchema(): Promise<void>;

  // People
  createPerson(dto: CreatePersonDTO): Promise<Person>;
  getPersonById(id: string): Promise<Person | null>;
  getAllPeople(): Promise<Person[]>;
  searchPeople(query: string): Promise<Person[]>;
  updatePerson(id: string, updates: UpdatePersonDTO): Promise<Person>;
  deletePerson(id: string): Promise<void>;

  // Debts
  createDebt(dto: CreateDebtDTO): Promise<Debt>;
  getDebtById(id: string): Promise<Debt | null>;
  getDebtsByPersonId(personId: string): Promise<Debt[]>;
  getAllDebts(type?: DebtType): Promise<Debt[]>;
  updateDebt(id: string, updates: UpdateDebtDTO): Promise<Debt>;
  deleteDebt(id: string): Promise<void>;

  // Settlements
  createSettlement(dto: CreateSettlementDTO): Promise<Settlement>;
  getSettlementById(id: string): Promise<Settlement | null>;
  getSettlementsByPersonId(personId: string): Promise<Settlement[]>;
  getAllSettlements(): Promise<Settlement[]>;
  updateSettlement(id: string, updates: UpdateSettlementDTO): Promise<Settlement>;
  deleteSettlement(id: string): Promise<void>;

  // Balances & Summaries
  getAllPeopleWithBalances(): Promise<PersonBalanceSummary[]>;
  getPersonBalanceSummary(personId: string): Promise<PersonBalanceSummary | null>;
  getOverallSummary(): Promise<SplitwiseOverallSummary>;
  getAllActivityHistory(limit?: number): Promise<SplitwiseActivityItem[]>;
  getPersonActivityHistory(personId: string): Promise<SplitwiseActivityItem[]>;

  // --------------------------------------------------------------------------
  // Future Architecture Contracts: Groups & Members
  // --------------------------------------------------------------------------
  createGroup?(dto: CreateGroupDTO): Promise<Group>;
  getGroupById?(id: string): Promise<Group | null>;
  getAllGroups?(): Promise<Group[]>;
  updateGroup?(id: string, updates: UpdateGroupDTO): Promise<Group>;
  deleteGroup?(id: string): Promise<void>;
  addGroupMember?(groupId: string, personId: string, role?: string): Promise<GroupMember>;
  removeGroupMember?(groupId: string, personId: string): Promise<void>;
  getGroupMembers?(groupId: string): Promise<Person[]>;

  // --------------------------------------------------------------------------
  // Future Architecture Contracts: Shared Expenses & Splits
  // --------------------------------------------------------------------------
  createExpense?(dto: CreateExpenseDTO): Promise<Expense>;
  getExpenseById?(id: string): Promise<Expense | null>;
  getExpensesByGroupId?(groupId: string): Promise<Expense[]>;
  getExpenseSplits?(expenseId: string): Promise<ExpenseSplit[]>;
  deleteExpense?(id: string): Promise<void>;

  // --------------------------------------------------------------------------
  // Future Architecture Contracts: Cloud Sync & Export / Import
  // --------------------------------------------------------------------------
  exportSyncData?(): Promise<SplitwiseSyncPayload>;
  importSyncData?(payload: SplitwiseSyncPayload): Promise<void>;
}

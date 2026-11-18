import { create } from 'zustand';
import { SplitwiseRepository } from '../database/splitwise.repository';
import type {
  Person,
  Debt,
  Settlement,
  CreatePerson,
  UpdatePerson,
  CreateDebt,
  UpdateDebt,
  CreateSettlement,
  PersonBalanceSummary,
  SplitwiseOverallSummary,
  DebtType,
  Group,
  Expense,
  ExpenseWithSplits,
  CreateGroupDTO,
  UpdateGroupDTO,
  CreateExpenseDTO,
  UpdateExpenseDTO,
  GroupBalanceSummary,
} from '../types/splitwise.types';

export type SplitwiseFilter = 'ALL' | 'OWE_ME' | 'I_OWE';

export interface SplitwiseState {
  people: Person[];
  peopleWithBalances: PersonBalanceSummary[];
  debts: Debt[];
  settlements: Settlement[];
  groups: Group[];
  expenses: ExpenseWithSplits[];
  activeGroupId: string | null;
  activeGroupExpenses: ExpenseWithSplits[];
  activeGroupBalances: GroupBalanceSummary | null;
  activeGroupMembers: Person[];
  overallSummary: SplitwiseOverallSummary;
  selectedPersonId: string | null;
  selectedFilter: SplitwiseFilter;
  searchQuery: string;
  isLoading: boolean;
  error: string | null;

  // Actions - Data Loading
  loadPeople: () => Promise<void>;
  loadDebts: (personId?: string, type?: DebtType) => Promise<void>;
  loadSettlements: (personId?: string) => Promise<void>;
  loadGroups: () => Promise<void>;
  loadGroupDetails: (groupId: string) => Promise<void>;
  loadAllData: () => Promise<void>;

  // Actions - People
  addPerson: (dto: CreatePerson) => Promise<Person>;
  updatePerson: (id: string, updates: UpdatePerson) => Promise<Person>;
  deletePerson: (id: string) => Promise<void>;

  // Actions - Debts
  addDebt: (dto: CreateDebt) => Promise<Debt>;
  updateDebt: (id: string, updates: UpdateDebt) => Promise<Debt>;
  deleteDebt: (id: string) => Promise<void>;

  // Actions - Settlements
  addSettlement: (dto: CreateSettlement) => Promise<Settlement>;
  deleteSettlement: (id: string) => Promise<void>;

  // Actions - Groups
  createGroup: (dto: CreateGroupDTO) => Promise<Group>;
  updateGroup: (id: string, updates: UpdateGroupDTO) => Promise<Group>;
  deleteGroup: (id: string) => Promise<void>;
  addGroupMembers: (groupId: string, personIds: string[]) => Promise<void>;
  removeGroupMember: (groupId: string, personId: string) => Promise<void>;

  // Actions - Shared Expenses
  createExpense: (dto: CreateExpenseDTO) => Promise<ExpenseWithSplits>;
  deleteExpense: (id: string) => Promise<void>;

  // Actions - UI State
  setActiveGroupId: (id: string | null) => void;
  setSelectedPersonId: (id: string | null) => void;
  setSelectedFilter: (filter: SplitwiseFilter) => void;
  setSearchQuery: (query: string) => void;
  clearError: () => void;
}

const defaultSummary: SplitwiseOverallSummary = {
  totalOwedToMe: 0,
  totalIOwe: 0,
  totalSettled: 0,
  netBalance: 0,
  peopleCount: 0,
};

export const useSplitwiseStore = create<SplitwiseState>()((set, get) => ({
  people: [],
  peopleWithBalances: [],
  debts: [],
  settlements: [],
  groups: [],
  expenses: [],
  activeGroupId: null,
  activeGroupExpenses: [],
  activeGroupBalances: null,
  activeGroupMembers: [],
  overallSummary: defaultSummary,
  selectedPersonId: null,
  selectedFilter: 'ALL',
  searchQuery: '',
  isLoading: false,
  error: null,

  loadPeople: async () => {
    set({ isLoading: true, error: null });
    try {
      const [people, peopleWithBalances, overallSummary] = await Promise.all([
        SplitwiseRepository.getAllPeople(),
        SplitwiseRepository.getAllPeopleWithBalances(),
        SplitwiseRepository.getOverallSummary(),
      ]);

      set({
        people,
        peopleWithBalances,
        overallSummary,
        isLoading: false,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load people';
      set({ error: message, isLoading: false });
    }
  },

  loadDebts: async (personId?: string, type?: DebtType) => {
    set({ isLoading: true, error: null });
    try {
      let debts: Debt[];
      if (personId) {
        debts = await SplitwiseRepository.getDebtsByPersonId(personId);
      } else {
        debts = await SplitwiseRepository.getAllDebts(type);
      }
      set({ debts, isLoading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load debts';
      set({ error: message, isLoading: false });
    }
  },

  loadSettlements: async (personId?: string) => {
    set({ isLoading: true, error: null });
    try {
      let settlements: Settlement[];
      if (personId) {
        settlements = await SplitwiseRepository.getSettlementsByPersonId(personId);
      } else {
        settlements = await SplitwiseRepository.getAllSettlements();
      }
      set({ settlements, isLoading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load settlements';
      set({ error: message, isLoading: false });
    }
  },

  loadGroups: async () => {
    set({ isLoading: true, error: null });
    try {
      const groups = await SplitwiseRepository.getAllGroups();
      set({ groups, isLoading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load groups';
      set({ error: message, isLoading: false });
    }
  },

  loadGroupDetails: async (groupId: string) => {
    set({ isLoading: true, error: null });
    try {
      const [members, expenses, balances] = await Promise.all([
        SplitwiseRepository.getGroupMembers(groupId),
        SplitwiseRepository.getExpensesByGroupId(groupId),
        SplitwiseRepository.getGroupBalanceSummary(groupId),
      ]);
      set({
        activeGroupId: groupId,
        activeGroupMembers: members,
        activeGroupExpenses: expenses,
        activeGroupBalances: balances,
        isLoading: false,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load group details';
      set({ error: message, isLoading: false });
    }
  },

  loadAllData: async () => {
    set({ isLoading: true, error: null });
    try {
      await SplitwiseRepository.ensureSchema();

      const [people, peopleWithBalances, debts, settlements, groups, expenses, overallSummary] =
        await Promise.all([
          SplitwiseRepository.getAllPeople(),
          SplitwiseRepository.getAllPeopleWithBalances(),
          SplitwiseRepository.getAllDebts(),
          SplitwiseRepository.getAllSettlements(),
          SplitwiseRepository.getAllGroups(),
          SplitwiseRepository.getAllExpenses(),
          SplitwiseRepository.getOverallSummary(),
        ]);

      set({
        people,
        peopleWithBalances,
        debts,
        settlements,
        groups,
        expenses,
        overallSummary,
        isLoading: false,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to load Splitwise data';
      set({ error: message, isLoading: false });
    }
  },

  addPerson: async (dto: CreatePerson) => {
    set({ isLoading: true, error: null });
    try {
      const created = await SplitwiseRepository.createPerson(dto);
      await get().loadPeople();
      return created;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to add person';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  updatePerson: async (id: string, updates: UpdatePerson) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await SplitwiseRepository.updatePerson(id, updates);
      await get().loadPeople();
      return updated;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update person';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  deletePerson: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await SplitwiseRepository.deletePerson(id);
      if (get().selectedPersonId === id) {
        set({ selectedPersonId: null });
      }
      await get().loadAllData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete person';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  addDebt: async (dto: CreateDebt) => {
    set({ isLoading: true, error: null });
    try {
      const created = await SplitwiseRepository.createDebt(dto);
      await Promise.all([
        get().loadDebts(),
        get().loadPeople(),
      ]);
      return created;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to add debt';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  updateDebt: async (id: string, updates: UpdateDebt) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await SplitwiseRepository.updateDebt(id, updates);
      await Promise.all([
        get().loadDebts(),
        get().loadPeople(),
      ]);
      return updated;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update debt';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  deleteDebt: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await SplitwiseRepository.deleteDebt(id);
      await Promise.all([
        get().loadDebts(),
        get().loadPeople(),
      ]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete debt';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  addSettlement: async (dto: CreateSettlement) => {
    set({ isLoading: true, error: null });
    try {
      const created = await SplitwiseRepository.createSettlement(dto);
      const reloadPromises: Promise<any>[] = [
        get().loadSettlements(),
        get().loadPeople(),
        get().loadAllData(),
      ];
      if (dto.groupId) {
        reloadPromises.push(get().loadGroupDetails(dto.groupId));
      }
      await Promise.all(reloadPromises);
      return created;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to add settlement';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  deleteSettlement: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await SplitwiseRepository.deleteSettlement(id);
      await Promise.all([
        get().loadSettlements(),
        get().loadPeople(),
      ]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete settlement';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  createGroup: async (dto: CreateGroupDTO) => {
    set({ isLoading: true, error: null });
    try {
      const created = await SplitwiseRepository.createGroup(dto);
      await get().loadGroups();
      return created;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create group';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  updateGroup: async (id: string, updates: UpdateGroupDTO) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await SplitwiseRepository.updateGroup(id, updates);
      await get().loadGroups();
      if (get().activeGroupId === id) {
        await get().loadGroupDetails(id);
      }
      return updated;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update group';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  deleteGroup: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await SplitwiseRepository.deleteGroup(id);
      if (get().activeGroupId === id) {
        set({
          activeGroupId: null,
          activeGroupExpenses: [],
          activeGroupBalances: null,
          activeGroupMembers: [],
        });
      }
      await get().loadGroups();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete group';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  addGroupMembers: async (groupId: string, personIds: string[]) => {
    set({ isLoading: true, error: null });
    try {
      await SplitwiseRepository.addGroupMembers(groupId, personIds);
      await Promise.all([
        get().loadGroups(),
        get().loadGroupDetails(groupId),
      ]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to add group members';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  removeGroupMember: async (groupId: string, personId: string) => {
    set({ isLoading: true, error: null });
    try {
      await SplitwiseRepository.removeGroupMember(groupId, personId);
      await Promise.all([
        get().loadGroups(),
        get().loadGroupDetails(groupId),
      ]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to remove group member';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  createExpense: async (dto: CreateExpenseDTO) => {
    set({ isLoading: true, error: null });
    try {
      const created = await SplitwiseRepository.createExpense(dto);
      if (dto.groupId) {
        await get().loadGroupDetails(dto.groupId);
      }
      await get().loadAllData();
      return created;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create expense';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  deleteExpense: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await SplitwiseRepository.deleteExpense(id);
      if (get().activeGroupId) {
        await get().loadGroupDetails(get().activeGroupId!);
      }
      await get().loadAllData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete expense';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  setActiveGroupId: (activeGroupId: string | null) => set({ activeGroupId }),
  setSelectedPersonId: (selectedPersonId: string | null) => set({ selectedPersonId }),
  setSelectedFilter: (selectedFilter: SplitwiseFilter) => set({ selectedFilter }),
  setSearchQuery: (searchQuery: string) => set({ searchQuery }),
  clearError: () => set({ error: null }),
}));

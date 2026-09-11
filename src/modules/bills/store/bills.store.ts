import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvZustandStorage } from '@/lib/storage';
import { BillsRepository } from '../database/bills.repository';
import { BillService } from '../services/BillService';
import type {
  Bill,
  Subscription,
  BillsSummary,
  CreateBillDTO,
  UpdateBillDTO,
  CreateSubscriptionDTO,
  UpdateSubscriptionDTO,
} from '../types/bill.types';

export type BillsTab = 'upcoming' | 'paid' | 'overdue' | 'subscriptions';

interface BillsState {
  bills: Bill[];
  subscriptions: Subscription[];
  summary: BillsSummary;
  selectedTab: BillsTab;
  selectedCategory: string;
  searchQuery: string;
  isLoading: boolean;

  // Actions
  loadData: () => Promise<void>;
  createBill: (dto: CreateBillDTO) => Promise<Bill>;
  updateBill: (id: string, updates: UpdateBillDTO) => Promise<void>;
  deleteBill: (id: string) => Promise<void>;
  markBillPaid: (id: string, paidDate?: string, paidTxId?: string) => Promise<void>;
  createSubscription: (dto: CreateSubscriptionDTO) => Promise<Subscription>;
  updateSubscription: (id: string, updates: UpdateSubscriptionDTO) => Promise<void>;
  deleteSubscription: (id: string) => Promise<void>;
  setSelectedTab: (tab: BillsTab) => void;
  setSelectedCategory: (category: string) => void;
  setSearchQuery: (query: string) => void;
}

const defaultSummary: BillsSummary = {
  upcomingCount: 0,
  upcomingAmount: 0,
  overdueCount: 0,
  overdueAmount: 0,
  paidCount: 0,
  paidThisMonthAmount: 0,
  monthlySubscriptionSpend: 0,
  activeSubscriptionCount: 0,
  totalCommittedMonth: 0,
};

export const useBillsStore = create<BillsState>()(
  persist(
    (set, get) => ({
      bills: [],
      subscriptions: [],
      summary: defaultSummary,
      selectedTab: 'upcoming',
      selectedCategory: 'all',
      searchQuery: '',
      isLoading: false,

      loadData: async () => {
        if (get().bills.length === 0 && get().subscriptions.length === 0) {
          set({ isLoading: true });
        }
        try {
          await BillsRepository.ensureSchema();
          await BillsRepository.seedSampleDataIfEmpty();

          const [bills, subscriptions, summary] = await Promise.all([
            BillsRepository.getAllBills(),
            BillsRepository.getAllSubscriptions(),
            BillsRepository.getSummary(),
          ]);

          set({
            bills,
            subscriptions,
            summary,
            isLoading: false,
          });
        } catch (error) {
          console.warn('[useBillsStore] Failed to load bills:', error);
          set({ isLoading: false });
        }
      },

      createBill: async (dto: CreateBillDTO) => {
        const created = await BillService.createBill(dto);
        await get().loadData();
        return created;
      },

      updateBill: async (id: string, updates: UpdateBillDTO) => {
        await BillService.updateBill(id, updates);
        await get().loadData();
      },

      deleteBill: async (id: string) => {
        await BillService.deleteBill(id);
        await get().loadData();
      },

      markBillPaid: async (id: string, paidDate?: string, paidTxId?: string) => {
        await BillService.markBillPaid(id, paidDate, paidTxId);
        await get().loadData();
      },

      createSubscription: async (dto: CreateSubscriptionDTO) => {
        const created = await BillService.createSubscription(dto);
        await get().loadData();
        return created;
      },

      updateSubscription: async (id: string, updates: UpdateSubscriptionDTO) => {
        await BillService.updateSubscription(id, updates);
        await get().loadData();
      },

      deleteSubscription: async (id: string) => {
        await BillService.deleteSubscription(id);
        await get().loadData();
      },

      setSelectedTab: (selectedTab: BillsTab) => set({ selectedTab }),
      setSelectedCategory: (selectedCategory: string) => set({ selectedCategory }),
      setSearchQuery: (searchQuery: string) => set({ searchQuery }),
    }),
    {
      name: 'clarity-bills-store',
      storage: createJSONStorage(() => mmkvZustandStorage),
      partialize: (state) => ({
        bills: state.bills,
        subscriptions: state.subscriptions,
        summary: state.summary,
        selectedTab: state.selectedTab,
        selectedCategory: state.selectedCategory,
      }),
    }
  )
);

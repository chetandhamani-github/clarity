import { NotificationLedgerService } from '@/modules/notifications/services/notificationLedgerService';
import { SmsAnalyticsService } from '@/modules/sms/services/smsAnalyticsService';
import { SmsDao } from '@/modules/sms/storage/smsDao';
import type { ParsedTransaction, SmsAnalytics } from '@/modules/sms/types';
import { create } from 'zustand';

interface SmsStoreState {
  analytics: SmsAnalytics | null;
  reviewQueueCount: number;
  pendingTransactions: ParsedTransaction[];
  isPromptVisible: boolean;

  // Actions
  refreshAnalytics: () => Promise<void>;
  refreshReviewQueueCount: () => Promise<void>;
  setPendingTransactions: (txs: ParsedTransaction[]) => void;
  openTransactionPrompt: () => void;
  closeTransactionPrompt: () => void;
  importPendingTransactions: (
    selectedIds?: string[],
    accountOverrides?: Record<string, string>
  ) => Promise<number>;
  dismissPendingTransactions: (idsToDismiss?: string[]) => Promise<void>;
}

export const useSmsStore = create<SmsStoreState>((set, get) => ({
  analytics: null,
  reviewQueueCount: 0,
  pendingTransactions: [],
  isPromptVisible: false,

  refreshAnalytics: async () => {
    try {
      const analytics = await SmsAnalyticsService.getAnalytics();
      set({ analytics });
    } catch {
      // Failed to refresh analytics
    }
  },

  refreshReviewQueueCount: async () => {
    try {
      const stats = await SmsDao.getSmsStats();
      set({ reviewQueueCount: stats.totalReview });
    } catch {
      // Failed to refresh review queue count
    }
  },

  setPendingTransactions: (txs: ParsedTransaction[]) => {
    set((state) => ({
      pendingTransactions: txs,
      isPromptVisible: txs.length === 0 ? false : state.isPromptVisible,
    }));
  },

  openTransactionPrompt: () => {
    if (get().pendingTransactions.length > 0) {
      set({ isPromptVisible: true });
    }
  },

  closeTransactionPrompt: () => {
    set({ isPromptVisible: false });
  },

  importPendingTransactions: async (
    selectedIds?: string[],
    accountOverrides?: Record<string, string>
  ) => {
    const { pendingTransactions } = get();
    if (pendingTransactions.length === 0) return 0;

    const toImport = selectedIds
      ? pendingTransactions.filter((tx) => selectedIds.includes(tx.id))
      : pendingTransactions;
    const toDeny = selectedIds
      ? pendingTransactions.filter((tx) => !selectedIds.includes(tx.id))
      : [];

    if (toDeny.length > 0) {
      await SmsDao.markParsedTransactionsDenied(toDeny.map((tx) => tx.id));
    }

    if (toImport.length > 0) {
      await NotificationLedgerService.importParsedTransactions(toImport, { accountOverrides });
    }

    let remainingUnlinked: ParsedTransaction[] = [];
    let importedCount = toImport.length;
    if (typeof SmsDao.getUnlinkedParsedTransactions === 'function') {
      try {
        remainingUnlinked = await SmsDao.getUnlinkedParsedTransactions();
        const unlinkedIdSet = new Set(remainingUnlinked.map((tx) => tx.id));
        importedCount = toImport.filter((tx) => !unlinkedIdSet.has(tx.id)).length;
      } catch {
        remainingUnlinked = [];
      }
    }

    set((state) => ({
      pendingTransactions: remainingUnlinked,
      isPromptVisible:
        remainingUnlinked.length === 0 || importedCount > 0 ? false : state.isPromptVisible,
    }));

    await get().refreshAnalytics();
    await get().refreshReviewQueueCount();

    return importedCount;
  },

  dismissPendingTransactions: async (idsToDismiss?: string[]) => {
    const { pendingTransactions } = get();
    const ids = idsToDismiss ?? pendingTransactions.map((tx) => tx.id);
    if (ids.length > 0) {
      await SmsDao.markParsedTransactionsDenied(ids);
    }
    set({
      pendingTransactions: [],
      isPromptVisible: false,
    });
    await get().refreshAnalytics();
  },
}));

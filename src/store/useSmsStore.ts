import { create } from 'zustand';
import type { SmsAnalytics, ParsedTransaction } from '@/modules/sms/types';
import { SmsSyncService } from '@/modules/sms/services/smsSyncService';
import { SmsAnalyticsService } from '@/modules/sms/services/smsAnalyticsService';
import { SmsDao } from '@/modules/sms/storage/smsDao';

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
  importPendingTransactions: (selectedIds?: string[]) => Promise<number>;
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
    set({
      pendingTransactions: txs,
      isPromptVisible: false,
    });
  },

  openTransactionPrompt: () => {
    if (get().pendingTransactions.length > 0) {
      set({ isPromptVisible: true });
    }
  },

  closeTransactionPrompt: () => {
    set({ isPromptVisible: false });
  },

  importPendingTransactions: async (selectedIds?: string[]) => {
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
      await SmsSyncService.importParsedTransactions(toImport);
    }

    set({
      pendingTransactions: [],
      isPromptVisible: false,
    });

    await get().refreshAnalytics();
    await get().refreshReviewQueueCount();

    return toImport.length;
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

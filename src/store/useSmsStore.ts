import { create } from 'zustand';
import type {
  SmsPermissionStatus,
  SmsSyncProgress,
  SmsAnalytics,
  ParsedTransaction,
} from '@/modules/sms/types';
import { SmsPermissionManager } from '@/modules/sms/permissions/smsPermissionManager';
import { SmsSyncService, SyncOptions } from '@/modules/sms/services/smsSyncService';
import { SmsAnalyticsService } from '@/modules/sms/services/smsAnalyticsService';
import { SmsDao } from '@/modules/sms/storage/smsDao';

interface SmsStoreState {
  permissionStatus: SmsPermissionStatus;
  isSyncing: boolean;
  progress: SmsSyncProgress;
  lastSyncTimestamp: number | null;
  analytics: SmsAnalytics | null;
  reviewQueueCount: number;
  error: string | null;
  pendingTransactions: ParsedTransaction[];
  isPromptVisible: boolean;

  // Actions
  checkPermission: () => Promise<SmsPermissionStatus>;
  requestPermission: () => Promise<SmsPermissionStatus>;
  startInitialSync: (options?: SyncOptions) => Promise<void>;
  startIncrementalSync: (options?: SyncOptions) => Promise<void>;
  cancelSync: () => void;
  refreshAnalytics: () => Promise<void>;
  refreshReviewQueueCount: () => Promise<void>;
  setPendingTransactions: (txs: ParsedTransaction[]) => void;
  openTransactionPrompt: () => void;
  closeTransactionPrompt: () => void;
  importPendingTransactions: (selectedIds?: string[]) => Promise<number>;
  dismissPendingTransactions: (idsToDismiss?: string[]) => Promise<void>;
}

export const useSmsStore = create<SmsStoreState>((set, get) => ({
  permissionStatus: 'denied',
  isSyncing: false,
  progress: {
    total: 0,
    processed: 0,
    batchIndex: 0,
    totalBatches: 0,
    phase: 'idle',
  },
  lastSyncTimestamp: SmsSyncService.getLastSyncTimestamp(),
  analytics: null,
  reviewQueueCount: 0,
  error: null,
  pendingTransactions: [],
  isPromptVisible: false,

  checkPermission: async () => {
    const status = await SmsPermissionManager.checkSmsPermission();
    set({ permissionStatus: status });
    return status;
  },

  requestPermission: async () => {
    const status = await SmsPermissionManager.requestSmsPermission();
    set({ permissionStatus: status });
    return status;
  },

  startInitialSync: async (options?: SyncOptions) => {
    if (get().isSyncing) return;

    set({
      isSyncing: true,
      error: null,
      progress: {
        total: 0,
        processed: 0,
        batchIndex: 0,
        totalBatches: 0,
        phase: 'fetching',
      },
    });

    try {
      const result = await SmsSyncService.runInitialScan({
        ...options,
        onProgress: (progress) => {
          set({ progress });
          options?.onProgress?.(progress);
        },
      });

      const lastSync = SmsSyncService.getLastSyncTimestamp();
      set({
        isSyncing: false,
        lastSyncTimestamp: lastSync,
      });

      if (
        options?.autoCreateClarityTransactions === false &&
        result.newTransactions &&
        result.newTransactions.length > 0
      ) {
        get().setPendingTransactions(result.newTransactions);
      }

      await get().refreshAnalytics();
      await get().refreshReviewQueueCount();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Sync failed';
      set({
        isSyncing: false,
        error: errorMsg,
        progress: {
          ...get().progress,
          phase: 'error',
          error: errorMsg,
        },
      });
      throw err;
    }
  },

  startIncrementalSync: async (options?: SyncOptions) => {
    if (get().isSyncing) return;

    set({ isSyncing: true, error: null });

    try {
      const result = await SmsSyncService.runIncrementalScan({
        ...options,
        onProgress: (progress) => {
          set({ progress });
          options?.onProgress?.(progress);
        },
      });

      const lastSync = SmsSyncService.getLastSyncTimestamp();
      set({
        isSyncing: false,
        lastSyncTimestamp: lastSync,
      });

      if (
        options?.autoCreateClarityTransactions === false &&
        result.newTransactions &&
        result.newTransactions.length > 0
      ) {
        get().setPendingTransactions(result.newTransactions);
      }

      await get().refreshAnalytics();
      await get().refreshReviewQueueCount();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Incremental sync failed';
      set({
        isSyncing: false,
        error: errorMsg,
      });
      throw err;
    }
  },

  cancelSync: () => {
    SmsSyncService.cancelSync();
    set({ isSyncing: false });
  },

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

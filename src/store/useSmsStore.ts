import { create } from 'zustand';
import type {
  SmsPermissionStatus,
  SmsSyncProgress,
  SmsAnalytics,
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

  // Actions
  checkPermission: () => Promise<SmsPermissionStatus>;
  requestPermission: () => Promise<SmsPermissionStatus>;
  startInitialSync: (options?: SyncOptions) => Promise<void>;
  startIncrementalSync: (options?: SyncOptions) => Promise<void>;
  cancelSync: () => void;
  refreshAnalytics: () => Promise<void>;
  refreshReviewQueueCount: () => Promise<void>;
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
      await SmsSyncService.runInitialScan({
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
      await SmsSyncService.runIncrementalScan({
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
    } catch (err) {
      console.warn('[useSmsStore] Failed to refresh analytics:', err);
    }
  },

  refreshReviewQueueCount: async () => {
    try {
      const stats = await SmsDao.getSmsStats();
      set({ reviewQueueCount: stats.totalReview });
    } catch (err) {
      console.warn('[useSmsStore] Failed to refresh review queue count:', err);
    }
  },
}));

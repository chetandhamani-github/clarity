import type { QueryClient } from '@tanstack/react-query';
import { clearDatabase } from '@/services/database';
import { clearAutoBackupTimer } from '@/services/cloud/google-drive-service';
import { mmkv } from '@/lib/storage';
import { useAppStore } from '@/store/use-app-store';
import { useBillsStore } from '@/modules/bills/store/bills.store';
import { useSplitwiseStore } from '@/modules/splitwise/store/splitwise.store';
import { useSmsStore } from '@/store/useSmsStore';
import { useCopilotStore } from '@/store/use-copilot-store';
import { BillsRepository } from '@/modules/bills/database/bills.repository';
import { DuplicateDetectionEngine } from '@/modules/sms/duplicate/duplicateDetectionEngine';

const INSTALLATION_ID_STORAGE_KEY = 'clarity_device_installation_id';

/**
 * Resets all application data completely across SQLite, MMKV, Zustand,
 * in-memory engine caches, and TanStack Query cache.
 */
export async function resetEntireAppData(queryClient?: QueryClient): Promise<void> {
  // 1. Pause auto-backup timers and lock cloud sync to protect remote Google Drive backups
  clearAutoBackupTimer();
  useAppStore.getState().setPostResetLocked(true);

  // 2. Drop and re-seed the SQLite database
  await clearDatabase();

  // 3. Reset repository and engine schema/memory caches
  BillsRepository.resetSchemaCache();
  DuplicateDetectionEngine.clearCache();

  // 4. Wipe MMKV storage while preserving installation id
  const installationId = mmkv.getString(INSTALLATION_ID_STORAGE_KEY);
  mmkv.clearAll();
  if (installationId) {
    mmkv.set(INSTALLATION_ID_STORAGE_KEY, installationId);
  }

  // 5. Reset in-memory Zustand stores
  useBillsStore.setState({
    bills: [],
    subscriptions: [],
    summary: {
      upcomingCount: 0,
      upcomingAmount: 0,
      overdueCount: 0,
      overdueAmount: 0,
      paidCount: 0,
      paidThisMonthAmount: 0,
      monthlySubscriptionSpend: 0,
      activeSubscriptionCount: 0,
      totalCommittedMonth: 0,
    },
    selectedTab: 'upcoming',
    selectedCategory: 'all',
    searchQuery: '',
    isLoading: false,
  });

  useSplitwiseStore.setState({
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
    overallSummary: {
      totalOwedToMe: 0,
      totalIOwe: 0,
      totalSettled: 0,
      netBalance: 0,
      peopleCount: 0,
    },
    selectedPersonId: null,
    selectedFilter: 'ALL',
    searchQuery: '',
    isLoading: false,
    error: null,
  });

  useSmsStore.setState({
    isSyncing: false,
    progress: {
      total: 0,
      processed: 0,
      batchIndex: 0,
      totalBatches: 0,
      phase: 'idle',
    },
    lastSyncTimestamp: null,
    analytics: null,
    reviewQueueCount: 0,
    error: null,
    pendingTransactions: [],
    isPromptVisible: false,
  });

  useCopilotStore.getState().clearMessages();

  // 6. Reset user preferences & prompt flags in useAppStore
  const appStore = useAppStore.getState();
  appStore.setLastCloudBackupTime(null);
  appStore.setHasSeenSmsPrompt(false);
  appStore.setHasSeenDrivePrompt(false);
  appStore.setHasSeenNotificationPrompt(false);
  appStore.setLastDismissedClipboardHash(null);
  appStore.setHideBalances(false);
  appStore.setHasDismissedOnboardingChecklist(false);

  // 7. Flush TanStack Query cache and force all mounted observers to re-fetch
  if (queryClient) {
    await queryClient.cancelQueries();
    queryClient.clear();
    await queryClient.invalidateQueries();
  }
}

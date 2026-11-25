import { mmkv } from '@/lib/storage';
import { BillsRepository } from '@/modules/bills/database/bills.repository';
import { useBillsStore } from '@/modules/bills/store/bills.store';
import { NativeNotificationListenerAdapter } from '@/modules/notifications/adapters/nativeNotificationListenerAdapter';
import { DEFAULT_TARGET_APPS } from '@/modules/notifications/constants';
import { DuplicateDetectionEngine } from '@/modules/sms/duplicate/duplicateDetectionEngine';
import { useSplitwiseStore } from '@/modules/splitwise/store/splitwise.store';
import { clearAutoBackupTimer } from '@/services/cloud/google-drive-service';
import { clearDatabase } from '@/services/database';
import { useAppStore } from '@/store/use-app-store';
import { useCopilotStore } from '@/store/use-copilot-store';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useSmsStore } from '@/store/useSmsStore';
import type { QueryClient } from '@tanstack/react-query';

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

  // 2.5 Cancel all OS-scheduled notifications before wiping state
  try {
    const { BillAlertEngine } = await import('@/services/notifications/bill-alert-engine');
    await BillAlertEngine.cancelAllNativeBillReminders();
  } catch {
    // Ignore in test/headless mode
  }

  // 3. Reset repository and engine schema/memory caches & native notification bridge buffer
  BillsRepository.resetSchemaCache();
  DuplicateDetectionEngine.clearCache();
  await NativeNotificationListenerAdapter.clearBridgeState().catch(() => false);

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
    analytics: null,
    reviewQueueCount: 0,
    pendingTransactions: [],
    isPromptVisible: false,
  });

  useNotificationStore.setState({
    isEnabled: true,
    permissionStatus: 'denied',
    parseTransactions: true,
    parseBills: true,
    enabledPackages: DEFAULT_TARGET_APPS.map((app) => app.packageName),
    health: null,
    isDisclosureVisible: false,
    activeDetectedBill: null,
    activeDetectedBillId: null,
    detectedBillQueue: [],
    detectedBillModalVisible: false,
  });

  useCopilotStore.getState().clearMessages();

  // 6. Reset user preferences & prompt flags in useAppStore
  const appStore = useAppStore.getState();
  appStore.setLastCloudBackupTime(null);
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

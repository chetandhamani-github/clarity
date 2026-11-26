import { mmkv } from '@/lib/storage';
import { BillsRepository } from '@/modules/bills/database/bills.repository';
import { useBillsStore } from '@/modules/bills/store/bills.store';
import { NativeNotificationListenerAdapter } from '@/modules/notifications/adapters/nativeNotificationListenerAdapter';
import { DEFAULT_TARGET_APPS } from '@/modules/notifications/constants';
import { NotificationParsingService } from '@/modules/notifications/services/notificationParsingService';
import { LocalCategorizerEngine } from '@/modules/sms/categorizer/localCategorizerEngine';
import { DuplicateDetectionEngine } from '@/modules/sms/duplicate/duplicateDetectionEngine';
import { SmsSyncService } from '@/modules/sms/services/smsSyncService';
import { useSplitwiseStore } from '@/modules/splitwise/store/splitwise.store';
import { clearAutoBackupTimer } from '@/services/cloud/google-drive-service';
import { clearDatabase } from '@/services/database';
import { resetBillReminderCheckCooldown } from '@/services/notifications/alert-engine';
import { clearAllReceiptImages } from '@/services/storage/receipt-storage';
import { useAppStore } from '@/store/use-app-store';
import { useCopilotStore } from '@/store/use-copilot-store';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useSmsStore } from '@/store/useSmsStore';
import type { QueryClient } from '@tanstack/react-query';

const INSTALLATION_ID_STORAGE_KEY = 'clarity_device_installation_id';

let resetInFlight: Promise<void> | null = null;

/**
 * Resets all local application data cleanly across SQLite, receipt & export files,
 * MMKV, Zustand stores, OS notifications, in-memory caches, and TanStack Query cache.
 * Preserves device installation ID, remote cloud backups + credentials, app lock security,
 * and authentication session.
 */
export function resetEntireAppData(queryClient?: QueryClient): Promise<void> {
  if (resetInFlight) {
    return resetInFlight;
  }

  resetInFlight = executeResetEntireAppData(queryClient).finally(() => {
    resetInFlight = null;
  });
  return resetInFlight;
}

async function executeResetEntireAppData(queryClient?: QueryClient): Promise<void> {
  // 1. Pause auto-backup timers, lock cloud sync to protect Drive backups, and quiesce background ingestion
  clearAutoBackupTimer();
  useAppStore.getState().setPostResetLocked(true);
  SmsSyncService.cancelSync();
  NotificationParsingService.setResetInProgress(true);

  try {
    await NotificationParsingService.flushPendingWork();

    // 2. Drop and re-seed the SQLite database
    await clearDatabase();

    // 3. Remove persisted receipt images & cached export files on disk
    await clearAllReceiptImages();
    try {
      const { clearCachedExportFiles } = await import('@/services/export/export-service');
      await clearCachedExportFiles();
    } catch {
      // Ignore in test/headless mode
    }

    // 4. Cancel scheduled OS notifications, clear notification tray, & reset alert cooldown
    try {
      const { BillAlertEngine } = await import('@/services/notifications/bill-alert-engine');
      await BillAlertEngine.cancelAllNativeBillReminders();
      await BillAlertEngine.dismissAllDeliveredNotifications();
    } catch {
      // Ignore in test/headless mode
    }
    resetBillReminderCheckCooldown();

    // 5. Reset repository & engine caches, custom categorizer rules, and native listener buffer
    BillsRepository.resetSchemaCache();
    DuplicateDetectionEngine.clearCache();
    LocalCategorizerEngine.clearCustomRules();
    await NativeNotificationListenerAdapter.clearBridgeState().catch(() => false);

    // 6. Wipe MMKV storage while preserving installation id
    const installationId = mmkv.getString(INSTALLATION_ID_STORAGE_KEY);
    mmkv.clearAll();
    if (installationId) {
      mmkv.set(INSTALLATION_ID_STORAGE_KEY, installationId);
    }

    // 7. Reset in-memory Zustand stores
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
    // Sync actual OS permission/health so granted Notification Access isn't misreported
    await useNotificationStore.getState().refreshHealth().catch(() => null);

    useCopilotStore.getState().clearMessages();

    // 8. Reset user financial cycle config, prompt flags, & privacy state in useAppStore
    const appStore = useAppStore.getState();
    appStore.setLastCloudBackupTime(null);
    appStore.setHasSeenDrivePrompt(false);
    appStore.setHasSeenNotificationPrompt(false);
    appStore.setLastDismissedClipboardHash(null);
    appStore.setHideBalances(false);
    appStore.setHasDismissedOnboardingChecklist(false);
    appStore.setOnboarded(false);
    appStore.setPaydayDayOfMonth(1);
    appStore.setSafetyBufferAmount(2000);

    // 9. Flush TanStack Query cache and notify mounted non-query listeners
    if (queryClient) {
      await queryClient.cancelQueries();
      queryClient.clear();
      await queryClient.invalidateQueries();
    }

    try {
      const { DeviceEventEmitter } = await import('react-native');
      DeviceEventEmitter?.emit?.('appDataReset');
      DeviceEventEmitter?.emit?.('billsUpdated');
      DeviceEventEmitter?.emit?.('notificationsUpdated');
      DeviceEventEmitter?.emit?.('splitwiseUpdated');
    } catch {
      // Ignore in test/headless mode
    }
  } finally {
    NotificationParsingService.setResetInProgress(false);
  }
}

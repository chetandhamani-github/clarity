import { useEffect } from 'react';
import { useSmsStore } from '@/store/useSmsStore';
import type { SyncOptions } from '@/modules/sms/services/smsSyncService';

export function useSmsSync() {
  const {
    permissionStatus,
    isSyncing,
    progress,
    lastSyncTimestamp,
    error,
    pendingTransactions,
    isPromptVisible,
    checkPermission,
    requestPermission,
    startInitialSync,
    startIncrementalSync,
    cancelSync,
    setPendingTransactions,
    openTransactionPrompt,
    closeTransactionPrompt,
    importPendingTransactions,
    dismissPendingTransactions,
  } = useSmsStore();

  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  const sync = async (options?: SyncOptions) => {
    if (permissionStatus !== 'granted') {
      const status = await requestPermission();
      if (status !== 'granted') {
        throw new Error('SMS permission is required to scan messages');
      }
    }

    if (lastSyncTimestamp) {
      await startIncrementalSync(options);
    } else {
      await startInitialSync(options);
    }
  };

  return {
    permissionStatus,
    isSyncing,
    progress,
    lastSyncTimestamp,
    error,
    pendingTransactions,
    isPromptVisible,
    requestPermission,
    checkPermission,
    sync,
    startInitialSync,
    startIncrementalSync,
    cancelSync,
    setPendingTransactions,
    openTransactionPrompt,
    closeTransactionPrompt,
    importPendingTransactions,
    dismissPendingTransactions,
  };
}

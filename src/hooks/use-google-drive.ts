import { useToast } from '@/components/ui';
import {
    authenticateWithGoogle,
    checkHasCustomBackupPassphrase,
    clearStoredBackupPassphrase,
    clearTokens,
    deleteAllBackups,
    downloadBackup,
    downloadBackupRevision,
    findBackupFile,
    getSavedTokens,
    getStoredBackupPassphrase,
    listBackupRevisions,
    setStoredBackupPassphrase,
    uploadBackup,
    type GoogleDriveBackupInfo,
    type GoogleDriveRevisionInfo,
} from '@/services/cloud/google-drive-service';
import {
    generateDatabaseSnapshot,
    getBackupSummary,
    isMeaningfulDatabaseSnapshot,
    restoreDatabaseFromSnapshot,
    type BackupMetadata,
} from '@/services/database/backup-restore-service';
import { useAppStore } from '@/store/use-app-store';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';

export function useGoogleDrive() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const isConnected = useAppStore((state) => state.googleDriveConnected);
  const userEmail = useAppStore((state) => state.googleDriveUserEmail);
  const lastBackupTime = useAppStore((state) => state.lastCloudBackupTime);
  const setGoogleDriveConnected = useAppStore((state) => state.setGoogleDriveConnected);
  const setLastCloudBackupTime = useAppStore((state) => state.setLastCloudBackupTime);
  const hasCustomBackupPassphrase = useAppStore((state) => state.hasCustomBackupPassphrase);
  const setHasCustomBackupPassphrase = useAppStore((state) => state.setHasCustomBackupPassphrase);

  const autoBackupEnabled = useAppStore((state) => state.autoBackupEnabled);
  const setAutoBackupEnabled = useAppStore((state) => state.setAutoBackupEnabled);
  const autoBackupOnlyWifi = useAppStore((state) => state.autoBackupOnlyWifi);
  const setAutoBackupOnlyWifi = useAppStore((state) => state.setAutoBackupOnlyWifi);

  useEffect(() => {
    if (isConnected) {
      checkHasCustomBackupPassphrase().catch(() => {});
    }
  }, [isConnected]);

  const [isConnecting, setIsConnecting] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isCheckingBackup, setIsCheckingBackup] = useState(false);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const [isDeletingBackups, setIsDeletingBackups] = useState(false);

  /**
   * Restore database from Google Drive backup.
   */
  const restoreFromDrive = useCallback(
    async (
      passphrase?: string
    ): Promise<{
      success: boolean;
      summary?: BackupMetadata;
      isEncrypted?: boolean;
      error?: string;
    }> => {
      setIsRestoring(true);
      try {
        const downloadRes = await downloadBackup(passphrase);
        if (!downloadRes.success || !downloadRes.data) {
          if (downloadRes.isEncrypted) {
            return { success: false, isEncrypted: true, error: downloadRes.error };
          }
          showToast(downloadRes.error || 'No backup found to restore', 'error');
          return { success: false, error: downloadRes.error };
        }

        await restoreDatabaseFromSnapshot(downloadRes.data);
        const summary = getBackupSummary(downloadRes.data);

        useAppStore.getState().setPostResetLocked(false);

        if (downloadRes.metadata?.modifiedTime) {
          setLastCloudBackupTime(downloadRes.metadata.modifiedTime);
        }

        // Invalidate and refetch all query caches so UI updates instantly
        await queryClient.invalidateQueries();

        DeviceEventEmitter.emit('billsUpdated');
        DeviceEventEmitter.emit('notificationsUpdated');
        DeviceEventEmitter.emit('splitwiseUpdated');

        try {
          const { useBillsStore } = await import('@/modules/bills/store/bills.store');
          useBillsStore.getState().loadData().catch(() => {});
        } catch {
          // Ignore if bills store is not initialized
        }

        if (downloadRes.isRecoveredFromRevision) {
          showToast(
            `Data recovered from previous version! (${summary.accountCount} accounts, ${summary.transactionCount} transactions)`,
            'success'
          );
          // Resave the recovered version as the latest snapshot so future backups stay in sync
          uploadBackup(downloadRes.data).catch(() => {});
        } else {
          showToast(
            `Data restored! (${summary.accountCount} accounts, ${summary.transactionCount} transactions)`,
            'success'
          );
        }

        return { success: true, summary };
      } catch (error: any) {
        showToast(error?.message || 'Failed to restore backup from Drive', 'error');
        return { success: false, error: error?.message };
      } finally {
        setIsRestoring(false);
      }
    },
    [queryClient, setLastCloudBackupTime, showToast]
  );

  /**
   * Connect with Google Drive OAuth and check for existing cloud backups safely.
   */
  const connect = useCallback(
    async (options?: {
      silent?: boolean;
      autoRestoreIfEmpty?: boolean;
      deferInitialUpload?: boolean;
    }): Promise<{
      success: boolean;
      needsPassphraseToRestore?: boolean;
      hasExistingBackup?: boolean;
      existingBackupDate?: string;
      restored?: boolean;
      error?: string;
    }> => {
      setIsConnecting(true);
      try {
        const auth = await authenticateWithGoogle();
        if (!auth.success) {
          if (!auth.error?.toLowerCase().includes('cancel') && !options?.silent) {
            showToast(auth.error || 'Failed to connect Google Drive', 'error');
          }
          return { success: false, error: auth.error };
        }

        setGoogleDriveConnected(true, auth.email);
        await checkHasCustomBackupPassphrase();
        if (!options?.silent) {
          showToast(`Connected to Google Drive (${auth.email})`, 'success');
        }

        // Check if an existing backup is already in Google Drive
        // Critical: NEVER overwrite an existing cloud backup with fresh/empty local state
        try {
          if (auth.accessToken) {
            const existingFile = await findBackupFile(auth.accessToken);
            if (existingFile) {
              setLastCloudBackupTime(existingFile.modifiedTime);

              // Check if local database is currently empty/cleared
              const localSnapshot = await generateDatabaseSnapshot();
              const hasMeaningfulLocalData = isMeaningfulDatabaseSnapshot(localSnapshot);

              if (!hasMeaningfulLocalData && (options?.autoRestoreIfEmpty ?? true)) {
                if (!options?.silent) {
                  showToast('Cloud backup found! Restoring your data...', 'info');
                }
                const restoreRes = await restoreFromDrive();
                if (restoreRes.success) {
                  return { success: true, restored: true, hasExistingBackup: true };
                }
                if (restoreRes.isEncrypted) {
                  return {
                    success: true,
                    needsPassphraseToRestore: true,
                    hasExistingBackup: true,
                    existingBackupDate: existingFile.modifiedTime,
                  };
                }
              }

              if (!options?.silent) {
                const dateStr = new Date(existingFile.modifiedTime).toLocaleDateString();
                showToast(`Cloud backup found from ${dateStr}. Restore from Settings anytime.`, 'info');
              }
              return {
                success: true,
                hasExistingBackup: true,
                existingBackupDate: existingFile.modifiedTime,
              };
            }
          }

          // If no cloud backup exists, only perform initial backup automatically unless caller defers it for password setup
          if (!options?.deferInitialUpload) {
            const snapshot = await generateDatabaseSnapshot();
            if (isMeaningfulDatabaseSnapshot(snapshot)) {
              const uploadRes = await uploadBackup(snapshot);
              if (uploadRes.success && uploadRes.modifiedTime) {
                setLastCloudBackupTime(uploadRes.modifiedTime);
              }
            }
          }
        } catch {
          // Initial sync check error ignored
        }

        return { success: true, hasExistingBackup: false };
      } catch (error: any) {
        if (!options?.silent) {
          showToast(error?.message || 'Error connecting to Google Drive', 'error');
        }
        return { success: false, error: error?.message };
      } finally {
        setIsConnecting(false);
      }
    },
    [restoreFromDrive, setGoogleDriveConnected, setLastCloudBackupTime, showToast]
  );

  /**
   * Disconnect Google Drive account.
   */
  const disconnect = useCallback(async () => {
    try {
      await clearTokens();
      setGoogleDriveConnected(false, null);
      showToast('Google Drive disconnected', 'info');
    } catch {
      showToast('Failed to disconnect Google Drive', 'error');
    }
  }, [setGoogleDriveConnected, showToast]);

  /**
   * Trigger manual backup to Google Drive (encrypted if a password is provided or previously set).
   */
  const backupNow = useCallback(async (passphrase?: string) => {
    setIsBackingUp(true);
    try {
      const snapshot = await generateDatabaseSnapshot();
      const result = await uploadBackup(snapshot, { passphrase, pinRevision: true });

      if (!result.success) {
        showToast(result.error || 'Failed to upload backup', 'error');
        return false;
      }

      useAppStore.getState().setPostResetLocked(false);
      const nowStr = result.modifiedTime || new Date().toISOString();
      setLastCloudBackupTime(nowStr);
      showToast(
        result.encrypted
          ? 'Encrypted backup saved to Google Drive!'
          : 'Backup saved to Google Drive!',
        'success'
      );
      return true;
    } catch (error: any) {
      showToast(error?.message || 'Error uploading backup', 'error');
      return false;
    } finally {
      setIsBackingUp(false);
    }
  }, [setLastCloudBackupTime, showToast]);

  /**
   * Uploads initial unencrypted snapshot in the background when skipping optional password setup.
   */
  const syncInitialBackupIfMeaningful = useCallback(async (): Promise<boolean> => {
    try {
      const state = useAppStore.getState();
      if (!state.googleDriveConnected || state.isPostResetLocked) {
        return false;
      }
      const snapshot = await generateDatabaseSnapshot();
      if (!isMeaningfulDatabaseSnapshot(snapshot)) {
        return false;
      }
      const result = await uploadBackup(snapshot, { allowInteractive: false });
      if (result.success && result.modifiedTime) {
        setLastCloudBackupTime(result.modifiedTime);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [setLastCloudBackupTime]);

  /**
   * Removes backup password protection and uploads a fresh unencrypted snapshot when possible.
   */
  const disableBackupEncryption = useCallback(async (): Promise<boolean> => {
    setIsBackingUp(true);
    try {
      const snapshot = await generateDatabaseSnapshot();
      const hasMeaningfulLocal = isMeaningfulDatabaseSnapshot(snapshot);
      const { accessToken } = await getSavedTokens();
      const existingFile = accessToken ? await findBackupFile(accessToken).catch(() => null) : null;

      if (!existingFile && !hasMeaningfulLocal) {
        await clearStoredBackupPassphrase();
        showToast('Backup password removed.', 'info');
        return true;
      }

      if (existingFile && !hasMeaningfulLocal) {
        showToast(
          'Local database is empty. Restore your backup or add data before removing cloud password encryption.',
          'error'
        );
        return false;
      }

      const result = await uploadBackup(snapshot, {
        disableEncryption: true,
        pinRevision: true,
      });

      if (!result.success) {
        showToast(result.error || 'Failed to update cloud backup', 'error');
        return false;
      }

      useAppStore.getState().setPostResetLocked(false);
      if (result.modifiedTime) {
        setLastCloudBackupTime(result.modifiedTime);
      }
      showToast('Backup password removed & unencrypted backup saved to Google Drive!', 'success');
      return true;
    } catch (error: any) {
      showToast(error?.message || 'Error updating backup encryption', 'error');
      return false;
    } finally {
      setIsBackingUp(false);
    }
  }, [setLastCloudBackupTime, showToast]);

  /**
   * Perform silent background auto-backup without disrupting user.
   */
  const performSilentAutoBackup = useCallback(
    async (_reason = 'auto-sync'): Promise<boolean> => {
      const currentState = useAppStore.getState();
      if (!currentState.googleDriveConnected || !currentState.autoBackupEnabled || currentState.isPostResetLocked) {
        return false;
      }

      setIsAutoSyncing(true);
      try {
        const snapshot = await generateDatabaseSnapshot();
        if (!isMeaningfulDatabaseSnapshot(snapshot)) {
          return false;
        }
        const result = await uploadBackup(snapshot, { allowInteractive: false });
        if (result.success && result.modifiedTime) {
          currentState.setLastCloudBackupTime(result.modifiedTime);
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        setIsAutoSyncing(false);
      }
    },
    []
  );

  /**
   * Retrieve list of available backup revisions from Google Drive.
   */
  const getDriveRevisions = useCallback(async (): Promise<GoogleDriveRevisionInfo[]> => {
    const res = await listBackupRevisions();
    if (res.success && res.revisions) {
      return res.revisions;
    }
    if (res.error && !res.error.includes('No backup')) {
      showToast(res.error, 'error');
    }
    return [];
  }, [showToast]);

  /**
   * Restore database from a specific historical Google Drive revision.
   */
  const restoreRevisionFromDrive = useCallback(
    async (
      revisionId: string,
      passphrase?: string
    ): Promise<{
      success: boolean;
      summary?: BackupMetadata;
      isEncrypted?: boolean;
      error?: string;
    }> => {
      setIsRestoring(true);
      try {
        const downloadRes = await downloadBackupRevision(revisionId, passphrase);
        if (!downloadRes.success || !downloadRes.data) {
          if (downloadRes.isEncrypted) {
            return { success: false, isEncrypted: true, error: downloadRes.error };
          }
          showToast(downloadRes.error || 'Failed to download revision', 'error');
          return { success: false, error: downloadRes.error };
        }

        await restoreDatabaseFromSnapshot(downloadRes.data);
        const summary = getBackupSummary(downloadRes.data);

        useAppStore.getState().setPostResetLocked(false);

        if (downloadRes.metadata?.modifiedTime) {
          setLastCloudBackupTime(downloadRes.metadata.modifiedTime);
        }

        await queryClient.invalidateQueries();
        DeviceEventEmitter.emit('billsUpdated');
        DeviceEventEmitter.emit('notificationsUpdated');
        DeviceEventEmitter.emit('splitwiseUpdated');

        try {
          const { useBillsStore } = await import('@/modules/bills/store/bills.store');
          useBillsStore.getState().loadData().catch(() => {});
        } catch {
          // Ignore
        }

        showToast(
          `Version restored successfully! (${summary.accountCount} accounts, ${summary.transactionCount} transactions)`,
          'success'
        );

        // Resave as the latest snapshot so future auto-sync builds on top of restored state
        uploadBackup(downloadRes.data).catch(() => {});

        return { success: true, summary };
      } catch (error: any) {
        showToast(error?.message || 'Failed to restore revision', 'error');
        return { success: false, error: error?.message };
      } finally {
        setIsRestoring(false);
      }
    },
    [queryClient, setLastCloudBackupTime, showToast]
  );

  /**
   * Check available backup in Google Drive.
   */
  const checkAvailableBackup = useCallback(async (): Promise<GoogleDriveBackupInfo | null> => {
    setIsCheckingBackup(true);
    try {
      const { accessToken } = await getSavedTokens();
      if (!accessToken) return null;
      return await findBackupFile(accessToken);
    } catch {
      return null;
    } finally {
      setIsCheckingBackup(false);
    }
  }, []);

  /**
   * Delete all backups from Google Drive private appDataFolder.
   */
  const deleteBackupsFromDrive = useCallback(async (): Promise<{
    success: boolean;
    count: number;
    error?: string;
  }> => {
    setIsDeletingBackups(true);
    try {
      const res = await deleteAllBackups();
      if (!res.success) {
        showToast(res.error || 'Failed to remove backups from Drive', 'error');
        return { success: false, count: 0, error: res.error };
      }
      setLastCloudBackupTime(null);
      if (res.count > 0) {
        showToast(
          `Deleted ${res.count} cloud backup${res.count > 1 ? 's' : ''} from Google Drive.`,
          'success'
        );
      } else {
        showToast('No cloud backups found in Google Drive to delete.', 'info');
      }
      return { success: true, count: res.count };
    } catch (error: any) {
      showToast(error?.message || 'Error deleting backups from Drive', 'error');
      return { success: false, count: 0, error: error?.message };
    } finally {
      setIsDeletingBackups(false);
    }
  }, [setLastCloudBackupTime, showToast]);

  return {
    isConnected,
    userEmail,
    lastBackupTime,
    autoBackupEnabled,
    setAutoBackupEnabled,
    autoBackupOnlyWifi,
    setAutoBackupOnlyWifi,
    hasCustomBackupPassphrase,
    checkHasCustomBackupPassphrase,
    isConnecting,
    isBackingUp,
    isRestoring,
    isCheckingBackup,
    isAutoSyncing,
    isDeletingBackups,
    connect,
    disconnect,
    backupNow,
    syncInitialBackupIfMeaningful,
    disableBackupEncryption,
    performSilentAutoBackup,
    restoreFromDrive,
    getDriveRevisions,
    restoreRevisionFromDrive,
    checkAvailableBackup,
    deleteBackupsFromDrive,
    getBackupPassphrase: getStoredBackupPassphrase,
    setBackupPassphrase: setStoredBackupPassphrase,
  };
}

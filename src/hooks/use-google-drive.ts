import { useState, useCallback } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/store/use-app-store';
import { useToast } from '@/components/ui';
import {
  authenticateWithGoogle,
  clearTokens,
  uploadBackup,
  downloadBackup,
  findBackupFile,
  getSavedTokens,
  type GoogleDriveBackupInfo,
} from '@/services/cloud/google-drive-service';
import {
  generateDatabaseSnapshot,
  restoreDatabaseFromSnapshot,
  getBackupSummary,
  isMeaningfulDatabaseSnapshot,
  type BackupMetadata,
} from '@/services/database/backup-restore-service';

export function useGoogleDrive() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const isConnected = useAppStore((state) => state.googleDriveConnected);
  const userEmail = useAppStore((state) => state.googleDriveUserEmail);
  const lastBackupTime = useAppStore((state) => state.lastCloudBackupTime);
  const setGoogleDriveConnected = useAppStore((state) => state.setGoogleDriveConnected);
  const setLastCloudBackupTime = useAppStore((state) => state.setLastCloudBackupTime);

  const autoBackupEnabled = useAppStore((state) => state.autoBackupEnabled);
  const setAutoBackupEnabled = useAppStore((state) => state.setAutoBackupEnabled);

  const [isConnecting, setIsConnecting] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isCheckingBackup, setIsCheckingBackup] = useState(false);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);

  /**
   * Restore database from Google Drive backup.
   */
  const restoreFromDrive = useCallback(async (): Promise<{
    success: boolean;
    summary?: BackupMetadata;
    error?: string;
  }> => {
    setIsRestoring(true);
    try {
      const downloadRes = await downloadBackup();
      if (!downloadRes.success || !downloadRes.data) {
        showToast(downloadRes.error || 'No backup found to restore', 'error');
        return { success: false, error: downloadRes.error };
      }

      await restoreDatabaseFromSnapshot(downloadRes.data);
      const summary = getBackupSummary(downloadRes.data);

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
      console.error('Restore error:', error);
      showToast(error?.message || 'Failed to restore backup from Drive', 'error');
      return { success: false, error: error?.message };
    } finally {
      setIsRestoring(false);
    }
  }, [queryClient, setLastCloudBackupTime, showToast]);

  /**
   * Connect with Google Drive OAuth and check for existing cloud backups safely.
   */
  const connect = useCallback(
    async (options?: { silent?: boolean; autoRestoreIfEmpty?: boolean }) => {
      setIsConnecting(true);
      try {
        const auth = await authenticateWithGoogle();
        if (!auth.success) {
          if (!auth.error?.toLowerCase().includes('cancel') && !options?.silent) {
            showToast(auth.error || 'Failed to connect Google Drive', 'error');
          }
          return false;
        }

        setGoogleDriveConnected(true, auth.email);
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
                  return true;
                }
              }

              if (!options?.silent) {
                const dateStr = new Date(existingFile.modifiedTime).toLocaleDateString();
                showToast(`Cloud backup found from ${dateStr}. Restore from Settings anytime.`, 'info');
              }
              return true;
            }
          }

          // If no cloud backup exists, only perform initial backup if local DB has real data
          const snapshot = await generateDatabaseSnapshot();
          if (isMeaningfulDatabaseSnapshot(snapshot)) {
            const uploadRes = await uploadBackup(snapshot);
            if (uploadRes.success && uploadRes.modifiedTime) {
              setLastCloudBackupTime(uploadRes.modifiedTime);
            }
          }
        } catch (syncErr) {
          console.error('[GoogleDrive] Initial sync check error:', syncErr);
        }

        return true;
      } catch (error: any) {
        console.error('Connect error:', error);
        if (!options?.silent) {
          showToast(error?.message || 'Error connecting to Google Drive', 'error');
        }
        return false;
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
    } catch (error: any) {
      console.error('Disconnect error:', error);
      showToast('Failed to disconnect Google Drive', 'error');
    }
  }, [setGoogleDriveConnected, showToast]);

  /**
   * Trigger manual backup to Google Drive.
   */
  const backupNow = useCallback(async () => {
    setIsBackingUp(true);
    try {
      const snapshot = await generateDatabaseSnapshot();
      const result = await uploadBackup(snapshot);

      if (!result.success) {
        showToast(result.error || 'Failed to upload backup', 'error');
        return false;
      }

      const nowStr = result.modifiedTime || new Date().toISOString();
      setLastCloudBackupTime(nowStr);
      showToast('Backup saved to Google Drive successfully!', 'success');
      return true;
    } catch (error: any) {
      console.error('Backup error:', error);
      showToast(error?.message || 'Error uploading backup', 'error');
      return false;
    } finally {
      setIsBackingUp(false);
    }
  }, [setLastCloudBackupTime, showToast]);

  /**
   * Perform silent background auto-backup without disrupting user.
   */
  const performSilentAutoBackup = useCallback(
    async (reason = 'auto-sync'): Promise<boolean> => {
      const currentState = useAppStore.getState();
      if (!currentState.googleDriveConnected || !currentState.autoBackupEnabled) {
        return false;
      }

      setIsAutoSyncing(true);
      try {
        const snapshot = await generateDatabaseSnapshot();
        if (!isMeaningfulDatabaseSnapshot(snapshot)) {
          return false;
        }
        const result = await uploadBackup(snapshot);
        if (result.success && result.modifiedTime) {
          currentState.setLastCloudBackupTime(result.modifiedTime);
          return true;
        }
        return false;
      } catch (err) {
        console.warn(`[AutoBackup:${reason}] Silent backup error:`, err);
        return false;
      } finally {
        setIsAutoSyncing(false);
      }
    },
    []
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
    } catch (e) {
      console.error('Check backup error:', e);
      return null;
    } finally {
      setIsCheckingBackup(false);
    }
  }, []);

  return {
    isConnected,
    userEmail,
    lastBackupTime,
    autoBackupEnabled,
    setAutoBackupEnabled,
    isConnecting,
    isBackingUp,
    isRestoring,
    isCheckingBackup,
    isAutoSyncing,
    connect,
    disconnect,
    backupNow,
    performSilentAutoBackup,
    restoreFromDrive,
    checkAvailableBackup,
  };
}

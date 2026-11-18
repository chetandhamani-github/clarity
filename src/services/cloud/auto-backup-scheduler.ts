import { AppState, type AppStateStatus } from 'react-native';
import { useAppStore } from '@/store/use-app-store';
import { syncDatabaseToDriveSilently } from './google-drive-service';
import { useNetworkStore } from '@/store/use-network-store';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

let isInitialized = false;

/**
 * Checks if a scheduled backup is due (at least 24 hours since last backup)
 * and executes silent cloud sync if preconditions are met.
 */
export async function checkAndRunScheduledBackup(reason = 'scheduled-daily'): Promise<boolean> {
  try {
    const state = useAppStore.getState();

    if (!state.googleDriveConnected || !state.autoBackupEnabled) {
      return false;
    }

    // Check if network is connected
    const isConnected = useNetworkStore.getState().isConnected;
    if (!isConnected) {
      return false;
    }

    // Check last backup timestamp
    const lastBackup = state.lastCloudBackupTime;
    if (lastBackup) {
      const lastTime = new Date(lastBackup).getTime();
      const elapsed = Date.now() - lastTime;
      if (elapsed < TWENTY_FOUR_HOURS_MS) {
        return false;
      }
    }

    return await syncDatabaseToDriveSilently(reason);
  } catch {
    return false;
  }
}

/**
 * Initializes opportunistic background and resume triggers for daily auto-backup.
 */
export function initScheduledBackupListener(): () => void {
  if (isInitialized) {
    return () => {};
  }
  isInitialized = true;

  // Run a delayed check on startup (10 seconds after launch)
  const initialTimer = setTimeout(() => {
    void checkAndRunScheduledBackup('startup-check');
  }, 10000);

  // Check whenever app returns to foreground
  let previousAppState: AppStateStatus = AppState.currentState;
  const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
    if (
      previousAppState.match(/inactive|background/) &&
      nextAppState === 'active'
    ) {
      void checkAndRunScheduledBackup('app-resume');
    }
    previousAppState = nextAppState;
  });

  return () => {
    clearTimeout(initialTimer);
    subscription.remove();
    isInitialized = false;
  };
}

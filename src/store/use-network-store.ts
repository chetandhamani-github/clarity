import { create } from 'zustand';
import { AppState, type AppStateStatus } from 'react-native';
import { checkInternetConnectivity } from '@/services/network/network.service';

interface NetworkState {
  isConnected: boolean;
  isChecking: boolean;
  setIsConnected: (connected: boolean) => void;
  checkConnection: () => Promise<boolean>;
  verifyConnection: () => Promise<boolean>;
}

let offlineRetryTimer: ReturnType<typeof setInterval> | null = null;

function startOfflineRetry() {
  if (offlineRetryTimer) return;
  offlineRetryTimer = setInterval(async () => {
    try {
      const isOnline = await checkInternetConnectivity(4000);
      if (isOnline) {
        useNetworkStore.getState().setIsConnected(true);
        stopOfflineRetry();
      }
    } catch {
      // Still offline, retry next cycle
    }
  }, 6000);
}

function stopOfflineRetry() {
  if (offlineRetryTimer) {
    clearInterval(offlineRetryTimer);
    offlineRetryTimer = null;
  }
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  isConnected: true,
  isChecking: false,
  setIsConnected: (connected: boolean) => {
    if (get().isConnected !== connected) {
      set({ isConnected: connected });
      if (!connected) {
        startOfflineRetry();
      } else {
        stopOfflineRetry();
      }
    }
  },
  checkConnection: async () => {
    if (get().isChecking) {
      return get().isConnected;
    }
    set({ isChecking: true });
    try {
      const connected = await checkInternetConnectivity();
      set({ isConnected: connected, isChecking: false });
      if (!connected) {
        startOfflineRetry();
      } else {
        stopOfflineRetry();
      }
      return connected;
    } catch {
      set({ isConnected: false, isChecking: false });
      startOfflineRetry();
      return false;
    }
  },
  verifyConnection: async () => {
    if (get().isChecking) {
      return get().isConnected;
    }
    return get().checkConnection();
  },
}));

let isMonitoringInitialized = false;

/**
 * Initializes app-level network state monitoring via AppState changes.
 */
export function initNetworkMonitoring(): () => void {
  if (isMonitoringInitialized) {
    return () => {};
  }
  isMonitoringInitialized = true;

  // Run initial connectivity check
  useNetworkStore.getState().checkConnection();

  const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') {
      useNetworkStore.getState().checkConnection();
    }
  });

  return () => {
    subscription.remove();
    stopOfflineRetry();
    isMonitoringInitialized = false;
  };
}

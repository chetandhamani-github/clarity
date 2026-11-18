import { create } from 'zustand';
import { AppState, type AppStateStatus } from 'react-native';
import { checkInternetConnectivity } from '@/services/network/network.service';

interface NetworkState {
  isConnected: boolean;
  isChecking: boolean;
  setIsConnected: (connected: boolean) => void;
  checkConnection: () => Promise<boolean>;
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  isConnected: true,
  isChecking: false,
  setIsConnected: (connected: boolean) => {
    if (get().isConnected !== connected) {
      set({ isConnected: connected });
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
      return connected;
    } catch {
      set({ isConnected: false, isChecking: false });
      return false;
    }
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
    isMonitoringInitialized = false;
  };
}

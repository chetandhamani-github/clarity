import { useNetworkStore } from '@/store/use-network-store';

/**
 * Hook providing reactive network connectivity status and manual connection checks.
 */
export function useNetworkStatus() {
  const isConnected = useNetworkStore((state) => state.isConnected);
  const isChecking = useNetworkStore((state) => state.isChecking);
  const checkConnection = useNetworkStore((state) => state.checkConnection);
  const setIsConnected = useNetworkStore((state) => state.setIsConnected);

  return {
    isConnected,
    isOffline: !isConnected,
    isChecking,
    checkConnection,
    setIsConnected,
  };
}

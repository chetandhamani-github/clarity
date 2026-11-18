import { useNetworkStore } from '@/store/use-network-store';
import * as networkService from '@/services/network/network.service';

jest.mock('@/services/network/network.service', () => ({
  checkInternetConnectivity: jest.fn(),
  isNetworkError: jest.fn(),
}));

describe('useNetworkStore', () => {
  beforeEach(() => {
    useNetworkStore.setState({ isConnected: true, isChecking: false });
    jest.clearAllMocks();
  });

  it('updates isConnected via setIsConnected', () => {
    useNetworkStore.getState().setIsConnected(false);
    expect(useNetworkStore.getState().isConnected).toBe(false);

    useNetworkStore.getState().setIsConnected(true);
    expect(useNetworkStore.getState().isConnected).toBe(true);
  });

  it('checks connection successfully and updates state to true', async () => {
    (networkService.checkInternetConnectivity as jest.Mock).mockResolvedValueOnce(true);

    const result = await useNetworkStore.getState().checkConnection();
    expect(result).toBe(true);
    expect(useNetworkStore.getState().isConnected).toBe(true);
    expect(useNetworkStore.getState().isChecking).toBe(false);
  });

  it('handles connection check failure and updates state to false', async () => {
    (networkService.checkInternetConnectivity as jest.Mock).mockResolvedValueOnce(false);

    const result = await useNetworkStore.getState().checkConnection();
    expect(result).toBe(false);
    expect(useNetworkStore.getState().isConnected).toBe(false);
    expect(useNetworkStore.getState().isChecking).toBe(false);
  });

  it('delegates verifyConnection to checkConnection', async () => {
    (networkService.checkInternetConnectivity as jest.Mock).mockResolvedValueOnce(true);

    const result = await useNetworkStore.getState().verifyConnection();
    expect(result).toBe(true);
    expect(useNetworkStore.getState().isConnected).toBe(true);
  });
});

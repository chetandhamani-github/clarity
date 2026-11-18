import { checkInternetConnectivity, isNetworkError } from './network.service';

describe('network.service', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('checkInternetConnectivity', () => {
    it('returns true when primary 204 endpoint succeeds', async () => {
      globalThis.fetch = jest.fn().mockResolvedValueOnce({
        status: 204,
        ok: true,
      } as Response);

      const isOnline = await checkInternetConnectivity(1000);
      expect(isOnline).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://connectivitycheck.gstatic.com/generate_204',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('returns true when fallback endpoint succeeds if primary fails', async () => {
      globalThis.fetch = jest
        .fn()
        .mockRejectedValueOnce(new Error('Primary network error'))
        .mockResolvedValueOnce({
          status: 204,
          ok: true,
        } as Response);

      const isOnline = await checkInternetConnectivity(1000);
      expect(isOnline).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('returns true when tertiary Cloudflare endpoint succeeds if first two fail', async () => {
      globalThis.fetch = jest
        .fn()
        .mockRejectedValueOnce(new Error('Primary network error'))
        .mockRejectedValueOnce(new Error('Secondary network error'))
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
        } as Response);

      const isOnline = await checkInternetConnectivity(1000);
      expect(isOnline).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });

    it('returns false when all endpoints fail', async () => {
      globalThis.fetch = jest.fn().mockRejectedValue(new Error('Network request failed'));

      const isOnline = await checkInternetConnectivity(1000);
      expect(isOnline).toBe(false);
    });
  });

  describe('isNetworkError', () => {
    it('identifies status 0 as network error', () => {
      expect(isNetworkError({ status: 0 })).toBe(true);
    });

    it('identifies status 408 as network timeout error', () => {
      expect(isNetworkError({ status: 408 })).toBe(true);
    });

    it('identifies network error message in Error object', () => {
      expect(isNetworkError(new Error('Network request failed'))).toBe(true);
      expect(isNetworkError(new Error('Failed to fetch'))).toBe(true);
      expect(isNetworkError(new Error('The user aborted a request'))).toBe(true);
    });

    it('returns false for non-network errors', () => {
      expect(isNetworkError(new Error('Invalid JSON input'))).toBe(false);
      expect(isNetworkError({ status: 500 })).toBe(false);
      expect(isNetworkError(null)).toBe(false);
      expect(isNetworkError(undefined)).toBe(false);
    });
  });
});

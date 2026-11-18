/**
 * Network Connectivity Service
 *
 * Provides internet reachability detection and network error identification
 * without adding third-party native dependencies.
 */

/**
 * Checks internet connectivity by pinging lightweight 204 endpoints.
 * Returns true if network is available and reachable, false otherwise.
 */
export async function checkInternetConnectivity(timeoutMs: number = 2500): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch('https://connectivitycheck.gstatic.com/generate_204', {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    clearTimeout(timer);
    return res.status === 204 || res.ok;
  } catch {
    clearTimeout(timer);
    // Fallback attempt to alternate lightweight endpoint
    try {
      const fbController = new AbortController();
      const fbTimer = setTimeout(() => fbController.abort(), 1500);
      const fbRes = await fetch('https://clients3.google.com/generate_204', {
        method: 'HEAD',
        signal: fbController.signal,
      });
      clearTimeout(fbTimer);
      return fbRes.status === 204 || fbRes.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Determines whether an error is caused by a network failure or offline state.
 */
export function isNetworkError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === 'object' && 'status' in error) {
    const status = (error as { status: unknown }).status;
    if (status === 0 || status === 408) return true;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('network') ||
      msg.includes('failed to fetch') ||
      msg.includes('network request failed') ||
      msg.includes('abort') ||
      msg.includes('timeout') ||
      msg.includes('offline')
    );
  }
  return false;
}

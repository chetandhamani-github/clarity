/**
 * Network Connectivity Service
 *
 * Provides internet reachability detection and network error identification
 * without adding third-party native dependencies.
 */

/**
 * Checks internet connectivity by pinging lightweight, globally distributed 204/trace endpoints.
 * Returns true if network is available and reachable, false otherwise.
 */
export async function checkInternetConnectivity(timeoutMs: number = 5000): Promise<boolean> {
  // 1. Primary check: Google connectivity check 204
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch('https://connectivitycheck.gstatic.com/generate_204', {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
    });
    clearTimeout(timer);
    if (res.status === 204 || res.ok) {
      return true;
    }
  } catch {
    // Primary failed, proceed to fallback
  }

  // 2. Fallback check: Google alternate 204
  try {
    const fbController = new AbortController();
    const fbTimer = setTimeout(() => fbController.abort(), 3000);
    const fbRes = await fetch('https://clients3.google.com/generate_204', {
      method: 'GET',
      signal: fbController.signal,
    });
    clearTimeout(fbTimer);
    if (fbRes.status === 204 || fbRes.ok) {
      return true;
    }
  } catch {
    // Alternate failed, proceed to third fallback
  }

  // 3. Fallback check: Cloudflare CDN trace
  try {
    const cfController = new AbortController();
    const cfTimer = setTimeout(() => cfController.abort(), 3000);
    const cfRes = await fetch('https://www.cloudflare.com/cdn-cgi/trace', {
      method: 'GET',
      signal: cfController.signal,
    });
    clearTimeout(cfTimer);
    if (cfRes.status === 200 || cfRes.ok) {
      return true;
    }
  } catch {
    // All endpoints failed
  }

  return false;
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

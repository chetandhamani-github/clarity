import { router } from 'expo-router';

let cooldownMs = 500;
let lastNavigationTime = 0;
let isInitialized = false;

let originalPush = router.push;
let originalNavigate = router.navigate;
let originalReplace = router.replace;

/**
 * Returns whether a navigation cooldown is currently active.
 */
export function isNavigating(): boolean {
  return Date.now() - lastNavigationTime < cooldownMs;
}

/**
 * Configure the duration of the navigation cooldown in milliseconds.
 */
export function setNavigationCooldown(ms: number): void {
  cooldownMs = ms;
}

/**
 * Manually reset the navigation lock (useful in tests or when navigation was dismissed).
 */
export function resetNavigationLock(): void {
  lastNavigationTime = 0;
}

/**
 * Restores original unpatched router methods (primarily for testing).
 */
export function restoreNavigationGuard(): void {
  if (!isInitialized) return;
  router.push = originalPush;
  router.navigate = originalNavigate;
  router.replace = originalReplace;
  isInitialized = false;
  lastNavigationTime = 0;
}

/**
 * Initializes the global navigation guard on Expo Router.
 * Protects against duplicate rapid taps by ignoring consecutive pushes/navigates within cooldown window.
 */
export function initNavigationGuard(): void {
  if (isInitialized) return;
  originalPush = router.push;
  originalNavigate = router.navigate;
  originalReplace = router.replace;
  isInitialized = true;

  router.push = (href, options) => {
    const now = Date.now();
    if (now - lastNavigationTime < cooldownMs) {
      return;
    }
    lastNavigationTime = now;
    return originalPush.call(router, href, options);
  };

  router.navigate = (href, options) => {
    const now = Date.now();
    if (now - lastNavigationTime < cooldownMs) {
      return;
    }
    lastNavigationTime = now;
    return originalNavigate.call(router, href, options);
  };

  router.replace = (href, options) => {
    const now = Date.now();
    if (now - lastNavigationTime < cooldownMs) {
      return;
    }
    lastNavigationTime = now;
    return originalReplace.call(router, href, options);
  };
}

// Automatically activate navigation guard
initNavigationGuard();

import { apiClient } from './client';
import { FeatureFlagItem, FeatureFlagsMap } from './types';
import { mmkv } from '@/lib/storage';

const FEATURE_FLAGS_CACHE_KEY = 'clarity_cached_feature_flags';

export const DEFAULT_FEATURE_FLAGS: FeatureFlagsMap = {
  subscription_manager: true,
  bills_reminders: true,
  splitwise: false,
  premium: false,
  ai_insights: false,
};

/**
 * Gets cached feature flags from MMKV
 */
export function getCachedFeatureFlags(): FeatureFlagsMap {
  const cachedJson = mmkv.getString(FEATURE_FLAGS_CACHE_KEY);
  if (cachedJson) {
    try {
      return JSON.parse(cachedJson) as FeatureFlagsMap;
    } catch {
      // JSON parse error fallback
    }
  }
  return DEFAULT_FEATURE_FLAGS;
}

/**
 * Saves feature flags into MMKV cache
 */
export function cacheFeatureFlags(flags: FeatureFlagsMap): void {
  mmkv.set(FEATURE_FLAGS_CACHE_KEY, JSON.stringify(flags));
}

/**
 * Fetches dynamic feature flags from backend and converts to key-value map
 */
export async function fetchFeatureFlags(): Promise<FeatureFlagsMap> {
  try {
    const flagList = await apiClient.get<FeatureFlagItem[]>('/api/v1/features');
    const flagsMap: FeatureFlagsMap = {};

    if (Array.isArray(flagList)) {
      for (const item of flagList) {
        flagsMap[item.key] = item.enabled;
      }
    }

    cacheFeatureFlags(flagsMap);
    return flagsMap;
  } catch (error) {
    if (__DEV__) {
      console.warn('⚠️ [Features API] Fetch failed, using cached feature flags:', error);
    }
    return getCachedFeatureFlags();
  }
}

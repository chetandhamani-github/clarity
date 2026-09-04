import { apiClient } from './client';
import { RemoteConfig } from './types';
import { mmkv } from '@/lib/storage';

const REMOTE_CONFIG_CACHE_KEY = 'clarity_cached_remote_config';

export const DEFAULT_REMOTE_CONFIG: RemoteConfig = {
  minVersion: '1.0.0',
  latestVersion: '1.0.0',
  maintenanceMode: false,
};

/**
 * Gets cached remote config from MMKV or fallback default
 */
export function getCachedRemoteConfig(): RemoteConfig {
  const cachedJson = mmkv.getString(REMOTE_CONFIG_CACHE_KEY);
  if (cachedJson) {
    try {
      return JSON.parse(cachedJson) as RemoteConfig;
    } catch {
      // JSON parse error fallback
    }
  }
  return DEFAULT_REMOTE_CONFIG;
}

/**
 * Saves remote config into MMKV cache
 */
export function cacheRemoteConfig(config: RemoteConfig): void {
  mmkv.set(REMOTE_CONFIG_CACHE_KEY, JSON.stringify(config));
}

/**
 * Fetches remote app configuration from backend with MMKV caching and offline fallback
 */
export async function fetchRemoteConfig(): Promise<RemoteConfig> {
  try {
    const config = await apiClient.get<RemoteConfig>('/api/v1/config');
    cacheRemoteConfig(config);
    return config;
  } catch (error) {
    if (__DEV__) {
      console.warn('⚠️ [Config API] Remote config request failed, using cached config:', error);
    }
    return getCachedRemoteConfig();
  }
}

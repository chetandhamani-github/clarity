import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvZustandStorage } from '@/lib/storage';
import { RemoteConfig } from '@/services/api/types';
import { DEFAULT_REMOTE_CONFIG } from '@/services/api/config.api';

interface RemoteConfigState {
  config: RemoteConfig;
  lastUpdated: string | null;
  setConfig: (config: RemoteConfig) => void;
}

export const useRemoteConfigStore = create<RemoteConfigState>()(
  persist(
    (set) => ({
      config: DEFAULT_REMOTE_CONFIG,
      lastUpdated: null,
      setConfig: (config) =>
        set({
          config,
          lastUpdated: new Date().toISOString(),
        }),
    }),
    {
      name: 'clarity_remote_config_store',
      storage: createJSONStorage(() => mmkvZustandStorage),
    }
  )
);

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvZustandStorage } from '@/lib/storage';
import { FeatureFlagsMap } from '@/services/api/types';
import { DEFAULT_FEATURE_FLAGS } from '@/services/api/feature.api';

interface FeatureFlagState {
  flags: FeatureFlagsMap;
  lastUpdated: string | null;
  setFlags: (flags: FeatureFlagsMap) => void;
  updateFlag: (key: string, enabled: boolean) => void;
  isFeatureEnabled: (name: string) => boolean;
}

export const useFeatureFlagStore = create<FeatureFlagState>()(
  persist(
    (set, get) => ({
      flags: DEFAULT_FEATURE_FLAGS,
      lastUpdated: null,
      setFlags: (flags) =>
        set({
          flags,
          lastUpdated: new Date().toISOString(),
        }),
      updateFlag: (key, enabled) =>
        set((state) => ({
          flags: {
            ...state.flags,
            [key]: enabled,
          },
        })),
      isFeatureEnabled: (name: string) => {
        const state = get();
        return Boolean(state.flags[name]);
      },
    }),
    {
      name: 'clarity_feature_flags_store',
      storage: createJSONStorage(() => mmkvZustandStorage),
    }
  )
);

/**
 * Direct non-hook accessor for feature flags
 */
export function isFeatureEnabled(name: string): boolean {
  return useFeatureFlagStore.getState().isFeatureEnabled(name);
}

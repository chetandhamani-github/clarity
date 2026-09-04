import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchFeatureFlags } from '@/services/api/feature.api';
import { FeatureFlagsMap } from '@/services/api/types';
import { useFeatureFlagStore } from '@/store/featureFlag.store';

export const FEATURES_QUERY_KEY = ['featureFlags'] as const;

export function useFeatures() {
  const storeFlags = useFeatureFlagStore((state) => state.flags);
  const setFlags = useFeatureFlagStore((state) => state.setFlags);

  const query = useQuery<FeatureFlagsMap>({
    queryKey: FEATURES_QUERY_KEY,
    queryFn: fetchFeatureFlags,
    initialData: storeFlags,
    staleTime: 1000 * 60 * 15, // 15 minutes
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });

  useEffect(() => {
    if (query.data) {
      setFlags(query.data);
    }
  }, [query.data, setFlags]);

  return {
    ...query,
    flags: query.data ?? storeFlags,
    isFeatureEnabled: (name: string) => Boolean((query.data ?? storeFlags)[name]),
  };
}

/**
 * Hook to reactively observe a single feature flag's state
 */
export function useFeatureFlag(name: string): boolean {
  return useFeatureFlagStore((state) => Boolean(state.flags[name]));
}

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchRemoteConfig } from '@/services/api/config.api';
import { RemoteConfig } from '@/services/api/types';
import { useRemoteConfigStore } from '@/store/remoteConfig.store';

export const CONFIG_QUERY_KEY = ['remoteConfig'] as const;

export function useConfig() {
  const storeConfig = useRemoteConfigStore((state) => state.config);
  const setConfig = useRemoteConfigStore((state) => state.setConfig);

  const query = useQuery<RemoteConfig>({
    queryKey: CONFIG_QUERY_KEY,
    queryFn: fetchRemoteConfig,
    initialData: storeConfig,
    staleTime: 1000 * 60 * 15, // 15 minutes
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });

  useEffect(() => {
    if (query.data) {
      setConfig(query.data);
    }
  }, [query.data, setConfig]);

  return {
    ...query,
    config: query.data ?? storeConfig,
  };
}

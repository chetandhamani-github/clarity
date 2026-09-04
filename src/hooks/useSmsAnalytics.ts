import { useEffect } from 'react';
import { useSmsStore } from '@/store/useSmsStore';

export function useSmsAnalytics() {
  const analytics = useSmsStore((state) => state.analytics);
  const refreshAnalytics = useSmsStore((state) => state.refreshAnalytics);

  useEffect(() => {
    refreshAnalytics();
  }, [refreshAnalytics]);

  return {
    analytics,
    refresh: refreshAnalytics,
  };
}

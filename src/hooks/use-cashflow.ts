import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/store/use-app-store';
import { calculateSafeToSpend } from '@/services/cashflow/cashflow-engine';
import type { SafeToSpendSummary } from '@/types';

export function useSafeToSpend(customPayday?: number, customBuffer?: number) {
  const storedPayday = useAppStore((state) => state.paydayDayOfMonth);
  const storedBuffer = useAppStore((state) => state.safetyBufferAmount);

  const payday = customPayday !== undefined ? customPayday : storedPayday || 1;
  const buffer = customBuffer !== undefined ? customBuffer : storedBuffer !== undefined ? storedBuffer : 2000;

  const { data, isLoading, refetch } = useQuery<SafeToSpendSummary>({
    queryKey: ['safeToSpend', payday, buffer],
    queryFn: () => calculateSafeToSpend(payday, buffer),
  });

  return {
    summary: data || null,
    isLoading,
    refetch,
  };
}

export function useInvalidateCashflow() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['safeToSpend'] });
  };
}


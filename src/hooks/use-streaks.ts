import { useQuery, useQueryClient } from '@tanstack/react-query';
import { calculateSpendingStreaks, type StreakMetrics } from '@/services/retention/streak-service';

export function useStreaks(dailyBudgetLimit?: number) {
  const { data, isLoading, refetch } = useQuery<StreakMetrics>({
    queryKey: ['spendingStreaks', dailyBudgetLimit],
    queryFn: () => calculateSpendingStreaks(dailyBudgetLimit),
  });

  return {
    streaks: data || null,
    isLoading,
    refetch,
  };
}

export function useInvalidateStreaks() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['spendingStreaks'] });
  };
}


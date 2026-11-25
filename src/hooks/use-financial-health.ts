import { useQuery, type QueryClient } from '@tanstack/react-query';
import {
  computeFinancialHealthScore,
  FinancialHealthReport,
} from '@/services/analytics/financial-health-engine';

export const FINANCIAL_HEALTH_QUERY_KEY = ['financial_health_report'] as const;

export function invalidateAnalyticsAndHealthQueries(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: FINANCIAL_HEALTH_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: ['aiDigest'] });
  queryClient.invalidateQueries({ queryKey: ['active_debt_list'] });
  queryClient.invalidateQueries({ queryKey: ['safeToSpend'] });
}

export function useFinancialHealth(month?: number, year?: number) {
  const now = new Date();
  const targetMonth = month ?? now.getMonth() + 1;
  const targetYear = year ?? now.getFullYear();

  const query = useQuery<FinancialHealthReport>({
    queryKey: [...FINANCIAL_HEALTH_QUERY_KEY, targetMonth, targetYear],
    queryFn: () => computeFinancialHealthScore({ month: targetMonth, year: targetYear }),
  });

  return {
    report: query.data || null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

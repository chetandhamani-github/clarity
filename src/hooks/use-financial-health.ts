import { useQuery } from '@tanstack/react-query';
import {
  computeFinancialHealthScore,
  FinancialHealthReport,
} from '@/services/analytics/financial-health-engine';

export const FINANCIAL_HEALTH_QUERY_KEY = ['financial_health_report'];

export function useFinancialHealth() {
  const query = useQuery({
    queryKey: FINANCIAL_HEALTH_QUERY_KEY,
    queryFn: computeFinancialHealthScore,
  });

  return {
    report: query.data || null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

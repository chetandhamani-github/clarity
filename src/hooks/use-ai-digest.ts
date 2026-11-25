import { useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMonthlyAiDigest } from '@/services/api/ai.api';
import { isNetworkError } from '@/services/network/network.service';
import { useNetworkStore } from '@/store/use-network-store';
import { getCurrencySymbol } from '@/utils/format';
import type { FinancialHealthReport } from '@/services/analytics/financial-health-engine';
import type { BudgetPlan, CategorySpending, MonthlyTotals } from '@/types';
import type { MonthlyDigestResult } from '@/services/api/types';

export interface UseMonthlyAiDigestParams {
  month: number;
  year: number;
  totals: MonthlyTotals;
  budgetPlan: BudgetPlan | null;
  spending: CategorySpending[];
  healthReport: FinancialHealthReport | null;
  isDataReady: boolean;
}

export interface MonthlyDigestInputs {
  effectiveIncome: number;
  plannedIncome: number;
  expenses: number;
  hasActivity: boolean;
  topCategories: string[];
  needsPercent: number;
  wantsPercent: number;
  savingsPercent: number;
  currencySymbol: string;
  canonicalHealthScore?: number;
  healthSummary?: string;
}

export function buildMonthlyDigestInputs(
  totals: MonthlyTotals,
  budgetPlan: BudgetPlan | null,
  spending: CategorySpending[],
  healthReport: FinancialHealthReport | null,
  currencySymbol: string = getCurrencySymbol()
): MonthlyDigestInputs {
  const recordedIncome = Math.max(0, totals.income);
  const plannedIncome =
    budgetPlan && budgetPlan.monthlyIncome > 0 ? budgetPlan.monthlyIncome : 0;
  const effectiveIncome = Math.max(recordedIncome, plannedIncome);
  const expenses = Math.max(0, totals.expenses);
  const hasActivity = effectiveIncome > 0 || expenses > 0;

  const sortedActive = [...spending]
    .filter((s) => s.spent > 0)
    .sort((a, b) => b.spent - a.spent);

  const topCategories = sortedActive
    .slice(0, 3)
    .map((s) => `${s.category}: ${Math.round(s.spent)}`);

  let needsSpent = 0;
  let wantsSpent = 0;
  for (const item of spending) {
    if (item.bucketType === 'needs') needsSpent += item.spent;
    else if (item.bucketType === 'wants') wantsSpent += item.spent;
  }

  const denominator = effectiveIncome > 0 ? effectiveIncome : expenses;
  const needsPercent =
    denominator > 0 ? Math.round((needsSpent / denominator) * 1000) / 10 : 0;
  const wantsPercent =
    denominator > 0 ? Math.round((wantsSpent / denominator) * 1000) / 10 : 0;
  const savingsPercent =
    effectiveIncome > 0
      ? Math.max(0, Math.round(((effectiveIncome - expenses) / effectiveIncome) * 1000) / 10)
      : 0;

  const healthSummary = healthReport
    ? `Score ${healthReport.overallScore}/100 (${healthReport.grade}); Runway: ${healthReport.pillars.runway.metricValue}; Savings: ${healthReport.pillars.savingsRate.metricValue}; Credit Util: ${healthReport.pillars.creditUtilization.metricValue}; DTI: ${healthReport.pillars.debtBurden.metricValue}; Spend/Income: ${healthReport.pillars.budgetAdherence.metricValue}`
    : undefined;

  return {
    effectiveIncome,
    plannedIncome,
    expenses,
    hasActivity,
    topCategories,
    needsPercent,
    wantsPercent,
    savingsPercent,
    currencySymbol,
    canonicalHealthScore: healthReport?.overallScore,
    healthSummary,
  };
}

export function deriveDigestViewState(params: {
  hasActivity: boolean;
  isDataReady: boolean;
  isConnected: boolean;
  isCheckingNetwork: boolean;
  queryData: MonthlyDigestResult | undefined;
  queryIsLoading: boolean;
  queryIsFetching: boolean;
  queryIsError: boolean;
  queryError: unknown;
}) {
  const digest = params.hasActivity ? (params.queryData ?? null) : null;
  const isLoading =
    params.isDataReady &&
    params.hasActivity &&
    params.isConnected &&
    (params.queryIsLoading || (params.queryIsFetching && !params.queryData));

  const isOffline =
    params.hasActivity &&
    !digest &&
    (!params.isConnected || (params.queryIsError && isNetworkError(params.queryError)));

  const isError = params.hasActivity && !digest && params.queryIsError && !isOffline;

  return {
    digest,
    isLoading,
    isRetrying: params.isCheckingNetwork || params.queryIsFetching,
    isOffline,
    isError,
    hasActivity: params.hasActivity,
  };
}

export function useMonthlyAiDigest({
  month,
  year,
  totals,
  budgetPlan,
  spending,
  healthReport,
  isDataReady,
}: UseMonthlyAiDigestParams) {
  const isConnected = useNetworkStore((state) => state.isConnected);
  const isCheckingNetwork = useNetworkStore((state) => state.isChecking);
  const checkConnection = useNetworkStore((state) => state.checkConnection);

  const digestInputs = useMemo(
    () => buildMonthlyDigestInputs(totals, budgetPlan, spending, healthReport),
    [totals, budgetPlan, spending, healthReport]
  );

  const query = useQuery<MonthlyDigestResult>({
    queryKey: [
      'aiDigest',
      month,
      year,
      digestInputs.effectiveIncome,
      digestInputs.plannedIncome,
      digestInputs.expenses,
      digestInputs.canonicalHealthScore ?? null,
      digestInputs.topCategories.join('|'),
      digestInputs.needsPercent,
      digestInputs.wantsPercent,
      digestInputs.savingsPercent,
      digestInputs.currencySymbol,
    ],
    enabled: isDataReady && digestInputs.hasActivity && isConnected,
    retry: false,
    queryFn: () =>
      fetchMonthlyAiDigest({
        month,
        year,
        totalIncome: digestInputs.effectiveIncome,
        totalExpenses: digestInputs.expenses,
        plannedIncome: digestInputs.plannedIncome > 0 ? digestInputs.plannedIncome : undefined,
        currencySymbol: digestInputs.currencySymbol,
        canonicalHealthScore: digestInputs.canonicalHealthScore,
        healthSummary: digestInputs.healthSummary,
        topCategories: digestInputs.topCategories,
        needsPercent: digestInputs.needsPercent,
        wantsPercent: digestInputs.wantsPercent,
        savingsPercent: digestInputs.savingsPercent,
      }),
  });

  const refetchDigest = query.refetch;
  const retry = useCallback(async () => {
    const online = await checkConnection();
    if (online && isDataReady && digestInputs.hasActivity) {
      await refetchDigest();
    }
  }, [checkConnection, isDataReady, digestInputs.hasActivity, refetchDigest]);

  const viewState = deriveDigestViewState({
    hasActivity: digestInputs.hasActivity,
    isDataReady,
    isConnected,
    isCheckingNetwork,
    queryData: query.data,
    queryIsLoading: query.isLoading,
    queryIsFetching: query.isFetching,
    queryIsError: query.isError,
    queryError: query.error,
  });

  return {
    ...viewState,
    retry,
  };
}

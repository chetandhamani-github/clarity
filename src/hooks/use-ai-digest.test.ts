import { buildMonthlyDigestInputs, deriveDigestViewState } from './use-ai-digest';
import { ApiError } from '@/services/api/client';
import type { FinancialHealthReport } from '@/services/analytics/financial-health-engine';

const mockHealthReport = {
  overallScore: 77,
  grade: 'Strong',
  gradeColor: '#3B82F6',
  headline: 'Resilient & Healthy',
  summary: 'Good',
  month: 11,
  year: 2026,
  recordedIncome: 0,
  effectiveIncome: 80000,
  monthlyExpenses: 40000,
  pillars: {
    runway: { metricValue: '60 Days' },
    savingsRate: { metricValue: '50%' },
    creditUtilization: { metricValue: '10%' },
    debtBurden: { metricValue: '5%' },
    budgetAdherence: { metricValue: '50%' },
  },
  actionableTips: [],
} as unknown as FinancialHealthReport;

describe('buildMonthlyDigestInputs', () => {
  it('computes effective income from budget plan fallback, canonical score, and 50/30/20 percentages', () => {
    const inputs = buildMonthlyDigestInputs(
      { income: 0, expenses: 40000 },
      {
        id: 'bp-1',
        monthlyIncome: 80000,
        needsPercent: 50,
        wantsPercent: 30,
        savingsPercent: 20,
        month: 11,
        year: 2026,
      },
      [
        { category: 'Rent', icon: 'house', limit: 30000, spent: 24000, bucketType: 'needs' },
        { category: 'Dining', icon: 'restaurant', limit: 15000, spent: 16000, bucketType: 'wants' },
      ],
      mockHealthReport,
      '₹'
    );

    expect(inputs.effectiveIncome).toBe(80000);
    expect(inputs.plannedIncome).toBe(80000);
    expect(inputs.canonicalHealthScore).toBe(77);
    expect(inputs.needsPercent).toBe(30);
    expect(inputs.wantsPercent).toBe(20);
    expect(inputs.savingsPercent).toBe(50);
    expect(inputs.topCategories).toEqual(['Rent: 24000', 'Dining: 16000']);
    expect(inputs.hasActivity).toBe(true);
  });

  it('marks hasActivity false when effective income and expenses are both 0', () => {
    const inputs = buildMonthlyDigestInputs({ income: 0, expenses: 0 }, null, [], null, '₹');
    expect(inputs.hasActivity).toBe(false);
  });
});

describe('deriveDigestViewState', () => {
  it('clears previous cached digest when switching to an empty month even if offline', () => {
    const state = deriveDigestViewState({
      hasActivity: false,
      isDataReady: true,
      isConnected: false,
      isCheckingNetwork: false,
      queryData: {
        headline: 'Old Month',
        savingsAssessment: 'Old',
        insights: [],
        actionableTips: [],
        financialHealthScore: 80,
      },
      queryIsLoading: false,
      queryIsFetching: false,
      queryIsError: false,
      queryError: null,
    });

    expect(state.digest).toBeNull();
    expect(state.isOffline).toBe(false);
    expect(state.isError).toBe(false);
  });

  it('returns offline state immediately when offline with activity', () => {
    const state = deriveDigestViewState({
      hasActivity: true,
      isDataReady: true,
      isConnected: false,
      isCheckingNetwork: false,
      queryData: undefined,
      queryIsLoading: false,
      queryIsFetching: false,
      queryIsError: false,
      queryError: null,
    });

    expect(state.isOffline).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(state.isError).toBe(false);
  });

  it('distinguishes online server errors from offline state', () => {
    const state = deriveDigestViewState({
      hasActivity: true,
      isDataReady: true,
      isConnected: true,
      isCheckingNetwork: false,
      queryData: undefined,
      queryIsLoading: false,
      queryIsFetching: false,
      queryIsError: true,
      queryError: new ApiError('Internal Server Error', 500),
    });

    expect(state.isError).toBe(true);
    expect(state.isOffline).toBe(false);
  });
});

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getActiveDebtList,
  calculateDebtComparison,
  DebtItem,
  DebtPayoffComparison,
} from '@/services/debt/debt-payoff-service';

export const DEBT_LIST_QUERY_KEY = ['active_debt_list'];

export function useDebtPayoff(initialExtraPayment: number = 2000) {
  const [extraPayment, setExtraPayment] = useState<number>(initialExtraPayment);
  const [customDebts, setCustomDebts] = useState<DebtItem[] | null>(null);

  const query = useQuery({
    queryKey: DEBT_LIST_QUERY_KEY,
    queryFn: getActiveDebtList,
  });

  const debts = useMemo(() => {
    if (customDebts) return customDebts;
    return query.data || [];
  }, [customDebts, query.data]);

  const comparison: DebtPayoffComparison | null = useMemo(() => {
    if (debts.length === 0) return null;
    return calculateDebtComparison(debts, extraPayment);
  }, [debts, extraPayment]);

  const updateDebtItem = (id: string, patch: Partial<DebtItem>) => {
    setCustomDebts((prev) => {
      const base = prev || query.data || [];
      return base.map((d) => (d.id === id ? { ...d, ...patch } : d));
    });
  };

  const resetCustomDebts = () => {
    setCustomDebts(null);
  };

  return {
    debts,
    comparison,
    extraPayment,
    setExtraPayment,
    updateDebtItem,
    resetCustomDebts,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

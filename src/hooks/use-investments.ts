import {
  deleteInvestmentHolding,
  getAllInvestmentHoldings,
  getInvestmentHoldingById,
  getInvestmentMaturityCalendar,
  getPortfolioSummary,
  insertInvestmentHolding,
  updateInvestmentHolding,
} from '@/services/database/investment-dao';
import type { InvestmentHolding, InvestmentMaturityItem, PortfolioSummary } from '@/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useAccounts } from './use-accounts';

export function useInvestments() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['investments'],
    queryFn: () => getAllInvestmentHoldings(),
  });

  return { holdings: data || [], isLoading, refetch };
}

export function useInvestment(id: string | undefined) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['investments', id],
    queryFn: () => getInvestmentHoldingById(id as string),
    enabled: !!id,
  });

  return { holding: data || null, isLoading, refetch };
}

export function usePortfolioSummary() {
  const { accounts } = useAccounts();

  // Create an order-independent fingerprint of account balances
  const accountsBalanceKey = useMemo(() => {
    if (!accounts || accounts.length === 0) return 'empty';
    return accounts
      .map((a) => `${a.id}:${a.balance}`)
      .sort()
      .join('|');
  }, [accounts]);

  const { data, isLoading, refetch } = useQuery<PortfolioSummary>({
    queryKey: ['portfolioSummary', accountsBalanceKey],
    queryFn: () => getPortfolioSummary(accounts),
    enabled: !!accounts,
    placeholderData: (previousData) => previousData,
  });

  return { summary: data || null, isLoading, refetch };
}

export function useInvestmentMaturityCalendar() {
  const { data, isLoading, refetch } = useQuery<InvestmentMaturityItem[]>({
    queryKey: ['investmentMaturityCalendar'],
    queryFn: () => getInvestmentMaturityCalendar(),
  });

  return { calendar: data || [], isLoading, refetch };
}

export function useCreateInvestmentHolding() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: Omit<InvestmentHolding, 'id' | 'createdAt' | 'updatedAt'>) =>
      insertInvestmentHolding(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments'] });
      queryClient.invalidateQueries({ queryKey: ['portfolioSummary'] });
      queryClient.invalidateQueries({ queryKey: ['investmentMaturityCalendar'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  return {
    mutate: (
      data: Omit<InvestmentHolding, 'id' | 'createdAt' | 'updatedAt'>,
      options?: { onSuccess?: () => void; onError?: (error: Error) => void }
    ) => {
      mutation.mutate(data, { onSuccess: options?.onSuccess, onError: options?.onError });
    },
    isPending: mutation.isPending,
  };
}

export function useUpdateInvestmentHolding() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<Omit<InvestmentHolding, 'id' | 'createdAt'>>;
    }) => updateInvestmentHolding(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments'] });
      queryClient.invalidateQueries({ queryKey: ['portfolioSummary'] });
      queryClient.invalidateQueries({ queryKey: ['investmentMaturityCalendar'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  return {
    mutate: (
      arg1: string | { id: string; data: Partial<Omit<InvestmentHolding, 'id' | 'createdAt'>> },
      arg2?:
        | Partial<Omit<InvestmentHolding, 'id' | 'createdAt'>>
        | { onSuccess?: () => void; onError?: (error: Error) => void },
      arg3?: { onSuccess?: () => void; onError?: (error: Error) => void }
    ) => {
      if (typeof arg1 === 'object') {
        const options = arg2 as { onSuccess?: () => void; onError?: (error: Error) => void } | undefined;
        mutation.mutate(arg1, {
          onSuccess: options?.onSuccess,
          onError: options?.onError,
        });
      } else {
        mutation.mutate(
          { id: arg1, data: arg2 as Partial<Omit<InvestmentHolding, 'id' | 'createdAt'>> },
          { onSuccess: arg3?.onSuccess, onError: arg3?.onError }
        );
      }
    },
    isPending: mutation.isPending,
  };
}

export function useDeleteInvestmentHolding() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (id: string) => deleteInvestmentHolding(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments'] });
      queryClient.invalidateQueries({ queryKey: ['portfolioSummary'] });
      queryClient.invalidateQueries({ queryKey: ['investmentMaturityCalendar'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  return {
    mutate: (id: string, options?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
      mutation.mutate(id, { onSuccess: options?.onSuccess, onError: options?.onError });
    },
    isPending: mutation.isPending,
  };
}

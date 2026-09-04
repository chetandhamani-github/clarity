import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  deleteTransaction as deleteTransactionDao,
  getAccountHistory,
  getMonthlyReports,
  getMonthlyTotals,
  getNetWorthHistory,
  getRecurringTransactions,
  getTopMerchants,
  getTransactionById,
  getTransactions,
  insertTransaction,
  updateTransaction as updateTransactionDao,
  type HistoryPoint,
} from '@/services/database/transaction-dao';
import {
  createRecurringTransaction,
  getActiveRecurringTransactions,
  deleteRecurringTransaction,
  toggleRecurringTransactionActive,
} from '@/services/database/recurring-dao';
import { queueAutoBackup } from '@/services/cloud/google-drive-service';
import type {
  MonthlyTotals,
  Transaction,
  TransactionFilters,
  TransactionWithAccount,
} from '@/types';

export function useTransactions(filters?: TransactionFilters) {
  // Stringify filters to use safely in the queryKey
  const filtersString = JSON.stringify(filters || {});

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['transactions', 'list', filtersString],
    queryFn: () => {
      const parsedFilters = filters ? JSON.parse(filtersString) : undefined;
      return getTransactions(parsedFilters);
    },
  });

  return { transactions: data || [], isLoading, refetch };
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: Omit<Transaction, 'id'>) => insertTransaction(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['categorySpending'] });
      queryClient.invalidateQueries({ queryKey: ['budgetPlan'] });
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queueAutoBackup('create-transaction');
    },
  });

  return {
    mutate: (data: Omit<Transaction, 'id'>, options?: { onSuccess?: () => void }) => {
      mutation.mutate(data, { onSuccess: options?.onSuccess });
    },
    isPending: mutation.isPending,
  };
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Omit<Transaction, 'id'>> }) =>
      updateTransactionDao(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['categorySpending'] });
      queryClient.invalidateQueries({ queryKey: ['budgetPlan'] });
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queueAutoBackup('update-transaction');
    },
  });

  return {
    mutate: (
      id: string,
      data: Partial<Omit<Transaction, 'id'>>,
      options?: { onSuccess?: () => void }
    ) => {
      mutation.mutate({ id, data }, { onSuccess: options?.onSuccess });
    },
    isPending: mutation.isPending,
  };
}

export function useTransaction(id: string | undefined) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['transactions', 'detail', id],
    queryFn: () => getTransactionById(id as string),
    enabled: !!id,
  });

  return { transaction: data || null, isLoading, refetch };
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (id: string) => deleteTransactionDao(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['categorySpending'] });
      queryClient.invalidateQueries({ queryKey: ['budgetPlan'] });
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queueAutoBackup('delete-transaction');
    },
  });

  return {
    mutate: (id: string, options?: { onSuccess?: () => void }) => {
      mutation.mutate(id, { onSuccess: options?.onSuccess });
    },
    isPending: mutation.isPending,
  };
}

export function useMonthlyTotals(month: number, year: number) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['transactions', 'monthlyTotals', month, year],
    queryFn: () => getMonthlyTotals(month, year),
  });

  return { totals: data || { income: 0, expenses: 0 }, isLoading, refetch };
}

export function useMonthlyReports() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['transactions', 'monthlyReports'],
    queryFn: () => getMonthlyReports(),
  });

  return { reports: data || [], isLoading, refetch };
}

export function useTopMerchants(month: number, year: number, limit = 5) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['transactions', 'topMerchants', month, year, limit],
    queryFn: () => getTopMerchants(month, year, limit),
  });

  return { merchants: data || [], isLoading, refetch };
}

export function useRecurringTransactions() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['transactions', 'recurring'],
    queryFn: () => getActiveRecurringTransactions(),
  });

  return { transactions: data || [], isLoading, refetch };
}

export function useCreateRecurringTransaction() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: any) => createRecurringTransaction(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions', 'recurring'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queueAutoBackup('recurring-create');
    },
  });

  return {
    mutate: (data: any, options?: { onSuccess?: () => void }) => {
      mutation.mutate(data, { onSuccess: options?.onSuccess });
    },
    isPending: mutation.isPending,
  };
}

export function useDeleteRecurringTransaction() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (id: string) => deleteRecurringTransaction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions', 'recurring'] });
      queueAutoBackup('recurring-delete');
    },
  });

  return {
    mutate: (id: string, options?: { onSuccess?: () => void }) => {
      mutation.mutate(id, { onSuccess: options?.onSuccess });
    },
    isPending: mutation.isPending,
  };
}

export function useToggleRecurringTransaction() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      toggleRecurringTransactionActive(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions', 'recurring'] });
      queueAutoBackup('recurring-toggle');
    },
  });

  return {
    mutate: (
      params: { id: string; isActive: boolean },
      options?: { onSuccess?: () => void }
    ) => {
      mutation.mutate(params, { onSuccess: options?.onSuccess });
    },
    isPending: mutation.isPending,
  };
}

export function useNetWorthHistory(days: number = 30) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['transactions', 'netWorthHistory', days],
    queryFn: () => getNetWorthHistory(days),
  });

  return { history: data || [], isLoading, refetch };
}

export function useAccountHistory(accountId: string, days: number = 30) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['transactions', 'accountHistory', accountId, days],
    queryFn: () => getAccountHistory(accountId, days),
    enabled: !!accountId,
  });

  return { history: data || [], isLoading, refetch };
}

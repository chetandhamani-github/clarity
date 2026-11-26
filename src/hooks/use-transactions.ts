import { useMemo } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteTransaction as deleteTransactionDao,
  bulkDeleteTransactions,
  bulkUpdateCategory,
  bulkUpdateAccount,
  getAccountHistory,
  getDateRangeTotals,
  getMonthlyDailyTotals,
  getMonthlyReports,
  getMonthlyTotals,
  getNetWorthHistory,
  getRecurringTransactions,
  getTopMerchants,
  getTransactionById,
  getTransactions,
  getTransactionsCount,
  insertTransaction,
  updateTransaction as updateTransactionDao,
  type HistoryPoint,
} from '@/services/database/transaction-dao';
import {
  createRecurringTransaction,
  getActiveRecurringTransactions,
  getAllRecurringTransactions,
  deleteRecurringTransaction,
  toggleRecurringTransactionActive,
} from '@/services/database/recurring-dao';
import { queueAutoBackup } from '@/services/cloud/google-drive-service';
import { invalidateAnalyticsAndHealthQueries } from '@/hooks/use-financial-health';
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

export function usePaginatedTransactions(
  filters?: Omit<TransactionFilters, 'limit' | 'offset'>,
  pageSize = 50,
  enabled = true
) {
  const filtersString = JSON.stringify(filters || {});

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['transactions', 'paginated', filtersString, pageSize],
    initialPageParam: 0,
    enabled,
    queryFn: async ({ pageParam }) => {
      const parsedFilters = filters ? (JSON.parse(filtersString) as TransactionFilters) : {};
      const [items, totalCount] = await Promise.all([
        getTransactions({ ...parsedFilters, limit: pageSize, offset: pageParam }),
        pageParam === 0 ? getTransactionsCount(parsedFilters) : Promise.resolve<number | null>(null),
      ]);
      return {
        items,
        totalCount,
        nextOffset: pageParam + items.length,
      };
    },
    getNextPageParam: (lastPage) =>
      lastPage.items.length < pageSize ? undefined : lastPage.nextOffset,
  });

  const transactions = useMemo(() => {
    if (!data?.pages) return [];
    const seenIds = new Set<string>();
    const combined: TransactionWithAccount[] = [];
    for (const page of data.pages) {
      for (const tx of page.items) {
        if (!seenIds.has(tx.id)) {
          seenIds.add(tx.id);
          combined.push(tx);
        }
      }
    }
    return combined;
  }, [data?.pages]);

  const totalCount = data?.pages?.[0]?.totalCount ?? transactions.length;

  return {
    transactions,
    totalCount,
    isLoading,
    isFetchingNextPage,
    hasNextPage: Boolean(hasNextPage),
    fetchNextPage,
    refetch,
  };
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
      invalidateAnalyticsAndHealthQueries(queryClient);
      queueAutoBackup('create-transaction');
    },
  });

  return {
    mutate: (
      data: Omit<Transaction, 'id'>,
      options?: { onSuccess?: () => void; onError?: (error: Error) => void }
    ) => {
      mutation.mutate(data, { onSuccess: options?.onSuccess, onError: options?.onError });
    },
    mutateAsync: (data: Omit<Transaction, 'id'>) => mutation.mutateAsync(data),
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
      invalidateAnalyticsAndHealthQueries(queryClient);
      queueAutoBackup('update-transaction');
    },
  });

  return {
    mutate: (
      id: string,
      data: Partial<Omit<Transaction, 'id'>>,
      options?: { onSuccess?: () => void; onError?: (error: Error) => void }
    ) => {
      mutation.mutate({ id, data }, { onSuccess: options?.onSuccess, onError: options?.onError });
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
      invalidateAnalyticsAndHealthQueries(queryClient);
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

export function useBulkDeleteTransactions() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (ids: string[]) => bulkDeleteTransactions(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['categorySpending'] });
      queryClient.invalidateQueries({ queryKey: ['budgetPlan'] });
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      invalidateAnalyticsAndHealthQueries(queryClient);
      queueAutoBackup('bulk-delete-transactions');
    },
  });

  return {
    mutate: (
      ids: string[],
      options?: { onSuccess?: () => void; onError?: (error: unknown) => void }
    ) => {
      mutation.mutate(ids, {
        onSuccess: options?.onSuccess,
        onError: options?.onError,
      });
    },
    isPending: mutation.isPending,
  };
}

export function useBulkUpdateCategory() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ ids, category }: { ids: string[]; category: string }) =>
      bulkUpdateCategory(ids, category),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['categorySpending'] });
      queryClient.invalidateQueries({ queryKey: ['budgetPlan'] });
      invalidateAnalyticsAndHealthQueries(queryClient);
      queueAutoBackup('bulk-update-category');
    },
  });

  return {
    mutate: (
      params: { ids: string[]; category: string },
      options?: { onSuccess?: () => void; onError?: (error: unknown) => void }
    ) => {
      mutation.mutate(params, {
        onSuccess: options?.onSuccess,
        onError: options?.onError,
      });
    },
    isPending: mutation.isPending,
  };
}

export function useBulkUpdateAccount() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ ids, accountId }: { ids: string[]; accountId: string }) =>
      bulkUpdateAccount(ids, accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      invalidateAnalyticsAndHealthQueries(queryClient);
      queueAutoBackup('bulk-update-account');
    },
  });

  return {
    mutate: (
      params: { ids: string[]; accountId: string },
      options?: { onSuccess?: () => void; onError?: (error: unknown) => void }
    ) => {
      mutation.mutate(params, {
        onSuccess: options?.onSuccess,
        onError: options?.onError,
      });
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

export function useMonthlyDailyTotals(
  month: number,
  year: number,
  filters?: Omit<TransactionFilters, 'limit' | 'offset' | 'dateFrom' | 'dateTo'>,
  enabled = true
) {
  const filtersString = JSON.stringify(filters || {});

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['transactions', 'monthlyDailyTotals', month, year, filtersString],
    queryFn: () => {
      const parsedFilters = filters ? (JSON.parse(filtersString) as TransactionFilters) : undefined;
      return getMonthlyDailyTotals(month, year, parsedFilters);
    },
    enabled,
  });

  const dailyMap = useMemo(() => {
    const map: Record<string, (typeof rows)[number]> = {};
    const rows = data || [];
    for (const row of rows) {
      map[row.date] = row;
    }
    return map;
  }, [data]);

  return { dailyTotals: data || [], dailyMap, isLoading, refetch };
}

export function useDateRangeTotals(
  filters?: Omit<TransactionFilters, 'limit' | 'offset'>,
  enabled = true
) {
  const filtersString = JSON.stringify(filters || {});

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', 'dateRangeTotals', filtersString],
    queryFn: () => {
      const parsedFilters = filters
        ? (JSON.parse(filtersString) as Omit<TransactionFilters, 'limit' | 'offset'>)
        : undefined;
      return getDateRangeTotals(parsedFilters);
    },
    enabled,
  });

  return { rangeTotals: data || null, isLoading };
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

export function useAllRecurringTransactions(enabled = true) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['transactions', 'recurring', 'all'],
    queryFn: () => getAllRecurringTransactions(),
    enabled,
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
      queryClient.invalidateQueries({ queryKey: ['safeToSpend'] });
      invalidateAnalyticsAndHealthQueries(queryClient);
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
      queryClient.invalidateQueries({ queryKey: ['safeToSpend'] });
      invalidateAnalyticsAndHealthQueries(queryClient);
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
      queryClient.invalidateQueries({ queryKey: ['safeToSpend'] });
      invalidateAnalyticsAndHealthQueries(queryClient);
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

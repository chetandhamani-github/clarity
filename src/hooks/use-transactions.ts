import { useState, useEffect, useCallback } from 'react';
import type { Transaction, TransactionWithAccount, TransactionFilters, MonthlyTotals } from '@/types';
import {
  getTransactions,
  getTransactionById,
  insertTransaction,
  updateTransaction as updateTransactionDao,
  deleteTransaction as deleteTransactionDao,
  getMonthlyTotals,
  getMonthlyReports,
  getTopMerchants,
  getRecurringTransactions
} from '@/services/database/transaction-dao';

export function useTransactions(filters?: TransactionFilters) {
  const [transactions, setTransactions] = useState<TransactionWithAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // We stringify filters to safely use them as a dependency
  const filtersString = JSON.stringify(filters);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const parsedFilters = filtersString ? JSON.parse(filtersString) : undefined;
      const data = await getTransactions(parsedFilters);
      setTransactions(data);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [filtersString]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { transactions, isLoading, refetch };
}

export function useCreateTransaction() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (
      data: Omit<Transaction, 'id'>,
      options?: { onSuccess?: () => void },
    ) => {
      setIsPending(true);
      try {
        await insertTransaction(data);
        options?.onSuccess?.();
      } catch (error) {
        console.error('Failed to create transaction:', error);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [],
  );

  return { mutate, isPending };
}

export function useUpdateTransaction() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (
      id: string,
      data: Partial<Omit<Transaction, 'id'>>,
      options?: { onSuccess?: () => void },
    ) => {
      setIsPending(true);
      try {
        await updateTransactionDao(id, data);
        options?.onSuccess?.();
      } catch (error) {
        console.error('Failed to update transaction:', error);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [],
  );

  return { mutate, isPending };
}

export function useTransaction(id: string | undefined) {
  const [transaction, setTransaction] = useState<TransactionWithAccount | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!id) {
      setTransaction(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const data = await getTransactionById(id);
      setTransaction(data);
    } catch (error) {
      console.error('Failed to fetch transaction:', error);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { transaction, isLoading, refetch };
}

export function useDeleteTransaction() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (id: string, options?: { onSuccess?: () => void }) => {
      setIsPending(true);
      try {
        await deleteTransactionDao(id);
        options?.onSuccess?.();
      } catch (error) {
        console.error('Failed to delete transaction:', error);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [],
  );

  return { mutate, isPending };
}

export function useMonthlyTotals(month: number, year: number) {
  const [totals, setTotals] = useState<MonthlyTotals>({ income: 0, expenses: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getMonthlyTotals(month, year);
      setTotals(data);
    } catch (error) {
      console.error('Failed to fetch monthly totals:', error);
    } finally {
      setIsLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { totals, isLoading, refetch };
}

export function useMonthlyReports() {
  const [reports, setReports] = useState<{ datePrefix: string; income: number; expenses: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getMonthlyReports();
      setReports(data);
    } catch (error) {
      console.error('Failed to fetch monthly reports:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { reports, isLoading, refetch };
}

export function useTopMerchants(month: number, year: number, limit = 5) {
  const [merchants, setMerchants] = useState<{ merchant: string; total: number }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getTopMerchants(month, year, limit);
      setMerchants(data);
    } catch (error) {
      console.error('Failed to fetch top merchants:', error);
    } finally {
      setIsLoading(false);
    }
  }, [month, year, limit]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { merchants, isLoading, refetch };
}

export function useRecurringTransactions() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getRecurringTransactions();
      setTransactions(data);
    } catch (error) {
      console.error('Failed to fetch recurring transactions:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { transactions, isLoading, refetch };
}

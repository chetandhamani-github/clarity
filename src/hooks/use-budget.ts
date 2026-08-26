import { useState, useEffect, useCallback } from 'react';
import type { BudgetPlan, BudgetCategory, BucketType, CategorySpending } from '@/types';
import {
  getCurrentBudgetPlan,
  upsertBudgetPlan,
  getAllCategories,
  insertCategory,
  updateCategory,
  deleteCategory,
  getSpentByCategory,
} from '@/services/database/budget-dao';

export function useBudgetPlan() {
  const [plan, setPlan] = useState<BudgetPlan | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getCurrentBudgetPlan();
      setPlan(data);
    } catch (error) {
      console.error('Failed to fetch budget plan:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { plan, isLoading, refetch };
}

export function useUpdateBudgetPlan() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (
      data: Omit<BudgetPlan, 'id'>,
      options?: { onSuccess?: () => void },
    ) => {
      setIsPending(true);
      try {
        await upsertBudgetPlan(data);
        options?.onSuccess?.();
      } catch (error) {
        console.error('Failed to update budget plan:', error);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [],
  );

  return { mutate, isPending };
}

export function useCategories() {
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getAllCategories();
      setCategories(data);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { categories, isLoading, refetch };
}

export function useCreateCategory() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (
      data: Omit<BudgetCategory, 'id'>,
      options?: { onSuccess?: () => void },
    ) => {
      setIsPending(true);
      try {
        await insertCategory(data);
        options?.onSuccess?.();
      } catch (error) {
        console.error('Failed to create category:', error);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [],
  );

  return { mutate, isPending };
}

export function useUpdateCategory() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (
      id: string,
      data: Partial<Omit<BudgetCategory, 'id'>>,
      options?: { onSuccess?: () => void },
    ) => {
      setIsPending(true);
      try {
        await updateCategory(id, data);
        options?.onSuccess?.();
      } catch (error) {
        console.error('Failed to update category:', error);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [],
  );

  return { mutate, isPending };
}

export function useDeleteCategory() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (id: string, options?: { onSuccess?: () => void }) => {
      setIsPending(true);
      try {
        await deleteCategory(id);
        options?.onSuccess?.();
      } catch (error) {
        console.error('Failed to delete category:', error);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [],
  );

  return { mutate, isPending };
}

export function useCategorySpending(month: number, year: number) {
  const [spending, setSpending] = useState<CategorySpending[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const categories = await getAllCategories();
      const spentDict = await getSpentByCategory(month, year);

      const spendingData: CategorySpending[] = categories.map(cat => ({
        category: cat.name,
        icon: cat.icon,
        limit: cat.limit,
        spent: spentDict[cat.name] || 0,
        bucketType: cat.bucketType,
      }));

      setSpending(spendingData);
    } catch (error) {
      console.error('Failed to fetch category spending:', error);
    } finally {
      setIsLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { spending, isLoading, refetch };
}

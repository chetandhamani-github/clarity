import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['budgetPlan'],
    queryFn: () => getCurrentBudgetPlan(),
  });

  return { plan: data || null, isLoading, refetch };
}

export function useUpdateBudgetPlan() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: Omit<BudgetPlan, 'id'>) => upsertBudgetPlan(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgetPlan'] });
    },
  });

  return { 
    mutate: (data: Omit<BudgetPlan, 'id'>, options?: { onSuccess?: () => void }) => {
      mutation.mutate(data, { onSuccess: options?.onSuccess });
    }, 
    isPending: mutation.isPending 
  };
}

export function useCategories() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['categories'],
    queryFn: () => getAllCategories(),
  });

  return { categories: data || [], isLoading, refetch };
}

export function useCreateCategory() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: Omit<BudgetCategory, 'id'>) => insertCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['categorySpending'] });
    },
  });

  return { 
    mutate: (data: Omit<BudgetCategory, 'id'>, options?: { onSuccess?: () => void }) => {
      mutation.mutate(data, { onSuccess: options?.onSuccess });
    }, 
    isPending: mutation.isPending 
  };
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Omit<BudgetCategory, 'id'>> }) => 
      updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['categorySpending'] });
    },
  });

  return { 
    mutate: (id: string, data: Partial<Omit<BudgetCategory, 'id'>>, options?: { onSuccess?: () => void }) => {
      mutation.mutate({ id, data }, { onSuccess: options?.onSuccess });
    }, 
    isPending: mutation.isPending 
  };
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['categorySpending'] });
    },
  });

  return { 
    mutate: (id: string, options?: { onSuccess?: () => void }) => {
      mutation.mutate(id, { onSuccess: options?.onSuccess });
    }, 
    isPending: mutation.isPending 
  };
}

export function useCategorySpending(month: number, year: number) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['categorySpending', month, year],
    queryFn: async () => {
      const categories = await getAllCategories();
      const spentDict = await getSpentByCategory(month, year);

      const spendingData: CategorySpending[] = categories.map(cat => ({
        category: cat.name,
        icon: cat.icon,
        limit: cat.limit,
        spent: spentDict[cat.name] || 0,
        bucketType: cat.bucketType,
      }));
      return spendingData;
    },
  });

  return { spending: data || [], isLoading, refetch };
}

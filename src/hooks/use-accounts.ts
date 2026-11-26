import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Account } from '@/types';
import {
  getAllAccounts,
  getAccountById,
  insertAccount,
  updateAccount as updateAccountDao,
  clearAccountData as clearAccountDataDao,
  deleteAccount as deleteAccountDao,
  updateAccountsOrder,
  getTotalBalance,
} from '@/services/database/account-dao';
import { queueAutoBackup } from '@/services/cloud/google-drive-service';
import { invalidateAnalyticsAndHealthQueries } from '@/hooks/use-financial-health';
import { useSmsStore } from '@/store/useSmsStore';

export function useAccounts() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => getAllAccounts(),
  });

  return { accounts: data || [], isLoading, refetch };
}

export function useAccount(id: string | undefined) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['accounts', id],
    queryFn: () => getAccountById(id as string),
    enabled: !!id,
  });

  return { account: data || null, isLoading, refetch };
}

export function useTotalBalance() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['accounts', 'totalBalance'],
    queryFn: () => getTotalBalance(),
  });

  return { total: data || 0, isLoading, refetch };
}

export function useCreateAccount() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: Omit<Account, 'id' | 'createdAt'>) => insertAccount(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      invalidateAnalyticsAndHealthQueries(queryClient);
      queueAutoBackup('create-account');
    },
  });

  return {
    mutate: (
      data: Omit<Account, 'id' | 'createdAt'>,
      options?: { onSuccess?: () => void; onError?: (error: Error) => void }
    ) => {
      mutation.mutate(data, { onSuccess: options?.onSuccess, onError: options?.onError });
    },
    isPending: mutation.isPending,
  };
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (id: string) => deleteAccountDao(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      invalidateAnalyticsAndHealthQueries(queryClient);
      queueAutoBackup('delete-account');
    },
  });

  return {
    mutate: (id: string, options?: { onSuccess?: () => void }) => {
      mutation.mutate(id, { onSuccess: options?.onSuccess });
    },
    isPending: mutation.isPending,
  };
}

export function useClearAccountData() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (id: string) => clearAccountDataDao(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['categorySpending'] });
      queryClient.invalidateQueries({ queryKey: ['budgetPlan'] });
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queryClient.invalidateQueries({ queryKey: ['goalContributions'] });
      queryClient.invalidateQueries({ queryKey: ['recurring'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation', id] });
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      queryClient.invalidateQueries({ queryKey: ['investments'] });
      queryClient.invalidateQueries({ queryKey: ['portfolioSummary'] });
      invalidateAnalyticsAndHealthQueries(queryClient);
      useSmsStore.getState().refreshAnalytics().catch(() => {});
      useSmsStore.getState().refreshReviewQueueCount().catch(() => {});
      queueAutoBackup('clear-account-data');
    },
  });

  return {
    mutate: (
      id: string,
      options?: { onSuccess?: () => void; onError?: (error: Error) => void }
    ) => {
      mutation.mutate(id, { onSuccess: options?.onSuccess, onError: options?.onError });
    },
    isPending: mutation.isPending,
  };
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Omit<Account, 'id' | 'createdAt'>> }) =>
      updateAccountDao(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      invalidateAnalyticsAndHealthQueries(queryClient);
      queueAutoBackup('update-account');
    },
  });

  return {
    mutate: (
      id: string,
      data: Partial<Omit<Account, 'id' | 'createdAt'>>,
      options?: { onSuccess?: () => void; onError?: (error: Error) => void }
    ) => {
      mutation.mutate({ id, data }, { onSuccess: options?.onSuccess, onError: options?.onError });
    },
    isPending: mutation.isPending,
  };
}

export function useReorderAccounts() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (orderedAccounts: Account[]) => {
      const ids = orderedAccounts.map((a) => a.id);
      return updateAccountsOrder(ids);
    },
    onMutate: async (newOrderedAccounts: Account[]) => {
      await queryClient.cancelQueries({ queryKey: ['accounts'] });
      const previousAccounts = queryClient.getQueryData<Account[]>(['accounts']);
      queryClient.setQueryData<Account[]>(['accounts'], newOrderedAccounts);
      return { previousAccounts };
    },
    onError: (_err, _newAccounts, context) => {
      if (context?.previousAccounts) {
        queryClient.setQueryData(['accounts'], context.previousAccounts);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queueAutoBackup('reorder-accounts');
    },
  });

  return {
    reorder: (orderedAccounts: Account[]) => mutation.mutate(orderedAccounts),
    isPending: mutation.isPending,
  };
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Account } from '@/types';
import {
  getAllAccounts,
  getAccountById,
  insertAccount,
  updateAccount as updateAccountDao,
  deleteAccount as deleteAccountDao,
  getTotalBalance,
} from '@/services/database/account-dao';

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
    },
  });

  return {
    mutate: (data: Omit<Account, 'id' | 'createdAt'>, options?: { onSuccess?: () => void }) => {
      mutation.mutate(data, { onSuccess: options?.onSuccess });
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
    },
  });

  return {
    mutate: (id: string, options?: { onSuccess?: () => void }) => {
      mutation.mutate(id, { onSuccess: options?.onSuccess });
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
    },
  });

  return {
    mutate: (
      id: string,
      data: Partial<Omit<Account, 'id' | 'createdAt'>>,
      options?: { onSuccess?: () => void }
    ) => {
      mutation.mutate({ id, data }, { onSuccess: options?.onSuccess });
    },
    isPending: mutation.isPending,
  };
}

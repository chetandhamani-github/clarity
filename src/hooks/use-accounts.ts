import { useState, useEffect, useCallback } from 'react';
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
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getAllAccounts();
      setAccounts(data);
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { accounts, isLoading, refetch };
}

export function useAccount(id: string | undefined) {
  const [account, setAccount] = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!id) {
      setAccount(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const data = await getAccountById(id);
      setAccount(data);
    } catch (error) {
      console.error('Failed to fetch account:', error);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { account, isLoading, refetch };
}

export function useTotalBalance() {
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const data = await getTotalBalance();
      setTotal(data);
    } catch (error) {
      console.error('Failed to fetch total balance:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { total, isLoading, refetch };
}

export function useCreateAccount() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (
      data: Omit<Account, 'id' | 'createdAt'>,
      options?: { onSuccess?: () => void },
    ) => {
      setIsPending(true);
      try {
        await insertAccount(data);
        options?.onSuccess?.();
      } catch (error) {
        console.error('Failed to create account:', error);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [],
  );

  return { mutate, isPending };
}

export function useDeleteAccount() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (id: string, options?: { onSuccess?: () => void }) => {
      setIsPending(true);
      try {
        await deleteAccountDao(id);
        options?.onSuccess?.();
      } catch (error) {
        console.error('Failed to delete account:', error);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [],
  );

  return { mutate, isPending };
}

export function useUpdateAccount() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (
      id: string,
      data: Partial<Omit<Account, 'id' | 'createdAt'>>,
      options?: { onSuccess?: () => void },
    ) => {
      setIsPending(true);
      try {
        await updateAccountDao(id, data);
        options?.onSuccess?.();
      } catch (error) {
        console.error('Failed to update account:', error);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [],
  );

  return { mutate, isPending };
}

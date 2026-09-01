import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as goalDao from '@/services/database/goal-dao';
import { queueAutoBackup } from '@/services/cloud/google-drive-service';
import type { Goal, GoalContribution } from '@/types';

export function useGoals() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['goals'],
    queryFn: () => goalDao.getGoals(),
  });

  return { goals: data || [], isLoading, refetch };
}

export function useGoal(id: string) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['goals', id],
    queryFn: () => goalDao.getGoalById(id),
    enabled: !!id,
  });

  return { goal: data || null, isLoading, refetch };
}

export function useGoalContributions(goalId: string) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['goalContributions', goalId],
    queryFn: () => goalDao.getGoalContributions(goalId),
    enabled: !!goalId,
  });

  return { contributions: data || [], isLoading, refetch };
}

export function useCreateGoal() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: Omit<Goal, 'id' | 'createdAt' | 'autoSaveAmount'>) =>
      goalDao.createGoal(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queueAutoBackup('create-goal');
    },
  });

  return {
    mutate: (
      data: Omit<Goal, 'id' | 'createdAt' | 'autoSaveAmount'>,
      options?: { onSuccess?: () => void }
    ) => {
      mutation.mutate(data, { onSuccess: options?.onSuccess });
    },
    isPending: mutation.isPending,
  };
}

export function useDeleteGoal() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (id: string) => goalDao.deleteGoal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queueAutoBackup('delete-goal');
    },
  });

  return {
    mutate: (id: string, options?: { onSuccess?: () => void }) => {
      mutation.mutate(id, { onSuccess: options?.onSuccess });
    },
    isPending: mutation.isPending,
  };
}

export function useAddGoalContribution() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({
      data,
      accountId,
    }: {
      data: Omit<GoalContribution, 'id'>;
      accountId?: string;
    }) => goalDao.addGoalContribution(data, accountId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queryClient.invalidateQueries({
        queryKey: ['goalContributions', variables.data.goalId],
      });
      if (variables.accountId) {
        queryClient.invalidateQueries({ queryKey: ['accounts'] });
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['categorySpending'] });
      }
      queueAutoBackup('contribute-goal');
    },
  });

  return {
    mutate: (
      variables: { data: Omit<GoalContribution, 'id'>; accountId?: string },
      options?: { onSuccess?: () => void }
    ) => {
      mutation.mutate(variables, { onSuccess: options?.onSuccess });
    },
    isPending: mutation.isPending,
  };
}

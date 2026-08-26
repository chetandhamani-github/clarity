import { useState, useEffect, useCallback } from 'react';
import * as goalDao from '@/services/database/goal-dao';
import type { Goal, GoalContribution } from '@/types';

export function useGoals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await goalDao.getGoals();
      setGoals(data);
    } catch (error) {
      console.error('Failed to fetch goals:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { goals, isLoading, refetch };
}

export function useGoal(id: string) {
  const [goal, setGoal] = useState<Goal | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    try {
      const data = await goalDao.getGoalById(id);
      setGoal(data);
    } catch (error) {
      console.error('Failed to fetch goal:', error);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { goal, isLoading, refetch };
}

export function useGoalContributions(goalId: string) {
  const [contributions, setContributions] = useState<GoalContribution[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!goalId) return;
    setIsLoading(true);
    try {
      const data = await goalDao.getGoalContributions(goalId);
      setContributions(data);
    } catch (error) {
      console.error('Failed to fetch goal contributions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [goalId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { contributions, isLoading, refetch };
}

export function useCreateGoal() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (
      data: Omit<Goal, 'id' | 'createdAt' | 'autoSaveAmount'>,
      options?: { onSuccess?: () => void },
    ) => {
      setIsPending(true);
      try {
        await goalDao.createGoal(data);
        options?.onSuccess?.();
      } catch (error) {
        console.error('Failed to create goal:', error);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [],
  );

  return { mutate, isPending };
}

export function useAddGoalContribution() {
  const [isPending, setIsPending] = useState(false);

  const mutate = useCallback(
    async (
      data: Omit<GoalContribution, 'id'>,
      options?: { onSuccess?: () => void },
    ) => {
      setIsPending(true);
      try {
        await goalDao.addGoalContribution(data);
        options?.onSuccess?.();
      } catch (error) {
        console.error('Failed to add goal contribution:', error);
        throw error;
      } finally {
        setIsPending(false);
      }
    },
    [],
  );

  return { mutate, isPending };
}

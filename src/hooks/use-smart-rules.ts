import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAllSmartRules,
  getSmartRuleById,
  saveSmartRule,
  toggleSmartRule,
  deleteSmartRule,
} from '@/services/database/smart-rules-dao';
import { applyRuleToExistingTransactions } from '@/services/rules/rules-engine';
import type { SmartRule } from '@/types';

export const SMART_RULES_QUERY_KEY = ['smart_rules'];

export function useSmartRules() {
  const query = useQuery({
    queryKey: SMART_RULES_QUERY_KEY,
    queryFn: getAllSmartRules,
  });

  return {
    rules: query.data || [],
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useSmartRule(id: string) {
  return useQuery({
    queryKey: [...SMART_RULES_QUERY_KEY, id],
    queryFn: () => getSmartRuleById(id),
    enabled: Boolean(id),
  });
}

export function useSaveSmartRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      rule: Omit<SmartRule, 'id' | 'createdAt' | 'updatedAt' | 'matchCount'> & { id?: string }
    ) => saveSmartRule(rule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SMART_RULES_QUERY_KEY });
    },
  });
}

export function useToggleSmartRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      toggleSmartRule(id, isEnabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SMART_RULES_QUERY_KEY });
    },
  });
}

export function useDeleteSmartRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteSmartRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SMART_RULES_QUERY_KEY });
    },
  });
}

export function useApplyRuleToExisting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (rule: SmartRule) => applyRuleToExistingTransactions(rule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: SMART_RULES_QUERY_KEY });
    },
  });
}

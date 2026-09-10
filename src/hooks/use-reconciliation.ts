import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAccountReconciliationStatus,
  createBalanceAdjustmentEntry,
  type AccountReconciliationStatus,
} from '@/services/database/reconciliation-service';
import { queueAutoBackup } from '@/services/cloud/google-drive-service';

export function useAccountReconciliation(accountId: string | undefined) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['reconciliation', accountId],
    queryFn: () => (accountId ? getAccountReconciliationStatus(accountId) : Promise.resolve(null)),
    enabled: Boolean(accountId),
  });

  return { reconciliation: data || null, isLoading, refetch };
}

export function useCreateAdjustmentEntry() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({
      accountId,
      discrepancyAmount,
    }: {
      accountId: string;
      discrepancyAmount: number;
    }) => createBalanceAdjustmentEntry(accountId, discrepancyAmount),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation', variables.accountId] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queueAutoBackup('create-adjustment-entry');
    },
  });

  return {
    mutate: (
      data: { accountId: string; discrepancyAmount: number },
      options?: { onSuccess?: () => void }
    ) => {
      mutation.mutate(data, { onSuccess: options?.onSuccess });
    },
    isPending: mutation.isPending,
  };
}

import { useState, useCallback, useEffect } from 'react';
import type { ReviewQueueItem, ExtractedTransaction } from '@/modules/sms/types';
import { ReviewQueueService } from '@/modules/sms/reviewQueue/reviewQueueService';
import { useSmsStore } from '@/store/useSmsStore';

export function useSmsReviewQueue() {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshCount = useSmsStore((state) => state.refreshReviewQueueCount);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ReviewQueueService.getPendingItems();
      setItems(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load review items');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const resolveItem = useCallback(
    async (item: ReviewQueueItem, verifiedData: ExtractedTransaction) => {
      await ReviewQueueService.resolveItem(item, verifiedData);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      await refreshCount();
    },
    [refreshCount]
  );

  const dismissItem = useCallback(
    async (id: string) => {
      await ReviewQueueService.dismissItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      await refreshCount();
    },
    [refreshCount]
  );

  return {
    items,
    loading,
    error,
    refetch: fetchItems,
    resolveItem,
    dismissItem,
  };
}

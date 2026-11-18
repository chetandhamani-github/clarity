import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Tag } from '@/types';
import { getAllTags, getOrCreateTag } from '@/services/database/tag-dao';

export function useTags() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tags'],
    queryFn: () => getAllTags(),
  });

  return { tags: data || [], isLoading, refetch };
}

export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, color }: { name: string; color?: string }) =>
      getOrCreateTag(name, color),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

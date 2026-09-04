import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  fetchAnnouncements,
  dismissAnnouncement as persistDismiss,
  getDismissedAnnouncementIds,
  getCachedAnnouncements,
} from '@/services/api/announcement.api';
import { AnnouncementItem } from '@/services/api/types';

export const ANNOUNCEMENTS_QUERY_KEY = ['announcements'] as const;

export function useAnnouncements() {
  const [dismissedIds, setDismissedIds] = useState<string[]>(() =>
    getDismissedAnnouncementIds()
  );

  const query = useQuery<AnnouncementItem[]>({
    queryKey: ANNOUNCEMENTS_QUERY_KEY,
    queryFn: fetchAnnouncements,
    initialData: getCachedAnnouncements(),
    staleTime: 1000 * 60 * 15, // 15 minutes
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  });

  const dismiss = useCallback((id: string) => {
    persistDismiss(id);
    setDismissedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const allAnnouncements = query.data ?? [];
  const activeAnnouncements = allAnnouncements.filter(
    (item) => !dismissedIds.includes(item.id)
  );

  return {
    ...query,
    announcements: activeAnnouncements,
    allAnnouncements,
    dismiss,
    hasAnnouncements: activeAnnouncements.length > 0,
  };
}

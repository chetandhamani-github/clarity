import { apiClient } from './client';
import { AnnouncementItem } from './types';
import { mmkv } from '@/lib/storage';

const ANNOUNCEMENTS_CACHE_KEY = 'clarity_cached_announcements';
const DISMISSED_ANNOUNCEMENTS_KEY = 'clarity_dismissed_announcements';

/**
 * Gets cached announcements from MMKV
 */
export function getCachedAnnouncements(): AnnouncementItem[] {
  const cached = mmkv.getString(ANNOUNCEMENTS_CACHE_KEY);
  if (cached) {
    try {
      return JSON.parse(cached) as AnnouncementItem[];
    } catch {
      // JSON parse error fallback
    }
  }
  return [];
}

/**
 * Saves announcements in MMKV cache
 */
export function cacheAnnouncements(announcements: AnnouncementItem[]): void {
  mmkv.set(ANNOUNCEMENTS_CACHE_KEY, JSON.stringify(announcements));
}

/**
 * Gets set of dismissed announcement IDs from MMKV
 */
export function getDismissedAnnouncementIds(): string[] {
  const data = mmkv.getString(DISMISSED_ANNOUNCEMENTS_KEY);
  if (data) {
    try {
      return JSON.parse(data) as string[];
    } catch {
      // fallback
    }
  }
  return [];
}

/**
 * Marks an announcement as dismissed in MMKV
 */
export function dismissAnnouncement(id: string): void {
  const current = getDismissedAnnouncementIds();
  if (!current.includes(id)) {
    current.push(id);
    mmkv.set(DISMISSED_ANNOUNCEMENTS_KEY, JSON.stringify(current));
  }
}

/**
 * Fetches active announcements from backend with offline caching
 */
export async function fetchAnnouncements(): Promise<AnnouncementItem[]> {
  try {
    const announcements = await apiClient.get<AnnouncementItem[]>('/api/v1/announcements');
    if (Array.isArray(announcements)) {
      cacheAnnouncements(announcements);
      return announcements;
    }
    return [];
  } catch (error) {
    if (__DEV__) {
      console.warn('⚠️ [Announcement API] Fetch failed, using cached announcements:', error);
    }
    return getCachedAnnouncements();
  }
}

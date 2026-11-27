import { useEffect, useMemo } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/store/use-app-store';
import type {
  CreateReminderDTO,
  Reminder,
  UnifiedReminderItem,
  UpdateReminderDTO,
} from '../types/reminder.types';
import { RemindersService } from '../services/RemindersService';
import { ReminderScheduler } from '../services/ReminderScheduler';
import { useRemindersStore } from '../store/reminders.store';

export const REMINDERS_QUERY_KEY = ['reminders', 'unified'] as const;

export interface RemindersSummary {
  upcomingCount: number;
  overdueCount: number;
  snoozedCount: number;
  customActiveCount: number;
  completedCount: number;
}

export function useReminders(daysAhead: number = 45) {
  const queryClient = useQueryClient();
  const defaultReminderTime = useAppStore((s) => s.defaultReminderTime);
  const {
    selectedTab,
    selectedCategory,
    searchQuery,
    setSelectedTab,
    setSelectedCategory,
    setSearchQuery,
    resetFilters,
  } = useRemindersStore();

  useEffect(() => {
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['reminders'] });
    };
    const subs = [
      DeviceEventEmitter.addListener('remindersUpdated', invalidate),
      DeviceEventEmitter.addListener('billsUpdated', invalidate),
      DeviceEventEmitter.addListener('appDataReset', invalidate),
    ];
    return () => {
      subs.forEach((s) => s.remove());
    };
  }, [queryClient]);

  const query = useQuery({
    queryKey: [...REMINDERS_QUERY_KEY, daysAhead, defaultReminderTime],
    queryFn: () => RemindersService.getUnifiedFeed(daysAhead, defaultReminderTime),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['reminders'] });
  };

  const createMutation = useMutation({
    mutationFn: (dto: CreateReminderDTO) => RemindersService.createReminder(dto),
    onSuccess: invalidateAll,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: UpdateReminderDTO }) =>
      RemindersService.updateReminder(id, updates),
    onSuccess: invalidateAll,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => RemindersService.deleteReminder(id),
    onSuccess: invalidateAll,
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => RemindersService.completeReminder(id),
    onSuccess: invalidateAll,
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ id, hours }: { id: string; hours: number }) =>
      RemindersService.snoozeReminder(id, hours),
    onSuccess: invalidateAll,
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => RemindersService.dismissReminder(id),
    onSuccess: invalidateAll,
  });

  const customReminders: Reminder[] = useMemo(
    () => query.data?.customReminders ?? [],
    [query.data]
  );

  const unifiedUpcoming: UnifiedReminderItem[] = useMemo(
    () => query.data?.unifiedUpcoming ?? [],
    [query.data]
  );

  const completedReminders: Reminder[] = useMemo(
    () => query.data?.completedReminders ?? [],
    [query.data]
  );

  const summary = useMemo<RemindersSummary>(() => {
    let overdueCount = 0;
    let snoozedCount = 0;
    for (const item of unifiedUpcoming) {
      if (item.isOverdue) overdueCount++;
      if (item.isSnoozed) snoozedCount++;
    }
    return {
      upcomingCount: unifiedUpcoming.length,
      overdueCount,
      snoozedCount,
      customActiveCount: customReminders.length,
      completedCount: completedReminders.length,
    };
  }, [unifiedUpcoming, customReminders.length, completedReminders.length]);

  const filteredUpcoming = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return unifiedUpcoming.filter((item) => {
      if (selectedTab === 'custom' && item.sourceKind !== 'custom') return false;
      if (selectedTab === 'dues' && item.sourceKind === 'custom') return false;
      if (selectedTab === 'snoozed' && !item.isSnoozed) return false;
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
      if (q) {
        const hay = `${item.title} ${item.subtitle} ${item.notes ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [unifiedUpcoming, selectedTab, selectedCategory, searchQuery]);

  const filteredCompleted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return completedReminders.filter((item) => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
      if (q) {
        const hay = `${item.title} ${item.notes}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [completedReminders, selectedCategory, searchQuery]);

  return {
    customReminders,
    unifiedUpcoming,
    filteredUpcoming,
    completedReminders,
    filteredCompleted,
    summary,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    refetch: query.refetch,
    selectedTab,
    selectedCategory,
    searchQuery,
    setSelectedTab,
    setSelectedCategory,
    setSearchQuery,
    resetFilters,
    createReminder: createMutation.mutateAsync,
    updateReminder: (id: string, updates: UpdateReminderDTO) =>
      updateMutation.mutateAsync({ id, updates }),
    deleteReminder: deleteMutation.mutateAsync,
    completeReminder: completeMutation.mutateAsync,
    snoozeReminder: (id: string, hours: number = 24) => snoozeMutation.mutateAsync({ id, hours }),
    dismissReminder: dismissMutation.mutateAsync,
    syncAllSchedules: () => ReminderScheduler.syncAll(),
  };
}


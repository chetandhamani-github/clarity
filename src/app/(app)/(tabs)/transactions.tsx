import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Text,
  Header,
  TransactionsSkeleton,
  TransactionsPaginationSkeleton,
  useToast,
  useAlert,
} from '@/components/ui';
import { spacing, typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  usePaginatedTransactions,
  useMonthlyDailyTotals,
  useDateRangeTotals,
  useBulkDeleteTransactions,
  useBulkUpdateCategory,
  useBulkUpdateAccount,
  useCreateTransaction,
  useAllRecurringTransactions,
  useToggleRecurringTransaction,
  useDeleteRecurringTransaction,
} from '@/hooks/use-transactions';
import { useAccounts } from '@/hooks/use-accounts';
import { useCategories } from '@/hooks/use-budget';
import { formatCurrency, formatDate } from '@/utils/format';
import {
  CalendarDateRange,
  getMonthDateBounds,
  isRangeWithinMonth,
  normalizeCalendarRange,
  resolvePresetDateRange,
} from '@/utils/calendar-utils';
import { getLocalTodayYmd } from '@/utils/date';
import { getCategoryIcon } from '@/utils/icons';
import {
  FlatTransactionListItem,
  SectionHeaderItem,
  TransactionRowItem,
  buildFlatTransactionListItems,
  getTransactionListItemLayout,
  getTransactionListStyles,
} from '@/components/transactions/VirtualizedTransactionRows';
import { TransactionsCalendarCard } from '@/components/transactions/TransactionsCalendarCard';
import { RecurringSchedulesList } from '@/components/transactions/RecurringSchedulesList';
import { TransactionFilterModal, ActiveFilters, DatePreset } from '@/components/modals/TransactionFilterModal';
import { ReviewQueueModal } from '@/components/modals/ReviewQueueModal';
import { useAppStore } from '@/store/use-app-store';
import { useSmsStore } from '@/store/useSmsStore';
import { haptics } from '@/utils/haptics';
import { getTransactionDisplayName } from '@/utils/transaction-display';
import type { RecurringTransactionWithAccount, TransactionFilters, TransactionType } from '@/types';

const FILTERS = [
  { id: 'all', label: 'All', icon: 'list' },
  { id: 'expense', label: 'Expenses', icon: 'arrow-downward' },
  { id: 'income', label: 'Income', icon: 'arrow-upward' },
  { id: 'transfer', label: 'Transfers', icon: 'swap-horiz' },
  { id: 'recurring', label: 'Recurring', icon: 'autorenew' },
];

const TRANSACTIONS_PAGE_SIZE = 25;

interface TransactionsScreenProps {
  showBack?: boolean;
  lockedAccountId?: string;
  initialCategory?: string;
  initialType?: 'all' | 'expense' | 'income' | 'transfer';
  initialDatePreset?: DatePreset;
}

export default function TransactionsScreen({
  showBack = false,
  lockedAccountId,
  initialCategory,
  initialType,
  initialDatePreset,
}: TransactionsScreenProps = {}) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const listStyles = useMemo(() => getTransactionListStyles(colors), [colors]);
  const insets = useSafeInsets();
  const bottomInset = insets.bottom;
  const router = useRouter();
  const currency = useAppStore((state) => state.currency);
  const hideBalances = useAppStore((state) => state.hideBalances);

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [isRecurringTab, setIsRecurringTab] = useState(false);
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth() + 1);
  const [selectedCalendarRange, setSelectedCalendarRange] = useState<CalendarDateRange | null>(null);
  const [isCalendarGliding, setIsCalendarGliding] = useState(false);

  const { accounts } = useAccounts();
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const reviewQueueCount = useSmsStore((state) => state.reviewQueueCount);
  const refreshReviewQueueCount = useSmsStore((state) => state.refreshReviewQueueCount);
  const [filters, setFilters] = useState<ActiveFilters>(() => ({
    accountId: lockedAccountId,
    category: initialCategory,
    datePreset: initialDatePreset ?? 'all',
    type: initialType ?? 'all',
  }));

  useEffect(() => {
    if (lockedAccountId) {
      setFilters((prev) =>
        prev.accountId === lockedAccountId ? prev : { ...prev, accountId: lockedAccountId }
      );
    }
  }, [lockedAccountId]);

  useEffect(() => {
    if (!initialCategory && !initialType && !initialDatePreset) return;
    if (initialType) {
      setIsRecurringTab(false);
    }
    setFilters((prev) => {
      const nextCategory = initialCategory;
      const nextType = initialType ?? prev.type;
      const nextPreset = initialDatePreset ?? prev.datePreset;
      if (
        prev.category === nextCategory &&
        prev.type === nextType &&
        prev.datePreset === nextPreset
      ) {
        return prev;
      }
      return {
        ...prev,
        category: nextCategory,
        type: nextType,
        datePreset: nextPreset,
      };
    });
  }, [initialCategory, initialType, initialDatePreset]);

  const effectiveAccountId = lockedAccountId ?? filters.accountId;

  const { showToast } = useToast();
  const { showAlert } = useAlert();
  const { categories } = useCategories();
  const { mutate: bulkDelete } = useBulkDeleteTransactions();
  const { mutate: bulkUpdateCat } = useBulkUpdateCategory();
  const { mutate: bulkUpdateAcc } = useBulkUpdateAccount();
  const { mutate: restoreTx } = useCreateTransaction();
  const {
    transactions: recurringSchedules,
    isLoading: isRecurringLoading,
  } = useAllRecurringTransactions(isRecurringTab);
  const { mutate: toggleRecurring } = useToggleRecurringTransaction();
  const { mutate: deleteRecurring } = useDeleteRecurringTransaction();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategoryModalVisible, setBulkCategoryModalVisible] = useState(false);
  const [bulkAccountModalVisible, setBulkAccountModalVisible] = useState(false);

  const dateRange = useMemo<{ dateFrom?: string; dateTo?: string }>(() => {
    if (viewMode === 'calendar') {
      if (selectedCalendarRange) {
        return { dateFrom: selectedCalendarRange.start, dateTo: selectedCalendarRange.end };
      }
      return getMonthDateBounds(calendarYear, calendarMonth);
    }

    return resolvePresetDateRange(
      filters.datePreset,
      filters.customDateFrom,
      filters.customDateTo
    );
  }, [
    viewMode,
    selectedCalendarRange,
    calendarYear,
    calendarMonth,
    filters.datePreset,
    filters.customDateFrom,
    filters.customDateTo,
  ]);

  const calendarBaseFilters = useMemo<Omit<TransactionFilters, 'limit' | 'offset' | 'dateFrom' | 'dateTo'>>(
    () => ({
      type: filters.type === 'all' ? undefined : filters.type,
      accountId: effectiveAccountId,
      category: filters.category,
      tag: filters.tag,
    }),
    [filters.type, effectiveAccountId, filters.category, filters.tag]
  );

  const {
    dailyTotals,
    dailyMap,
    isLoading: isCalendarTotalsLoading,
  } = useMonthlyDailyTotals(
    calendarMonth,
    calendarYear,
    calendarBaseFilters,
    viewMode === 'calendar' && !isRecurringTab
  );

  const queryFilters = useMemo<TransactionFilters>(() => {
    return {
      ...calendarBaseFilters,
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo,
    };
  }, [calendarBaseFilters, dateRange]);

  const isCalendarCrossMonth = Boolean(
    !isRecurringTab &&
      viewMode === 'calendar' &&
      selectedCalendarRange &&
      !isRangeWithinMonth(selectedCalendarRange, calendarYear, calendarMonth)
  );

  const { rangeTotals: crossMonthRangeTotals } = useDateRangeTotals(
    queryFilters,
    isCalendarCrossMonth
  );

  const {
    transactions,
    totalCount,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = usePaginatedTransactions(queryFilters, TRANSACTIONS_PAGE_SIZE, !isRecurringTab);

  useFocusEffect(
    useCallback(() => {
      if (lockedAccountId) return;

      const runFocusRefresh = () => {
        refreshReviewQueueCount();
      };

      if (typeof globalThis.requestIdleCallback === 'function') {
        try {
          const idleId = globalThis.requestIdleCallback(runFocusRefresh);
          return () => {
            if (typeof globalThis.cancelIdleCallback === 'function') {
              globalThis.cancelIdleCallback(idleId);
            }
          };
        } catch {
          // Fallback when runtime scheduler does not support idle callbacks
        }
      }

      const timer = setTimeout(runFocusRefresh, 0);
      return () => {
        clearTimeout(timer);
      };
    }, [refreshReviewQueueCount, lockedAccountId])
  );

  const toggleSelect = useCallback((id: string) => {
    haptics.selection();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    haptics.light();
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map((t) => t.id)));
    }
  }, [selectedIds.size, transactions]);

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    haptics.warning();

    showAlert(
      'Delete Transactions',
      `Are you sure you want to delete ${count} selected transaction${count > 1 ? 's' : ''}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const idsToDelete = Array.from(selectedIds);
            const backupList = transactions.filter((t) => selectedIds.has(t.id));

            bulkDelete(idsToDelete, {
              onSuccess: () => {
                setSelectedIds(new Set());
                showToast(
                  `Deleted ${count} transaction${count > 1 ? 's' : ''}`,
                  'info',
                  {
                    label: 'UNDO',
                    onPress: () => {
                      backupList.forEach((item) => {
                        restoreTx(item);
                      });
                      showToast(`Restored ${count} transaction${count > 1 ? 's' : ''}`, 'success');
                    },
                  }
                );
              },
              onError: () => {
                showToast('Failed to delete transactions', 'error');
              },
            });
          },
        },
      ]
    );
  }, [selectedIds, transactions, bulkDelete, restoreTx, showToast, showAlert]);

  const handleSelectBulkCategory = useCallback(
    (catName: string) => {
      if (selectedIds.size === 0) return;
      const count = selectedIds.size;
      const ids = Array.from(selectedIds);

      bulkUpdateCat(
        { ids, category: catName },
        {
          onSuccess: () => {
            haptics.success();
            showToast(`Updated category to ${catName} for ${count} items`, 'success');
            setSelectedIds(new Set());
            setBulkCategoryModalVisible(false);
          },
          onError: () => {
            showToast('Failed to update category', 'error');
          },
        }
      );
    },
    [selectedIds, bulkUpdateCat, showToast]
  );

  const handleSelectBulkAccount = useCallback(
    (accId: string) => {
      if (selectedIds.size === 0) return;
      const count = selectedIds.size;
      const ids = Array.from(selectedIds);
      const targetAcc = accounts.find((a) => a.id === accId);

      bulkUpdateAcc(
        { ids, accountId: accId },
        {
          onSuccess: () => {
            haptics.success();
            showToast(
              `Moved ${count} item${count > 1 ? 's' : ''} to ${targetAcc?.name || 'account'}`,
              'success'
            );
            setSelectedIds(new Set());
            setBulkAccountModalVisible(false);
          },
          onError: () => {
            showToast('Failed to move transactions', 'error');
          },
        }
      );
    },
    [selectedIds, accounts, bulkUpdateAcc, showToast]
  );

  const flatListItems = useMemo<FlatTransactionListItem[]>(() => {
    if (isLoading) return [];
    return buildFlatTransactionListItems(transactions, currency, effectiveAccountId);
  }, [transactions, isLoading, effectiveAccountId, currency]);

  const hasSelectionMode = selectedIds.size > 0;
  const hasSelectionModeRef = useRef(hasSelectionMode);

  useEffect(() => {
    hasSelectionModeRef.current = hasSelectionMode;
  }, [hasSelectionMode]);

  const handleItemPress = useCallback(
    (id: string) => {
      if (hasSelectionModeRef.current) {
        toggleSelect(id);
      } else {
        router.navigate(`/(app)/add-transaction?id=${id}`);
      }
    },
    [toggleSelect, router]
  );

  const handleItemLongPress = useCallback(
    (id: string) => {
      toggleSelect(id);
    },
    [toggleSelect]
  );

  const keyExtractor = useCallback((item: FlatTransactionListItem) => item.key, []);

  const listContentContainerStyle = useMemo(
    () => [styles.scrollContent, { paddingBottom: bottomInset + (showBack ? 32 : 120) }],
    [styles.scrollContent, bottomInset, showBack]
  );

  const listExtraData = useMemo(
    () => ({ selectedIds, hasSelectionMode }),
    [selectedIds, hasSelectionMode]
  );

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderListFooter = useCallback(() => {
    if (!isFetchingNextPage) return null;
    return <TransactionsPaginationSkeleton />;
  }, [isFetchingNextPage]);

  const renderItem = useCallback(
    ({ item }: { item: FlatTransactionListItem }) => {
      if (item.kind === 'header') {
        return (
          <SectionHeaderItem
            title={item.title}
            isFirst={item.isFirst}
            styles={listStyles}
          />
        );
      }

      return (
        <TransactionRowItem
          item={item.row}
          isLastInSection={item.isLastInSection}
          isVeryLast={item.isVeryLast}
          isSelected={hasSelectionMode && selectedIds.has(item.row.id)}
          hasSelectionMode={hasSelectionMode}
          iconDefaultColor={colors.onSurfaceVariant}
          iconCreditColor={colors.onPrimaryContainer}
          primaryColor={colors.primary}
          outlineColor={colors.outline}
          styles={listStyles}
          onPress={handleItemPress}
          onLongPress={handleItemLongPress}
        />
      );
    },
    [colors, listStyles, selectedIds, hasSelectionMode, handleItemPress, handleItemLongPress]
  );

  const activeCount =
    (filters.type && filters.type !== 'all' ? 1 : 0) +
    (viewMode === 'list' && filters.datePreset !== 'all' ? 1 : 0) +
    (!lockedAccountId && filters.accountId ? 1 : 0) +
    (filters.category ? 1 : 0) +
    (filters.tag ? 1 : 0);

  const selectedAccount = useMemo(() => {
    if (!effectiveAccountId) return null;
    return accounts.find((a) => a.id === effectiveAccountId);
  }, [accounts, effectiveAccountId]);

  const activeBadges = useMemo(() => {
    const list: { id: string; label: string; onRemove: () => void }[] = [];
    if (!lockedAccountId && filters.accountId && selectedAccount) {
      list.push({
        id: 'account',
        label: `Account: ${selectedAccount.name}`,
        onRemove: () => setFilters((prev) => ({ ...prev, accountId: undefined })),
      });
    }
    if (filters.category) {
      list.push({
        id: 'category',
        label: `Category: ${filters.category}`,
        onRemove: () => setFilters((prev) => ({ ...prev, category: undefined })),
      });
    }
    if (filters.tag) {
      list.push({
        id: 'tag',
        label: `Tag: #${filters.tag}`,
        onRemove: () => setFilters((prev) => ({ ...prev, tag: undefined })),
      });
    }
    if (viewMode === 'list' && filters.datePreset !== 'all') {
      let label: string;
      if (filters.datePreset === 'custom' && dateRange.dateFrom && dateRange.dateTo) {
        label =
          dateRange.dateFrom === dateRange.dateTo
            ? formatDate(dateRange.dateFrom, 'short')
            : `${formatDate(dateRange.dateFrom, 'short')} – ${formatDate(dateRange.dateTo, 'short')}`;
      } else if (filters.datePreset === 'this_month') {
        label = 'This Month';
      } else if (filters.datePreset === 'last_7_days') {
        label = 'Last 7 Days';
      } else if (filters.datePreset === 'last_30_days') {
        label = 'Last 30 Days';
      } else if (filters.datePreset === 'last_month') {
        label = 'Last Month';
      } else {
        label = 'Last 90 Days';
      }
      list.push({
        id: 'date',
        label: `Date: ${label}`,
        onRemove: () => {
          setSelectedCalendarRange(null);
          setFilters((prev) => ({
            ...prev,
            datePreset: 'all',
            customDateFrom: undefined,
            customDateTo: undefined,
          }));
        },
      });
    }
    return list;
  }, [filters, selectedAccount, lockedAccountId, viewMode, dateRange]);

  const handleCalendarPrevMonth = useCallback(() => {
    if (calendarMonth === 1) {
      setCalendarMonth(12);
      setCalendarYear((y) => y - 1);
    } else {
      setCalendarMonth((m) => m - 1);
    }
  }, [calendarMonth]);

  const handleCalendarNextMonth = useCallback(() => {
    if (calendarMonth === 12) {
      setCalendarMonth(1);
      setCalendarYear((y) => y + 1);
    } else {
      setCalendarMonth((m) => m + 1);
    }
  }, [calendarMonth]);

  const handleCalendarJumpToToday = useCallback(() => {
    const todayYmd = getLocalTodayYmd();
    const [y, m] = todayYmd.split('-').map(Number);
    setCalendarYear(y);
    setCalendarMonth(m);
    setSelectedCalendarRange({ start: todayYmd, end: todayYmd });
  }, []);

  const handleSelectCalendarRange = useCallback(
    (range: CalendarDateRange | null) => {
      if (range && range.start === range.end && selectedCalendarRange === null) {
        const [y, m] = range.start.split('-').map(Number);
        if (y && m && (y !== calendarYear || m !== calendarMonth)) {
          setCalendarYear(y);
          setCalendarMonth(m);
        }
      }
      setSelectedCalendarRange(range);
    },
    [calendarYear, calendarMonth, selectedCalendarRange]
  );

  const handleToggleViewMode = useCallback(() => {
    haptics.selection();
    if (isRecurringTab) {
      setIsRecurringTab(false);
      setViewMode('calendar');
      return;
    }
    if (viewMode === 'calendar') {
      if (selectedCalendarRange) {
        setFilters((prev) => ({
          ...prev,
          datePreset: 'custom',
          customDateFrom: selectedCalendarRange.start,
          customDateTo: selectedCalendarRange.end,
        }));
      }
      setViewMode('list');
      return;
    }

    if (filters.datePreset === 'this_month') {
      const now = new Date();
      setCalendarYear(now.getFullYear());
      setCalendarMonth(now.getMonth() + 1);
      setSelectedCalendarRange(null);
    } else if (filters.datePreset === 'last_month') {
      const last = new Date();
      last.setMonth(last.getMonth() - 1);
      setCalendarYear(last.getFullYear());
      setCalendarMonth(last.getMonth() + 1);
      setSelectedCalendarRange(null);
    } else if (filters.datePreset !== 'all' && dateRange.dateFrom && dateRange.dateTo) {
      const normalized = normalizeCalendarRange(dateRange.dateFrom, dateRange.dateTo);
      const focusDate = filters.datePreset === 'custom' ? normalized.start : normalized.end;
      const [y, m] = focusDate.split('-').map(Number);
      if (y && m) {
        setCalendarYear(y);
        setCalendarMonth(m);
      }
      setSelectedCalendarRange(normalized);
    }
    setViewMode('calendar');
  }, [isRecurringTab, viewMode, selectedCalendarRange, filters.datePreset, dateRange]);

  const navigateToSearch = useCallback(() => {
    router.navigate(lockedAccountId ? `/(app)/search?accountId=${lockedAccountId}` : '/search');
  }, [router, lockedAccountId]);

  const navigateToAddTransaction = useCallback(() => {
    const params: Record<string, string> = {};
    if (lockedAccountId) params.accountId = lockedAccountId;
    if (isRecurringTab) params.recurring = '1';
    if (Object.keys(params).length > 0) {
      router.navigate({ pathname: '/add-transaction', params });
      return;
    }
    router.navigate('/add-transaction');
  }, [router, lockedAccountId, isRecurringTab]);

  const handleAddRecurring = useCallback(
    (opts?: { type?: TransactionType; accountId?: string; toAccountId?: string }) => {
      const params: Record<string, string> = { recurring: '1' };
      if (opts?.type) params.type = opts.type;
      if (opts?.accountId) params.accountId = opts.accountId;
      else if (lockedAccountId && !opts?.toAccountId) params.accountId = lockedAccountId;
      if (opts?.toAccountId) params.toAccountId = opts.toAccountId;
      router.navigate({ pathname: '/add-transaction', params });
    },
    [router, lockedAccountId]
  );

  const handleToggleRecurringActive = useCallback(
    (id: string, isActive: boolean) => {
      haptics.selection();
      toggleRecurring(
        { id, isActive },
        {
          onSuccess: () => {
            showToast(
              isActive ? 'Recurring schedule resumed' : 'Recurring schedule paused',
              'info'
            );
          },
        }
      );
    },
    [toggleRecurring, showToast]
  );

  const handleDeleteRecurring = useCallback(
    (schedule: RecurringTransactionWithAccount) => {
      const title = getTransactionDisplayName(schedule);
      showAlert(
        'Cancel Recurring Schedule',
        `Cancel the ${schedule.frequency} recurring schedule for "${title}"?\n\nPast recorded transactions will not be deleted.`,
        [
          { text: 'Keep Schedule', style: 'cancel' },
          {
            text: 'Cancel Schedule',
            style: 'destructive',
            onPress: () => {
              deleteRecurring(schedule.id, {
                onSuccess: () => {
                  showToast('Recurring schedule cancelled', 'success');
                },
              });
            },
          },
        ]
      );
    },
    [showAlert, deleteRecurring, showToast]
  );

  const handlePayRecurringNow = useCallback(
    (schedule: RecurringTransactionWithAccount) => {
      const params: Record<string, string> = {
        type: schedule.type,
        accountId: schedule.accountId,
        amount: schedule.amount.toString(),
        merchant: schedule.merchant,
        category: schedule.category,
      };
      if (schedule.type === 'transfer' && schedule.toAccountId) {
        params.toAccountId = schedule.toAccountId;
      }
      router.navigate({ pathname: '/add-transaction', params });
    },
    [router]
  );

  const clearFilters = useCallback(() => {
    setSelectedCalendarRange(null);
    setFilters({
      datePreset: 'all',
      type: 'all',
      ...(lockedAccountId ? { accountId: lockedAccountId } : {}),
    });
  }, [lockedAccountId]);

  const renderListHeader = useMemo(
    () => (
      <View>
        <View style={styles.searchRow}>
          <TouchableOpacity style={styles.searchBar} onPress={navigateToSearch}>
            <MaterialIcons name="search" size={20} color={colors.primary} />
            <Text style={styles.searchPlaceholder}>Search transactions...</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, viewMode === 'calendar' && styles.filterButtonActive]}
            onPress={handleToggleViewMode}
            accessibilityRole="button"
            accessibilityLabel={viewMode === 'calendar' ? 'Switch to list view' : 'Switch to calendar view'}
          >
            <MaterialIcons
              name={viewMode === 'calendar' ? 'view-agenda' : 'calendar-month'}
              size={22}
              color={viewMode === 'calendar' ? colors.onPrimary : colors.onSurface}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, activeCount > 0 && styles.filterButtonActive]}
            onPress={() => setFilterModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Filter transactions"
          >
            <MaterialIcons
              name="tune"
              size={22}
              color={activeCount > 0 ? colors.onPrimary : colors.onSurface}
            />
            {activeCount > 0 && (
              <View style={styles.filterDotBadge}>
                <Text style={styles.filterDotText}>{activeCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.filtersScroll}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersContainer}
          >
            {FILTERS.map((filter) => {
              const isActive =
                filter.id === 'recurring'
                  ? isRecurringTab
                  : !isRecurringTab && (filters.type || 'all') === filter.id;
              return (
                <TouchableOpacity
                  key={filter.id}
                  style={isActive ? styles.activeFilter : styles.inactiveFilter}
                  onPress={() => {
                    haptics.selection();
                    if (filter.id === 'recurring') {
                      setSelectedIds(new Set());
                      setViewMode('list');
                      setIsRecurringTab(true);
                    } else {
                      setIsRecurringTab(false);
                      setFilters((prev) => ({
                        ...prev,
                        type: filter.id as ActiveFilters['type'],
                      }));
                    }
                  }}
                >
                  <MaterialIcons
                    name={filter.icon as any}
                    size={16}
                    color={isActive ? colors.primary : colors.onSurfaceVariant}
                  />
                  <Text style={isActive ? styles.activeFilterText : styles.inactiveFilterText}>
                    {filter.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {!isRecurringTab && activeBadges.length > 0 && (
          <View style={styles.activeBadgesRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.activeBadgesContainer}
            >
              {activeBadges.map((badge) => (
                <View key={badge.id} style={styles.activeBadgePill}>
                  <Text style={styles.activeBadgeText}>{badge.label}</Text>
                  <TouchableOpacity
                    onPress={badge.onRemove}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons name="close" size={14} color={colors.onPrimaryContainer} />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                onPress={clearFilters}
                style={styles.clearAllBtn}
              >
                <Text style={styles.clearAllText}>Clear All</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {!isRecurringTab && !lockedAccountId && reviewQueueCount > 0 && (
          <TouchableOpacity
            style={styles.reviewQueueBanner}
            onPress={() => setReviewModalVisible(true)}
            activeOpacity={0.8}
          >
            <View style={styles.reviewQueueIconContainer}>
              <MaterialIcons name="rate-review" size={20} color={colors.onPrimary} />
            </View>
            <View style={styles.reviewQueueContent}>
              <Text style={styles.reviewQueueTitle}>
                {reviewQueueCount} {reviewQueueCount === 1 ? 'transaction needs' : 'transactions need'} review
              </Text>
              <Text style={styles.reviewQueueSubtitle}>
                Tap to verify auto-detected alert details
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.onPrimaryContainer} />
          </TouchableOpacity>
        )}

        {!isRecurringTab && viewMode === 'calendar' && (
          <TransactionsCalendarCard
            year={calendarYear}
            month={calendarMonth}
            selectedRange={selectedCalendarRange}
            dailyTotals={dailyTotals}
            dailyMap={dailyMap}
            rangeSummaryOverride={isCalendarCrossMonth ? crossMonthRangeTotals : null}
            isLoading={isCalendarTotalsLoading}
            currencyCode={currency}
            hideBalances={hideBalances}
            onPrevMonth={handleCalendarPrevMonth}
            onNextMonth={handleCalendarNextMonth}
            onJumpToToday={handleCalendarJumpToToday}
            onSelectRange={handleSelectCalendarRange}
            onGlideStateChange={setIsCalendarGliding}
          />
        )}

        {!isRecurringTab && (
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsTitle}>
              {viewMode === 'calendar'
                ? selectedCalendarRange
                  ? selectedCalendarRange.start === selectedCalendarRange.end
                    ? formatDate(selectedCalendarRange.start, 'short')
                    : `${formatDate(selectedCalendarRange.start, 'short')} – ${formatDate(selectedCalendarRange.end, 'short')}`
                  : formatDate(
                      `${calendarYear}-${String(calendarMonth).padStart(2, '0')}-01`,
                      'month-year'
                    )
                : filters.datePreset === 'custom' && dateRange.dateFrom && dateRange.dateTo
                ? dateRange.dateFrom === dateRange.dateTo
                  ? formatDate(dateRange.dateFrom, 'short')
                  : `${formatDate(dateRange.dateFrom, 'short')} – ${formatDate(dateRange.dateTo, 'short')}`
                : filters.datePreset === 'this_month'
                ? 'This Month'
                : filters.datePreset === 'last_7_days'
                ? 'Last 7 Days'
                : filters.datePreset === 'last_30_days'
                ? 'Last 30 Days'
                : filters.datePreset === 'last_month'
                ? 'Last Month'
                : filters.datePreset === 'last_90_days'
                ? 'Last 90 Days'
                : 'Recent Activity'}
            </Text>
            <Text style={styles.resultsCount}>
              {transactions.length < totalCount
                ? `${transactions.length} of ${totalCount}`
                : `${totalCount} ${totalCount === 1 ? 'Transaction' : 'Transactions'}`}
            </Text>
          </View>
        )}
      </View>
    ),
    [
      colors,
      styles,
      filters,
      isRecurringTab,
      activeCount,
      activeBadges,
      transactions.length,
      totalCount,
      reviewQueueCount,
      lockedAccountId,
      navigateToSearch,
      clearFilters,
      viewMode,
      calendarYear,
      calendarMonth,
      selectedCalendarRange,
      dailyTotals,
      dailyMap,
      isCalendarTotalsLoading,
      isCalendarCrossMonth,
      crossMonthRangeTotals,
      dateRange.dateFrom,
      dateRange.dateTo,
      currency,
      hideBalances,
      handleToggleViewMode,
      handleCalendarPrevMonth,
      handleCalendarNextMonth,
      handleCalendarJumpToToday,
      handleSelectCalendarRange,
    ]
  );

  const renderListEmpty = useCallback(() => {
    if (isLoading) {
      return <TransactionsSkeleton />;
    }
    const hasActiveFilters = activeCount > 0;
    const isCalendarRangeEmpty = viewMode === 'calendar' && selectedCalendarRange !== null;
    const isCalendarMonthEmpty = viewMode === 'calendar' && selectedCalendarRange === null;
    const isSingleDayEmpty = Boolean(
      selectedCalendarRange && selectedCalendarRange.start === selectedCalendarRange.end
    );
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <MaterialIcons
            name={
              hasActiveFilters
                ? 'filter-list-off'
                : viewMode === 'calendar'
                ? 'event-busy'
                : 'receipt-long'
            }
            size={40}
            color={colors.primary}
          />
        </View>
        <Text style={styles.emptyTitle}>
          {isCalendarRangeEmpty && selectedCalendarRange
            ? isSingleDayEmpty
              ? `No Activity on ${formatDate(selectedCalendarRange.start, 'short')}`
              : `No Activity (${formatDate(selectedCalendarRange.start, 'short')} – ${formatDate(selectedCalendarRange.end, 'short')})`
            : hasActiveFilters
            ? 'No Matching Transactions'
            : isCalendarMonthEmpty
            ? 'No Activity This Month'
            : 'No Transactions Yet'}
        </Text>
        <Text style={styles.emptyDescription}>
          {isCalendarRangeEmpty
            ? isSingleDayEmpty
              ? 'No transactions were recorded on this date under your current filters.'
              : 'No transactions were recorded in this date range under your current filters.'
            : hasActiveFilters
            ? 'Try resetting your search or filter criteria to see all activity.'
            : lockedAccountId
            ? 'No transactions found for this account yet.'
            : 'Track expenses automatically via bank alerts or record your first cash spend manually.'}
        </Text>
        {isCalendarRangeEmpty ? (
          <TouchableOpacity
            style={styles.emptyActionBtn}
            onPress={() => setSelectedCalendarRange(null)}
          >
            <Text style={styles.emptyActionBtnText}>Show Full Month</Text>
          </TouchableOpacity>
        ) : hasActiveFilters ? (
          <TouchableOpacity
            style={styles.emptyActionBtn}
            onPress={clearFilters}
          >
            <Text style={styles.emptyActionBtnText}>Clear Filters</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.emptyActionBtn}
            onPress={navigateToAddTransaction}
          >
            <MaterialIcons name="add" size={18} color={colors.onPrimary} />
            <Text style={styles.emptyActionBtnText}>Add First Transaction</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [
    isLoading,
    activeCount,
    viewMode,
    selectedCalendarRange,
    styles,
    colors,
    lockedAccountId,
    clearFilters,
    navigateToAddTransaction,
  ]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: showBack ? insets.bottom : 0 }]}>
      <Header
        isMainTab={selectedIds.size === 0 && !showBack}
        showBack={selectedIds.size > 0 || showBack}
        onBack={selectedIds.size > 0 ? () => setSelectedIds(new Set()) : undefined}
        title={
          selectedIds.size > 0
            ? `${selectedIds.size} Selected`
            : lockedAccountId
            ? selectedAccount?.name || 'Account Activity'
            : 'Activity'
        }
        leftNode={
          selectedIds.size > 0 ? (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setSelectedIds(new Set())}
            >
              <MaterialIcons name="close" size={24} color={colors.onSurface} />
            </TouchableOpacity>
          ) : showBack ? undefined : (
            <TouchableOpacity style={styles.avatarButton} onPress={() => router.navigate('/settings')}>
              <View style={[styles.avatarFallback, { backgroundColor: colors.primaryContainer }]}>
                <MaterialIcons name="person" size={20} color={colors.onPrimaryContainer} />
              </View>
            </TouchableOpacity>
          )
        }
        rightNode={
          selectedIds.size > 0 ? (
            <TouchableOpacity
              style={styles.selectAllBtn}
              onPress={handleToggleSelectAll}
            >
              <Text style={[styles.selectAllText, { color: colors.primary }]}>
                {selectedIds.size === transactions.length ? 'Deselect All' : 'Select All'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.iconButton} onPress={navigateToSearch}>
                <MaterialIcons name="search" size={24} color={colors.onSurface} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={navigateToAddTransaction}
              >
                <MaterialIcons name="add" size={24} color={colors.onSurface} />
              </TouchableOpacity>
            </View>
          )
        }
      />

      {isRecurringTab ? (
        <RecurringSchedulesList
          schedules={recurringSchedules}
          accounts={accounts}
          isLoading={isRecurringLoading}
          hideBalances={hideBalances}
          lockedAccountId={lockedAccountId}
          bottomInset={showBack ? 16 : bottomInset}
          ListHeaderComponent={renderListHeader}
          onAddRecurring={handleAddRecurring}
          onToggleActive={handleToggleRecurringActive}
          onDeleteSchedule={handleDeleteRecurring}
          onPayNow={handlePayRecurringNow}
        />
      ) : (
        <FlatList<FlatTransactionListItem>
          data={flatListItems}
          scrollEnabled={!isCalendarGliding}
          keyExtractor={keyExtractor}
          getItemLayout={getTransactionListItemLayout}
          renderItem={renderItem}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={renderListEmpty}
          ListFooterComponent={renderListFooter}
          contentContainerStyle={listContentContainerStyle}
          showsVerticalScrollIndicator={false}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          removeClippedSubviews={Platform.OS === 'android'}
          initialNumToRender={10}
          maxToRenderPerBatch={6}
          windowSize={5}
          updateCellsBatchingPeriod={50}
          extraData={listExtraData}
        />
      )}

      {filterModalVisible && (
        <TransactionFilterModal
          visible={filterModalVisible}
          filters={filters}
          lockedAccountId={lockedAccountId}
          onClose={() => setFilterModalVisible(false)}
          onApply={(nextFilters) => {
            setIsRecurringTab(false);
            setFilters(nextFilters);
            if (viewMode === 'calendar') {
              if (
                nextFilters.datePreset === 'custom' &&
                nextFilters.customDateFrom &&
                nextFilters.customDateTo
              ) {
                const normalized = normalizeCalendarRange(
                  nextFilters.customDateFrom,
                  nextFilters.customDateTo
                );
                const [y, m] = normalized.start.split('-').map(Number);
                if (y && m) {
                  setCalendarYear(y);
                  setCalendarMonth(m);
                }
                setSelectedCalendarRange(normalized);
              } else if (nextFilters.datePreset === 'all') {
                setSelectedCalendarRange(null);
              } else if (nextFilters.datePreset === 'this_month') {
                const now = new Date();
                setCalendarYear(now.getFullYear());
                setCalendarMonth(now.getMonth() + 1);
                setSelectedCalendarRange(null);
              } else if (nextFilters.datePreset === 'last_month') {
                const last = new Date();
                last.setMonth(last.getMonth() - 1);
                setCalendarYear(last.getFullYear());
                setCalendarMonth(last.getMonth() + 1);
                setSelectedCalendarRange(null);
              } else {
                setViewMode('list');
              }
            }
          }}
        />
      )}

      {reviewModalVisible && (
        <ReviewQueueModal
          visible={reviewModalVisible}
          onClose={() => setReviewModalVisible(false)}
        />
      )}

      {/* Floating Bulk Action Drawer */}
      {selectedIds.size > 0 && (
        <View style={[styles.bulkActionBar, { bottom: insets.bottom + (showBack ? 16 : 80), backgroundColor: colors.surfaceContainerHighest }]}>
          <TouchableOpacity
            style={styles.bulkActionItem}
            onPress={handleBulkDelete}
          >
            <View style={[styles.bulkIconCircle, { backgroundColor: colors.error + '20' }]}>
              <MaterialIcons name="delete-outline" size={20} color={colors.error} />
            </View>
            <Text style={[styles.bulkActionLabel, { color: colors.error }]}>Delete</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.bulkActionItem}
            onPress={() => setBulkCategoryModalVisible(true)}
          >
            <View style={[styles.bulkIconCircle, { backgroundColor: colors.primaryContainer }]}>
              <MaterialIcons name="category" size={20} color={colors.onPrimaryContainer} />
            </View>
            <Text style={[styles.bulkActionLabel, { color: colors.onSurface }]}>Category</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.bulkActionItem}
            onPress={() => setBulkAccountModalVisible(true)}
          >
            <View style={[styles.bulkIconCircle, { backgroundColor: colors.primaryContainer }]}>
              <MaterialIcons name="account-balance" size={20} color={colors.onPrimaryContainer} />
            </View>
            <Text style={[styles.bulkActionLabel, { color: colors.onSurface }]}>Account</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bulk Category Picker Modal */}
      {bulkCategoryModalVisible && (
        <Modal
          visible={bulkCategoryModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setBulkCategoryModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setBulkCategoryModalVisible(false)}
          >
            <View style={[styles.bulkModalSheet, { backgroundColor: colors.surfaceContainerLowest, paddingBottom: Math.max(insets.bottom, 24) + 16 }]}>
              <View style={styles.bulkModalHeader}>
                <Text style={[styles.bulkModalTitle, { color: colors.onSurface }]}>Change Category</Text>
                <TouchableOpacity onPress={() => setBulkCategoryModalVisible(false)}>
                  <MaterialIcons name="close" size={22} color={colors.onSurfaceVariant} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.bulkOptionItem, { borderBottomColor: colors.surfaceVariant }]}
                    onPress={() => handleSelectBulkCategory(cat.name)}
                  >
                    <View style={[styles.bulkOptionIcon, { backgroundColor: colors.surfaceContainerLow }]}>
                      <MaterialIcons name={getCategoryIcon(cat.name) as any} size={20} color={colors.primary} />
                    </View>
                    <Text style={[styles.bulkOptionText, { color: colors.onSurface }]}>{cat.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Bulk Account Picker Modal */}
      {bulkAccountModalVisible && (
        <Modal
          visible={bulkAccountModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setBulkAccountModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setBulkAccountModalVisible(false)}
          >
            <View style={[styles.bulkModalSheet, { backgroundColor: colors.surfaceContainerLowest, paddingBottom: Math.max(insets.bottom, 24) + 16 }]}>
              <View style={styles.bulkModalHeader}>
                <Text style={[styles.bulkModalTitle, { color: colors.onSurface }]}>Move to Account</Text>
                <TouchableOpacity onPress={() => setBulkAccountModalVisible(false)}>
                  <MaterialIcons name="close" size={22} color={colors.onSurfaceVariant} />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                {accounts.map((acc) => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[styles.bulkOptionItem, { borderBottomColor: colors.surfaceVariant }]}
                    onPress={() => handleSelectBulkAccount(acc.id)}
                  >
                    <View style={[styles.bulkOptionIcon, { backgroundColor: colors.surfaceContainerLow }]}>
                      <MaterialIcons name="account-balance" size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.bulkOptionText, { color: colors.onSurface }]}>{acc.name}</Text>
                      <Text style={[styles.bulkOptionSubtext, { color: colors.onSurfaceVariant }]}>
                        {formatCurrency(acc.balance)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surfaceContainerLow,
    },

    avatarButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    avatarFallback: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: spacing.sm,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
    },
    searchBar: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.onSurface,
      borderRadius: 12,
      height: 56,
      paddingHorizontal: 16,
      gap: 12,
    },
    filterButton: {
      width: 56,
      height: 56,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    filterButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterDotBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      backgroundColor: colors.error,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    filterDotText: {
      ...typography.labelMd,
      color: colors.onError,
      fontSize: 10,
      fontWeight: '700',
    },
    activeBadgesRow: {
      marginHorizontal: -20,
      marginBottom: 16,
    },
    activeBadgesContainer: {
      paddingHorizontal: 20,
      gap: 8,
      alignItems: 'center',
    },
    activeBadgePill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primaryContainer,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 16,
      gap: 6,
    },
    activeBadgeText: {
      ...typography.labelMd,
      color: colors.onPrimaryContainer,
      fontSize: 12,
      fontWeight: '600',
    },
    clearAllBtn: {
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    clearAllText: {
      ...typography.labelMd,
      color: colors.error,
      fontSize: 12,
      fontWeight: '600',
    },
    searchPlaceholder: {
      ...typography.bodyLg,
      color: colors.onSurfaceVariant,
    },
    filtersScroll: {
      marginHorizontal: -20,
      marginBottom: 24,
    },
    filtersContainer: {
      paddingHorizontal: 20,
      gap: 8,
      alignItems: 'center',
    },
    activeFilter: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 32,
      paddingHorizontal: 16,
      borderRadius: 16,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.primary,
      gap: 6,
    },
    activeFilterText: {
      ...typography.labelMd,
      color: colors.primary,
    },
    inactiveFilter: {
      flexDirection: 'row',
      alignItems: 'center',
      height: 32,
      paddingHorizontal: 16,
      borderRadius: 16,
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      gap: 6,
    },
    inactiveFilterText: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
    },
    reviewQueueBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primaryContainer,
      borderRadius: 16,
      padding: 14,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      gap: 12,
    },
    reviewQueueIconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    reviewQueueContent: {
      flex: 1,
    },
    reviewQueueTitle: {
      ...typography.labelMd,
      color: colors.onPrimaryContainer,
      fontWeight: '700',
    },
    reviewQueueSubtitle: {
      ...typography.bodyMd,
      color: colors.onPrimaryContainer,
      opacity: 0.8,
      marginTop: 2,
    },
    resultsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      marginBottom: 8,
    },
    resultsTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
    },
    resultsCount: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
    },
    emptyContainer: {
      paddingVertical: 48,
      paddingHorizontal: 24,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    emptyIconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.surfaceContainerLow,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    emptyTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
      textAlign: 'center',
    },
    emptyDescription: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
      lineHeight: 20,
      maxWidth: 280,
    },
    emptyActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 12,
      marginTop: 8,
    },
    emptyActionBtnText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      color: colors.onPrimary,
    },
    selectAllBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      justifyContent: 'center',
    },
    selectAllText: {
      ...typography.labelMd,
      fontWeight: '700',
      fontSize: 13,
    },
    bulkActionBar: {
      position: 'absolute',
      left: 20,
      right: 20,
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.2,
      shadowRadius: 16,
      elevation: 10,
    },
    bulkActionItem: {
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
    },
    bulkIconCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bulkActionLabel: {
      ...typography.labelMd,
      fontSize: 11,
      fontWeight: '700',
    },
    modalBackdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    bulkModalSheet: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      gap: 12,
    },
    bulkModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingBottom: 8,
    },
    bulkModalTitle: {
      ...typography.headlineSm,
      fontSize: 18,
    },
    bulkOptionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    bulkOptionIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bulkOptionText: {
      ...typography.bodyMd,
      fontWeight: '600',
      fontSize: 14,
    },
    bulkOptionSubtext: {
      ...typography.labelMd,
      fontSize: 11,
    },
  });
  return styles;
};

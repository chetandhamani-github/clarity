import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
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
import { spacing, typography, fontFamilies, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  usePaginatedTransactions,
  useMonthlyDailyTotals,
  useBulkDeleteTransactions,
  useBulkUpdateCategory,
  useBulkUpdateAccount,
  useCreateTransaction,
} from '@/hooks/use-transactions';
import { useAccounts } from '@/hooks/use-accounts';
import { useCategories } from '@/hooks/use-budget';
import { formatCurrency, formatDate, formatLocalDate, formatTransactionTime, getTransactionSign, groupTransactionsByDate } from '@/utils/format';
import { getMonthDateBounds } from '@/utils/calendar-utils';
import { getLocalTodayYmd } from '@/utils/date';
import { getCategoryIcon } from '@/utils/icons';
import { getTransactionDisplayName, hasMeaningfulMerchant } from '@/utils/transaction-display';
import { TransactionsCalendarCard } from '@/components/transactions/TransactionsCalendarCard';
import { TransactionFilterModal, ActiveFilters, DatePreset } from '@/components/modals/TransactionFilterModal';
import { ReviewQueueModal } from '@/components/modals/ReviewQueueModal';
import { useAppStore } from '@/store/use-app-store';
import { useSmsStore } from '@/store/useSmsStore';
import { haptics } from '@/utils/haptics';
import type { TransactionFilters, TransactionWithAccount } from '@/types';

const FILTERS = [
  { id: 'all', label: 'All', icon: 'list' },
  { id: 'expense', label: 'Expenses', icon: 'arrow-downward' },
  { id: 'income', label: 'Income', icon: 'arrow-upward' },
  { id: 'transfer', label: 'Transfers', icon: 'swap-horiz' },
];

const SECTION_HEADER_HEIGHT = 44;
const TRANSACTION_ROW_HEIGHT = 76;
const TRANSACTIONS_PAGE_SIZE = 25;

interface TransactionsScreenProps {
  showBack?: boolean;
  lockedAccountId?: string;
  initialCategory?: string;
  initialType?: 'all' | 'expense' | 'income' | 'transfer';
  initialDatePreset?: DatePreset;
}

type FlatTransactionListItem =
  | {
      kind: 'header';
      key: string;
      title: string;
      isFirst: boolean;
      offset: number;
      length: number;
    }
  | {
      kind: 'row';
      key: string;
      row: PreparedTransactionRow;
      isLastInSection: boolean;
      isVeryLast: boolean;
      offset: number;
      length: number;
    };

interface PreparedTransactionRow {
  id: string;
  title: string;
  subtitle: string;
  amountText: string;
  category: string;
  categoryIcon: ReturnType<typeof getCategoryIcon>;
  splitCount: number;
  tagLabel: string | null;
  hasReceipt: boolean;
  isCredit: boolean;
}

function prepareTransactionRow(
  tx: TransactionWithAccount,
  filterAccountId?: string
): PreparedTransactionRow {
  const isIncomingTransfer =
    Boolean(filterAccountId) && tx.type === 'transfer' && tx.toAccountId === filterAccountId;
  const isOutgoingTransfer =
    Boolean(filterAccountId) && tx.type === 'transfer' && tx.accountId === filterAccountId;
  const isCredit = tx.type === 'income' || isIncomingTransfer;
  const sign = isCredit
    ? '+'
    : isOutgoingTransfer || tx.type === 'expense'
    ? '-'
    : getTransactionSign(tx.type);
  const hasMerchant = hasMeaningfulMerchant(tx);
  const title = getTransactionDisplayName(tx);
  const timeStr = formatTransactionTime(tx.date, tx.createdAt);

  const metaParts: string[] = [];
  if (timeStr) {
    metaParts.push(timeStr);
  }
  if (tx.type === 'transfer') {
    metaParts.push(`${tx.accountName} → ${tx.toAccountName || 'Unknown'}`);
  } else if (hasMerchant) {
    if (tx.accountName) metaParts.push(tx.accountName);
    metaParts.push(tx.category);
  } else if (tx.accountName) {
    metaParts.push(tx.accountName);
  }

  const tags = tx.tags;
  const tagLabel =
    tags && tags.length > 0
      ? `#${tags[0]}${tags.length > 1 ? ` +${tags.length - 1}` : ''}`
      : null;

  return {
    id: tx.id,
    title,
    subtitle: metaParts.join(' • '),
    amountText: `${sign}${formatCurrency(tx.amount)}`,
    category: tx.category,
    categoryIcon: getCategoryIcon(tx.category),
    splitCount: tx.splits?.length ?? 0,
    tagLabel,
    hasReceipt: Boolean(tx.receiptUri),
    isCredit,
  };
}

const preparedRowCacheByContext = new Map<
  string,
  WeakMap<TransactionWithAccount, PreparedTransactionRow>
>();

function getPreparedTransactionRow(
  tx: TransactionWithAccount,
  currency: string,
  filterAccountId?: string
): PreparedTransactionRow {
  const contextKey = `${currency}:${filterAccountId ?? ''}`;
  let cache = preparedRowCacheByContext.get(contextKey);
  if (!cache) {
    cache = new WeakMap();
    preparedRowCacheByContext.set(contextKey, cache);
  }
  const cached = cache.get(tx);
  if (cached) {
    return cached;
  }
  const prepared = prepareTransactionRow(tx, filterAccountId);
  cache.set(tx, prepared);
  return prepared;
}

interface SectionHeaderItemProps {
  title: string;
  isFirst: boolean;
  styles: ReturnType<typeof getStyles>;
}

const SectionHeaderItem = React.memo(function SectionHeaderItem({
  title,
  isFirst,
  styles,
}: SectionHeaderItemProps) {
  return (
    <View style={[styles.dateGroupHeader, isFirst && styles.firstSectionHeader]}>
      <RNText style={styles.dateGroupText} numberOfLines={1} maxFontSizeMultiplier={1.15}>
        {title}
      </RNText>
    </View>
  );
});

interface TransactionRowItemProps {
  item: PreparedTransactionRow;
  isLastInSection: boolean;
  isVeryLast: boolean;
  isSelected: boolean;
  hasSelectionMode: boolean;
  iconDefaultColor: string;
  iconCreditColor: string;
  primaryColor: string;
  outlineColor: string;
  styles: ReturnType<typeof getStyles>;
  onPress: (id: string) => void;
  onLongPress: (id: string) => void;
}

const TransactionRowItem = React.memo(function TransactionRowItem({
  item,
  isLastInSection,
  isVeryLast,
  isSelected,
  hasSelectionMode,
  iconDefaultColor,
  iconCreditColor,
  primaryColor,
  outlineColor,
  styles,
  onPress,
  onLongPress,
}: TransactionRowItemProps) {
  const handleRowPress = useCallback(() => {
    onPress(item.id);
  }, [onPress, item.id]);

  const handleRowLongPress = useCallback(() => {
    onLongPress(item.id);
  }, [onLongPress, item.id]);

  const baseRowStyle = useMemo(
    () => [
      styles.transactionItem,
      isSelected && styles.transactionItemSelected,
      isVeryLast && styles.lastTransactionItem,
      isLastInSection && !isVeryLast && styles.transactionItemSectionLast,
    ],
    [styles, isSelected, isVeryLast, isLastInSection]
  );

  const pressedRowStyle = useMemo(
    () => [...baseRowStyle, styles.transactionItemPressed],
    [baseRowStyle, styles.transactionItemPressed]
  );

  const getRowStyle = useCallback(
    ({ pressed }: { pressed: boolean }) => (pressed ? pressedRowStyle : baseRowStyle),
    [pressedRowStyle, baseRowStyle]
  );

  return (
    <Pressable
      style={getRowStyle}
      onPress={handleRowPress}
      onLongPress={handleRowLongPress}
      delayLongPress={200}
    >
      {hasSelectionMode && (
        <View style={styles.selectionCheckbox}>
          <MaterialIcons
            name={isSelected ? 'check-circle' : 'radio-button-unchecked'}
            size={22}
            color={isSelected ? primaryColor : outlineColor}
          />
        </View>
      )}
      <View style={styles.transactionLeft}>
        <View
          style={[
            styles.transactionIconBox,
            item.isCredit && styles.transactionIconBoxCredit,
          ]}
        >
          <MaterialIcons
            name={item.categoryIcon}
            size={20}
            color={item.isCredit ? iconCreditColor : iconDefaultColor}
          />
        </View>
        <View style={styles.transactionTextCol}>
          <RNText style={styles.transactionName} numberOfLines={1} maxFontSizeMultiplier={1.15}>
            {item.title}
          </RNText>
          <RNText style={styles.transactionMeta} numberOfLines={1} maxFontSizeMultiplier={1.15}>
            {item.subtitle}
          </RNText>
        </View>
      </View>
      <View style={styles.transactionRight}>
        <RNText
          style={[
            styles.transactionAmount,
            item.isCredit && styles.transactionAmountCredit,
          ]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.15}
        >
          {item.amountText}
        </RNText>
        <View style={styles.badgesRow}>
          {item.splitCount > 0 && (
            <View style={[styles.categoryBadge, styles.secondaryBadge]}>
              <RNText
                style={[styles.categoryBadgeText, styles.secondaryBadgeText]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.15}
              >
                Split ({item.splitCount})
              </RNText>
            </View>
          )}
          <View style={styles.categoryBadge}>
            <RNText style={styles.categoryBadgeText} numberOfLines={1} maxFontSizeMultiplier={1.15}>
              {item.category}
            </RNText>
          </View>
          {item.tagLabel !== null && (
            <View style={[styles.categoryBadge, styles.tagBadge]}>
              <RNText
                style={[styles.categoryBadgeText, styles.secondaryBadgeText]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.15}
              >
                {item.tagLabel}
              </RNText>
            </View>
          )}
          {item.hasReceipt && (
            <View style={[styles.categoryBadge, styles.receiptBadge]}>
              <MaterialIcons name="receipt" size={12} color={primaryColor} />
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
});

export default function TransactionsScreen({
  showBack = false,
  lockedAccountId,
  initialCategory,
  initialType,
  initialDatePreset,
}: TransactionsScreenProps = {}) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const insets = useSafeInsets();
  const bottomInset = insets.bottom;
  const router = useRouter();
  const currency = useAppStore((state) => state.currency);
  const hideBalances = useAppStore((state) => state.hideBalances);

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth() + 1);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

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

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategoryModalVisible, setBulkCategoryModalVisible] = useState(false);
  const [bulkAccountModalVisible, setBulkAccountModalVisible] = useState(false);

  const dateRange = useMemo<{ dateFrom?: string; dateTo?: string }>(() => {
    if (viewMode === 'calendar') {
      if (selectedCalendarDate) {
        return { dateFrom: selectedCalendarDate, dateTo: selectedCalendarDate };
      }
      return getMonthDateBounds(calendarYear, calendarMonth);
    }

    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();

    switch (filters.datePreset) {
      case 'this_month': {
        const from = formatLocalDate(new Date(y, m, 1));
        const to = formatLocalDate(today);
        return { dateFrom: from, dateTo: to };
      }
      case 'last_month': {
        const from = formatLocalDate(new Date(y, m - 1, 1));
        const to = formatLocalDate(new Date(y, m, 0));
        return { dateFrom: from, dateTo: to };
      }
      case 'last_90_days': {
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 90);
        return { dateFrom: formatLocalDate(fromDate), dateTo: formatLocalDate(today) };
      }
      default:
        return {};
    }
  }, [viewMode, selectedCalendarDate, calendarYear, calendarMonth, filters.datePreset]);

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
    viewMode === 'calendar'
  );

  const queryFilters = useMemo<TransactionFilters>(() => {
    return {
      ...calendarBaseFilters,
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo,
    };
  }, [calendarBaseFilters, dateRange]);

  const {
    transactions,
    totalCount,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = usePaginatedTransactions(queryFilters, TRANSACTIONS_PAGE_SIZE);

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

  const groupedTransactions = useMemo(
    () => groupTransactionsByDate(transactions),
    [transactions]
  );

  const flatListItems = useMemo<FlatTransactionListItem[]>(() => {
    if (isLoading || groupedTransactions.length === 0) return [];
    const items: FlatTransactionListItem[] = [];
    const lastGroupIdx = groupedTransactions.length - 1;
    let offset = 0;

    for (let groupIndex = 0; groupIndex < groupedTransactions.length; groupIndex++) {
      const group = groupedTransactions[groupIndex];
      const isFirstGroup = groupIndex === 0;
      const isLastGroup = groupIndex === lastGroupIdx;

      items.push({
        kind: 'header',
        key: `header:${group.date}`,
        title: group.label,
        isFirst: isFirstGroup,
        offset,
        length: SECTION_HEADER_HEIGHT,
      });
      offset += SECTION_HEADER_HEIGHT;

      const lastRowIdx = group.items.length - 1;
      for (let rowIndex = 0; rowIndex < group.items.length; rowIndex++) {
        const tx = group.items[rowIndex];
        const isLastInSection = rowIndex === lastRowIdx;
        const isVeryLast = isLastGroup && isLastInSection;

        items.push({
          kind: 'row',
          key: tx.id,
          row: getPreparedTransactionRow(tx, currency, effectiveAccountId),
          isLastInSection,
          isVeryLast,
          offset,
          length: TRANSACTION_ROW_HEIGHT,
        });
        offset += TRANSACTION_ROW_HEIGHT;
      }
    }

    return items;
  }, [groupedTransactions, isLoading, effectiveAccountId, currency]);

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

  const getItemLayout = useCallback(
    (data: ArrayLike<FlatTransactionListItem> | null | undefined, index: number) => {
      const entry = data?.[index];
      if (entry) {
        return { length: entry.length, offset: entry.offset, index };
      }
      return { length: TRANSACTION_ROW_HEIGHT, offset: index * TRANSACTION_ROW_HEIGHT, index };
    },
    []
  );

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
      void fetchNextPage();
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
            styles={styles}
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
          styles={styles}
          onPress={handleItemPress}
          onLongPress={handleItemLongPress}
        />
      );
    },
    [colors, styles, selectedIds, hasSelectionMode, handleItemPress, handleItemLongPress]
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
      const label =
        filters.datePreset === 'this_month'
          ? 'This Month'
          : filters.datePreset === 'last_month'
          ? 'Last Month'
          : 'Last 90 Days';
      list.push({
        id: 'date',
        label: `Date: ${label}`,
        onRemove: () => setFilters((prev) => ({ ...prev, datePreset: 'all' })),
      });
    }
    return list;
  }, [filters, selectedAccount, lockedAccountId, viewMode]);

  const handleCalendarPrevMonth = useCallback(() => {
    setSelectedCalendarDate(null);
    if (calendarMonth === 1) {
      setCalendarMonth(12);
      setCalendarYear((y) => y - 1);
    } else {
      setCalendarMonth((m) => m - 1);
    }
  }, [calendarMonth]);

  const handleCalendarNextMonth = useCallback(() => {
    setSelectedCalendarDate(null);
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
    setSelectedCalendarDate(todayYmd);
  }, []);

  const handleSelectCalendarDate = useCallback(
    (dateStr: string) => {
      if (selectedCalendarDate === dateStr) {
        setSelectedCalendarDate(null);
        return;
      }
      const [y, m] = dateStr.split('-').map(Number);
      if (y && m && (y !== calendarYear || m !== calendarMonth)) {
        setCalendarYear(y);
        setCalendarMonth(m);
      }
      setSelectedCalendarDate(dateStr);
    },
    [selectedCalendarDate, calendarYear, calendarMonth]
  );

  const handleToggleViewMode = useCallback(() => {
    haptics.selection();
    setViewMode((prev) => (prev === 'list' ? 'calendar' : 'list'));
  }, []);

  const navigateToSearch = useCallback(() => {
    router.navigate(lockedAccountId ? `/(app)/search?accountId=${lockedAccountId}` : '/search');
  }, [router, lockedAccountId]);

  const navigateToAddTransaction = useCallback(() => {
    router.navigate(
      lockedAccountId ? `/(app)/add-transaction?accountId=${lockedAccountId}` : '/add-transaction'
    );
  }, [router, lockedAccountId]);

  const clearFilters = useCallback(() => {
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
              const isActive = (filters.type || 'all') === filter.id;
              return (
                <TouchableOpacity
                  key={filter.id}
                  style={isActive ? styles.activeFilter : styles.inactiveFilter}
                  onPress={() =>
                    setFilters((prev) => ({
                      ...prev,
                      type: filter.id as any,
                    }))
                  }
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

        {activeBadges.length > 0 && (
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

        {!lockedAccountId && reviewQueueCount > 0 && (
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

        {viewMode === 'calendar' && (
          <TransactionsCalendarCard
            year={calendarYear}
            month={calendarMonth}
            selectedDate={selectedCalendarDate}
            dailyTotals={dailyTotals}
            dailyMap={dailyMap}
            isLoading={isCalendarTotalsLoading}
            currencyCode={currency}
            hideBalances={hideBalances}
            onPrevMonth={handleCalendarPrevMonth}
            onNextMonth={handleCalendarNextMonth}
            onJumpToToday={handleCalendarJumpToToday}
            onSelectDate={handleSelectCalendarDate}
            onClearSelectedDate={() => setSelectedCalendarDate(null)}
          />
        )}

        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>
            {viewMode === 'calendar'
              ? selectedCalendarDate
                ? formatDate(selectedCalendarDate, 'short')
                : formatDate(
                    `${calendarYear}-${String(calendarMonth).padStart(2, '0')}-01`,
                    'month-year'
                  )
              : 'Recent Activity'}
          </Text>
          <Text style={styles.resultsCount}>
            {transactions.length < totalCount
              ? `${transactions.length} of ${totalCount}`
              : `${totalCount} ${totalCount === 1 ? 'Transaction' : 'Transactions'}`}
          </Text>
        </View>
      </View>
    ),
    [
      colors,
      styles,
      filters,
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
      selectedCalendarDate,
      dailyTotals,
      dailyMap,
      isCalendarTotalsLoading,
      currency,
      hideBalances,
      handleToggleViewMode,
      handleCalendarPrevMonth,
      handleCalendarNextMonth,
      handleCalendarJumpToToday,
      handleSelectCalendarDate,
    ]
  );

  const renderListEmpty = useCallback(() => {
    if (isLoading) {
      return <TransactionsSkeleton />;
    }
    const hasActiveFilters = activeCount > 0;
    const isCalendarDayEmpty = viewMode === 'calendar' && selectedCalendarDate !== null;
    const isCalendarMonthEmpty = viewMode === 'calendar' && selectedCalendarDate === null;
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
          {isCalendarDayEmpty
            ? `No Activity on ${formatDate(selectedCalendarDate, 'short')}`
            : hasActiveFilters
            ? 'No Matching Transactions'
            : isCalendarMonthEmpty
            ? 'No Activity This Month'
            : 'No Transactions Yet'}
        </Text>
        <Text style={styles.emptyDescription}>
          {isCalendarDayEmpty
            ? 'No transactions were recorded on this date under your current filters.'
            : hasActiveFilters
            ? 'Try resetting your search or filter criteria to see all activity.'
            : lockedAccountId
            ? 'No transactions found for this account yet.'
            : 'Track expenses automatically via bank alerts or record your first cash spend manually.'}
        </Text>
        {isCalendarDayEmpty ? (
          <TouchableOpacity
            style={styles.emptyActionBtn}
            onPress={() => setSelectedCalendarDate(null)}
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
    selectedCalendarDate,
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

      <FlatList<FlatTransactionListItem>
        data={flatListItems}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
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

      {filterModalVisible && (
        <TransactionFilterModal
          visible={filterModalVisible}
          filters={filters}
          lockedAccountId={lockedAccountId}
          onClose={() => setFilterModalVisible(false)}
          onApply={(nextFilters) => {
            setFilters(nextFilters);
            if (viewMode === 'calendar' && nextFilters.datePreset !== 'all') {
              setViewMode('list');
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
    dateGroupHeader: {
      backgroundColor: colors.surfaceContainerLow + '80',
      height: SECTION_HEADER_HEIGHT,
      justifyContent: 'center',
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineVariant,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.outlineVariant,
    },
    dateGroupText: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      textTransform: 'uppercase',
      letterSpacing: Platform.OS === 'ios' ? 0.6 : 0,
    },
    firstSectionHeader: {
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderTopWidth: 1,
    },
    transactionItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      height: TRANSACTION_ROW_HEIGHT,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineVariant,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.outlineVariant,
      backgroundColor: colors.surfaceContainerLowest,
    },
    transactionItemSelected: {
      backgroundColor: colors.primaryContainer + '30',
    },
    transactionItemPressed: {
      opacity: 0.72,
    },
    transactionItemSectionLast: {
      borderBottomWidth: 0,
    },
    lastTransactionItem: {
      borderBottomLeftRadius: 16,
      borderBottomRightRadius: 16,
      borderBottomWidth: 1,
    },
    transactionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      paddingRight: 12,
    },
    transactionIconBox: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    transactionIconBoxCredit: {
      backgroundColor: colors.primaryContainer,
    },
    transactionTextCol: {
      flex: 1,
      justifyContent: 'center',
    },
    transactionName: {
      ...typography.bodyLg,
      fontFamily: fontFamilies.medium,
      ...(Platform.OS === 'ios' ? { fontWeight: '500' as const } : {}),
      color: colors.onSurface,
    },
    transactionMeta: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
    },
    transactionRight: {
      alignItems: 'flex-end',
      flexShrink: 0,
    },
    transactionAmount: {
      fontFamily: fontFamilies.medium,
      fontSize: 20,
      lineHeight: 28,
      color: colors.onSurface,
      ...(Platform.OS === 'android' ? { includeFontPadding: false as const } : {}),
    },
    transactionAmountCredit: {
      color: colors.primary,
    },
    badgesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    categoryBadge: {
      backgroundColor: colors.primary + '1A', // primary/10
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 2,
      marginTop: 4,
      flexShrink: 0,
    },
    secondaryBadge: {
      backgroundColor: colors.secondaryContainer,
    },
    tagBadge: {
      backgroundColor: colors.secondaryContainer,
      paddingHorizontal: 6,
    },
    receiptBadge: {
      backgroundColor: colors.surfaceContainerHighest,
      paddingHorizontal: 5,
    },
    categoryBadgeText: {
      fontFamily: fontFamilies.semiBold,
      fontSize: 11,
      lineHeight: 15,
      color: colors.primary,
      textTransform: 'uppercase',
      ...(Platform.OS === 'android' ? { includeFontPadding: false as const } : {}),
    },
    secondaryBadgeText: {
      color: colors.onSecondaryContainer,
    },
    selectionCheckbox: {
      marginRight: 10,
      justifyContent: 'center',
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

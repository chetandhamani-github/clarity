import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SectionList,
  Platform,
} from 'react-native';
import { Text, Header, TransactionsSkeleton } from '@/components/ui';
import { spacing, typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTransactions } from '@/hooks/use-transactions';
import { useAccounts } from '@/hooks/use-accounts';
import { formatCurrency, formatLocalDate, getTransactionSign, groupTransactionsByDate } from '@/utils/format';
import { getCategoryIcon } from '@/utils/icons';
import { getTransactionDisplayName, hasMeaningfulMerchant } from '@/utils/transaction-display';
import { TransactionFilterModal, ActiveFilters, DatePreset } from '@/components/modals/TransactionFilterModal';
import { ReviewQueueModal } from '@/components/modals/ReviewQueueModal';
import { useSmsStore } from '@/store/useSmsStore';
import type { TransactionFilters } from '@/types';

const FILTERS = [
  { id: 'all', label: 'All', icon: 'list' },
  { id: 'expense', label: 'Expenses', icon: 'arrow-downward' },
  { id: 'income', label: 'Income', icon: 'arrow-upward' },
  { id: 'transfer', label: 'Transfers', icon: 'swap-horiz' },
];

export default function TransactionsScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { accounts } = useAccounts();
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const reviewQueueCount = useSmsStore((state) => state.reviewQueueCount);
  const refreshReviewQueueCount = useSmsStore((state) => state.refreshReviewQueueCount);
  const [filters, setFilters] = useState<ActiveFilters>({
    datePreset: 'all',
    type: 'all',
  });

  const dateRange = useMemo<{ dateFrom?: string; dateTo?: string }>(() => {
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
  }, [filters.datePreset]);

  const queryFilters = useMemo<TransactionFilters>(() => {
    return {
      type: filters.type === 'all' ? undefined : filters.type,
      accountId: filters.accountId,
      category: filters.category,
      dateFrom: dateRange.dateFrom,
      dateTo: dateRange.dateTo,
    };
  }, [filters, dateRange]);

  const { transactions, isLoading, refetch } = useTransactions(queryFilters);

  useFocusEffect(
    useCallback(() => {
      refetch();
      refreshReviewQueueCount();
    }, [refetch, refreshReviewQueueCount])
  );

  const groupedTransactions = useMemo(
    () => groupTransactionsByDate(transactions),
    [transactions]
  );

  const sections = useMemo(() => {
    if (isLoading) return [];
    return groupedTransactions.map((group, groupIndex) => ({
      title: group.label,
      date: group.date,
      data: group.items,
      isFirst: groupIndex === 0,
      isLast: groupIndex === groupedTransactions.length - 1,
    }));
  }, [groupedTransactions, isLoading]);

  const renderSectionHeader = useCallback(
    ({ section }: any) => (
      <View
        style={[
          styles.dateGroupHeader,
          section.isFirst && styles.firstSectionHeader,
        ]}
      >
        <Text style={styles.dateGroupText}>{section.title}</Text>
      </View>
    ),
    [styles]
  );

  const renderItem = useCallback(
    ({ item: tx, index, section }: any) => {
      const isLastInSection = index === section.data.length - 1;
      const isVeryLast = section.isLast && isLastInSection;
      const sign = getTransactionSign(tx.type);
      const hasMerchant = hasMeaningfulMerchant(tx);
      const title = getTransactionDisplayName(tx);
      const subtitle =
        tx.type === 'transfer'
          ? `${tx.accountName} → ${tx.toAccountName || 'Unknown'}`
          : hasMerchant
            ? `${tx.accountName} • ${tx.category}`
            : tx.accountName || '';

      return (
        <TouchableOpacity
          key={tx.id}
          style={[
            styles.transactionItem,
            isVeryLast && styles.lastTransactionItem,
            isLastInSection && !isVeryLast && { borderBottomWidth: 0 },
          ]}
          onPress={() => {
            router.navigate(`/(app)/add-transaction?id=${tx.id}`);
          }}
        >
          <View style={styles.transactionLeft}>
            <View
              style={[
                styles.transactionIconBox,
                tx.type === 'income' ? { backgroundColor: colors.primaryContainer } : undefined,
              ]}
            >
              <MaterialIcons
                name={getCategoryIcon(tx.category)}
                size={20}
                color={tx.type === 'income' ? colors.onPrimaryContainer : colors.onSurfaceVariant}
              />
            </View>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Text style={styles.transactionName} numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.transactionMeta} numberOfLines={1}>
                {subtitle}
              </Text>
            </View>
          </View>
          <View style={styles.transactionRight}>
            <Text
              style={[
                styles.transactionAmount,
                tx.type === 'income' ? { color: colors.primary } : undefined,
              ]}
            >
              {sign}
              {formatCurrency(tx.amount)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {tx.splits && tx.splits.length > 0 && (
                <View
                  style={[
                    styles.categoryBadge,
                    { backgroundColor: colors.secondaryContainer },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryBadgeText,
                      { color: colors.onSecondaryContainer },
                    ]}
                    numberOfLines={1}
                  >
                    Split ({tx.splits.length})
                  </Text>
                </View>
              )}
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText} numberOfLines={1}>{tx.category}</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [colors, styles, router]
  );

  const activeCount =
    (filters.type && filters.type !== 'all' ? 1 : 0) +
    (filters.datePreset !== 'all' ? 1 : 0) +
    (filters.accountId ? 1 : 0) +
    (filters.category ? 1 : 0);

  const selectedAccount = useMemo(() => {
    if (!filters.accountId) return null;
    return accounts.find((a) => a.id === filters.accountId);
  }, [accounts, filters.accountId]);

  const activeBadges = useMemo(() => {
    const list: { id: string; label: string; onRemove: () => void }[] = [];
    if (filters.accountId && selectedAccount) {
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
    if (filters.datePreset !== 'all') {
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
  }, [filters, selectedAccount]);

  const renderListHeader = useMemo(
    () => (
      <View>
        <View style={styles.searchRow}>
          <TouchableOpacity style={styles.searchBar} onPress={() => router.navigate('/search')}>
            <MaterialIcons name="search" size={20} color={colors.primary} />
            <Text style={styles.searchPlaceholder}>Search transactions...</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, activeCount > 0 && styles.filterButtonActive]}
            onPress={() => setFilterModalVisible(true)}
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
                onPress={() =>
                  setFilters({
                    datePreset: 'all',
                    type: 'all',
                  })
                }
                style={styles.clearAllBtn}
              >
                <Text style={styles.clearAllText}>Clear All</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}

        {reviewQueueCount > 0 && (
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
                Tap to verify details from parsed SMS
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.onPrimaryContainer} />
          </TouchableOpacity>
        )}

        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>Recent Activity</Text>
          <Text style={styles.resultsCount}>{transactions.length} Transactions</Text>
        </View>
      </View>
    ),
    [colors, styles, router, filters, activeCount, activeBadges, transactions.length, reviewQueueCount]
  );

  const renderListEmpty = useCallback(() => {
    if (isLoading) {
      return <TransactionsSkeleton />;
    }
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No transactions found</Text>
      </View>
    );
  }, [isLoading, styles]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header
        isMainTab
        title="Activity"
        leftNode={
          <TouchableOpacity style={styles.avatarButton} onPress={() => router.navigate('/settings')}>
            <View style={[styles.avatarFallback, { backgroundColor: colors.primaryContainer }]}>
              <MaterialIcons name="person" size={20} color={colors.onPrimaryContainer} />
            </View>
          </TouchableOpacity>
        }
        rightNode={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={styles.iconButton} onPress={() => router.navigate('/search')}>
              <MaterialIcons name="search" size={24} color={colors.onSurface} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => router.navigate('/add-transaction')}
            >
              <MaterialIcons name="add" size={24} color={colors.onSurface} />
            </TouchableOpacity>
          </View>
        }
      />

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderSectionHeader={renderSectionHeader}
        renderItem={renderItem}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={renderListEmpty}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        initialNumToRender={15}
        maxToRenderPerBatch={15}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
      />

      <TransactionFilterModal
        visible={filterModalVisible}
        filters={filters}
        onClose={() => setFilterModalVisible(false)}
        onApply={setFilters}
      />

      <ReviewQueueModal
        visible={reviewModalVisible}
        onClose={() => setReviewModalVisible(false)}
      />
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
      paddingVertical: 60,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    emptyText: {
      ...typography.bodyLg,
      color: colors.onSurfaceVariant,
    },
    dateGroupHeader: {
      backgroundColor: colors.surfaceContainerLow + '80',
      paddingHorizontal: 16,
      paddingVertical: 12,
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
      letterSpacing: 0.6,
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
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineVariant,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.outlineVariant,
      backgroundColor: colors.surfaceContainerLowest,
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
    transactionName: {
      ...typography.bodyLg,
      fontWeight: '500',
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
      fontFamily: 'Manrope_500Medium',
      fontSize: 20,
      lineHeight: 28,
      color: colors.onSurface,
    },
    categoryBadge: {
      backgroundColor: colors.primary + '1A', // primary/10
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 2,
      marginTop: 4,
      flexShrink: 0,
    },
    categoryBadgeText: {
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 11,
      lineHeight: 15,
      color: colors.primary,
      textTransform: 'uppercase',
    },
  });
  return styles;
};

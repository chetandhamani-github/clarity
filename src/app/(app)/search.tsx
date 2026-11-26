import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text, Header, ListSkeleton, TransactionsPaginationSkeleton } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { usePaginatedTransactions } from '@/hooks/use-transactions';
import { useAppStore } from '@/store/use-app-store';
import {
  FlatTransactionListItem,
  SectionHeaderItem,
  TransactionRowItem,
  buildFlatTransactionListItems,
  getTransactionListItemLayout,
  getTransactionListStyles,
} from '@/components/transactions/VirtualizedTransactionRows';

const SEARCH_PAGE_SIZE = 25;

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'expense', label: 'Expenses' },
  { id: 'income', label: 'Income' },
  { id: 'transfer', label: 'Transfers' },
];

export default function SearchScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const listStyles = useMemo(() => getTransactionListStyles(colors), [colors]);
  const router = useRouter();
  const insets = useSafeInsets();
  const currency = useAppStore((state) => state.currency);
  const params = useLocalSearchParams<{ accountId?: string | string[] }>();
  const accountId = Array.isArray(params.accountId) ? params.accountId[0] : params.accountId;

  const [searchQuery, setSearchQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const typeFilter =
    activeFilter === 'all' ? undefined : (activeFilter as 'expense' | 'income' | 'transfer');

  const queryFilters = useMemo(
    () => ({
      search: debouncedSearchQuery.trim() || undefined,
      type: typeFilter,
      accountId,
    }),
    [debouncedSearchQuery, typeFilter, accountId]
  );

  const {
    transactions,
    totalCount,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = usePaginatedTransactions(queryFilters, SEARCH_PAGE_SIZE);

  const flatListItems = useMemo<FlatTransactionListItem[]>(() => {
    if (isLoading) return [];
    return buildFlatTransactionListItems(transactions, currency, accountId);
  }, [transactions, isLoading, currency, accountId]);

  const handleItemPress = useCallback(
    (id: string) => {
      router.navigate(`/(app)/add-transaction?id=${id}`);
    },
    [router]
  );

  const keyExtractor = useCallback((item: FlatTransactionListItem) => item.key, []);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderListHeader = useMemo(() => {
    if (isLoading) return null;
    return (
      <View style={styles.resultsHeader}>
        <Text style={styles.resultsTitle}>
          {debouncedSearchQuery.trim() ? 'Matching Results' : 'Recent Activity'}
        </Text>
        <Text style={styles.resultsCount}>
          {transactions.length < totalCount
            ? `${transactions.length} of ${totalCount}`
            : `${totalCount} ${totalCount === 1 ? 'Transaction' : 'Transactions'}`}
        </Text>
      </View>
    );
  }, [isLoading, styles, debouncedSearchQuery, transactions.length, totalCount]);

  const renderListEmpty = useCallback(() => {
    if (isLoading) {
      return <ListSkeleton />;
    }
    return (
      <View style={styles.emptyContainer}>
        <MaterialIcons name="search-off" size={48} color={colors.outline} />
        <Text style={styles.emptyText}>No results found.</Text>
      </View>
    );
  }, [isLoading, styles, colors.outline]);

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
          isSelected={false}
          hasSelectionMode={false}
          iconDefaultColor={colors.onSurfaceVariant}
          iconCreditColor={colors.onPrimaryContainer}
          primaryColor={colors.primary}
          outlineColor={colors.outline}
          styles={listStyles}
          onPress={handleItemPress}
        />
      );
    },
    [colors, listStyles, handleItemPress]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Header showBack title="Search" />

      <View style={styles.content}>
        {/* Search Input Section */}
        <View style={styles.searchSection}>
          <View
            style={[styles.searchInputContainer, isFocused && styles.searchInputContainerFocused]}
          >
            <MaterialIcons
              name="search"
              size={24}
              color={isFocused ? colors.primary : colors.onSurfaceVariant}
              style={styles.searchIcon}
            />
            <TextInput
              style={styles.searchInput}
              placeholder="Search transactions..."
              placeholderTextColor={colors.onSurfaceVariant}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
                <MaterialIcons name="close" size={20} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            )}
          </View>

          {/* Quick Filter Chips */}
          <View style={styles.filterChipsRow}>
            {FILTERS.map((f) => {
              const isSelected = activeFilter === f.id;
              return (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.chip, isSelected && styles.chipSelected]}
                  onPress={() => setActiveFilter(f.id)}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Virtualized Search Results */}
        <FlatList<FlatTransactionListItem>
          style={styles.resultsContainer}
          data={flatListItems}
          keyExtractor={keyExtractor}
          getItemLayout={getTransactionListItemLayout}
          renderItem={renderItem}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={renderListEmpty}
          ListFooterComponent={renderListFooter}
          contentContainerStyle={styles.resultsScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          removeClippedSubviews={Platform.OS === 'android'}
          initialNumToRender={10}
          maxToRenderPerBatch={6}
          windowSize={5}
          updateCellsBatchingPeriod={50}
        />
      </View>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surfaceContainerLow,
    },
    content: {
      flex: 1,
    },
    searchSection: {
      paddingTop: 8,
      gap: 16,
    },
    searchInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.onSurface,
      borderRadius: 12,
      height: 56,
      marginHorizontal: 20,
      paddingHorizontal: 16,
    },
    searchInputContainerFocused: {
      borderColor: colors.primary,
      borderWidth: 1.5,
    },
    filterChipsRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 20,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    chipSelected: {
      backgroundColor: colors.primaryContainer,
      borderColor: colors.primary,
    },
    chipText: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
    },
    chipTextSelected: {
      color: colors.onPrimaryContainer,
      fontWeight: '700',
    },
    searchIcon: {
      marginRight: 12,
    },
    searchInput: {
      flex: 1,
      ...typography.bodyLg,
      color: colors.onSurface,
      height: '100%',
    },
    clearBtn: {
      padding: 4,
    },
    resultsContainer: {
      flex: 1,
      marginTop: 16,
    },
    resultsScrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    resultsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      marginBottom: 12,
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
  });
  return styles;
};

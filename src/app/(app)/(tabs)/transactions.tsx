import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text, Header } from '@/components/ui';
import { spacing, typography, useTheme, ThemeColors } from '@/theme';
import { Skeleton } from 'boneyard-js/native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTransactions } from '@/hooks/use-transactions';
import { formatCurrency, getTransactionSign, groupTransactionsByDate } from '@/utils/format';
import { getCategoryIcon } from '@/utils/icons';

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

  const [activeFilter, setActiveFilter] = useState<string>('all');
  
  // Convert filter string to type expected by useTransactions
  const typeFilter = activeFilter === 'all' ? undefined : activeFilter as 'expense' | 'income' | 'transfer';
  
  const { transactions, isLoading, refetch } = useTransactions({ type: typeFilter });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const groupedTransactions = groupTransactionsByDate(transactions);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header
        isMainTab
        title="Activity"
        leftNode={
          <TouchableOpacity style={styles.avatarButton} onPress={() => router.push('/settings')}>
            <View style={[styles.avatarFallback, { backgroundColor: colors.primaryContainer }]}>
              <MaterialIcons name="person" size={20} color={colors.onPrimaryContainer} />
            </View>
          </TouchableOpacity>
        }
        rightNode={
          <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/search')}>
            <MaterialIcons name="search" size={24} color={colors.onSurface} />
          </TouchableOpacity>
        }
      />

      <ScrollView 
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]} 
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity 
          style={styles.searchBar}
          onPress={() => router.push('/search')}
        >
          <MaterialIcons name="search" size={20} color={colors.primary} />
          <Text style={styles.searchPlaceholder}>Search transactions...</Text>
        </TouchableOpacity>

        <View style={styles.filtersScroll}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersContainer}
          >
            {FILTERS.map(filter => {
              const isActive = activeFilter === filter.id;
              return (
                <TouchableOpacity 
                  key={filter.id}
                  style={isActive ? styles.activeFilter : styles.inactiveFilter}
                  onPress={() => setActiveFilter(filter.id)}
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

        <View style={styles.resultsHeader}>
          <Text style={styles.resultsTitle}>Recent Activity</Text>
          <Text style={styles.resultsCount}>{transactions.length} Transactions</Text>
        </View>

        <Skeleton name="transactions-list" loading={isLoading}>
        {transactions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No transactions found</Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {groupedTransactions.map((group, groupIndex) => (
              <React.Fragment key={group.date}>
                <View style={styles.dateGroupHeader}>
                  <Text style={styles.dateGroupText}>{group.label}</Text>
                </View>
                {group.items.map((tx, txIndex) => {
                  const isLast = groupIndex === groupedTransactions.length - 1 && txIndex === group.items.length - 1;
                  const sign = getTransactionSign(tx.type);
                  
                  return (
                    <TouchableOpacity
                      key={tx.id}
                      style={[styles.transactionItem, isLast && { borderBottomWidth: 0 }]}
                      onPress={() => {
                        router.push(`/(app)/add-transaction?id=${tx.id}`);
                      }}
                    >
                      <View style={styles.transactionLeft}>
                        <View style={[
                          styles.transactionIconBox,
                          tx.type === 'income' ? { backgroundColor: colors.primaryContainer } : undefined
                        ]}>
                          <MaterialIcons 
                            name={getCategoryIcon(tx.category)} 
                            size={20} 
                            color={tx.type === 'income' ? colors.onPrimaryContainer : colors.primary} 
                          />
                        </View>
                        <View>
                          <Text style={styles.transactionName}>{tx.merchant}</Text>
                          <Text style={styles.transactionMeta}>{tx.accountName}</Text>
                        </View>
                      </View>
                      <View style={styles.transactionRight}>
                        <Text style={[
                          styles.transactionAmount,
                          tx.type === 'income' ? { color: colors.primary } : undefined
                        ]}>
                          {sign}{formatCurrency(tx.amount)}
                        </Text>
                        <View style={styles.categoryBadge}>
                          <Text style={styles.categoryBadgeText}>{tx.category}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </React.Fragment>
            ))}
          </View>
        )}
        </Skeleton>
      </ScrollView>
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
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.onSurface,
      borderRadius: 12,
      height: 56,
      paddingHorizontal: 16,
      gap: 12,
      marginBottom: 16,
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
    loaderContainer: {
      paddingVertical: 40,
      alignItems: 'center',
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
    emptyButton: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 20,
      marginTop: 8,
    },
    listCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      overflow: 'hidden',
    },
    dateGroupHeader: {
      backgroundColor: colors.surfaceContainerLow + '80',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineVariant,
    },
    dateGroupText: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    transactionItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineVariant,
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
    },
    transactionAmount: {
      fontFamily: 'Manrope',
      fontSize: 20,
      lineHeight: 28,
      fontWeight: '500',
      color: colors.onSurface,
    },
    categoryBadge: {
      backgroundColor: colors.primary + '1A', // primary/10
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 2,
      marginTop: 4,
    },
    categoryBadgeText: {
      fontFamily: 'Manrope',
      fontSize: 10,
      lineHeight: 14,
      fontWeight: '600',
      color: colors.primary,
      textTransform: 'uppercase',
    },
  });
  return styles;
};

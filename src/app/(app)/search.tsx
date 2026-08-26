import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Text } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTransactions } from '@/hooks/use-transactions';
import { formatCurrency, getTransactionSign, groupTransactionsByDate } from '@/utils/format';
import { getCategoryIcon } from '@/utils/icons';

// Simple debounce hook
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

export default function SearchScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [searchQuery, setSearchQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const { transactions, isLoading } = useTransactions({ search: debouncedSearchQuery });
  const groupedTransactions = groupTransactionsByDate(transactions);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Mobile Top App Bar */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Search
        </Text>
        <View style={styles.iconButtonSpacer} />
      </View>

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
        </View>

        {/* Search Results */}
        <KeyboardAwareScrollView
          style={styles.resultsContainer}
          contentContainerStyle={[styles.resultsScrollContent, { paddingBottom: insets.bottom + 60 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          enableOnAndroid={true}
        >
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsTitle}>
              {searchQuery ? 'Matching Results' : 'Recent Activity'}
            </Text>
            <Text style={styles.resultsCount}>{transactions.length} Transactions</Text>
          </View>

          {isLoading ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : transactions.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="search-off" size={48} color={colors.outline} />
              <Text style={styles.emptyText}>No results found.</Text>
            </View>
          ) : (
            <View style={styles.transactionsList}>
              {groupedTransactions.map((group, groupIndex) => (
                <React.Fragment key={group.date}>
                  <View style={styles.dateHeader}>
                    <Text style={styles.dateHeaderText}>{group.label}</Text>
                  </View>

                  {group.items.map((tx, txIndex) => {
                    const isLast = groupIndex === groupedTransactions.length - 1 && txIndex === group.items.length - 1;
                    const sign = getTransactionSign(tx.type);
                    
                    return (
                      <TouchableOpacity
                        key={tx.id}
                        style={[styles.transactionItem, isLast && { borderBottomWidth: 0 }]}
                        onPress={() => {
                          // TODO: Open detail modal
                        }}
                      >
                        <View style={styles.txLeft}>
                          <View style={[
                            styles.txIconBox,
                            tx.type === 'income' ? { backgroundColor: colors.primaryContainer } : undefined
                          ]}>
                            <MaterialIcons 
                              name={getCategoryIcon(tx.category)} 
                              size={20} 
                              color={tx.type === 'income' ? colors.onPrimaryContainer : colors.primary} 
                            />
                          </View>
                          <View style={styles.txTextContent}>
                            <Text style={styles.txTitle}>{tx.merchant}</Text>
                            <Text style={styles.txSubtitle}>{tx.accountName}</Text>
                          </View>
                        </View>
                        <View style={styles.txRight}>
                          <Text style={[
                            styles.txAmount,
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
        </KeyboardAwareScrollView>
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 16,
    },
    headerTitle: {
      ...typography.headlineMd,
      color: colors.onSurface,
    },
    iconButton: {
      padding: 8,
      borderRadius: 24,
    },
    iconButtonSpacer: {
      width: 40,
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
    transactionsList: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      overflow: 'hidden',
    },
    dateHeader: {
      backgroundColor: colors.surfaceContainerLow + '80',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineVariant,
    },
    dateHeaderText: {
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
    txLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      paddingRight: 12,
    },
    txIconBox: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    txTextContent: {
      justifyContent: 'center',
    },
    txTitle: {
      ...typography.bodyLg,
      fontWeight: '500',
      color: colors.onSurface,
    },
    txSubtitle: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
    },
    txRight: {
      alignItems: 'flex-end',
    },
    txAmount: {
      ...typography.dataLg,
      fontSize: 20,
      lineHeight: 28,
      color: colors.onSurface,
      fontWeight: '500',
    },
    categoryBadge: {
      backgroundColor: colors.primary + '1A',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 2,
      marginTop: 4,
    },
    categoryBadgeText: {
      ...typography.labelMd,
      fontSize: 10,
      lineHeight: 14,
      color: colors.primary,
      textTransform: 'uppercase',
    },
  });
  return styles;
};

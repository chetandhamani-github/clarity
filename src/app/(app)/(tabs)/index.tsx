import React, { useMemo } from 'react';
import { ProgressBar, Text } from '@/components/ui';
import { radius, ThemeColors, typography, useTheme } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image, ScrollView, StyleSheet, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { useAccounts } from '@/hooks/use-accounts';
import { useTransactions, useMonthlyTotals } from '@/hooks/use-transactions';
import { useBudgetPlan, useCategorySpending } from '@/hooks/use-budget';
import { formatCurrency, getTransactionSign } from '@/utils/format';
import { getCategoryIcon } from '@/utils/icons';

export default function DashboardScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Fetch Data
  const { accounts, isLoading: accountsLoading } = useAccounts();
  const { transactions, isLoading: txLoading } = useTransactions({ limit: 5 });
  const { totals: monthlyTotals, isLoading: totalsLoading } = useMonthlyTotals(currentMonth, currentYear);
  const { plan, isLoading: planLoading } = useBudgetPlan();
  const { spending, isLoading: spendingLoading } = useCategorySpending(currentMonth, currentYear);

  const isLoading = accountsLoading || txLoading || totalsLoading || planLoading || spendingLoading;

  // Calculate Net Worth
  const netWorth = useMemo(() => {
    return accounts.reduce((sum, account) => sum + account.balance, 0);
  }, [accounts]);

  // Calculate Budget Progress
  const budgetProgress = useMemo(() => {
    if (!plan) return { needsSpent: 0, wantsSpent: 0, savingsSpent: 0 };
    
    let needsSpent = 0;
    let wantsSpent = 0;
    let savingsSpent = 0;
    
    spending.forEach(cat => {
      if (cat.bucketType === 'needs') needsSpent += cat.spent;
      if (cat.bucketType === 'wants') wantsSpent += cat.spent;
      if (cat.bucketType === 'savings') savingsSpent += cat.spent;
    });
    
    return { needsSpent, wantsSpent, savingsSpent };
  }, [plan, spending]);

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Savings calculation: Income - Expenses (from transactions)
  const savedAmount = Math.max(0, monthlyTotals.income - monthlyTotals.expenses);

  const needsLimit = plan ? plan.monthlyIncome * (plan.needsPercent / 100) : 0;
  const wantsLimit = plan ? plan.monthlyIncome * (plan.wantsPercent / 100) : 0;
  const savingsLimit = plan ? plan.monthlyIncome * (plan.savingsPercent / 100) : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.avatarButton} onPress={() => router.push('/settings')}>
          <View style={[styles.avatarFallback, { backgroundColor: colors.primaryContainer }]}>
            <MaterialIcons name="person" size={20} color={colors.onPrimaryContainer} />
          </View>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Clarity</Text>

        <TouchableOpacity
          style={styles.notificationButton}
          onPress={() => router.push('/notifications')}
        >
          <MaterialIcons name="notifications-none" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Main Card: Net Worth */}
        <View style={styles.netWorthCard}>
          <View style={styles.netWorthHeader}>
            <Text style={styles.netWorthLabel}>TOTAL NET WORTH</Text>
            {/* Hardcoded badge for now since historical data requires a complex timeseries table */}
            <View style={styles.netWorthBadge}>
              <Text style={styles.netWorthBadgeText}>+4.2%</Text>
            </View>
          </View>
          <Text style={styles.netWorthAmount}>{formatCurrency(netWorth)}</Text>

          <View style={styles.chartContainer}>
            <Svg width="100%" height="100%" viewBox="0 0 100 30" preserveAspectRatio="none">
              <Defs>
                <LinearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={colors.primary} stopOpacity="0.1" />
                  <Stop offset="100%" stopColor={colors.primary} stopOpacity="0" />
                </LinearGradient>
              </Defs>
              <Path
                d="M0,30 L0,20 Q10,15 20,22 T40,15 T60,18 T80,5 T100,10 L100,30 Z"
                fill="url(#chartGradient)"
              />
              <Path
                d="M0,20 Q10,15 20,22 T40,15 T60,18 T80,5 T100,10"
                fill="none"
                stroke={colors.primary}
                strokeWidth="1.5"
              />
            </Svg>
          </View>
        </View>

        {/* Snapshot Row */}
        <View style={styles.snapshotRow}>
          <View style={styles.snapshotCard}>
            <Text style={styles.snapshotLabel}>INCOME</Text>
            <Text style={styles.snapshotValue}>{formatCurrency(monthlyTotals.income)}</Text>
          </View>
          <View style={styles.snapshotCard}>
            <Text style={styles.snapshotLabel}>EXPENSES</Text>
            <Text style={styles.snapshotValue}>{formatCurrency(monthlyTotals.expenses)}</Text>
          </View>
          <View style={styles.snapshotCard}>
            <Text style={styles.snapshotLabel}>SAVED</Text>
            <Text style={[styles.snapshotValue, { color: colors.primary }]}>{formatCurrency(savedAmount)}</Text>
          </View>
        </View>

        {/* Budget Allocation */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>Budget Allocation</Text>
          {plan ? (
            <TouchableOpacity style={styles.budgetCard} onPress={() => router.push('/plan')}>
              <View style={styles.budgetItem}>
                <View style={styles.budgetRow}>
                  <Text style={styles.budgetType}>Needs ({plan.needsPercent}%)</Text>
                  <Text style={styles.budgetAmount}>{formatCurrency(budgetProgress.needsSpent)} / {formatCurrency(needsLimit)}</Text>
                </View>
                <ProgressBar
                  progress={Math.min(1, budgetProgress.needsSpent / Math.max(1, needsLimit))}
                  color={colors.onSurface}
                  backgroundColor={colors.surfaceContainerHigh}
                />
              </View>

              <View style={styles.budgetItem}>
                <View style={styles.budgetRow}>
                  <Text style={styles.budgetType}>Wants ({plan.wantsPercent}%)</Text>
                  <Text style={styles.budgetAmount}>{formatCurrency(budgetProgress.wantsSpent)} / {formatCurrency(wantsLimit)}</Text>
                </View>
                <ProgressBar
                  progress={Math.min(1, budgetProgress.wantsSpent / Math.max(1, wantsLimit))}
                  color={colors.outline}
                  backgroundColor={colors.surfaceContainerHigh}
                />
              </View>

              <View style={styles.budgetItem}>
                <View style={styles.budgetRow}>
                  <Text style={styles.budgetType}>Savings ({plan.savingsPercent}%)</Text>
                  <Text style={styles.budgetAmount}>{formatCurrency(budgetProgress.savingsSpent)} / {formatCurrency(savingsLimit)}</Text>
                </View>
                <ProgressBar
                  progress={Math.min(1, budgetProgress.savingsSpent / Math.max(1, savingsLimit))}
                  color={colors.primary}
                  backgroundColor={colors.surfaceContainerHigh}
                />
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.budgetCard} onPress={() => router.push('/budget-setup')}>
              <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                <Text style={{ ...typography.bodyMd, color: colors.onSurfaceVariant, marginBottom: 12 }}>
                  No budget plan set up yet.
                </Text>
                <Text style={{ ...typography.labelMd, color: colors.primary }}>
                  SET UP BUDGET
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Recent Activity */}
        <View style={styles.sectionContainer}>
          <View style={styles.recentActivityHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <TouchableOpacity onPress={() => router.push('/transactions')}>
              <Text style={styles.viewAllText}>VIEW ALL</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.activityCard}>
            {transactions.length === 0 ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Text style={{ color: colors.onSurfaceVariant }}>No recent transactions.</Text>
              </View>
            ) : (
              transactions.map((tx, index) => {
                const isLast = index === transactions.length - 1;
                const sign = getTransactionSign(tx.type);
                return (
                  <TouchableOpacity
                    key={tx.id}
                    style={[styles.activityItem, isLast && styles.lastActivityItem]}
                    onPress={() => router.push('/(app)/(tabs)/transactions')} // Could route to details if built
                  >
                    <View style={[
                      styles.activityIconContainer, 
                      tx.type === 'income' ? { backgroundColor: colors.primary + '1A' } : undefined
                    ]}>
                      <MaterialIcons 
                        name={getCategoryIcon(tx.category)} 
                        size={20} 
                        color={tx.type === 'income' ? colors.primary : colors.onSurface} 
                      />
                    </View>
                    <View style={styles.activityDetails}>
                      <Text style={styles.activityName}>{tx.merchant}</Text>
                      <Text style={styles.activityDate}>{tx.date} • {tx.category}</Text>
                    </View>
                    <Text style={tx.type === 'income' ? styles.activityAmountPositive : styles.activityAmountNegative}>
                      {sign}{formatCurrency(tx.amount)}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      backgroundColor: colors.background + 'F2',
      zIndex: 40,
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
    headerTitle: {
      ...typography.displayLg,
      color: colors.primary,
    },
    notificationButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 20,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 16,
    },
    netWorthCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 20,
      marginBottom: 24,
    },
    netWorthHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    netWorthLabel: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
    },
    netWorthBadge: {
      backgroundColor: colors.primary + '1A', 
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radius.full,
    },
    netWorthBadgeText: {
      ...typography.labelMd,
      color: colors.primary,
    },
    netWorthAmount: {
      ...typography.dataLg,
      color: colors.onSurface,
      marginBottom: 24,
    },
    chartContainer: {
      height: 96,
      width: '100%',
    },
    snapshotRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 24,
    },
    snapshotCard: {
      flex: 1,
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 16,
    },
    snapshotLabel: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      marginBottom: 4,
    },
    snapshotValue: {
      ...typography.bodyLg,
      fontWeight: '500',
      color: colors.onSurface,
      fontSize: 14,
    },
    sectionContainer: {
      marginBottom: 24,
    },
    sectionTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
      marginBottom: 16,
    },
    budgetCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 20,
      gap: 16,
    },
    budgetItem: {},
    budgetRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    budgetType: {
      ...typography.bodyMd,
      color: colors.onSurface,
    },
    budgetAmount: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
    },
    recentActivityHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      marginBottom: 16,
    },
    viewAllText: {
      ...typography.labelMd,
      color: colors.primary,
    },
    activityCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      overflow: 'hidden',
    },
    activityItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceVariant,
    },
    lastActivityItem: {
      borderBottomWidth: 0,
    },
    activityIconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
    },
    activityDetails: {
      flex: 1,
    },
    activityName: {
      ...typography.bodyMd,
      fontWeight: '500',
      color: colors.onSurface,
    },
    activityDate: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
    },
    activityAmountNegative: {
      ...typography.bodyLg,
      color: colors.onSurface,
    },
    activityAmountPositive: {
      ...typography.bodyLg,
      color: colors.primary,
    },
  });
  return styles;
};

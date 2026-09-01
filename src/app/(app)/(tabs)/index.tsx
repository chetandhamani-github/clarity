import { Header, HomeSkeleton, ProgressBar, Text } from '@/components/ui';
import { radius, ThemeColors, typography, useTheme } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View
} from 'react-native';
import { LineChart, PieChart } from 'react-native-gifted-charts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccounts } from '@/hooks/use-accounts';
import { useBudgetPlan, useCategorySpending } from '@/hooks/use-budget';
import { useMonthlyTotals, useNetWorthHistory, useTransactions } from '@/hooks/use-transactions';
import { useDoubleBackToExit } from '@/hooks/use-double-back-to-exit';
import { formatCurrency, getTransactionSign } from '@/utils/format';
import { getCategoryIcon } from '@/utils/icons';

export default function DashboardScreen() {
  useDoubleBackToExit();

  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Fetch Data
  const { accounts, isLoading: accountsLoading, refetch: refetchAccounts } = useAccounts();
  const {
    transactions,
    isLoading: txLoading,
    refetch: refetchTransactions,
  } = useTransactions({ limit: 5 });
  const {
    totals: monthlyTotals,
    isLoading: totalsLoading,
    refetch: refetchTotals,
  } = useMonthlyTotals(currentMonth, currentYear);
  const { plan, isLoading: planLoading, refetch: refetchPlan } = useBudgetPlan();
  const {
    spending,
    isLoading: spendingLoading,
    refetch: refetchSpending,
  } = useCategorySpending(currentMonth, currentYear);
  const { history: nwHistory, isLoading: nwLoading, refetch: refetchNw } = useNetWorthHistory(30);

  useFocusEffect(
    useCallback(() => {
      refetchAccounts();
      refetchTransactions();
      refetchTotals();
      refetchPlan();
      refetchSpending();
      refetchNw();
    }, [
      refetchAccounts,
      refetchTransactions,
      refetchTotals,
      refetchPlan,
      refetchSpending,
      refetchNw,
    ])
  );

  const isLoading =
    accountsLoading || txLoading || totalsLoading || planLoading || spendingLoading || nwLoading;

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

    spending.forEach((cat) => {
      if (cat.bucketType === 'needs') needsSpent += cat.spent;
      if (cat.bucketType === 'wants') wantsSpent += cat.spent;
      if (cat.bucketType === 'savings') savingsSpent += cat.spent;
    });

    return { needsSpent, wantsSpent, savingsSpent };
  }, [plan, spending]);

  // Calculate Net Worth change percentage
  const nwChangePercent = useMemo(() => {
    if (nwHistory.length < 2) return 0;
    const start = nwHistory[0].value;
    const end = nwHistory[nwHistory.length - 1].value;
    if (start === 0) return end > 0 ? 100 : end < 0 ? -100 : 0;
    return ((end - start) / Math.abs(start)) * 100;
  }, [nwHistory]);

  const isPositiveTrend = nwChangePercent >= 0;
  const nwTrendStr = `${isPositiveTrend ? '+' : ''}${nwChangePercent.toFixed(1)}%`;

  // Format history for LineChart
  const chartData = useMemo(() => {
    let data = nwHistory;
    if (data.length === 0)
      data = [
        { date: new Date().toISOString().split('T')[0], value: 0 },
        { date: new Date().toISOString().split('T')[0], value: 0 },
      ];
    else if (data.length === 1) data = [data[0], data[0]];

    return data.map((point, index) => {
      const isStart = index === 0;
      const isEnd = index === data.length - 1;
      const isMid = index === Math.floor(data.length / 2);

      const dateParts = point.date.split('-');
      const label = isStart || isEnd || isMid ? `${dateParts[1]}/${dateParts[2]}` : '';

      return {
        value: point.value,
        label,
        dataPointText: formatCurrency(point.value),
      };
    });
  }, [nwHistory]);

  const chartConfig = useMemo(() => {
    const vals = chartData.map((d) => d.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min;

    if (range <= 0) {
      return {
        yAxisOffset: min < 0 ? min * 1.2 : 0,
        maxValue: max <= 0 ? (max === 0 ? 100 : 0) : max * 1.25,
        hasVariance: false,
      };
    }

    const padding = range * 0.15;
    return {
      yAxisOffset: Math.max(0, min - padding),
      maxValue: max + padding,
      hasVariance: true,
    };
  }, [chartData]);

  const screenWidth = Dimensions.get('window').width;
  // screen padding 20*2 = 40, card padding 24*2 = 48 -> chartWidth approx screenWidth - 88
  const chartWidth = screenWidth - 88;

  // Savings calculation: Income - Expenses (from transactions)
  const savedAmount = Math.max(0, monthlyTotals.income - monthlyTotals.expenses);

  const pieData = useMemo(() => {
    const activeSpending = spending.filter((s) => s.spent > 0);
    if (activeSpending.length === 0) {
      return [{ value: 1, color: colors.surfaceVariant, text: 'No Data' }];
    }

    const pieColors = [
      colors.primary,
      colors.tertiary,
      colors.error,
      '#FF9800',
      '#4CAF50',
      '#9C27B0',
      '#00BCD4',
    ];

    return activeSpending.map((item, index) => ({
      value: item.spent,
      color: pieColors[index % pieColors.length],
      text: item.category,
      label: item.category,
    }));
  }, [spending, colors]);

  const needsLimit = plan ? plan.monthlyIncome * (plan.needsPercent / 100) : 0;
  const wantsLimit = plan ? plan.monthlyIncome * (plan.wantsPercent / 100) : 0;
  const savingsLimit = plan ? plan.monthlyIncome * (plan.savingsPercent / 100) : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <Header
        isMainTab
        title="Clarity Finance"
        leftNode={
          <TouchableOpacity style={styles.avatarButton} onPress={() => router.push('/settings')}>
            <View style={[styles.avatarFallback, { backgroundColor: colors.primaryContainer }]}>
              <MaterialIcons name="person" size={20} color={colors.onPrimaryContainer} />
            </View>
          </TouchableOpacity>
        }
        rightNode={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/analytics')}>
              <MaterialIcons name="insights" size={24} color={colors.onSurface} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => router.push('/notifications')}
            >
              <MaterialIcons name="notifications-none" size={24} color={colors.onSurface} />
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flex: 1 }}>
          {isLoading ? (
            <HomeSkeleton />
          ) : (
            <>
              {/* Main Card: Net Worth */}
              <View style={styles.netWorthCard}>
                <View style={styles.netWorthHeader}>
                  <Text style={styles.netWorthLabel}>TOTAL NET WORTH</Text>
                  <View
                    style={[
                      styles.netWorthBadge,
                      {
                        backgroundColor: isPositiveTrend
                          ? colors.primary + '1A'
                          : colors.error + '1A',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.netWorthBadgeText,
                        { color: isPositiveTrend ? colors.primary : colors.error },
                      ]}
                    >
                      {nwTrendStr}
                    </Text>
                  </View>
                </View>
                <Text style={styles.netWorthAmount}>{formatCurrency(netWorth)}</Text>

                <View style={styles.chartContainer}>
                  <LineChart
                    data={chartData}
                    width={chartWidth}
                    height={130}
                    spacing={
                      chartData.length > 1 ? chartWidth / (chartData.length - 1) : chartWidth
                    }
                    adjustToWidth={true}
                    yAxisOffset={chartConfig.yAxisOffset}
                    maxValue={chartConfig.maxValue}
                    hideDataPoints
                    color={isPositiveTrend ? colors.primary : colors.error}
                    thickness={3}
                    initialSpacing={0}
                    endSpacing={0}
                    areaChart
                    startFillColor={isPositiveTrend ? colors.primary : colors.error}
                    startOpacity={0.3}
                    endFillColor={isPositiveTrend ? colors.primary : colors.error}
                    endOpacity={0.05}
                    curved={chartConfig.hasVariance && chartData.length > 2}
                    hideRules
                    hideYAxisText
                    hideAxesAndRules
                    pointerConfig={{
                      pointerStripHeight: 140,
                      pointerStripColor: colors.outline,
                      pointerStripWidth: 2,
                      pointerColor: colors.primary,
                      radius: 6,
                      pointerLabelWidth: 80,
                      pointerLabelHeight: 30,
                      activatePointersOnLongPress: true,
                      autoAdjustPointerLabelPosition: true,
                      pointerLabelComponent: (items: any) => {
                        return (
                          <View
                            style={{
                              height: 30,
                              width: 80,
                              justifyContent: 'center',
                              backgroundColor: colors.surfaceContainerHighest,
                              borderRadius: 8,
                              padding: 4,
                            }}
                          >
                            <Text
                              style={{
                                color: colors.onSurface,
                                fontSize: 12,
                                fontWeight: 'bold',
                                textAlign: 'center',
                              }}
                            >
                              {items[0].dataPointText}
                            </Text>
                          </View>
                        );
                      },
                    }}
                  />
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
                  <Text style={[styles.snapshotValue, { color: colors.primary }]}>
                    {formatCurrency(savedAmount)}
                  </Text>
                </View>
              </View>

              {/* Spending by Category Donut */}
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Spending Summary</Text>
                <View style={styles.budgetCard}>
                  <View style={{ alignItems: 'center', marginVertical: 10 }}>
                    <PieChart
                      data={pieData}
                      donut
                      radius={80}
                      innerRadius={55}
                      innerCircleColor={colors.surfaceContainerLowest}
                      centerLabelComponent={() => {
                        return (
                          <View style={{ justifyContent: 'center', alignItems: 'center' }}>
                            <Text style={{ fontSize: 12, color: colors.onSurfaceVariant }}>
                              Total
                            </Text>
                            <Text
                              style={{ fontSize: 16, color: colors.onSurface, fontWeight: 'bold' }}
                            >
                              {formatCurrency(monthlyTotals.expenses)}
                            </Text>
                          </View>
                        );
                      }}
                    />
                  </View>
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
                        <Text style={styles.budgetAmount}>
                          {formatCurrency(budgetProgress.needsSpent)} / {formatCurrency(needsLimit)}
                        </Text>
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
                        <Text style={styles.budgetAmount}>
                          {formatCurrency(budgetProgress.wantsSpent)} / {formatCurrency(wantsLimit)}
                        </Text>
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
                        <Text style={styles.budgetAmount}>
                          {formatCurrency(budgetProgress.savingsSpent)} /{' '}
                          {formatCurrency(savingsLimit)}
                        </Text>
                      </View>
                      <ProgressBar
                        progress={Math.min(
                          1,
                          budgetProgress.savingsSpent / Math.max(1, savingsLimit)
                        )}
                        color={colors.primary}
                        backgroundColor={colors.surfaceContainerHigh}
                      />
                    </View>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.budgetCard}
                    onPress={() => router.push('/budget-setup')}
                  >
                    <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                      <Text
                        style={{
                          ...typography.bodyMd,
                          color: colors.onSurfaceVariant,
                          marginBottom: 12,
                        }}
                      >
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
                      <Text style={{ color: colors.onSurfaceVariant }}>
                        No recent transactions.
                      </Text>
                    </View>
                  ) : (
                    transactions.map((tx, index) => {
                      const isLast = index === transactions.length - 1;
                      const sign = getTransactionSign(tx.type);
                      return (
                        <TouchableOpacity
                          key={tx.id}
                          style={[styles.activityItem, isLast && styles.lastActivityItem]}
                          onPress={() => router.push(`/(app)/add-transaction?id=${tx.id}`)}
                        >
                          <View
                            style={[
                              styles.activityIconContainer,
                              tx.type === 'income'
                                ? { backgroundColor: colors.primary + '1A' }
                                : undefined,
                            ]}
                          >
                            <MaterialIcons
                              name={getCategoryIcon(tx.category)}
                              size={20}
                              color={tx.type === 'income' ? colors.primary : colors.onSurface}
                            />
                          </View>
                          <View style={styles.activityDetails}>
                            <Text style={styles.activityName}>
                              {tx.type === 'transfer' ? `Transfer` : tx.merchant}
                            </Text>
                            <Text style={styles.activityDate}>
                              {tx.date} •{' '}
                              {tx.type === 'transfer'
                                ? `${tx.accountName} → ${tx.toAccountName || 'Unknown'}`
                                : tx.category}
                            </Text>
                          </View>
                          <Text
                            style={
                              tx.type === 'income'
                                ? styles.activityAmountPositive
                                : styles.activityAmountNegative
                            }
                          >
                            {sign}
                            {formatCurrency(tx.amount)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>
              </View>
            </>
          )}
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
      marginBottom: 8,
    },
    chartContainer: {
      marginTop: 12,
      height: 135,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
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

import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, Header } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMonthlyTotals, useTopMerchants, useRecurringTransactions, useMonthlyReports } from '@/hooks/use-transactions';
import { useAccounts } from '@/hooks/use-accounts';
import { useCategorySpending } from '@/hooks/use-budget';
import { formatCurrency } from '@/utils/format';
import { getCategoryIcon } from '@/utils/icons';

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { totals, isLoading: loadingTotals } = useMonthlyTotals(month, year);
  const { accounts, isLoading: loadingAccounts } = useAccounts();
  const { spending, isLoading: loadingSpending } = useCategorySpending(month, year);
  const { merchants, isLoading: loadingMerchants } = useTopMerchants(month, year, 5);
  const { transactions: recurring, isLoading: loadingRecurring } = useRecurringTransactions();
  const { reports, isLoading: loadingReports } = useMonthlyReports();

  const isLoading = loadingTotals || loadingAccounts || loadingSpending || loadingMerchants || loadingRecurring || loadingReports;

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const netCashFlow = totals.income - totals.expenses;
  const savingsRate = totals.income > 0 ? (netCashFlow / totals.income) * 100 : 0;
  
  const assets = accounts.filter(a => a.balance > 0).reduce((sum, a) => sum + a.balance, 0);
  const liabilities = accounts.filter(a => a.balance < 0).reduce((sum, a) => sum + Math.abs(a.balance), 0);
  const netWorth = assets - liabilities;

  // For Net Worth bars
  const totalAssetsLiabilities = assets + liabilities;
  const assetsPercent = totalAssetsLiabilities > 0 ? (assets / totalAssetsLiabilities) * 100 : 0;
  const liabilitiesPercent = totalAssetsLiabilities > 0 ? (liabilities / totalAssetsLiabilities) * 100 : 0;

  const currentMonthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header
        showBack
        title="Analytics Overview"
        rightNode={
          <TouchableOpacity style={styles.iconButton}>
            <MaterialIcons name="more-vert" size={24} color={colors.primary} />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 60 }]} showsVerticalScrollIndicator={false}>
        {/* Page Header */}
        <View style={styles.pageHeader}>
          <Text style={styles.dateInsightsText}>{currentMonthName} insights</Text>
          <TouchableOpacity style={styles.exportButton}>
            <Text style={styles.exportButtonText}>Export Report</Text>
            <MaterialIcons name="download" size={16} color={colors.onPrimary} />
          </TouchableOpacity>
        </View>

        {/* Bento Grid: Key Metrics & Cash Flow */}
        <View style={styles.bentoGrid}>
          {/* Cash Flow Card */}
          <View style={styles.cashFlowCard}>
            <View style={styles.cashFlowHeader}>
              <Text style={styles.cashFlowLabel}>NET CASH FLOW</Text>
              <View style={[styles.cashFlowBadge, { backgroundColor: netCashFlow >= 0 ? colors.primaryContainer : colors.errorContainer }]}>
                <Text style={[styles.cashFlowBadgeText, { color: netCashFlow >= 0 ? colors.onPrimaryContainer : colors.onErrorContainer }]}>
                  {netCashFlow >= 0 ? '+' : ''}{formatCurrency(netCashFlow)}
                </Text>
              </View>
            </View>

            <View style={styles.inOutRow}>
              <Text style={styles.inOutAmount}>{formatCurrency(totals.income)}</Text>
              <Text style={styles.inOutLabel}>In</Text>
              <Text style={styles.inOutDivider}>/</Text>
              <Text style={styles.inOutAmountOut}>{formatCurrency(totals.expenses)}</Text>
              <Text style={styles.inOutLabel}>Out</Text>
            </View>
            <Text style={styles.savedMessage}>You saved {savingsRate.toFixed(1)}% of your income this month.</Text>

            {/* Simplified Bar Chart Representation */}
            <View style={styles.barChartContainer}>
              {reports.slice(0, 6).reverse().map((report, idx, arr) => {
                const isLast = idx === arr.length - 1;
                // Calculate height based on max expenses to give a relative sense of scale
                const maxExpenses = Math.max(...arr.map(r => r.expenses), 1);
                const heightPct = Math.max((report.expenses / maxExpenses) * 100, 10); // min 10% height
                
                const reportDate = new Date(parseInt(report.datePrefix.split('-')[0]), parseInt(report.datePrefix.split('-')[1]) - 1, 1);
                const monthShort = reportDate.toLocaleString('default', { month: 'short' });

                return (
                  <View style={styles.barColumn} key={report.datePrefix}>
                    <View style={[isLast ? styles.barValueActive : styles.barValue, { height: `${heightPct}%` }]} />
                    {isLast && (
                      <View style={styles.tooltip}>
                        <Text style={styles.tooltipText}>{monthShort}</Text>
                      </View>
                    )}
                  </View>
                );
              })}
              
              {/* Fill remaining with empty bars if less than 6 months of data */}
              {Array.from({ length: Math.max(0, 6 - reports.length) }).map((_, idx) => (
                <View style={styles.barColumn} key={`empty-${idx}`}>
                  <View style={[styles.barValue, { height: '10%' }]} />
                </View>
              ))}
            </View>
          </View>

          {/* Net Worth Card */}
          <View style={styles.netWorthCard}>
            <View>
              <Text style={styles.netWorthLabel}>NET WORTH</Text>
              <Text style={styles.netWorthAmount}>{formatCurrency(netWorth)}</Text>
            </View>

            <View style={styles.netWorthBars}>
              <View style={styles.netWorthBarRow}>
                <View style={styles.netWorthBarTextRow}>
                  <Text style={styles.netWorthBarLabel}>Assets</Text>
                  <Text style={styles.netWorthBarValue}>{formatCurrency(assets)}</Text>
                </View>
                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { backgroundColor: colors.primary, width: `${Math.max(2, assetsPercent)}%` },
                    ]}
                  />
                </View>
              </View>

              <View style={styles.netWorthBarRow}>
                <View style={styles.netWorthBarTextRow}>
                  <Text style={styles.netWorthBarLabel}>Liabilities</Text>
                  <Text style={styles.netWorthBarValue}>{formatCurrency(liabilities)}</Text>
                </View>
                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { backgroundColor: colors.outlineVariant, width: `${Math.max(2, liabilitiesPercent)}%` },
                    ]}
                  />
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Spending by Category */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Spending by Category</Text>
          <View style={styles.categoryList}>
            {spending.filter(s => s.spent > 0).sort((a,b) => b.spent - a.spent).slice(0, 5).map((cat, i) => {
              const maxSpent = Math.max(...spending.map(s => s.spent), 1);
              const pct = (cat.spent / maxSpent) * 100;
              return (
                <View style={styles.categoryItem} key={i}>
                  <View style={styles.categoryRowTop}>
                    <View style={styles.categoryRowLeft}>
                      <View style={styles.categoryIconBox}>
                        <MaterialIcons name={getCategoryIcon(cat.category)} size={20} color={colors.onSurface} />
                      </View>
                      <Text style={styles.categoryName}>{cat.category}</Text>
                    </View>
                    <Text style={styles.categoryAmount}>{formatCurrency(cat.spent)}</Text>
                  </View>
                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { backgroundColor: i === 0 ? colors.primary : colors.outlineVariant, width: `${Math.max(2, pct)}%` },
                      ]}
                    />
                  </View>
                </View>
              );
            })}
            
            {spending.every(s => s.spent === 0) && (
              <Text style={{ ...typography.bodyMd, color: colors.onSurfaceVariant, textAlign: 'center' }}>
                No spending data for this month.
              </Text>
            )}
          </View>
        </View>

        {/* Bottom Lists */}
        <View style={styles.listsGrid}>
          {/* Top Merchants */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Top Merchants</Text>
            {merchants.length > 0 ? merchants.map((m, i) => (
              <View style={styles.listItem} key={i}>
                <View style={styles.listItemLeft}>
                  <View style={styles.avatarBox}>
                    <Text style={styles.avatarText}>{m.merchant.substring(0, 2).toUpperCase()}</Text>
                  </View>
                  <View>
                    <Text style={styles.listItemTitle}>{m.merchant}</Text>
                    <Text style={styles.listItemSubtitle}>Expense</Text>
                  </View>
                </View>
                <Text style={styles.listItemAmount}>{formatCurrency(m.total)}</Text>
              </View>
            )) : (
              <Text style={{ ...typography.bodyMd, color: colors.onSurfaceVariant, textAlign: 'center', padding: 16 }}>
                No merchants found.
              </Text>
            )}
          </View>

          {/* Recurring */}
          <View style={styles.card}>
            <View style={styles.recurringHeader}>
              <Text style={styles.cardTitle}>Recurring</Text>
              <TouchableOpacity style={styles.addRecurringBtn}>
                <Text style={styles.addRecurringText}>Add</Text>
                <MaterialIcons name="add" size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>

            {recurring.length > 0 ? recurring.map((tx, i) => (
              <View style={styles.listItem} key={tx.id}>
                <View style={styles.listItemLeft}>
                  <View style={styles.avatarBox}>
                    <MaterialIcons name="autorenew" size={20} color={colors.onSurface} />
                  </View>
                  <View>
                    <Text style={styles.listItemTitle}>{tx.merchant}</Text>
                    <Text style={styles.listItemSubtitle}>{tx.category}</Text>
                  </View>
                </View>
                <Text style={styles.listItemAmount}>{formatCurrency(tx.amount)}</Text>
              </View>
            )) : (
              <Text style={{ ...typography.bodyMd, color: colors.onSurfaceVariant, textAlign: 'center', padding: 16 }}>
                No recurring transactions.
              </Text>
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

    iconButton: {
      padding: 8,
      borderRadius: 24,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
      gap: 24,
    },
    pageHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
    },
    dateInsightsText: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
    },
    exportButton: {
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
    },
    exportButtonText: {
      ...typography.labelMd,
      color: colors.onPrimary,
    },
    bentoGrid: {
      gap: 12,
    },
    cashFlowCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      borderRadius: 16,
      padding: 20,
    },
    cashFlowHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 24,
    },
    cashFlowLabel: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      letterSpacing: 0.6,
    },
    cashFlowBadge: {
      backgroundColor: colors.surfaceContainer,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    cashFlowBadgeText: {
      ...typography.labelMd,
      color: colors.onSurface,
    },
    inOutRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      marginBottom: 8,
    },
    inOutAmount: {
      ...typography.dataLg,
      color: colors.onSurface,
      marginRight: 8,
    },
    inOutAmountOut: {
      ...typography.dataLg,
      color: colors.onSurface,
      opacity: 0.6,
      marginRight: 8,
    },
    inOutLabel: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
    },
    inOutDivider: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      marginHorizontal: 8,
    },
    savedMessage: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      fontSize: 14,
      marginBottom: 24,
    },
    barChartContainer: {
      height: 96,
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
    },
    barColumn: {
      flex: 1,
      height: '100%',
      justifyContent: 'flex-end',
      position: 'relative',
    },
    barValue: {
      width: '100%',
      backgroundColor: colors.surfaceContainerHigh,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 4,
    },
    barValueActive: {
      width: '100%',
      backgroundColor: colors.primary,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 4,
    },
    tooltip: {
      position: 'absolute',
      top: -24,
      left: '50%',
      transform: [{ translateX: -12 }],
      backgroundColor: colors.inverseSurface,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tooltipText: {
      color: colors.inverseOnSurface,
      fontSize: 10,
      fontWeight: '600',
    },
    netWorthCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      borderRadius: 16,
      padding: 20,
      flexDirection: 'column',
      justifyContent: 'space-between',
    },
    netWorthLabel: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      letterSpacing: 0.6,
      marginBottom: 8,
    },
    netWorthAmount: {
      ...typography.dataLg,
      color: colors.onSurface,
    },
    netWorthBars: {
      marginTop: 24,
      gap: 16,
    },
    netWorthBarRow: {
      gap: 4,
    },
    netWorthBarTextRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    netWorthBarLabel: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
    },
    netWorthBarValue: {
      ...typography.bodyMd,
      color: colors.onSurface,
      fontWeight: '600',
    },
    progressBarTrack: {
      height: 6,
      backgroundColor: colors.surfaceContainerHigh,
      borderRadius: 3,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 3,
    },
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      borderRadius: 16,
      padding: 24,
    },
    cardTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
      marginBottom: 24,
    },
    categoryList: {
      gap: 24,
    },
    categoryItem: {
      gap: 4,
    },
    categoryRowTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    categoryRowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    categoryIconBox: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryName: {
      ...typography.bodyLg,
      color: colors.onSurface,
      fontWeight: '600',
    },
    categoryAmount: {
      ...typography.bodyLg,
      color: colors.onSurface,
      fontWeight: '600',
    },
    listsGrid: {
      gap: 24,
    },
    listItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
    },
    listItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    avatarBox: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      ...typography.labelMd,
      color: colors.onSurface,
    },
    listItemTitle: {
      ...typography.bodyLg,
      color: colors.onSurface,
      fontWeight: '600',
    },
    listItemSubtitle: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
    },
    listItemAmount: {
      ...typography.bodyLg,
      color: colors.onSurface,
      fontWeight: '600',
    },
    recurringHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 24,
    },
    addRecurringBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    addRecurringText: {
      ...typography.labelMd,
      color: colors.primary,
    },
  });
  return styles;
};

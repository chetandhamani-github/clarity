import { Header, HomeSkeleton, ProgressBar, Text, useToast } from '@/components/ui';
import { UpcomingBillsWidget, useBills } from '@/modules/bills';
import { SplitwiseWidget } from '@/modules/splitwise';
import { SafeToSpendWidget } from '@/components/dashboard/SafeToSpendWidget';
import { HealthScoreWidget } from '@/components/dashboard/HealthScoreWidget';
import { AnnouncementBanner } from '@/components/backend';
import { ReorderableBankAccounts, OnboardingChecklistCard } from '@/components/common';
import { VoiceTransactionModal } from '@/components/modals/VoiceTransactionModal';
import type { ParsedVoiceTransaction } from '@/services/voice/voice-parser';
import { radius, ThemeColors, typography, useTheme } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dimensions,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View
} from 'react-native';
import { LineChart, PieChart } from 'react-native-gifted-charts';
import { useSafeInsets } from '@/hooks/use-safe-insets';

import { useAccounts } from '@/hooks/use-accounts';
import { useGoals } from '@/hooks/use-goals';
import { useBudgetPlan, useCategorySpending } from '@/hooks/use-budget';
import { usePortfolioSummary } from '@/hooks/use-investments';
import { useInvalidateCashflow, useSafeToSpend } from '@/hooks/use-cashflow';
import { invalidateAnalyticsAndHealthQueries } from '@/hooks/use-financial-health';
import { useMonthlyTotals, useNetWorthHistory, useTransactions, useCreateTransaction } from '@/hooks/use-transactions';
import { useDoubleBackToExit } from '@/hooks/use-double-back-to-exit';
import { useNotifications } from '@/hooks/use-notifications';
import { formatCurrency, formatCurrencyPrivacy, formatDate, formatLocalDate, formatTransactionTime, getCurrencySymbol, getTransactionSign } from '@/utils/format';
import { getCategoryIcon } from '@/utils/icons';
import { getTransactionDisplayName, hasMeaningfulMerchant } from '@/utils/transaction-display';
import { useAppStore } from '@/store/use-app-store';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useSmsStore } from '@/store/useSmsStore';

const RECENT_TRANSACTIONS_FILTER = { limit: 5 };

export default function DashboardScreen() {
  useDoubleBackToExit();

  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeInsets();
  const router = useRouter();
  const { hideBalances, toggleHideBalances, googleDriveConnected } = useAppStore();
  const [isDraggingAccounts, setIsDraggingAccounts] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const { notifications } = useNotifications();
  const unreadNotificationCount = notifications.filter((n) => !n.isRead).length;
  const pendingSmsTransactions = useSmsStore((state) => state.pendingTransactions);
  const openSmsTransactionPrompt = useSmsStore((state) => state.openTransactionPrompt);
  const { showToast } = useToast();
  const { mutate: createTransaction } = useCreateTransaction();
  const { summary: portfolioSummary, isLoading: portfolioLoading, refetch: refetchPortfolio } = usePortfolioSummary();
  const { isLoading: safeToSpendLoading } = useSafeToSpend();
  const { isLoading: billsLoading } = useBills();

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const handleOpenCopilot = useCallback(() => {
    router.navigate({
      pathname: '/(app)/copilot',
      params: { month: currentMonth.toString(), year: currentYear.toString() },
    });
  }, [router, currentMonth, currentYear]);

  const handleApplyVoiceFromHome = useCallback(
    (parsed: ParsedVoiceTransaction) => {
      router.navigate({
        pathname: '/add-transaction',
        params: {
          type: parsed.type,
          amount: parsed.amount > 0 ? parsed.amount.toString() : '',
          merchant: parsed.merchant,
          category: parsed.category,
          accountId: parsed.accountId,
          note: parsed.note,
        },
      });
    },
    [router]
  );

  // Fetch Data
  const queryClient = useQueryClient();
  const invalidateCashflow = useInvalidateCashflow();
  const { accounts, isLoading: accountsLoading, refetch: refetchAccounts } = useAccounts();
  const {
    transactions,
    isLoading: txLoading,
    refetch: refetchTransactions,
  } = useTransactions(RECENT_TRANSACTIONS_FILTER);
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
  const { goals } = useGoals();

  const handleDirectSaveVoice = useCallback(
    (parsed: ParsedVoiceTransaction) => {
      if (parsed.amount <= 0) {
        showToast('Please specify a valid amount', 'error');
        return;
      }

      const targetAccount = parsed.accountId
        ? accounts.find((a) => a.id === parsed.accountId) || accounts[0]
        : accounts[0];

      if (!targetAccount) {
        showToast('Please add a bank account first', 'error');
        return;
      }

      createTransaction(
        {
          accountId: targetAccount.id,
          amount: parsed.amount,
          type: parsed.type || 'expense',
          merchant: parsed.merchant || 'General',
          category: parsed.category || 'General',
          date: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          note: parsed.note || 'Logged via Voice',
          isRecurring: false,
          source: 'MANUAL',
          status: 'VERIFIED',
        },
        {
          onSuccess: () => {
            showToast(
              `Added ${parsed.type || 'expense'}: ${parsed.merchant || 'Transaction'} (${getCurrencySymbol()}${parsed.amount.toFixed(2)})`,
              'success'
            );
            refetchTransactions();
            refetchAccounts();
            refetchTotals();
          },
          onError: () => {
            showToast('Could not save voice transaction. Please try again.', 'error');
          },
        }
      );
    },
    [accounts, createTransaction, showToast, refetchTransactions, refetchAccounts, refetchTotals]
  );

  const notificationPermissionStatus = useNotificationStore(
    (state) => state.permissionStatus
  );
  const isNotificationTrackingEnabled = useNotificationStore((state) => state.isEnabled);
  const openNotificationDisclosure = useNotificationStore((state) => state.openDisclosure);

  const handleEnableAutoTracking = () => {
    openNotificationDisclosure();
  };

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      invalidateCashflow();
      invalidateAnalyticsAndHealthQueries(queryClient);
      await Promise.all([
        refetchAccounts(),
        refetchTransactions(),
        refetchTotals(),
        refetchPlan(),
        refetchSpending(),
        refetchNw(),
        refetchPortfolio(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [
    queryClient,
    invalidateCashflow,
    refetchAccounts,
    refetchTransactions,
    refetchTotals,
    refetchPlan,
    refetchSpending,
    refetchNw,
    refetchPortfolio,
  ]);

  const hasLoadedRef = useRef(false);
  const isAnyLoading =
    accountsLoading ||
    txLoading ||
    totalsLoading ||
    planLoading ||
    spendingLoading ||
    nwLoading ||
    portfolioLoading ||
    safeToSpendLoading ||
    billsLoading;

  if (!isAnyLoading && !hasLoadedRef.current) {
    hasLoadedRef.current = true;
  }

  // Only show skeleton on initial cold load before cached data exists
  const showSkeleton = !hasLoadedRef.current && isAnyLoading;

  // Calculate Comprehensive Net Worth (Accounts + Investments)
  const netWorth = useMemo(() => {
    const liquidNetWorth = accounts.reduce((sum, account) => sum + account.balance, 0);
    const investmentsValue = portfolioSummary
      ? Math.max(
          0,
          portfolioSummary.totalPortfolioValue -
            (portfolioSummary.allocations.find((a) => a.assetClass === 'cash')?.amount || 0)
        )
      : 0;
    return liquidNetWorth + investmentsValue;
  }, [accounts, portfolioSummary]);

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
          <TouchableOpacity style={styles.avatarButton} onPress={() => router.navigate('/settings')}>
            <View style={[styles.avatarFallback, { backgroundColor: colors.primaryContainer }]}>
              <MaterialIcons name="person" size={20} color={colors.onPrimaryContainer} />
            </View>
          </TouchableOpacity>
        }
        rightNode={
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleOpenCopilot}
              accessibilityLabel="Financial Copilot"
            >
              <MaterialIcons name="auto-awesome" size={22} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} onPress={() => router.navigate('/analytics')}>
              <MaterialIcons name="insights" size={22} color={colors.onSurface} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => router.navigate('/notifications')}
            >
              <MaterialIcons name="notifications-none" size={22} color={colors.onSurface} />
              {unreadNotificationCount > 0 && (
                <View style={styles.unreadBadgeDot}>
                  <Text style={styles.unreadBadgeText}>
                    {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView
        scrollEnabled={!isDraggingAccounts}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={{ flex: 1 }}>
          {showSkeleton ? (
            <HomeSkeleton />
          ) : (
            <>
              <AnnouncementBanner />

              {/* Onboarding Checklist for New Users - Top Priority Hero */}
              <OnboardingChecklistCard
                hasAccounts={accounts.length > 0}
                hasTransactions={transactions.length > 0}
                hasBudgetPlan={Boolean(plan && plan.monthlyIncome > 0)}
                hasGoals={Boolean(goals && goals.length > 0)}
                googleDriveConnected={googleDriveConnected}
                onEnableAutoTracking={handleEnableAutoTracking}
                autoTrackingEnabled={
                  notificationPermissionStatus === 'granted' && isNotificationTrackingEnabled
                }
              />

              {accounts.length === 0 ? (
                /* Cold Start Welcome Hero for Brand New User */
                <View style={styles.welcomeHeroCard}>
                  <View style={styles.welcomeHeroHeader}>
                    <View style={styles.welcomeHeroIcon}>
                      <MaterialIcons name="account-balance" size={26} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.welcomeHeroTitle}>Welcome to Clarity</Text>
                      <Text style={styles.welcomeHeroSubtitle}>
                        Your private, local-first finance manager. Follow the getting started guide above to add your accounts and configure your budget.
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.welcomeHeroButton}
                    onPress={() => router.navigate('/add-account')}
                  >
                    <MaterialIcons name="add" size={18} color={colors.onPrimary} />
                    <Text style={styles.welcomeHeroButtonText}>Add First Account</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {/* Notification Auto-Tracking Banner */}
                  {Platform.OS === 'android' && notificationPermissionStatus !== 'granted' && (
                    <View
                      style={{
                        marginBottom: 16,
                        padding: 16,
                        borderRadius: 16,
                        backgroundColor: colors.surfaceContainerLow,
                        borderWidth: 1,
                        borderColor: colors.outlineVariant,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                        <View
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            backgroundColor: colors.primaryContainer,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <MaterialIcons
                            name="notifications-active"
                            size={20}
                            color={colors.onPrimaryContainer}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ ...typography.bodyLg, color: colors.onSurface, fontWeight: '700' }}>
                            Auto-Track UPI & Bank Alerts
                          </Text>
                          <Text style={{ ...typography.bodyMd, color: colors.onSurfaceVariant, fontSize: 12 }}>
                            Detect UPI, cards & bills 100% offline.
                          </Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        onPress={handleEnableAutoTracking}
                        style={{
                          backgroundColor: colors.primary,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 10,
                        }}
                      >
                        <Text
                          style={{
                            ...typography.labelMd,
                            color: colors.onPrimary,
                            fontWeight: '700',
                          }}
                        >
                          ENABLE
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
              {/* Main Card: Net Worth */}
              <View style={styles.netWorthCard}>
                <View style={styles.netWorthHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.netWorthLabel}>TOTAL NET WORTH</Text>
                    <TouchableOpacity
                      onPress={toggleHideBalances}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.eyeIconButton}
                    >
                      <MaterialIcons
                        name={hideBalances ? 'visibility-off' : 'visibility'}
                        size={16}
                        color={colors.onSurfaceVariant}
                      />
                    </TouchableOpacity>
                  </View>
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
                      numberOfLines={1}
                    >
                      {nwTrendStr}
                    </Text>
                  </View>
                </View>
                <Text style={styles.netWorthAmount}>
                  {formatCurrencyPrivacy(netWorth, false, hideBalances)}
                </Text>

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

                {/* Wealth Portfolio Quick Link */}
                <TouchableOpacity
                  style={[
                    styles.portfolioPillRow,
                    {
                      backgroundColor: colors.surfaceContainerLow,
                      borderColor: colors.surfaceVariant,
                    },
                  ]}
                  onPress={() => router.navigate('/(app)/investments')}
                  activeOpacity={0.8}
                >
                  <View style={styles.portfolioPillLeft}>
                    <MaterialIcons name="insights" size={14} color="#3B82F6" />
                    <Text style={[styles.portfolioPillText, { color: colors.onSurface }]}>
                      {portfolioSummary && portfolioSummary.holdingsCount > 0
                        ? `Investments: ${formatCurrencyPrivacy(
                            portfolioSummary.totalPortfolioValue -
                              (portfolioSummary.allocations.find((a) => a.assetClass === 'cash')?.amount || 0),
                            false,
                            hideBalances
                          )}`
                        : 'Wealth & Investments Cockpit'}
                    </Text>
                  </View>
                  <Text style={[styles.portfolioPillCta, { color: colors.primary }]}>
                    {portfolioSummary && portfolioSummary.holdingsCount > 0 ? 'Cockpit →' : 'Explore →'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Quick Actions: Voice Add & Copilot */}
              <View style={styles.quickActionsRow}>
                <TouchableOpacity
                  style={styles.quickActionCard}
                  onPress={() => setShowVoiceModal(true)}
                  activeOpacity={0.7}
                >
                  <View style={styles.quickActionIconBox}>
                    <MaterialIcons name="mic" size={18} color={colors.onPrimaryContainer} />
                  </View>
                  <View style={styles.quickActionTextBox}>
                    <Text style={styles.quickActionTitle}>Voice Add</Text>
                    <Text style={styles.quickActionSubtitle}>Speak expense</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickActionCard}
                  onPress={handleOpenCopilot}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.quickActionIconBox,
                      { backgroundColor: colors.secondaryContainer },
                    ]}
                  >
                    <MaterialIcons
                      name="auto-awesome"
                      size={18}
                      color={colors.onSecondaryContainer}
                    />
                  </View>
                  <View style={styles.quickActionTextBox}>
                    <Text style={styles.quickActionTitle}>Ask Copilot</Text>
                    <Text style={styles.quickActionSubtitle}>Financial AI</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Pending SMS Transactions Banner */}
              {pendingSmsTransactions.length > 0 && (
                <TouchableOpacity
                  style={styles.pendingSmsBanner}
                  onPress={openSmsTransactionPrompt}
                  activeOpacity={0.8}
                >
                  <View style={styles.pendingSmsBannerLeft}>
                    <View style={styles.pendingSmsIcon}>
                      <MaterialIcons name="sms" size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pendingSmsTitle} numberOfLines={1}>
                        {pendingSmsTransactions.length} new transaction
                        {pendingSmsTransactions.length > 1 ? 's' : ''} detected
                      </Text>
                      <Text style={styles.pendingSmsSubtitle} numberOfLines={1}>
                        Tap to review and import into Clarity
                      </Text>
                    </View>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color={colors.onPrimaryContainer} />
                </TouchableOpacity>
              )}


              {/* Predictive Cash Flow & Safe to Spend Engine */}
              <SafeToSpendWidget />

              {/* Holistic Financial Health Score */}
              <HealthScoreWidget />

              {/* Snapshot Row */}
              <View style={styles.snapshotRow}>
                <View style={styles.snapshotCard}>
                  <Text style={styles.snapshotLabel} numberOfLines={1}>INCOME</Text>
                  <Text style={styles.snapshotValue} numberOfLines={1} adjustsFontSizeToFit>
                    {formatCurrencyPrivacy(monthlyTotals.income, hideBalances)}
                  </Text>
                </View>
                <View style={styles.snapshotCard}>
                  <Text style={styles.snapshotLabel} numberOfLines={1}>EXPENSES</Text>
                  <Text style={styles.snapshotValue} numberOfLines={1} adjustsFontSizeToFit>
                    {formatCurrencyPrivacy(monthlyTotals.expenses, hideBalances)}
                  </Text>
                </View>
                <View style={styles.snapshotCard}>
                  <Text style={styles.snapshotLabel} numberOfLines={1}>SAVED</Text>
                  <Text
                    style={[styles.snapshotValue, { color: colors.primary }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {formatCurrencyPrivacy(savedAmount, hideBalances)}
                  </Text>
                </View>
              </View>

              {/* Bank Accounts Section */}
              <ReorderableBankAccounts
                accounts={accounts}
                hideBalances={hideBalances}
                onAccountPress={(accountId) =>
                  router.navigate({
                    pathname: '/account-details',
                    params: { accountId },
                  })
                }
                onViewAll={() => router.navigate('/accounts')}
                onDragStateChange={setIsDraggingAccounts}
              />

              {/* Upcoming Bills & Utilities Carousel */}
              <UpcomingBillsWidget />

              {/* Splitwise Shared Expenses Widget */}
              <SplitwiseWidget />

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
                              {formatCurrencyPrivacy(monthlyTotals.expenses, hideBalances)}
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
                  <TouchableOpacity style={styles.budgetCard} onPress={() => router.navigate('/plan')}>
                    <View style={styles.budgetItem}>
                      <View style={styles.budgetRow}>
                        <Text style={styles.budgetType} numberOfLines={1}>Needs ({plan.needsPercent}%)</Text>
                        <Text style={styles.budgetAmount} numberOfLines={1} adjustsFontSizeToFit>
                          {formatCurrencyPrivacy(budgetProgress.needsSpent, hideBalances)} /{' '}
                          {formatCurrencyPrivacy(needsLimit, hideBalances)}
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
                        <Text style={styles.budgetType} numberOfLines={1}>Wants ({plan.wantsPercent}%)</Text>
                        <Text style={styles.budgetAmount} numberOfLines={1} adjustsFontSizeToFit>
                          {formatCurrencyPrivacy(budgetProgress.wantsSpent, hideBalances)} /{' '}
                          {formatCurrencyPrivacy(wantsLimit, hideBalances)}
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
                        <Text style={styles.budgetType} numberOfLines={1}>Savings ({plan.savingsPercent}%)</Text>
                        <Text style={styles.budgetAmount} numberOfLines={1} adjustsFontSizeToFit>
                          {formatCurrencyPrivacy(budgetProgress.savingsSpent, hideBalances)} /{' '}
                          {formatCurrencyPrivacy(savingsLimit, hideBalances)}
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
                    onPress={() => router.navigate('/budget-setup')}
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
                  <Text style={styles.recentActivityTitle}>Recent Activity</Text>
                  <TouchableOpacity
                    style={styles.viewAllButton}
                    onPress={() => router.navigate('/transactions')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
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
                      const hasMerchant = hasMeaningfulMerchant(tx);
                      const title = getTransactionDisplayName(tx);
                      const timeStr = formatTransactionTime(tx.date, tx.createdAt);
                      const dateDisplay = formatDate(tx.date, 'short');
                      const metaParts: string[] = [dateDisplay];
                      if (timeStr) metaParts.push(timeStr);
                      if (tx.type === 'transfer') {
                        metaParts.push(`${tx.accountName} → ${tx.toAccountName || 'Unknown'}`);
                      } else if (hasMerchant) {
                        if (tx.accountName) metaParts.push(tx.accountName);
                        metaParts.push(tx.category);
                      } else {
                        if (tx.accountName) metaParts.push(tx.accountName);
                      }
                      const subtitle = metaParts.join(' • ');

                      return (
                        <TouchableOpacity
                          key={tx.id}
                          style={[styles.activityItem, isLast && styles.lastActivityItem]}
                          onPress={() => router.navigate(`/(app)/add-transaction?id=${tx.id}`)}
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
                            <Text style={styles.activityName} numberOfLines={1}>
                              {title}
                            </Text>
                            <Text style={styles.activityDate} numberOfLines={1}>
                              {subtitle}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                            <Text
                              style={
                                tx.type === 'income'
                                  ? styles.activityAmountPositive
                                  : styles.activityAmountNegative
                              }
                            >
                              {sign}
                              {formatCurrencyPrivacy(tx.amount, false, hideBalances)}
                            </Text>
                            {tx.splits && tx.splits.length > 0 && (
                              <View
                                style={[
                                  styles.splitMiniBadge,
                                  { backgroundColor: colors.secondaryContainer },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.splitMiniBadgeText,
                                    { color: colors.onSecondaryContainer },
                                  ]}
                                  numberOfLines={1}
                                >
                                  Split ({tx.splits.length})
                                </Text>
                              </View>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>
              </View>
            </>
          )}
        </>
      )}
        </View>
      </ScrollView>

      <VoiceTransactionModal
        visible={showVoiceModal}
        onDismiss={() => setShowVoiceModal(false)}
        onApply={handleApplyVoiceFromHome}
        onSave={handleDirectSaveVoice}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, lastFour: a.lastFour }))}
      />
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
      position: 'relative',
    },
    unreadBadgeDot: {
      position: 'absolute',
      top: 4,
      right: 4,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.error,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    unreadBadgeText: {
      color: colors.onError,
      fontSize: 10,
      fontWeight: '700',
      lineHeight: 12,
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
      marginBottom: 16,
    },
    welcomeHeroCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: 20,
      marginBottom: 16,
      gap: 16,
    },
    welcomeHeroHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
    },
    welcomeHeroIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    welcomeHeroTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
      fontSize: 18,
      marginBottom: 4,
    },
    welcomeHeroSubtitle: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      lineHeight: 20,
    },
    welcomeHeroButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
    },
    welcomeHeroButtonText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      color: colors.onPrimary,
      fontSize: 14,
    },
    quickActionsRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 24,
    },
    quickActionCard: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    quickActionIconBox: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickActionTextBox: {
      flex: 1,
    },
    quickActionTitle: {
      ...typography.labelMd,
      fontWeight: '700',
      color: colors.onSurface,
      fontSize: 12,
      lineHeight: 16,
    },
    quickActionSubtitle: {
      ...typography.bodyMd,
      fontSize: 11,
      lineHeight: 14,
      color: colors.onSurfaceVariant,
    },
    pendingSmsBanner: {
      backgroundColor: colors.primaryContainer,
      borderRadius: 16,
      padding: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: colors.primary + '33',
      marginBottom: 24,
    },
    pendingSmsBannerLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginRight: 8,
    },
    pendingSmsIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceContainerLowest,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    pendingSmsTitle: {
      ...typography.labelMd,
      color: colors.onPrimaryContainer,
      fontWeight: '700',
    },
    pendingSmsSubtitle: {
      ...typography.bodyMd,
      fontSize: 12,
      lineHeight: 16,
      color: colors.onPrimaryContainer,
      opacity: 0.85,
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
    eyeIconButton: {
      padding: 2,
      justifyContent: 'center',
      alignItems: 'center',
    },
    netWorthBadge: {
      backgroundColor: colors.primary + '1A',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radius.full,
      flexShrink: 0,
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
    portfolioPillRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.lg,
      borderWidth: 1,
      marginTop: 12,
    },
    portfolioPillLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
    },
    portfolioPillText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 12,
    },
    portfolioPillCta: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 12,
      marginLeft: 8,
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
      alignItems: 'center',
      marginBottom: 16,
    },
    recentActivityTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
      marginBottom: 0,
    },
    viewAllButton: {
      paddingVertical: 4,
      paddingHorizontal: 4,
    },
    viewAllText: {
      ...typography.labelMd,
      color: colors.primary,
      fontWeight: '700',
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
      justifyContent: 'center',
      paddingRight: 8,
    },
    activityName: {
      ...typography.bodyMd,
      fontWeight: '600',
      color: colors.onSurface,
      marginBottom: 2,
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
    splitMiniBadge: {
      marginTop: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      alignSelf: 'flex-end',
      flexShrink: 0,
    },
    splitMiniBadgeText: {
      ...typography.labelMd,
      fontSize: 11,
      lineHeight: 15,
      fontFamily: 'Manrope_600SemiBold',
      textAlignVertical: 'center',
    },
  });
  return styles;
};

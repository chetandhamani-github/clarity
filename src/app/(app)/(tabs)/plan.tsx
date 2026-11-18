import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, Header, PlanSkeleton, useToast } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  useBudgetPlan,
  useCategorySpending,
  useUpdateCategory,
  useCreateCategory,
} from '@/hooks/use-budget';
import { useMonthlyBillSummary } from '@/hooks/use-bills';
import { formatCurrency } from '@/utils/format';
import { getCategoryIcon } from '@/utils/icons';
import type { BucketType, CategorySpending } from '@/types';

interface PlanScreenProps {
  showBack?: boolean;
}

export default function PlanScreen({ showBack = false }: PlanScreenProps = {}) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { showToast } = useToast();
  const updateCategoryMutation = useUpdateCategory();
  const createCategoryMutation = useCreateCategory();

  const [activeCategoryFilter, setActiveCategoryFilter] = useState<'all' | BucketType>('all');
  const [selectedCategoryForCap, setSelectedCategoryForCap] = useState<CategorySpending | null>(null);
  const [capModalVisible, setCapModalVisible] = useState(false);
  const [capInputAmount, setCapInputAmount] = useState('');

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const daysRemaining = daysInMonth - now.getDate();

  const monthName = now.toLocaleString('default', { month: 'long' });

  const { plan, isLoading: planLoading, refetch: refetchPlan } = useBudgetPlan();
  const {
    spending,
    isLoading: spendingLoading,
    refetch: refetchSpending,
  } = useCategorySpending(currentMonth, currentYear);
  const { data: billSummary } = useMonthlyBillSummary(currentMonth, currentYear);

  useFocusEffect(
    React.useCallback(() => {
      refetchPlan();
      refetchSpending();
    }, [refetchPlan, refetchSpending])
  );

  const isLoading = planLoading || spendingLoading;

  // Calculate totals from spending
  const totals = useMemo(() => {
    if (!plan) return { needsSpent: 0, wantsSpent: 0, savingsSpent: 0, totalSpent: 0 };

    let needsSpent = 0;
    let wantsSpent = 0;
    let savingsSpent = 0;

    spending.forEach((cat) => {
      if (cat.bucketType === 'needs') needsSpent += cat.spent;
      if (cat.bucketType === 'wants') wantsSpent += cat.spent;
      if (cat.bucketType === 'savings') savingsSpent += cat.spent;
    });

    return {
      needsSpent,
      wantsSpent,
      savingsSpent,
      totalSpent: needsSpent + wantsSpent + savingsSpent,
    };
  }, [plan, spending]);

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header
          isMainTab={!showBack}
          showBack={showBack}
          title="Budget Plan"
          leftNode={
            showBack ? undefined : (
              <TouchableOpacity style={styles.avatarButton} onPress={() => router.navigate('/settings')}>
                <View style={[styles.avatarFallback, { backgroundColor: colors.primaryContainer }]}>
                  <MaterialIcons name="person" size={20} color={colors.onPrimaryContainer} />
                </View>
              </TouchableOpacity>
            )
          }
          rightNode={<View style={styles.iconButton} />}
        />
        <PlanSkeleton />
      </View>
    );
  }

  // If no plan, prompt to set one up
  if (!plan) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header
          isMainTab={!showBack}
          showBack={showBack}
          title="Budget Plan"
          leftNode={
            showBack ? undefined : (
              <TouchableOpacity style={styles.avatarButton} onPress={() => router.navigate('/settings')}>
                <View style={[styles.avatarFallback, { backgroundColor: colors.primaryContainer }]}>
                  <MaterialIcons name="person" size={20} color={colors.onPrimaryContainer} />
                </View>
              </TouchableOpacity>
            )
          }
          rightNode={<View style={styles.iconButton} />}
        />
        <View
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, gap: 16 }}
        >
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: colors.surfaceContainerLow,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MaterialIcons name="account-balance-wallet" size={44} color={colors.primary} />
          </View>
          <Text style={{ ...typography.headlineSm, color: colors.onSurface }}>
            No Budget Plan Set
          </Text>
          <Text
            style={{ ...typography.bodyMd, color: colors.onSurfaceVariant, textAlign: 'center' }}
          >
            Set up your monthly income and allocation to start tracking your budget.
          </Text>
          <TouchableOpacity style={styles.editBtn} onPress={() => router.navigate('/budget-setup')}>
            <Text style={styles.editBtnText}>Set Up Budget</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const safePlan = plan || {
    monthlyIncome: 0,
    needsPercent: 50,
    wantsPercent: 30,
    savingsPercent: 20,
  };

  const needsLimit = safePlan.monthlyIncome * (safePlan.needsPercent / 100);
  const wantsLimit = safePlan.monthlyIncome * (safePlan.wantsPercent / 100);
  const savingsLimit = safePlan.monthlyIncome * (safePlan.savingsPercent / 100);

  const remaining = safePlan.monthlyIncome - totals.totalSpent;

  const forecast = useMemo(() => {
    if (!safePlan.monthlyIncome || safePlan.monthlyIncome <= 0 || totals.totalSpent <= 0) return null;
    const now = new Date();
    const daysPassed = Math.max(1, now.getDate());
    const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysLeft = Math.max(0, totalDays - daysPassed);

    const dailyBurn = totals.totalSpent / daysPassed;
    const projectedMonthEnd = Math.round(dailyBurn * totalDays);
    const variance = projectedMonthEnd - safePlan.monthlyIncome;
    const isOverbudgetRisk = variance > 0;
    const unpaidBills = billSummary ? billSummary.totalPending + billSummary.totalOverdue : 0;
    const targetDailyPace =
      daysLeft > 0 ? Math.max(0, (safePlan.monthlyIncome - totals.totalSpent) / daysLeft) : 0;
    const safeDailySpend =
      daysLeft > 0 ? Math.max(0, (safePlan.monthlyIncome - totals.totalSpent - unpaidBills) / daysLeft) : 0;

    return {
      daysPassed,
      totalDays,
      daysLeft,
      dailyBurn: Math.round(dailyBurn),
      projectedMonthEnd,
      variance,
      isOverbudgetRisk,
      unpaidBills: Math.round(unpaidBills),
      targetDailyPace: Math.round(targetDailyPace),
      safeDailySpend: Math.round(safeDailySpend),
    };
  }, [safePlan.monthlyIncome, totals.totalSpent, billSummary?.totalPending, billSummary?.totalOverdue]);

  const handleOpenCapModal = (cat: CategorySpending) => {
    setSelectedCategoryForCap(cat);
    setCapInputAmount(cat.limit > 0 ? cat.limit.toString() : '');
    setCapModalVisible(true);
  };

  const handleSaveCap = () => {
    if (!selectedCategoryForCap) return;
    const num = parseFloat(capInputAmount) || 0;

    if (selectedCategoryForCap.id) {
      updateCategoryMutation.mutate(
        selectedCategoryForCap.id,
        { limit: num },
        {
          onSuccess: () => {
            showToast(
              num > 0
                ? `Budget cap for ${selectedCategoryForCap.category} set to ${formatCurrency(num)}`
                : `Budget cap removed for ${selectedCategoryForCap.category}`,
              'success'
            );
            setCapModalVisible(false);
            setSelectedCategoryForCap(null);
            refetchSpending();
          },
        }
      );
    } else {
      createCategoryMutation.mutate(
        {
          name: selectedCategoryForCap.category,
          bucketType: selectedCategoryForCap.bucketType || 'wants',
          limit: num,
          icon: selectedCategoryForCap.icon || 'category',
          sortOrder: 99,
        },
        {
          onSuccess: () => {
            showToast(
              `Budget cap for ${selectedCategoryForCap.category} set to ${formatCurrency(num)}`,
              'success'
            );
            setCapModalVisible(false);
            setSelectedCategoryForCap(null);
            refetchSpending();
          },
        }
      );
    }
  };

  const handleRemoveCap = () => {
    if (!selectedCategoryForCap || !selectedCategoryForCap.id) {
      setCapModalVisible(false);
      return;
    }
    updateCategoryMutation.mutate(
      selectedCategoryForCap.id,
      { limit: 0 },
      {
        onSuccess: () => {
          showToast(`Budget cap removed for ${selectedCategoryForCap.category}`, 'info');
          setCapModalVisible(false);
          setSelectedCategoryForCap(null);
          refetchSpending();
        },
      }
    );
  };

  const filteredCategorySpending = useMemo(() => {
    return spending.filter((cat) => {
      if (activeCategoryFilter === 'all') return true;
      return cat.bucketType === activeCategoryFilter;
    });
  }, [spending, activeCategoryFilter]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header
        isMainTab={!showBack}
        showBack={showBack}
        title="Budget Plan"
        leftNode={
          showBack ? undefined : (
            <TouchableOpacity style={styles.avatarButton} onPress={() => router.navigate('/settings')}>
              <View style={[styles.avatarFallback, { backgroundColor: colors.primaryContainer }]}>
                <MaterialIcons name="person" size={20} color={colors.onPrimaryContainer} />
              </View>
            </TouchableOpacity>
          )
        }
        rightNode={
          <TouchableOpacity style={styles.iconButton} onPress={() => router.navigate('/reports')}>
            <MaterialIcons name="assessment" size={24} color={colors.onSurface} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <PlanSkeleton />
        ) : (
          <>
            {/* Section Header */}
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>{monthName} Plan</Text>
                <Text style={styles.sectionSubtitle}>{daysRemaining} days remaining</Text>
              </View>
              <TouchableOpacity style={styles.editBtn} onPress={() => router.navigate('/budget-setup')}>
                <Text style={styles.editBtnText}>Edit Allocation</Text>
              </TouchableOpacity>
            </View>

            {/* Summary Cards Grid */}
            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Monthly Income</Text>
                <Text style={styles.summaryValue}>{formatCurrency(safePlan.monthlyIncome)}</Text>
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Allocated</Text>
                <Text style={styles.summaryValue}>{formatCurrency(safePlan.monthlyIncome)}</Text>
              </View>

              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Spent / Saved</Text>
                <Text style={styles.summaryValue}>{formatCurrency(totals.totalSpent)}</Text>
              </View>

              <View style={[styles.summaryCard, styles.summaryCardHighlight]}>
                <View style={styles.highlightBackground} />
                <Text style={styles.summaryLabel}>{remaining >= 0 ? 'Remaining' : 'Overspent'}</Text>
                <Text
                  style={[
                    styles.summaryValue,
                    { color: remaining >= 0 ? colors.primary : colors.error },
                  ]}
                >
                  {formatCurrency(remaining)}
                </Text>
              </View>
            </View>

            {/* Smart Predictive Burn-Rate Forecast */}
            {forecast && (
              <View
                style={[
                  styles.forecastCard,
                  {
                    borderColor: forecast.isOverbudgetRisk
                      ? colors.errorContainer
                      : colors.outlineVariant,
                  },
                ]}
              >
                <View style={styles.forecastHeader}>
                  <View style={styles.forecastHeaderLeft}>
                    <View
                      style={[
                        styles.forecastIconBox,
                        {
                          backgroundColor: forecast.isOverbudgetRisk
                            ? colors.errorContainer
                            : colors.primaryContainer,
                        },
                      ]}
                    >
                      <MaterialIcons
                        name={forecast.isOverbudgetRisk ? 'trending-up' : 'auto-awesome'}
                        size={18}
                        color={
                          forecast.isOverbudgetRisk
                            ? colors.onErrorContainer
                            : colors.onPrimaryContainer
                        }
                      />
                    </View>
                    <Text style={styles.forecastTitle}>
                      {forecast.isOverbudgetRisk ? 'Burn-Rate Alert' : 'Cash-Flow Projection'}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.forecastBadge,
                      {
                        color: forecast.isOverbudgetRisk ? colors.error : colors.primary,
                      },
                    ]}
                  >
                    {forecast.daysLeft}d left
                  </Text>
                </View>
                <Text style={styles.forecastDesc}>
                  {forecast.isOverbudgetRisk
                    ? `At your current pace (${formatCurrency(forecast.dailyBurn)}/day), month-end spend is projected to reach ${formatCurrency(forecast.projectedMonthEnd)} (${formatCurrency(forecast.variance)} over budget). Limit daily spending to ${formatCurrency(forecast.targetDailyPace)} to stay on track.`
                    : `Spending is well-paced at ${formatCurrency(forecast.dailyBurn)}/day. Projected month-end spend is ${formatCurrency(forecast.projectedMonthEnd)} with estimated savings of ${formatCurrency(Math.abs(forecast.variance))}.`}
                </Text>

                <View style={styles.forecastMetricsRow}>
                  <View style={styles.forecastMetricItem}>
                    <Text style={styles.forecastMetricLabel}>Daily Burn</Text>
                    <Text style={styles.forecastMetricValue}>{formatCurrency(forecast.dailyBurn)}/d</Text>
                  </View>
                  <View style={styles.forecastMetricDivider} />
                  <View style={styles.forecastMetricItem}>
                    <Text style={styles.forecastMetricLabel}>Safe Today</Text>
                    <Text style={[styles.forecastMetricValue, { color: colors.primary }]}>
                      {formatCurrency(forecast.safeDailySpend)}/d
                    </Text>
                  </View>
                  <View style={styles.forecastMetricDivider} />
                  <View style={styles.forecastMetricItem}>
                    <Text style={styles.forecastMetricLabel}>Unpaid Bills</Text>
                    <Text style={styles.forecastMetricValue}>
                      {formatCurrency(forecast.unpaidBills)}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Allocation Sections */}
            <View style={styles.allocationSections}>
              {/* Needs */}
              <TouchableOpacity
                style={styles.allocationCard}
                onPress={() => router.navigate('/manage-categories')}
              >
                <View style={styles.allocationHeader}>
                  <View style={styles.allocationHeaderLeft}>
                    <MaterialIcons name="home" size={24} color="#3B82F6" />
                    <Text style={styles.allocationTitle}>Needs</Text>
                  </View>
                  <Text style={styles.allocationPercent}>{safePlan.needsPercent}%</Text>
                </View>
                <View style={styles.progressSection}>
                  <View style={styles.progressTextRow}>
                    <Text style={styles.progressLabel}>Spent</Text>
                    <Text style={styles.progressValue}>
                      {formatCurrency(totals.needsSpent)} / {formatCurrency(needsLimit)}
                    </Text>
                  </View>
                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          backgroundColor: '#3B82F6',
                          width: `${Math.min(100, (totals.needsSpent / Math.max(1, needsLimit)) * 100)}%`,
                        },
                      ]}
                    />
                  </View>
                </View>

                {billSummary && billSummary.totalCommitted > 0 && (
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 10,
                      paddingTop: 10,
                      borderTopWidth: 1,
                      borderTopColor: colors.outlineVariant,
                    }}
                    onPress={() => router.navigate('/(app)/bills')}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <MaterialIcons name="receipt-long" size={16} color={colors.onSurfaceVariant} />
                      <Text style={{ ...typography.bodyMd, color: colors.onSurfaceVariant, fontSize: 12 }}>
                        Committed Bills & Utilities
                      </Text>
                    </View>
                    <Text style={{ ...typography.labelMd, color: colors.primary, fontWeight: '700' }}>
                      {formatCurrency(billSummary.totalCommitted)} →
                    </Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>

              {/* Wants */}
              <TouchableOpacity
                style={styles.allocationCard}
                onPress={() => router.navigate('/manage-categories')}
              >
                <View style={styles.allocationHeader}>
                  <View style={styles.allocationHeaderLeft}>
                    <MaterialIcons name="shopping-bag" size={24} color="#EC4899" />
                    <Text style={styles.allocationTitle}>Wants</Text>
                  </View>
                  <Text style={styles.allocationPercent}>{safePlan.wantsPercent}%</Text>
                </View>
                <View style={styles.progressSection}>
                  <View style={styles.progressTextRow}>
                    <Text style={styles.progressLabel}>Spent</Text>
                    <Text style={styles.progressValue}>
                      {formatCurrency(totals.wantsSpent)} / {formatCurrency(wantsLimit)}
                    </Text>
                  </View>
                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          backgroundColor: '#EC4899',
                          width: `${Math.min(100, (totals.wantsSpent / Math.max(1, wantsLimit)) * 100)}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              </TouchableOpacity>

              {/* Savings */}
              <TouchableOpacity
                style={styles.allocationCard}
                onPress={() => router.navigate('/manage-categories')}
              >
                <View style={styles.allocationHeader}>
                  <View style={styles.allocationHeaderLeft}>
                    <MaterialIcons name="savings" size={24} color="#10B981" />
                    <Text style={styles.allocationTitle}>Savings</Text>
                  </View>
                  <Text style={styles.allocationPercent}>{safePlan.savingsPercent}%</Text>
                </View>
                <View style={styles.progressSection}>
                  <View style={styles.progressTextRow}>
                    <Text style={styles.progressLabel}>Saved</Text>
                    <Text style={styles.progressValue}>
                      {formatCurrency(totals.savingsSpent)} / {formatCurrency(savingsLimit)}
                    </Text>
                  </View>
                  <View style={styles.progressBarTrack}>
                    <View
                      style={[
                        styles.progressBarFill,
                        {
                          backgroundColor: '#10B981',
                          width: `${Math.min(100, (totals.savingsSpent / Math.max(1, savingsLimit)) * 100)}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              </TouchableOpacity>
            </View>

            {/* Category Micro-Budgets Section */}
            <View style={styles.categoryBudgetsSection}>
              <View style={styles.categoryBudgetsHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Category Budgets</Text>
                  <Text style={styles.sectionSubtitle}>
                    Set spending caps to prevent category overspending
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.manageCategoryBtn}
                  onPress={() => router.navigate('/manage-categories')}
                >
                  <Text style={[styles.manageCategoryBtnText, { color: colors.primary }]}>
                    Manage
                  </Text>
                  <MaterialIcons name="chevron-right" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>

              {/* Bucket Filter Pills */}
              <View style={styles.filterPillsRow}>
                {(['all', 'needs', 'wants', 'savings'] as const).map((tab) => {
                  const isActive = activeCategoryFilter === tab;
                  const label =
                    tab === 'all'
                      ? 'All'
                      : tab === 'needs'
                      ? 'Needs (50%)'
                      : tab === 'wants'
                      ? 'Wants (30%)'
                      : 'Savings (20%)';
                  return (
                    <TouchableOpacity
                      key={tab}
                      style={[
                        styles.filterPill,
                        {
                          backgroundColor: isActive
                            ? colors.primary
                            : colors.surfaceContainerLow,
                          borderColor: isActive
                            ? colors.primary
                            : colors.surfaceVariant,
                        },
                      ]}
                      onPress={() => setActiveCategoryFilter(tab)}
                    >
                      <Text
                        style={[
                          styles.filterPillText,
                          {
                            color: isActive ? colors.onPrimary : colors.onSurfaceVariant,
                            fontWeight: isActive ? '700' : '500',
                          },
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Category Spending & Caps List */}
              <View style={styles.categoryCardsList}>
                {filteredCategorySpending.length === 0 ? (
                  <View style={styles.emptyCategoriesBox}>
                    <MaterialIcons name="category" size={32} color={colors.onSurfaceVariant} />
                    <Text style={[styles.emptyCategoriesText, { color: colors.onSurfaceVariant }]}>
                      No categories found in this section
                    </Text>
                  </View>
                ) : (
                  filteredCategorySpending.map((cat) => {
                    const bucketColor =
                      cat.bucketType === 'needs'
                        ? '#3B82F6'
                        : cat.bucketType === 'wants'
                        ? '#EC4899'
                        : '#10B981';

                    const hasLimit = cat.limit > 0;
                    const percent = hasLimit ? Math.round((cat.spent / cat.limit) * 100) : 0;
                    const isExceeded = hasLimit && cat.spent > cat.limit;
                    const isWarning = hasLimit && percent >= 80 && !isExceeded;
                    const progressFill = hasLimit
                      ? Math.min(100, (cat.spent / cat.limit) * 100)
                      : 0;

                    const statusColor = isExceeded
                      ? colors.error
                      : isWarning
                      ? '#F59E0B'
                      : bucketColor;

                    return (
                      <TouchableOpacity
                        key={cat.category}
                        style={[
                          styles.categorySpendCard,
                          {
                            backgroundColor: colors.surfaceContainerLowest,
                            borderColor: isExceeded
                              ? colors.error
                              : isWarning
                              ? '#F59E0B'
                              : colors.surfaceVariant,
                          },
                        ]}
                        activeOpacity={0.7}
                        onPress={() => handleOpenCapModal(cat)}
                      >
                        <View style={styles.categoryCardTop}>
                          <View style={styles.categoryCardLeft}>
                            <View
                              style={[
                                styles.categoryIconCircle,
                                { backgroundColor: bucketColor + '18' },
                              ]}
                            >
                              <MaterialIcons
                                name={getCategoryIcon(cat.category) as any}
                                size={20}
                                color={bucketColor}
                              />
                            </View>
                            <View style={styles.categoryNameCol}>
                              <Text style={[styles.categoryNameText, { color: colors.onSurface }]}>
                                {cat.category}
                              </Text>
                              <Text
                                style={[
                                  styles.categoryBucketTag,
                                  { color: bucketColor },
                                ]}
                              >
                                {cat.bucketType.toUpperCase()}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.categoryCardRight}>
                            <View style={styles.amountRow}>
                              <Text style={[styles.spentAmountText, { color: colors.onSurface }]}>
                                {formatCurrency(cat.spent)}
                              </Text>
                              {hasLimit && (
                                <Text
                                  style={[
                                    styles.limitAmountText,
                                    { color: colors.onSurfaceVariant },
                                  ]}
                                >
                                  {' / ' + formatCurrency(cat.limit)}
                                </Text>
                              )}
                            </View>

                            {hasLimit ? (
                              <View
                                style={[
                                  styles.statusPill,
                                  {
                                    backgroundColor: statusColor + '18',
                                    borderColor: statusColor + '40',
                                  },
                                ]}
                              >
                                <Text style={[styles.statusPillText, { color: statusColor }]}>
                                  {isExceeded
                                    ? `+${formatCurrency(cat.spent - cat.limit)} over`
                                    : isWarning
                                    ? `${percent}% near cap`
                                    : `${formatCurrency(cat.limit - cat.spent)} left`}
                                </Text>
                              </View>
                            ) : (
                              <View
                                style={[
                                  styles.setCapBadge,
                                  {
                                    backgroundColor: colors.primaryContainer,
                                  },
                                ]}
                              >
                                <MaterialIcons
                                  name="tune"
                                  size={12}
                                  color={colors.onPrimaryContainer}
                                />
                                <Text
                                  style={[
                                    styles.setCapBadgeText,
                                    { color: colors.onPrimaryContainer },
                                  ]}
                                >
                                  Set Cap
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>

                        {/* Progress Bar (if limit is configured) */}
                        {hasLimit ? (
                          <View style={styles.categoryProgressBarTrack}>
                            <View
                              style={[
                                styles.categoryProgressBarFill,
                                {
                                  backgroundColor: statusColor,
                                  width: `${progressFill}%`,
                                },
                              ]}
                            />
                          </View>
                        ) : null}
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* Category Cap Setting Modal */}
      <Modal
        visible={capModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCapModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <TouchableOpacity
            style={styles.modalBackdropTouch}
            activeOpacity={1}
            onPress={() => setCapModalVisible(false)}
          />
          <View
            style={[
              styles.capModalContainer,
              { backgroundColor: colors.surfaceContainerLowest },
            ]}
          >
            {selectedCategoryForCap && (
              <>
                <View style={styles.capModalHeader}>
                  <View style={styles.capModalTitleRow}>
                    <View
                      style={[
                        styles.categoryIconCircle,
                        {
                          backgroundColor:
                            (selectedCategoryForCap.bucketType === 'needs'
                              ? '#3B82F6'
                              : selectedCategoryForCap.bucketType === 'wants'
                              ? '#EC4899'
                              : '#10B981') + '18',
                        },
                      ]}
                    >
                      <MaterialIcons
                        name={getCategoryIcon(selectedCategoryForCap.category) as any}
                        size={22}
                        color={
                          selectedCategoryForCap.bucketType === 'needs'
                            ? '#3B82F6'
                            : selectedCategoryForCap.bucketType === 'wants'
                            ? '#EC4899'
                            : '#10B981'
                        }
                      />
                    </View>
                    <View>
                      <Text style={[styles.capModalTitle, { color: colors.onSurface }]}>
                        {selectedCategoryForCap.category}
                      </Text>
                      <Text
                        style={[
                          styles.capModalSubtitle,
                          { color: colors.onSurfaceVariant },
                        ]}
                      >
                        Spent this month: {formatCurrency(selectedCategoryForCap.spent)}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.modalCloseBtn}
                    onPress={() => setCapModalVisible(false)}
                  >
                    <MaterialIcons name="close" size={22} color={colors.onSurfaceVariant} />
                  </TouchableOpacity>
                </View>

                {/* Monthly Cap Input */}
                <View style={styles.inputFieldGroup}>
                  <Text style={[styles.inputFieldLabel, { color: colors.onSurfaceVariant }]}>
                    Monthly Spending Cap
                  </Text>
                  <View
                    style={[
                      styles.amountInputRow,
                      {
                        backgroundColor: colors.surfaceContainerLow,
                        borderColor: colors.surfaceVariant,
                      },
                    ]}
                  >
                    <Text style={[styles.currencyPrefix, { color: colors.onSurface }]}>₹</Text>
                    <TextInput
                      style={[styles.amountInput, { color: colors.onSurface }]}
                      keyboardType="numeric"
                      placeholder="0.00"
                      placeholderTextColor={colors.onSurfaceVariant}
                      value={capInputAmount}
                      onChangeText={setCapInputAmount}
                      autoFocus
                    />
                  </View>
                </View>

                {/* Preset Increment Pills */}
                <View style={styles.presetPillsRow}>
                  {[500, 1000, 2000, 5000].map((inc) => (
                    <TouchableOpacity
                      key={inc}
                      style={[
                        styles.presetPill,
                        {
                          backgroundColor: colors.surfaceContainerLow,
                          borderColor: colors.surfaceVariant,
                        },
                      ]}
                      onPress={() => {
                        const current = parseFloat(capInputAmount) || 0;
                        setCapInputAmount((current + inc).toString());
                      }}
                    >
                      <Text style={[styles.presetPillText, { color: colors.onSurface }]}>
                        +{inc}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={[
                      styles.presetPill,
                      {
                        backgroundColor: colors.surfaceContainerLow,
                        borderColor: colors.surfaceVariant,
                      },
                    ]}
                    onPress={() => setCapInputAmount('')}
                  >
                    <Text style={[styles.presetPillText, { color: colors.error }]}>Clear</Text>
                  </TouchableOpacity>
                </View>

                {/* Modal Actions */}
                <View style={styles.modalActionsRow}>
                  {selectedCategoryForCap.limit > 0 && (
                    <TouchableOpacity
                      style={[styles.removeCapBtn, { borderColor: colors.error }]}
                      onPress={handleRemoveCap}
                    >
                      <Text style={[styles.removeCapBtnText, { color: colors.error }]}>
                        Remove Cap
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.saveCapBtn,
                      { backgroundColor: colors.primary, flex: 1 },
                    ]}
                    onPress={handleSaveCap}
                  >
                    <Text style={[styles.saveCapBtnText, { color: colors.onPrimary }]}>
                      Save Cap
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 22,
    },
    editBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
    },
    editBtnText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      lineHeight: 18,
      color: colors.onPrimary,
    },
    scrollContent: {
      padding: 20,
      gap: 24,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
    },
    sectionTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
    },
    sectionSubtitle: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      marginTop: 2,
    },

    summaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 16,
    },
    summaryCard: {
      width: '47%',
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      borderRadius: 16,
      padding: 16,
      justifyContent: 'space-between',
      minHeight: 100,
    },
    summaryCardHighlight: {
      position: 'relative',
      overflow: 'hidden',
    },
    highlightBackground: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.primaryContainer,
      opacity: 0.1,
    },
    summaryLabel: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
    },
    summaryValue: {
      ...typography.dataLg,
      color: colors.onSurface,
      marginTop: 8,
      fontSize: 22,
      lineHeight: 28,
    },
    allocationSections: {
      gap: 16,
    },
    allocationCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      borderRadius: 16,
      padding: 24,
      gap: 16,
    },
    allocationHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    allocationHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    allocationTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
    },
    allocationPercent: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
    },
    progressSection: {
      gap: 8,
    },
    progressTextRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    progressLabel: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
    },
    progressValue: {
      ...typography.bodyMd,
      color: colors.onSurface,
    },
    progressBarTrack: {
      width: '100%',
      height: 8,
      backgroundColor: colors.surfaceContainer,
      borderRadius: 4,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: colors.primary,
      borderRadius: 4,
    },
    forecastCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      borderWidth: 1,
      padding: 16,
      gap: 10,
    },
    forecastHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    forecastHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    forecastIconBox: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    forecastTitle: {
      ...typography.labelMd,
      fontWeight: '700',
      color: colors.onSurface,
    },
    forecastBadge: {
      ...typography.labelMd,
      fontWeight: '700',
      fontSize: 12,
    },
    forecastDesc: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      lineHeight: 20,
    },
    forecastMetricsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginTop: 4,
    },
    forecastMetricItem: {
      flex: 1,
      alignItems: 'center',
    },
    forecastMetricDivider: {
      width: StyleSheet.hairlineWidth,
      height: 24,
      backgroundColor: colors.outlineVariant,
    },
    forecastMetricLabel: {
      ...typography.labelMd,
      fontSize: 10,
      color: colors.onSurfaceVariant,
      marginBottom: 2,
    },
    forecastMetricValue: {
      ...typography.labelMd,
      fontWeight: '700',
      fontSize: 12,
      color: colors.onSurface,
    },
    categoryBudgetsSection: {
      gap: 16,
      marginTop: 8,
    },
    categoryBudgetsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    manageCategoryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingVertical: 4,
    },
    manageCategoryBtnText: {
      ...typography.labelMd,
      fontWeight: '700',
      fontSize: 13,
    },
    filterPillsRow: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
    },
    filterPill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      borderWidth: 1,
    },
    filterPillText: {
      ...typography.labelMd,
      fontSize: 12,
    },
    categoryCardsList: {
      gap: 12,
    },
    emptyCategoriesBox: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 8,
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
    },
    emptyCategoriesText: {
      ...typography.bodyMd,
      fontSize: 13,
    },
    categorySpendCard: {
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
      gap: 10,
    },
    categoryCardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    categoryCardLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    categoryIconCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryNameCol: {
      gap: 2,
    },
    categoryNameText: {
      ...typography.labelMd,
      fontWeight: '700',
      fontSize: 14,
    },
    categoryBucketTag: {
      ...typography.labelMd,
      fontSize: 10,
      fontWeight: '700',
    },
    categoryCardRight: {
      alignItems: 'flex-end',
      gap: 4,
    },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
    },
    spentAmountText: {
      ...typography.labelMd,
      fontWeight: '700',
      fontSize: 14,
    },
    limitAmountText: {
      ...typography.labelMd,
      fontSize: 12,
    },
    statusPill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      borderWidth: 1,
    },
    statusPillText: {
      ...typography.labelMd,
      fontSize: 10,
      fontWeight: '700',
    },
    setCapBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    setCapBadgeText: {
      ...typography.labelMd,
      fontSize: 11,
      fontWeight: '700',
    },
    categoryProgressBarTrack: {
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.surfaceContainer,
      overflow: 'hidden',
    },
    categoryProgressBarFill: {
      height: '100%',
      borderRadius: 3,
    },
    modalBackdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalBackdropTouch: {
      flex: 1,
    },
    capModalContainer: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      gap: 20,
    },
    capModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    capModalTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    capModalTitle: {
      ...typography.headlineSm,
      fontSize: 18,
    },
    capModalSubtitle: {
      ...typography.bodyMd,
      fontSize: 12,
    },
    modalCloseBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 16,
    },
    inputFieldGroup: {
      gap: 8,
    },
    inputFieldLabel: {
      ...typography.labelMd,
      fontSize: 12,
    },
    amountInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 14,
      height: 50,
    },
    currencyPrefix: {
      ...typography.headlineSm,
      fontSize: 20,
      marginRight: 8,
    },
    amountInput: {
      flex: 1,
      ...typography.headlineSm,
      fontSize: 20,
      padding: 0,
    },
    presetPillsRow: {
      flexDirection: 'row',
      gap: 8,
    },
    presetPill: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
    },
    presetPillText: {
      ...typography.labelMd,
      fontSize: 12,
      fontWeight: '600',
    },
    modalActionsRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 4,
    },
    removeCapBtn: {
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 16,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeCapBtnText: {
      ...typography.labelMd,
      fontWeight: '700',
      fontSize: 13,
    },
    saveCapBtn: {
      borderRadius: 12,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveCapBtnText: {
      ...typography.labelMd,
      fontWeight: '700',
      fontSize: 14,
    },
  });
  return styles;
};

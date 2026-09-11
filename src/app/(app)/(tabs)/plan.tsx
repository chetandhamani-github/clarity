import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, Header, PlanSkeleton } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useBudgetPlan, useCategorySpending } from '@/hooks/use-budget';
import { useMonthlyBillSummary } from '@/hooks/use-bills';
import { formatCurrency } from '@/utils/format';

export default function PlanScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();

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
          isMainTab
          title="Budget Plan"
          leftNode={
            <TouchableOpacity style={styles.avatarButton} onPress={() => router.push('/settings')}>
              <View style={[styles.avatarFallback, { backgroundColor: colors.primaryContainer }]}>
                <MaterialIcons name="person" size={20} color={colors.onPrimaryContainer} />
              </View>
            </TouchableOpacity>
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
          isMainTab
          title="Budget Plan"
          leftNode={
            <TouchableOpacity style={styles.avatarButton} onPress={() => router.push('/settings')}>
              <View style={[styles.avatarFallback, { backgroundColor: colors.primaryContainer }]}>
                <MaterialIcons name="person" size={20} color={colors.onPrimaryContainer} />
              </View>
            </TouchableOpacity>
          }
          rightNode={<View style={styles.iconButton} />}
        />
        <View
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, gap: 16 }}
        >
          <MaterialIcons name="account-balance-wallet" size={64} color={colors.primaryContainer} />
          <Text style={{ ...typography.headlineSm, color: colors.onSurface }}>
            No Budget Plan Set
          </Text>
          <Text
            style={{ ...typography.bodyMd, color: colors.onSurfaceVariant, textAlign: 'center' }}
          >
            Set up your monthly income and allocation to start tracking your budget.
          </Text>
          <TouchableOpacity style={styles.editBtn} onPress={() => router.push('/budget-setup')}>
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header
        isMainTab
        title="Budget Plan"
        leftNode={
          <TouchableOpacity style={styles.avatarButton} onPress={() => router.push('/settings')}>
            <View style={[styles.avatarFallback, { backgroundColor: colors.primaryContainer }]}>
              <MaterialIcons name="person" size={20} color={colors.onPrimaryContainer} />
            </View>
          </TouchableOpacity>
        }
        rightNode={
          <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/reports')}>
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
              <TouchableOpacity style={styles.editBtn} onPress={() => router.push('/budget-setup')}>
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

            {/* Allocation Sections */}
            <View style={styles.allocationSections}>
              {/* Needs */}
              <TouchableOpacity
                style={styles.allocationCard}
                onPress={() => router.push('/manage-categories')}
              >
                <View style={styles.allocationHeader}>
                  <View style={styles.allocationHeaderLeft}>
                    <MaterialIcons name="home" size={24} color={colors.primary} />
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
                    onPress={() => router.push('/(app)/bills')}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <MaterialIcons name="receipt-long" size={16} color={colors.primary} />
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
                onPress={() => router.push('/manage-categories')}
              >
                <View style={styles.allocationHeader}>
                  <View style={styles.allocationHeaderLeft}>
                    <MaterialIcons name="shopping-bag" size={24} color={colors.primary} />
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
                onPress={() => router.push('/manage-categories')}
              >
                <View style={styles.allocationHeader}>
                  <View style={styles.allocationHeaderLeft}>
                    <MaterialIcons name="savings" size={24} color={colors.primary} />
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
                          width: `${Math.min(100, (totals.savingsSpent / Math.max(1, savingsLimit)) * 100)}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          </>
        )}
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
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 22,
    },
    editBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
    },
    editBtnText: {
      ...typography.labelMd,
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
  });
  return styles;
};

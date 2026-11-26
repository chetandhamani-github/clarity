import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { PieChart, type pieDataItem } from 'react-native-gifted-charts';
import { ProgressBar, Text } from '@/components/ui';
import { radius, ThemeColors, typography, useTheme } from '@/theme';
import { formatCurrencyPrivacy } from '@/utils/format';
import { getCategoryIcon } from '@/utils/icons';
import { haptics } from '@/utils/haptics';
import type { BucketType, CategorySpending } from '@/types';

interface SpendingSummaryWidgetProps {
  spending: CategorySpending[];
  totalExpenses: number;
  hideBalances: boolean;
}

interface SpendingChartItem extends CategorySpending {
  color: string;
  percentage: number;
}

const DEFAULT_VISIBLE_CATEGORIES = 5;

const BUCKET_LABELS: Record<BucketType, string> = {
  needs: 'Needs',
  wants: 'Wants',
  savings: 'Savings',
};

function buildChartPalette(primaryColor: string): string[] {
  return [
    primaryColor,
    '#3B82F6',
    '#10B981',
    '#EC4899',
    '#8B5CF6',
    '#EF4444',
    '#06B6D4',
    '#F97316',
    '#6366F1',
    '#14B8A6',
  ];
}

export function SpendingSummaryWidget({
  spending,
  totalExpenses,
  hideBalances,
}: SpendingSummaryWidgetProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const router = useRouter();

  const [selectedCategoryName, setSelectedCategoryName] = useState<string | null>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);

  const chartPalette = useMemo(() => buildChartPalette(colors.primary), [colors.primary]);

  const items = useMemo<SpendingChartItem[]>(() => {
    const active = spending
      .filter((item) => item.spent > 0)
      .sort((a, b) => b.spent - a.spent);

    if (active.length === 0) return [];

    const categorizedTotal = active.reduce((sum, item) => sum + item.spent, 0);
    const denominator = categorizedTotal > 0 ? categorizedTotal : totalExpenses;

    return active.map((item, index) => ({
      ...item,
      color: chartPalette[index % chartPalette.length],
      percentage: denominator > 0 ? (item.spent / denominator) * 100 : 0,
    }));
  }, [spending, totalExpenses, chartPalette]);

  const hasSpending = items.length > 0;

  const selectedIndex = useMemo(() => {
    if (!selectedCategoryName) return -1;
    return items.findIndex((item) => item.category === selectedCategoryName);
  }, [items, selectedCategoryName]);

  const selectedItem = selectedIndex >= 0 ? items[selectedIndex] : null;

  const pieData = useMemo<pieDataItem[]>(() => {
    if (!hasSpending) {
      return [{ value: 1, color: colors.surfaceVariant, text: 'No Data' }];
    }

    return items.map((item, index) => ({
      value: item.spent,
      color: item.color,
      text: item.category,
      focused: index === selectedIndex,
    }));
  }, [hasSpending, items, colors.surfaceVariant, selectedIndex]);

  const handleSelectCategory = useCallback((categoryName: string) => {
    haptics.selection();
    setSelectedCategoryName((prev) => (prev === categoryName ? null : categoryName));
  }, []);

  const handleSelectSlice = useCallback(
    (_item: pieDataItem, index: number) => {
      if (!hasSpending || index < 0 || index >= items.length) return;
      handleSelectCategory(items[index].category);
    },
    [hasSpending, items, handleSelectCategory]
  );

  const handleClearSelection = useCallback(() => {
    if (!selectedCategoryName) return;
    haptics.selection();
    setSelectedCategoryName(null);
  }, [selectedCategoryName]);

  const handleViewTransactions = useCallback(
    (category: string) => {
      router.push({
        pathname: '/(app)/transactions',
        params: {
          category,
          type: 'expense',
          datePreset: 'this_month',
        },
      });
    },
    [router]
  );

  const visibleLegendItems = showAllCategories
    ? items
    : items.slice(0, DEFAULT_VISIBLE_CATEGORIES);

  const renderCenterLabel = () => {
    if (selectedItem) {
      return (
        <TouchableOpacity
          style={styles.centerLabelButton}
          onPress={handleClearSelection}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`Selected category ${selectedItem.category}, tap to clear selection`}
        >
          <View style={styles.centerCategoryRow}>
            <View style={[styles.centerDot, { backgroundColor: selectedItem.color }]} />
            <Text style={styles.centerTitle} numberOfLines={1}>
              {selectedItem.category}
            </Text>
          </View>
          <Text
            style={styles.centerAmount}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {formatCurrencyPrivacy(selectedItem.spent, false, hideBalances)}
          </Text>
          <Text style={styles.centerShareText} numberOfLines={1}>
            {selectedItem.percentage.toFixed(1)}% • Reset
          </Text>
        </TouchableOpacity>
      );
    }

    return (
      <View style={styles.centerLabelBox}>
        <Text style={styles.centerTitle} numberOfLines={1}>
          Total
        </Text>
        <Text
          style={styles.centerAmount}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {formatCurrencyPrivacy(totalExpenses, false, hideBalances)}
        </Text>
        {hasSpending && (
          <Text style={styles.centerSubtext} numberOfLines={1}>
            {items.length} {items.length === 1 ? 'category' : 'categories'}
          </Text>
        )}
      </View>
    );
  };

  const hasBudgetLimit = Boolean(selectedItem && selectedItem.limit > 0);
  const limitRemaining = selectedItem ? selectedItem.limit - selectedItem.spent : 0;
  const isOverBudget = selectedItem ? selectedItem.limit > 0 && selectedItem.spent > selectedItem.limit : false;

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Spending Summary</Text>
        <TouchableOpacity
          onPress={() => router.navigate('/analytics')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <Text style={styles.insightsLink}>INSIGHTS →</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.chartWrapper}>
          <PieChart
            data={pieData}
            donut
            radius={82}
            innerRadius={56}
            extraRadius={8}
            innerCircleColor={colors.surfaceContainerLowest}
            focusOnPress={hasSpending}
            toggleFocusOnPress={hasSpending}
            focusedPieIndex={selectedIndex}
            onPress={hasSpending ? handleSelectSlice : undefined}
            centerLabelComponent={renderCenterLabel}
          />
        </View>

        {!hasSpending ? (
          <Text style={styles.emptyText}>No expenses recorded for this month yet.</Text>
        ) : (
          <>
            {selectedItem ? (
              <View
                style={[
                  styles.detailCard,
                  {
                    borderColor: `${selectedItem.color}55`,
                    backgroundColor: colors.surfaceContainerLow,
                  },
                ]}
              >
                <View style={styles.detailHeader}>
                  <View style={styles.detailTitleGroup}>
                    <View
                      style={[
                        styles.detailIconBox,
                        { backgroundColor: `${selectedItem.color}1F` },
                      ]}
                    >
                      <MaterialIcons
                        name={getCategoryIcon(selectedItem.category)}
                        size={18}
                        color={selectedItem.color}
                      />
                    </View>
                    <View style={styles.detailTitleTextWrap}>
                      <Text style={styles.detailTitle} numberOfLines={1}>
                        {selectedItem.category}
                      </Text>
                      <View style={styles.detailMetaRow}>
                        <View
                          style={[
                            styles.bucketBadge,
                            { backgroundColor: colors.surfaceContainerHighest },
                          ]}
                        >
                          <Text style={styles.bucketBadgeText}>
                            {BUCKET_LABELS[selectedItem.bucketType]}
                          </Text>
                        </View>
                        <Text style={styles.detailShareLabel} numberOfLines={1}>
                          {selectedItem.percentage.toFixed(1)}% of expenses
                        </Text>
                      </View>
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={handleClearSelection}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.closeBtn}
                    accessibilityLabel="Close category details"
                  >
                    <MaterialIcons name="close" size={18} color={colors.onSurfaceVariant} />
                  </TouchableOpacity>
                </View>

                <View style={styles.detailStatsRow}>
                  <View style={styles.detailStatBlock}>
                    <Text style={styles.detailStatLabel}>Spent This Month</Text>
                    <Text
                      style={styles.detailStatValue}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {formatCurrencyPrivacy(selectedItem.spent, false, hideBalances)}
                    </Text>
                  </View>

                  {hasBudgetLimit && (
                    <View style={[styles.detailStatBlock, styles.detailStatBlockEnd]}>
                      <Text style={styles.detailStatLabel}>Monthly Limit</Text>
                      <Text
                        style={styles.detailStatValue}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        {formatCurrencyPrivacy(selectedItem.limit, false, hideBalances)}
                      </Text>
                    </View>
                  )}
                </View>

                {hasBudgetLimit && (
                  <View style={styles.budgetProgressWrap}>
                    <ProgressBar
                      progress={Math.min(1, selectedItem.spent / Math.max(1, selectedItem.limit))}
                      color={isOverBudget ? colors.error : selectedItem.color}
                      backgroundColor={colors.surfaceContainerHighest}
                      height={6}
                    />
                    <Text
                      style={[
                        styles.budgetStatusText,
                        isOverBudget && { color: colors.error },
                      ]}
                    >
                      {isOverBudget
                        ? `${formatCurrencyPrivacy(Math.abs(limitRemaining), false, hideBalances)} over monthly limit`
                        : `${formatCurrencyPrivacy(limitRemaining, false, hideBalances)} remaining in limit`}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.viewTxButton}
                  onPress={() => handleViewTransactions(selectedItem.category)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.viewTxButtonText} numberOfLines={1}>
                    View {selectedItem.category} Transactions
                  </Text>
                  <MaterialIcons name="chevron-right" size={18} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.hintRow}>
                <MaterialIcons name="touch-app" size={14} color={colors.onSurfaceVariant} />
                <Text style={styles.hintText}>
                  Tap a chart slice or category below to inspect details
                </Text>
              </View>
            )}

            <View style={styles.legendList}>
              {visibleLegendItems.map((item) => {
                const isSelected = item.category === selectedCategoryName;
                return (
                  <TouchableOpacity
                    key={item.category}
                    style={[
                      styles.legendRow,
                      isSelected && {
                        backgroundColor: `${item.color}14`,
                        borderColor: `${item.color}55`,
                      },
                    ]}
                    onPress={() => handleSelectCategory(item.category)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.legendLeft}>
                      <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                      <Text
                        style={[
                          styles.legendName,
                          isSelected && styles.legendNameSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {item.category}
                      </Text>
                    </View>
                    <View style={styles.legendRight}>
                      <Text style={styles.legendPercent}>{item.percentage.toFixed(1)}%</Text>
                      <Text style={styles.legendAmount} numberOfLines={1}>
                        {formatCurrencyPrivacy(item.spent, false, hideBalances)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {items.length > DEFAULT_VISIBLE_CATEGORIES && (
                <TouchableOpacity
                  style={styles.toggleAllBtn}
                  onPress={() => setShowAllCategories((prev) => !prev)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.toggleAllText}>
                    {showAllCategories
                      ? 'Show top categories'
                      : `Show all ${items.length} categories`}
                  </Text>
                  <MaterialIcons
                    name={showAllCategories ? 'expand-less' : 'expand-more'}
                    size={18}
                    color={colors.primary}
                  />
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    sectionContainer: {
      marginBottom: 24,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    sectionTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
    },
    insightsLink: {
      ...typography.labelMd,
      color: colors.primary,
      fontWeight: '700',
    },
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 20,
      gap: 14,
    },
    chartWrapper: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    centerLabelBox: {
      width: 96,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    centerLabelButton: {
      width: 96,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    centerCategoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      maxWidth: '100%',
    },
    centerDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      flexShrink: 0,
    },
    centerTitle: {
      ...typography.bodySm,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
      flexShrink: 1,
    },
    centerAmount: {
      ...typography.labelMd,
      fontSize: 15,
      lineHeight: 20,
      fontFamily: 'Manrope_700Bold',
      color: colors.onSurface,
      textAlign: 'center',
      marginTop: 1,
    },
    centerSubtext: {
      ...typography.labelSm,
      fontSize: 10,
      lineHeight: 13,
      color: colors.onSurfaceVariant,
      marginTop: 1,
    },
    centerShareText: {
      ...typography.labelSm,
      fontSize: 9,
      lineHeight: 12,
      color: colors.primary,
      marginTop: 2,
      textAlign: 'center',
    },
    emptyText: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
      paddingBottom: 4,
    },
    hintRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 2,
    },
    hintText: {
      ...typography.bodySm,
      color: colors.onSurfaceVariant,
    },
    detailCard: {
      borderRadius: radius.lg,
      borderWidth: 1,
      padding: 14,
      gap: 12,
    },
    detailHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    detailTitleGroup: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    detailIconBox: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    detailTitleTextWrap: {
      flex: 1,
      gap: 2,
    },
    detailTitle: {
      ...typography.bodyMd,
      fontFamily: 'Manrope_700Bold',
      color: colors.onSurface,
    },
    detailMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    bucketBadge: {
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    bucketBadgeText: {
      ...typography.labelSm,
      fontSize: 10,
      color: colors.onSurfaceVariant,
    },
    detailShareLabel: {
      ...typography.bodySm,
      color: colors.onSurfaceVariant,
      flexShrink: 1,
    },
    closeBtn: {
      padding: 4,
      borderRadius: radius.full,
    },
    detailStatsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      gap: 12,
    },
    detailStatBlock: {
      flex: 1,
      gap: 2,
    },
    detailStatLabel: {
      ...typography.labelSm,
      color: colors.onSurfaceVariant,
    },
    detailStatValue: {
      ...typography.bodyLg,
      fontFamily: 'Manrope_700Bold',
      color: colors.onSurface,
    },
    budgetProgressWrap: {
      gap: 6,
    },
    budgetStatusText: {
      ...typography.bodySm,
      color: colors.onSurfaceVariant,
    },
    viewTxButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.outlineVariant,
    },
    viewTxButtonText: {
      ...typography.labelMd,
      color: colors.primary,
      fontFamily: 'Manrope_700Bold',
      flex: 1,
      marginRight: 8,
    },
    legendList: {
      gap: 6,
    },
    legendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    legendLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    legendDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      flexShrink: 0,
    },
    legendName: {
      ...typography.bodyMd,
      color: colors.onSurface,
      flex: 1,
    },
    legendNameSelected: {
      fontFamily: 'Manrope_700Bold',
    },
    detailStatBlockEnd: {
      alignItems: 'flex-end',
    },
    legendRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flexShrink: 0,
    },
    legendPercent: {
      ...typography.labelSm,
      color: colors.onSurfaceVariant,
      minWidth: 42,
      textAlign: 'right',
    },
    legendAmount: {
      ...typography.bodyMd,
      fontFamily: 'Manrope_600SemiBold',
      color: colors.onSurface,
      minWidth: 72,
      textAlign: 'right',
    },
    toggleAllBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingTop: 6,
      paddingBottom: 2,
    },
    toggleAllText: {
      ...typography.labelMd,
      color: colors.primary,
    },
  });
  return styles;
};

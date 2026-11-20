import React from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui';
import { typography, useTheme, radius, ThemeColors } from '@/theme';
import { useAppStore } from '@/store/use-app-store';
import { formatCurrency, formatCurrencyPrivacy } from '@/utils/format';
import { useSafeToSpend } from '@/hooks/use-cashflow';
import { useStreaks } from '@/hooks/use-streaks';

export function SafeToSpendWidget() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const { hideBalances } = useAppStore();

  const { summary, isLoading } = useSafeToSpend();
  const { streaks } = useStreaks(summary?.safeToSpendDaily);

  if (isLoading || !summary) {
    return null;
  }

  const isHealthy = !summary.hasCashCrunch && summary.safeToSpendDaily > 200;
  const isCaution = !summary.hasCashCrunch && summary.safeToSpendDaily <= 200;
  const isCrunch = summary.hasCashCrunch;

  const statusColor = isCrunch ? '#EF4444' : isCaution ? '#F59E0B' : '#10B981';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconCircle, { backgroundColor: `${statusColor}18` }]}>
            <MaterialIcons
              name={isCrunch ? 'report-problem' : isCaution ? 'speed' : 'security'}
              size={18}
              color={statusColor}
            />
          </View>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.title}>SAFE TO SPEND</Text>
              {streaks && streaks.currentStreak > 0 && (
                <View style={styles.streakBadge}>
                  <MaterialIcons name="local-fire-department" size={12} color="#F59E0B" />
                  <Text style={styles.streakBadgeText}>{streaks.currentStreak}d streak</Text>
                </View>
              )}
            </View>
            <Text style={styles.subTitle}>
              Next Payday in {summary.daysToNextPayday} day{summary.daysToNextPayday === 1 ? '' : 's'} ({summary.nextPaydayDate})
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => router.navigate('/(app)/cashflow')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.moreBtn}
          activeOpacity={0.7}
        >
          <Text style={[styles.moreBtnText, { color: colors.primary }]}>Runway</Text>
          <MaterialIcons name="chevron-right" size={16} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Main Metric Row */}
      <TouchableOpacity
        style={styles.metricBlock}
        onPress={() => router.navigate('/(app)/cashflow')}
        activeOpacity={0.88}
      >
        <View style={styles.metricTopRow}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text style={styles.dailyAmount} numberOfLines={1} adjustsFontSizeToFit>
                {formatCurrencyPrivacy(summary.safeToSpendDaily, false, hideBalances)}
              </Text>
              <Text style={styles.dailyUnit}>/ day</Text>
            </View>
            <Text style={styles.totalAllowanceText}>
              {formatCurrencyPrivacy(summary.safeToSpendTotal, false, hideBalances)} total disposable before payday
            </Text>
          </View>

          {/* Runway Badge */}
          <View
            style={[
              styles.runwayBadge,
              {
                backgroundColor: `${statusColor}15`,
                borderColor: `${statusColor}40`,
              },
            ]}
          >
            <Text style={[styles.runwayBadgeText, { color: statusColor }]} numberOfLines={1}>
              {summary.runwayDays >= 30 ? '30+ Days Runway' : `${summary.runwayDays} Days Runway`}
            </Text>
          </View>
        </View>

        {/* Cash Crunch Alert Banner if projected deficit */}
        {summary.hasCashCrunch && summary.cashCrunchDate && (
          <View style={styles.alertBanner}>
            <MaterialIcons name="warning" size={16} color="#EF4444" />
            <Text style={styles.alertBannerText}>
              Shortfall of {formatCurrency(summary.cashCrunchShortfall || 0)} projected on {summary.cashCrunchDate}.
            </Text>
          </View>
        )}

        {/* Visual Allocation Breakdown Bar */}
        {summary.currentLiquidCash > 0 && (
          <View style={styles.barContainer}>
            <View style={styles.stackedBar}>
              <View
                style={[
                  styles.barSegment,
                  {
                    flex: Math.max(1, summary.safeToSpendTotal),
                    backgroundColor: '#10B981',
                  },
                ]}
              />
              <View
                style={[
                  styles.barSegment,
                  {
                    flex: Math.max(1, summary.totalCommittedObligations),
                    backgroundColor: '#3B82F6',
                  },
                ]}
              />
              <View
                style={[
                  styles.barSegment,
                  {
                    flex: Math.max(1, summary.safetyBuffer),
                    backgroundColor: colors.surfaceContainerHighest,
                  },
                ]}
              />
            </View>
          </View>
        )}

        {/* Obligation Chips */}
        <View style={styles.chipsRow}>
          <View style={styles.chip}>
            <View style={[styles.chipDot, { backgroundColor: '#10B981' }]} />
            <Text style={styles.chipText} numberOfLines={1}>
              Liquid: {formatCurrencyPrivacy(summary.currentLiquidCash, false, hideBalances)}
            </Text>
          </View>

          <View style={styles.chip}>
            <View style={[styles.chipDot, { backgroundColor: '#3B82F6' }]} />
            <Text style={styles.chipText} numberOfLines={1}>
              Committed: {formatCurrencyPrivacy(summary.totalCommittedObligations, false, hideBalances)}
            </Text>
          </View>

          <View style={styles.chip}>
            <View style={[styles.chipDot, { backgroundColor: colors.outlineVariant }]} />
            <Text style={styles.chipText} numberOfLines={1}>
              Buffer: {formatCurrencyPrivacy(summary.safetyBuffer, false, hideBalances)}
            </Text>
          </View>
        </View>

        {/* Spending Pace & Streak Footer Row */}
        <View style={styles.pulseFooterRow}>
          <View style={styles.pulseInfoLeft}>
            {streaks && streaks.yesterdaySpend > 0 ? (
              <>
                <MaterialIcons name="schedule" size={13} color={colors.onSurfaceVariant} />
                <Text style={styles.pulseInfoText} numberOfLines={1}>
                  Yesterday: {formatCurrencyPrivacy(streaks.yesterdaySpend, false, hideBalances)}
                </Text>
              </>
            ) : streaks && streaks.noSpendDaysThisMonth > 0 ? (
              <>
                <MaterialIcons name="verified" size={13} color="#10B981" />
                <Text style={styles.pulseInfoText} numberOfLines={1}>
                  {streaks.noSpendDaysThisMonth} no-spend days this month
                </Text>
              </>
            ) : (
              <>
                <MaterialIcons name="insights" size={13} color={colors.onSurfaceVariant} />
                <Text style={styles.pulseInfoText} numberOfLines={1}>
                  Daily spending pace on track
                </Text>
              </>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 16,
      marginBottom: 16,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    iconCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 11,
      letterSpacing: Platform.OS === 'ios' ? 0.8 : 0,
      color: colors.onSurfaceVariant,
    },
    subTitle: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      marginTop: 1,
    },
    moreBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    moreBtnText: {
      ...typography.labelMd,
      fontSize: 12,
      fontFamily: 'Manrope_700Bold',
    },
    metricBlock: {
      marginTop: 2,
    },
    metricTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    dailyAmount: {
      ...typography.headlineSm,
      fontFamily: 'Manrope_700Bold',
      fontSize: 24,
      color: colors.onSurface,
      lineHeight: 30,
    },
    dailyUnit: {
      ...typography.bodyMd,
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 13,
      color: colors.onSurfaceVariant,
    },
    totalAllowanceText: {
      ...typography.bodyMd,
      fontSize: 12,
      color: colors.onSurfaceVariant,
      marginTop: 2,
    },
    runwayBadge: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.full,
      borderWidth: 1,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    runwayBadgeText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 11,
    },
    alertBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: radius.md,
      marginTop: 10,
    },
    alertBannerText: {
      ...typography.bodyMd,
      fontSize: 11,
      color: '#EF4444',
      flex: 1,
      fontFamily: 'Manrope_600SemiBold',
    },
    barContainer: {
      marginTop: 12,
    },
    stackedBar: {
      flexDirection: 'row',
      height: 6,
      borderRadius: 3,
      overflow: 'hidden',
      gap: 2,
    },
    barSegment: {
      height: '100%',
      borderRadius: 3,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginTop: 10,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    chipDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    chipText: {
      ...typography.labelMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
    },
    streakBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: 'rgba(245, 158, 11, 0.12)',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    streakBadgeText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 10,
      color: '#F59E0B',
    },
    pulseFooterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.surfaceContainerHigh,
    },
    pulseInfoLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      flex: 1,
    },
    pulseInfoText: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      flex: 1,
    },
  });
  return styles;
};

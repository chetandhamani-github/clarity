import { Header, InvestmentsSkeleton, Text, useAlert, useToast } from '@/components/ui';
import {
  useDeleteInvestmentHolding,
  useInvestmentMaturityCalendar,
  useInvestments,
  usePortfolioSummary,
} from '@/hooks/use-investments';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useAppStore } from '@/store/use-app-store';
import { radius, ThemeColors, typography, useTheme } from '@/theme';
import type { InvestmentHolding } from '@/types';
import { formatCurrency, formatCurrencyPrivacy } from '@/utils/format';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { PieChart } from 'react-native-gifted-charts';

type FilterTab = 'all' | 'equity' | 'debt_fixed_income' | 'gold' | 'real_estate' | 'crypto';

const TABS: { id: FilterTab; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { id: 'all', label: 'All Assets', icon: 'pie-chart' },
  { id: 'equity', label: 'Equity & Mutual Funds', icon: 'trending-up' },
  { id: 'debt_fixed_income', label: 'FD & Debt', icon: 'account-balance' },
  { id: 'gold', label: 'Gold', icon: 'stars' },
  { id: 'real_estate', label: 'Real Estate', icon: 'apartment' },
  { id: 'crypto', label: 'Crypto', icon: 'currency-bitcoin' },
];

function PortfolioDonutCenterLabel({ percentageLabel }: { percentageLabel: string }) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  return (
    <View style={styles.donutCenterContainer}>
      <Text style={styles.donutCenterCaption}>ASSETS</Text>
      <Text style={styles.donutCenterValue}>{percentageLabel}</Text>
    </View>
  );
}

function createPortfolioDonutCenterLabel(percentageLabel: string) {
  return function RenderDonutCenterLabel() {
    return <PortfolioDonutCenterLabel percentageLabel={percentageLabel} />;
  };
}

export default function InvestmentsScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeInsets();
  const router = useRouter();
  const { hideBalances, toggleHideBalances } = useAppStore();
  const { showAlert } = useAlert();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const { holdings, isLoading: loadingHoldings, refetch: refetchHoldings } = useInvestments();
  const { summary, isLoading: loadingSummary, refetch: refetchSummary } = usePortfolioSummary();
  const { calendar, refetch: refetchCalendar } =
    useInvestmentMaturityCalendar();
  const { mutate: deleteHolding } = useDeleteInvestmentHolding();

  const isLoading = loadingHoldings || loadingSummary;
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refetchHoldings(), refetchSummary(), refetchCalendar()]);
    setRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      refetchHoldings();
      refetchSummary();
      refetchCalendar();
    }, [refetchHoldings, refetchSummary, refetchCalendar])
  );

  const filteredHoldings = useMemo(() => {
    if (activeTab === 'all') return holdings;
    return holdings.filter((h) => h.assetClass === activeTab);
  }, [holdings, activeTab]);

  // Format data for Donut PieChart
  const positiveAllocations = useMemo(() => {
    if (!summary || !summary.allocations) return [];
    return summary.allocations.filter((a) => a.amount > 0);
  }, [summary]);

  const pieData = useMemo(() => {
    if (positiveAllocations.length === 0) {
      return [{ value: 100, color: colors.surfaceContainerHighest }];
    }
    return positiveAllocations.map((item) => ({
      value: item.amount,
      color: item.color,
      text: `${Math.round(item.percentage)}%`,
    }));
  }, [positiveAllocations, colors.surfaceContainerHighest]);

  const handleDelete = (h: InvestmentHolding) => {
    showAlert(
      'Delete Asset Holding',
      `Are you sure you want to remove "${h.name}" from your portfolio?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteHolding(h.id, {
              onSuccess: () => {
                showToast('Asset removed from portfolio', 'success');
              },
            });
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Header
        showBack
        title="Wealth & Investments"
        rightNode={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              onPress={toggleHideBalances}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.headerIconButton}
            >
              <MaterialIcons
                name={hideBalances ? 'visibility-off' : 'visibility'}
                size={22}
                color={colors.onSurface}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.navigate('/(app)/add-investment')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[styles.headerAddBtn, { backgroundColor: colors.primary }]}
            >
              <MaterialIcons name="add" size={20} color={colors.onPrimary} />
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {isLoading ? (
          <InvestmentsSkeleton />
        ) : (
          <>
            {/* HERO CARD: PORTFOLIO NET WEALTH */}
            <View style={styles.heroCard}>
              <View style={styles.heroHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.heroLabel}>TOTAL WEALTH PORTFOLIO</Text>
                </View>
                {summary && summary.unrealizedGainLoss !== 0 && (
                  <View
                    style={[
                      styles.pnlBadge,
                      {
                        backgroundColor:
                          summary.unrealizedGainLoss >= 0
                            ? 'rgba(16, 185, 129, 0.15)'
                            : 'rgba(239, 68, 68, 0.15)',
                      },
                    ]}
                  >
                    <MaterialIcons
                      name={summary.unrealizedGainLoss >= 0 ? 'trending-up' : 'trending-down'}
                      size={14}
                      color={summary.unrealizedGainLoss >= 0 ? '#10b981' : '#ef4444'}
                    />
                    <Text
                      style={[
                        styles.pnlBadgeText,
                        {
                          color: summary.unrealizedGainLoss >= 0 ? '#10b981' : '#ef4444',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {summary.unrealizedGainLoss >= 0 ? '+' : ''}
                      {summary.gainLossPercentage.toFixed(1)}%
                    </Text>
                  </View>
                )}
              </View>

              <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
                {formatCurrencyPrivacy(summary?.totalPortfolioValue || 0, false, hideBalances)}
              </Text>

              {/* Capital & Returns Breakdown Row */}
              <View style={styles.heroBreakdownRow}>
                <View style={styles.heroBreakdownCol}>
                  <Text style={styles.breakdownLabel}>Invested Capital</Text>
                  <Text style={styles.breakdownValue}>
                    {formatCurrencyPrivacy(summary?.totalInvestedAmount || 0, false, hideBalances)}
                  </Text>
                </View>

                <View style={[styles.breakdownDivider, { backgroundColor: colors.outlineVariant }]} />

                <View style={styles.heroBreakdownCol}>
                  <Text style={styles.breakdownLabel}>Unrealized Returns</Text>
                  <Text
                    style={[
                      styles.breakdownValue,
                      {
                        color:
                          (summary?.unrealizedGainLoss || 0) >= 0 ? '#10b981' : '#ef4444',
                      },
                    ]}
                  >
                    {(summary?.unrealizedGainLoss || 0) >= 0 ? '+' : ''}
                    {formatCurrencyPrivacy(summary?.unrealizedGainLoss || 0, false, hideBalances)}
                  </Text>
                </View>

                <View style={[styles.breakdownDivider, { backgroundColor: colors.outlineVariant }]} />

                <View style={styles.heroBreakdownCol}>
                  <Text style={styles.breakdownLabel}>Holdings</Text>
                  <Text style={styles.breakdownValue}>
                    {summary?.holdingsCount || 0} Assets
                  </Text>
                </View>
              </View>
            </View>

            {/* CARD 2: ASSET ALLOCATION DONUT & RADAR */}
            {summary && summary.allocations.length > 0 && (
              <View style={styles.allocationCard}>
                <View style={styles.cardHeaderRow}>
                  <View style={styles.cardHeaderLeft}>
                    <MaterialIcons name="donut-large" size={18} color={colors.primary} />
                    <Text style={styles.cardTitle}>Asset Allocation</Text>
                  </View>
                  <Text style={styles.allocationSubtext}>
                    {positiveAllocations.length === 0
                      ? 'No active allocations'
                      : `Across ${positiveAllocations.length} ${positiveAllocations.length === 1 ? 'asset class' : 'asset classes'}`}
                  </Text>
                </View>

                <View style={styles.donutRow}>
                  {/* Donut Chart */}
                  <View style={styles.donutWrapper}>
                    <PieChart
                      data={pieData}
                      donut
                      radius={68}
                      innerRadius={46}
                      innerCircleColor={colors.surfaceContainerLowest}
                      centerLabelComponent={createPortfolioDonutCenterLabel(
                        positiveAllocations.length === 0 ? '0%' : '100%'
                      )}
                    />
                  </View>

                  {/* Allocation Legend Grid */}
                  <View style={styles.legendGrid}>
                    {summary.allocations.map((item) => (
                      <View key={item.assetClass} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                        <View style={{ flex: 1 }}>
                          <View style={styles.legendNameRow}>
                            <Text style={styles.legendName} numberOfLines={1}>
                              {item.label}
                            </Text>
                            <Text style={styles.legendPct}>{item.percentage}%</Text>
                          </View>
                          <Text style={styles.legendAmount}>
                            {formatCurrencyPrivacy(item.amount, false, hideBalances)}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {/* CARD 3: SIP & MATURITY CALENDAR HORIZON */}
            {calendar.length > 0 && (
              <View style={styles.calendarSection}>
                <View style={styles.sectionHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialIcons name="event-note" size={18} color={colors.primary} />
                    <Text style={styles.sectionTitle}>Maturity & SIP Horizon</Text>
                  </View>
                  <Text style={styles.calendarCount}>{calendar.length} upcoming</Text>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.calendarScroll}
                >
                  {calendar.map((item) => {
                    const isSip = item.type === 'SIP';
                    const isUrgent = (item.daysRemaining ?? 99) <= 30;

                    return (
                      <View
                        key={item.id}
                        style={[
                          styles.calendarCard,
                          {
                            backgroundColor: colors.surfaceContainerLowest,
                            borderColor: isSip ? '#3B82F644' : isUrgent ? '#10B98188' : colors.surfaceVariant,
                          },
                        ]}
                      >
                        <View style={styles.calendarCardHeader}>
                          <View
                            style={[
                              styles.calendarIconCircle,
                              {
                                backgroundColor: isSip
                                  ? 'rgba(59, 130, 246, 0.12)'
                                  : 'rgba(16, 185, 129, 0.12)',
                              },
                            ]}
                          >
                            <MaterialIcons
                              name={isSip ? 'repeat' : 'alarm'}
                              size={16}
                              color={isSip ? '#3B82F6' : '#10B981'}
                            />
                          </View>

                          <View
                            style={[
                              styles.calendarTypeBadge,
                              {
                                backgroundColor: isSip
                                  ? 'rgba(59, 130, 246, 0.12)'
                                  : 'rgba(16, 185, 129, 0.12)',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.calendarTypeBadgeText,
                                { color: isSip ? '#3B82F6' : '#10B981' },
                              ]}
                              numberOfLines={1}
                            >
                              {isSip ? 'MONTHLY SIP' : 'FD MATURITY'}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.calendarItemName} numberOfLines={1}>
                          {item.name}
                        </Text>

                        <Text style={styles.calendarItemAmount}>
                          {formatCurrencyPrivacy(item.amount, false, hideBalances)}
                          {isSip && <Text style={{ fontSize: 11, color: colors.onSurfaceVariant }}>/mo</Text>}
                        </Text>

                        <View style={styles.calendarFooterRow}>
                          <MaterialIcons name="schedule" size={13} color={colors.onSurfaceVariant} />
                          <Text style={styles.calendarFooterText} numberOfLines={1}>
                            {isSip
                              ? item.dateOrDay
                              : item.daysRemaining !== undefined && item.daysRemaining >= 0
                                ? `Matures in ${item.daysRemaining} days`
                                : `Matured on ${item.dateOrDay}`}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* FILTER TABS */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsScroll}
            >
              {TABS.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    style={[
                      styles.tabPill,
                      {
                        backgroundColor: isActive
                          ? colors.primary
                          : colors.surfaceContainerLow,
                      },
                    ]}
                    onPress={() => setActiveTab(tab.id)}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons
                      name={tab.icon}
                      size={15}
                      color={isActive ? colors.onPrimary : colors.onSurfaceVariant}
                    />
                    <Text
                      style={[
                        styles.tabText,
                        {
                          color: isActive ? colors.onPrimary : colors.onSurfaceVariant,
                          fontFamily: isActive ? 'Manrope_700Bold' : 'Manrope_600SemiBold',
                        },
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* HOLDINGS LIST */}
            {filteredHoldings.length === 0 ? (
              <View style={styles.emptyHoldingsCard}>
                <MaterialIcons name="account-balance-wallet" size={40} color={colors.primary} />
                <Text style={styles.emptyTitle}>No asset holdings in this view</Text>
                <Text style={styles.emptySubtitle}>
                  Track your mutual funds, equity stocks, fixed deposits, gold bonds, or real estate.
                </Text>
                <TouchableOpacity
                  style={[styles.emptyAddBtn, { backgroundColor: colors.primary }]}
                  onPress={() => router.navigate('/(app)/add-investment')}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="add" size={18} color={colors.onPrimary} />
                  <Text style={[styles.emptyAddBtnText, { color: colors.onPrimary }]}>
                    Add Investment Asset
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.holdingsList}>
                {filteredHoldings.map((h) => {
                  const gain = h.currentValue - h.investedAmount;
                  const gainPct =
                    h.investedAmount > 0 ? (gain / h.investedAmount) * 100 : 0;
                  const isPositive = gain >= 0;

                  return (
                    <TouchableOpacity
                      key={h.id}
                      style={styles.holdingCard}
                      onPress={() => router.navigate(`/(app)/add-investment?id=${h.id}`)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.holdingMainRow}>
                        <View style={styles.holdingLeft}>
                          <View
                            style={[
                              styles.assetIconCircle,
                              {
                                backgroundColor:
                                  h.assetClass === 'equity'
                                    ? 'rgba(59, 130, 246, 0.12)'
                                    : h.assetClass === 'debt_fixed_income'
                                      ? 'rgba(16, 185, 129, 0.12)'
                                      : h.assetClass === 'gold'
                                        ? 'rgba(245, 158, 11, 0.12)'
                                        : 'rgba(139, 92, 246, 0.12)',
                              },
                            ]}
                          >
                            <MaterialIcons
                              name={
                                h.assetClass === 'equity'
                                  ? 'trending-up'
                                  : h.assetClass === 'debt_fixed_income'
                                    ? 'account-balance'
                                    : h.assetClass === 'gold'
                                      ? 'stars'
                                      : 'apartment'
                              }
                              size={20}
                              color={
                                h.assetClass === 'equity'
                                  ? '#3B82F6'
                                  : h.assetClass === 'debt_fixed_income'
                                    ? '#10B981'
                                    : h.assetClass === 'gold'
                                      ? '#F59E0B'
                                      : '#8B5CF6'
                              }
                            />
                          </View>

                          <View style={styles.holdingInfo}>
                            <Text style={styles.holdingName} numberOfLines={1}>
                              {h.name}
                            </Text>
                            <View style={styles.holdingSubRow}>
                              <Text style={styles.holdingSubtype}>
                                {h.subType.replace('_', ' ').toUpperCase()}
                              </Text>
                              {h.accountName && (
                                <>
                                  <View style={styles.metaDot} />
                                  <Text style={styles.holdingAccount} numberOfLines={1}>
                                    {h.accountName}
                                  </Text>
                                </>
                              )}
                            </View>
                          </View>
                        </View>

                        <View style={styles.holdingRight}>
                          <Text style={styles.holdingValue}>
                            {formatCurrencyPrivacy(h.currentValue, false, hideBalances)}
                          </Text>
                          <Text
                            style={[
                              styles.holdingPnl,
                              { color: isPositive ? '#10b981' : '#ef4444' },
                            ]}
                          >
                            {isPositive ? '+' : ''}
                            {gainPct.toFixed(1)}% ({formatCurrency(gain)})
                          </Text>
                        </View>
                      </View>

                      {/* Schedule / Folio Badges Row */}
                      {(h.sipDayOfMonth || h.maturityDate || h.folioOrAccountNumber) && (
                        <View style={styles.holdingTagsRow}>
                          {h.sipDayOfMonth && (
                            <View style={styles.tagPill}>
                              <MaterialIcons name="repeat" size={12} color={colors.primary} />
                              <Text style={styles.tagPillText} numberOfLines={1}>
                                SIP: {formatCurrency(h.sipAmount || 0)} on {h.sipDayOfMonth}th
                              </Text>
                            </View>
                          )}
                          {h.maturityDate && (
                            <View style={styles.tagPill}>
                              <MaterialIcons name="alarm" size={12} color="#10B981" />
                              <Text style={[styles.tagPillText, { color: '#10B981' }]} numberOfLines={1}>
                                Matures: {h.maturityDate}
                              </Text>
                            </View>
                          )}
                          {h.folioOrAccountNumber && (
                            <View style={styles.tagPill}>
                              <MaterialIcons name="tag" size={12} color={colors.onSurfaceVariant} />
                              <Text style={styles.tagPillText} numberOfLines={1}>
                                {h.folioOrAccountNumber}
                              </Text>
                            </View>
                          )}
                        </View>
                      )}

                      {/* Bottom action row */}
                      <View style={styles.holdingCardFooter}>
                        <Text style={styles.investedLabel}>
                          Invested: {formatCurrencyPrivacy(h.investedAmount, false, hideBalances)}
                        </Text>
                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => handleDelete(h)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <MaterialIcons name="delete-outline" size={18} color={colors.onSurfaceVariant} />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
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
    headerIconButton: {
      padding: 6,
    },
    headerAddBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    heroCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 18,
      marginBottom: 14,
    },
    heroHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    heroLabel: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 11,
      letterSpacing: Platform.OS === 'ios' ? 0.8 : 0,
      color: colors.onSurfaceVariant,
    },
    pnlBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.full,
      flexShrink: 0,
    },
    pnlBadgeText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 12,
    },
    heroAmount: {
      ...typography.headlineSm,
      fontFamily: 'Manrope_700Bold',
      fontSize: 28,
      lineHeight: 36,
      color: colors.onSurface,
      marginBottom: 14,
    },
    heroBreakdownRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: colors.surfaceContainerHigh,
    },
    heroBreakdownCol: {
      flex: 1,
      alignItems: 'center',
    },
    breakdownLabel: {
      ...typography.labelMd,
      fontSize: 10,
      color: colors.onSurfaceVariant,
      marginBottom: 2,
    },
    breakdownValue: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      color: colors.onSurface,
    },
    breakdownDivider: {
      width: 1,
      height: 24,
    },
    allocationCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 16,
      marginBottom: 14,
    },
    cardHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    cardHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    cardTitle: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      color: colors.onSurface,
    },
    allocationSubtext: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
    },
    donutRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginTop: 4,
    },
    donutWrapper: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    donutCenterContainer: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    donutCenterCaption: {
      fontSize: 10,
      color: colors.onSurfaceVariant,
      fontFamily: 'Manrope_700Bold',
    },
    donutCenterValue: {
      fontSize: 12,
      color: colors.onSurface,
      fontFamily: 'Manrope_700Bold',
    },
    legendGrid: {
      flex: 1,
      gap: 8,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    legendDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    legendNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    legendName: {
      ...typography.bodyMd,
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      color: colors.onSurface,
      flex: 1,
    },
    legendPct: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 11,
      color: colors.onSurfaceVariant,
      marginLeft: 4,
    },
    legendAmount: {
      ...typography.labelMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      marginTop: 1,
    },
    calendarSection: {
      marginBottom: 16,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
      paddingHorizontal: 2,
    },
    sectionTitle: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      color: colors.onSurface,
    },
    calendarCount: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.primary,
      fontFamily: 'Manrope_700Bold',
    },
    calendarScroll: {
      gap: 10,
    },
    calendarCard: {
      width: 190,
      borderRadius: radius.lg,
      borderWidth: 1,
      padding: 12,
    },
    calendarCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    calendarIconCircle: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    calendarTypeBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.full,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    calendarTypeBadgeText: {
      ...typography.labelMd,
      fontSize: 9,
      fontFamily: 'Manrope_700Bold',
    },
    calendarItemName: {
      ...typography.bodyMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      color: colors.onSurface,
      marginBottom: 2,
    },
    calendarItemAmount: {
      ...typography.headlineSm,
      fontFamily: 'Manrope_700Bold',
      fontSize: 16,
      color: colors.onSurface,
      marginBottom: 6,
    },
    calendarFooterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    calendarFooterText: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
    },
    tabsScroll: {
      gap: 8,
      marginBottom: 14,
    },
    tabPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: radius.full,
    },
    tabText: {
      ...typography.labelMd,
      fontSize: 12,
    },
    emptyHoldingsCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 28,
      alignItems: 'center',
      gap: 8,
    },
    emptyTitle: {
      ...typography.bodyMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 15,
      color: colors.onSurface,
      textAlign: 'center',
    },
    emptySubtitle: {
      ...typography.bodyMd,
      fontSize: 12,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
      lineHeight: 17,
      marginBottom: 6,
    },
    emptyAddBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: radius.full,
    },
    emptyAddBtnText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
    },
    holdingsList: {
      gap: 10,
    },
    holdingCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 14,
    },
    holdingMainRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    holdingLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    assetIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    holdingInfo: {
      flex: 1,
    },
    holdingName: {
      ...typography.bodyMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 14,
      color: colors.onSurface,
      marginBottom: 2,
    },
    holdingSubRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    holdingSubtype: {
      ...typography.labelMd,
      fontSize: 10,
      fontFamily: 'Manrope_700Bold',
      color: colors.onSurfaceVariant,
    },
    metaDot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: colors.outlineVariant,
    },
    holdingAccount: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
    },
    holdingRight: {
      alignItems: 'flex-end',
      marginLeft: 8,
    },
    holdingValue: {
      ...typography.bodyMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 15,
      color: colors.onSurface,
      marginBottom: 2,
    },
    holdingPnl: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 11,
    },
    holdingTagsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.surfaceContainerHigh,
    },
    tagPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.surfaceContainerLow,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.md,
      flexShrink: 0,
    },
    tagPillText: {
      ...typography.labelMd,
      fontSize: 10,
      color: colors.onSurface,
    },
    holdingCardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.surfaceContainerHigh,
    },
    investedLabel: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
    },
    deleteBtn: {
      padding: 4,
    },
  });
  return styles;
};

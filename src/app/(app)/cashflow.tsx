import { CashflowSkeleton, Header, renderWideChartPointerLabel, Text, useToast } from '@/components/ui';
import { useSafeToSpend } from '@/hooks/use-cashflow';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useAppStore } from '@/store/use-app-store';
import { radius, ThemeColors, typography, useTheme } from '@/theme';
import type { CashFlowEvent } from '@/types';
import { normalizeLineChartValues } from '@/utils/chart-utils';
import { formatCurrency, formatCurrencyPrivacy } from '@/utils/format';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { LineChart } from 'react-native-gifted-charts';

type EventFilter = 'all' | 'bill' | 'recurring' | 'sip' | 'income';

const FILTER_TABS: { id: EventFilter; label: string; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { id: 'all', label: 'All Events', icon: 'list' },
  { id: 'bill', label: 'Bills', icon: 'receipt-long' },
  { id: 'recurring', label: 'Subscriptions', icon: 'repeat' },
  { id: 'sip', label: 'SIPs', icon: 'trending-up' },
  { id: 'income', label: 'Income', icon: 'payments' },
];

export default function CashFlowScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeInsets();
  const { showToast } = useToast();
  const {
    hideBalances,
    toggleHideBalances,
    paydayDayOfMonth,
    setPaydayDayOfMonth,
    safetyBufferAmount,
    setSafetyBufferAmount,
  } = useAppStore();

  const [activeFilter, setActiveFilter] = useState<EventFilter>('all');
  const [simulationMode, setSimulationMode] = useState<'burn' | 'cycle'>('burn');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Local settings modal state
  const [tempPayday, setTempPayday] = useState(paydayDayOfMonth.toString());
  const [tempBuffer, setTempBuffer] = useState(safetyBufferAmount.toString());

  const { summary, isLoading, refetch } = useSafeToSpend();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const handleOpenConfig = () => {
    setTempPayday(paydayDayOfMonth.toString());
    setTempBuffer(safetyBufferAmount.toString());
    setShowConfigModal(true);
  };

  const handleSaveConfig = () => {
    const pDay = parseInt(tempPayday, 10);
    const bAmt = parseFloat(tempBuffer);

    if (isNaN(pDay) || pDay < 1 || pDay > 31) {
      showToast('Payday must be between day 1 and 31', 'error');
      return;
    }
    if (isNaN(bAmt) || bAmt < 0) {
      showToast('Safety buffer must be 0 or higher', 'error');
      return;
    }

    setPaydayDayOfMonth(pDay);
    setSafetyBufferAmount(bAmt);
    setShowConfigModal(false);
    showToast('Cash flow settings updated', 'success');
    refetch();
  };

  // Projections according to active simulation mode
  const activeProjections = useMemo(() => {
    if (!summary) return [];
    return simulationMode === 'cycle'
      ? summary.cycleProjections || summary.projections
      : summary.burnProjections || summary.projections;
  }, [summary, simulationMode]);

  // Flatten events from the active 30-day projections
  const allEvents = useMemo(() => {
    if (!summary || activeProjections.length === 0) return [];
    const list: (CashFlowEvent & { dayOfWeek: string; isPaydayDate: boolean })[] = [];
    for (const proj of activeProjections) {
      for (const ev of proj.events) {
        list.push({
          ...ev,
          dayOfWeek: proj.dayOfWeek,
          isPaydayDate: ev.date === summary.nextPaydayDate,
        });
      }
    }
    return list;
  }, [summary, activeProjections]);

  const filteredEvents = useMemo(() => {
    if (activeFilter === 'all') return allEvents;
    return allEvents.filter((e) => e.type === activeFilter);
  }, [allEvents, activeFilter]);

  // Chart Data & Dimension preparation
  const { width: windowWidth } = useWindowDimensions();
  const chartWidth = Math.max(160, windowWidth - 64);
  const initialSpacing = 16;
  const endSpacing = 16;
  const numPoints = activeProjections.length;
  const chartSpacing =
    numPoints > 1 ? (chartWidth - initialSpacing - endSpacing) / (numPoints - 1) : 10;

  const chartConfig = useMemo(() => {
    if (!summary || activeProjections.length === 0) {
      return normalizeLineChartValues([], { anchorZeroWhenNonNegative: true });
    }
    return normalizeLineChartValues(
      activeProjections.map((p) => p.projectedBalance),
      { anchorZeroWhenNonNegative: true }
    );
  }, [summary, activeProjections]);

  const chartData = useMemo(() => {
    if (!summary || activeProjections.length === 0) return [];

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return activeProjections.map((p, index) => {
      const dateParts = p.date.split('-');
      const monthStr = monthNames[parseInt(dateParts[1], 10) - 1] || '';
      const formattedDateLabel = `${p.dayOfMonth} ${monthStr}`;
      const isDeficit = p.projectedBalance < 0;

      return {
        value: chartConfig.values[index] ?? 0,
        dataPointText: `${formattedDateLabel}: ${formatCurrencyPrivacy(p.projectedBalance, false, hideBalances)}${isDeficit ? ' (Deficit)' : ''}`,
      };
    });
  }, [summary, activeProjections, chartConfig.values, hideBalances]);

  const axisDates = useMemo(() => {
    if (!summary || activeProjections.length === 0) return [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const len = activeProjections.length;

    const indices = [
      0,
      Math.floor((len - 1) / 3),
      Math.floor((2 * (len - 1)) / 3),
      len - 1,
    ];

    return indices.map((idx, i) => {
      const p = activeProjections[idx];
      if (!p) return { label: '' };
      const dateParts = p.date.split('-');
      const monthStr = monthNames[parseInt(dateParts[1], 10) - 1] || '';
      return {
        label: i === 0 ? `Today (${p.dayOfMonth} ${monthStr})` : `${p.dayOfMonth} ${monthStr}`,
      };
    });
  }, [summary, activeProjections]);

  const isCrunch = summary?.hasCashCrunch;
  const statusColor = isCrunch ? '#EF4444' : (summary?.safeToSpendDaily || 0) < 200 ? '#F59E0B' : '#10B981';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header
        showBack
        title="Cash Flow & Safe to Spend"
        rightNode={
          <View style={styles.rowGap6}>
            <TouchableOpacity
              onPress={toggleHideBalances}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.headerIconBtn}
            >
              <MaterialIcons
                name={hideBalances ? 'visibility-off' : 'visibility'}
                size={22}
                color={colors.onSurface}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleOpenConfig}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={[styles.headerIconBtn, { backgroundColor: colors.surfaceContainerHigh }]}
            >
              <MaterialIcons name="tune" size={20} color={colors.onSurface} />
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView
        style={styles.flex1}
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
        {isLoading || !summary ? (
          <CashflowSkeleton />
        ) : (
          <>
            {/* HERO CARD: SAFE-TO-SPEND GAUGE */}
            <View style={styles.heroCard}>
              <View style={styles.heroHeader}>
                <View style={styles.heroLabelRow}>
                  <MaterialIcons name="speed" size={16} color={statusColor} />
                  <Text style={styles.heroLabel} numberOfLines={1}>DAILY SAFE-TO-SPEND ALLOWANCE</Text>
                </View>

                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: `${statusColor}18`,
                      borderColor: `${statusColor}40`,
                    },
                  ]}
                >
                  <Text style={[styles.statusPillText, { color: statusColor }]} numberOfLines={1}>
                    {summary.runwayDays >= 30 ? '30+ Days Runway' : `${summary.runwayDays} Days Runway`}
                  </Text>
                </View>
              </View>

              <View style={styles.amountRow}>
                <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
                  {formatCurrencyPrivacy(summary.safeToSpendDaily, false, hideBalances)}
                </Text>
                <Text style={styles.heroUnit}>/ day</Text>
              </View>

              <Text style={styles.heroSubtitle}>
                {formatCurrencyPrivacy(summary.safeToSpendTotal, false, hideBalances)} total disposable before next payday ({summary.nextPaydayDate})
              </Text>

              {/* Cash Crunch Alert */}
              {summary.hasCashCrunch && summary.cashCrunchDate && (
                <View style={styles.deficitCard}>
                  <MaterialIcons name="warning" size={18} color="#EF4444" />
                  <View style={styles.flex1}>
                    <Text style={styles.deficitTitle}>Projected Cash Crunch</Text>
                    <Text style={styles.deficitText}>
                      Deficit of {formatCurrency(summary.cashCrunchShortfall || 0)} expected on {summary.cashCrunchDate}. Reduce discretionary spending or prepare funds.
                    </Text>
                  </View>
                </View>
              )}

              {/* Breakdown Grid */}
              <View style={styles.breakdownGrid}>
                <View style={styles.breakdownCol}>
                  <Text style={styles.breakdownLabel} numberOfLines={1}>Liquid Cash</Text>
                  <Text style={[styles.breakdownVal, styles.liquidCashVal]} numberOfLines={1} adjustsFontSizeToFit>
                    {formatCurrencyPrivacy(summary.currentLiquidCash, false, hideBalances)}
                  </Text>
                </View>

                <View style={[styles.gridDivider, { backgroundColor: colors.outlineVariant }]} />

                <View style={styles.breakdownCol}>
                  <Text style={styles.breakdownLabel} numberOfLines={1}>Bills & SIPs</Text>
                  <Text style={[styles.breakdownVal, styles.billsVal]} numberOfLines={1} adjustsFontSizeToFit>
                    -{formatCurrencyPrivacy(summary.totalCommittedObligations, false, hideBalances)}
                  </Text>
                </View>

                <View style={[styles.gridDivider, { backgroundColor: colors.outlineVariant }]} />

                <View style={styles.breakdownCol}>
                  <Text style={styles.breakdownLabel} numberOfLines={1}>Safety Buffer</Text>
                  <Text style={styles.breakdownVal} numberOfLines={1} adjustsFontSizeToFit>
                    {formatCurrencyPrivacy(summary.safetyBuffer, false, hideBalances)}
                  </Text>
                </View>
              </View>
            </View>

            {/* CARD 2: 30-DAY FORWARD RUNWAY CHART */}
            <View style={styles.chartCard}>
              <View style={styles.chartHeaderRow}>
                <View style={styles.chartTitleRow}>
                  <MaterialIcons name="insights" size={18} color={colors.primary} />
                  <Text style={styles.cardTitle}>30-Day Runway</Text>
                </View>

                {/* Mode Selector */}
                <View style={[styles.modeToggleRow, { backgroundColor: colors.surfaceContainerLow }]}>
                  <TouchableOpacity
                    style={[
                      styles.modeToggleBtn,
                      simulationMode === 'burn' && { backgroundColor: colors.primary },
                    ]}
                    onPress={() => setSimulationMode('burn')}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.modeToggleText,
                        { color: simulationMode === 'burn' ? colors.onPrimary : colors.onSurfaceVariant },
                      ]}
                    >
                      Burn Runway
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.modeToggleBtn,
                      simulationMode === 'cycle' && { backgroundColor: colors.primary },
                    ]}
                    onPress={() => setSimulationMode('cycle')}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.modeToggleText,
                        { color: simulationMode === 'cycle' ? colors.onPrimary : colors.onSurfaceVariant },
                      ]}
                    >
                      + Payday
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.chartExplainer}>
                {simulationMode === 'burn'
                  ? `Simulating liquid cash burn without future income. Deducts bills, subscriptions, SIPs, and typical discretionary spend (${formatCurrency(summary.dailyDiscretionaryBurn)}/day).`
                  : `Includes expected salary replenishment on ${summary.nextPaydayDate}.`}
              </Text>

              <View style={styles.chartWrapper}>
                <LineChart
                  data={chartData}
                  width={chartWidth}
                  height={135}
                  spacing={chartSpacing}
                  adjustToWidth={true}
                  maxValue={chartConfig.maxValue}
                  yAxisLabelWidth={0}
                  yAxisThickness={0}
                  xAxisThickness={0}
                  xAxisLabelsHeight={0}
                  labelsExtraHeight={0}
                  hideDataPoints
                  color={statusColor}
                  thickness={2.5}
                  initialSpacing={initialSpacing}
                  endSpacing={endSpacing}
                  areaChart={chartConfig.min >= 0}
                  startFillColor={statusColor}
                  startOpacity={0.25}
                  endFillColor={statusColor}
                  endOpacity={0.02}
                  curved={chartConfig.hasVariance && chartData.length > 2}
                  hideRules
                  hideYAxisText
                  hideAxesAndRules
                  pointerConfig={{
                    pointerStripHeight: 135,
                    pointerStripColor: colors.outline,
                    pointerStripWidth: 1.5,
                    pointerColor: statusColor,
                    radius: 5,
                    pointerLabelWidth: 170,
                    pointerLabelHeight: 34,
                    activatePointersOnLongPress: true,
                    autoAdjustPointerLabelPosition: true,
                    pointerLabelComponent: renderWideChartPointerLabel,
                  }}
                />
              </View>

              {/* Dedicated responsive date axis row */}
              <View style={styles.chartAxisRow}>
                {axisDates.map((item, idx) => (
                  <Text key={idx} style={[styles.axisDateText, { color: colors.onSurfaceVariant }]}>
                    {item.label}
                  </Text>
                ))}
              </View>
            </View>

            {/* CARD 3: SCHEDULED CASH FLOW OBLIGATIONS & INFLOWS */}
            <View style={styles.timelineSection}>
              <View style={styles.timelineHeaderRow}>
                <View style={styles.rowGap6}>
                  <MaterialIcons name="calendar-month" size={18} color={colors.primary} />
                  <Text style={styles.cardTitle}>Scheduled Inflows & Deductions</Text>
                </View>
                <Text style={styles.timelineCount}>{filteredEvents.length} events</Text>
              </View>

              {/* Filter Tabs */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                {FILTER_TABS.map((tab) => {
                  const isActive = activeFilter === tab.id;
                  return (
                    <TouchableOpacity
                      key={tab.id}
                      style={[
                        styles.filterTabPill,
                        {
                          backgroundColor: isActive ? colors.primary : colors.surfaceContainerLow,
                        },
                      ]}
                      onPress={() => setActiveFilter(tab.id)}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons
                        name={tab.icon}
                        size={14}
                        color={isActive ? colors.onPrimary : colors.onSurfaceVariant}
                      />
                      <Text
                        style={[
                          styles.filterTabText,
                          { color: isActive ? colors.onPrimary : colors.onSurfaceVariant },
                          isActive ? styles.filterTabTextActive : styles.filterTabTextInactive,
                        ]}
                      >
                        {tab.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Events List */}
              {filteredEvents.length === 0 ? (
                <View style={styles.emptyEventsBox}>
                  <MaterialIcons name="done-all" size={32} color="#10B981" />
                  <Text style={styles.emptyEventsTitle}>No scheduled charges in this filter</Text>
                  <Text style={styles.emptyEventsSub}>
                    You have no upcoming bills or recurring commitments in this timeframe.
                  </Text>
                </View>
              ) : (
                <View style={styles.eventsList}>
                  {filteredEvents.map((ev) => {
                    const isIncome = ev.type === 'income';
                    const icon =
                      ev.type === 'bill'
                        ? 'receipt-long'
                        : ev.type === 'recurring'
                          ? 'repeat'
                          : ev.type === 'sip'
                            ? 'trending-up'
                            : 'payments';

                    const iconColor =
                      ev.type === 'income'
                        ? '#10B981'
                        : ev.type === 'bill'
                          ? '#EF4444'
                          : ev.type === 'sip'
                            ? '#3B82F6'
                            : '#8B5CF6';

                    return (
                      <View key={ev.id} style={styles.eventCard}>
                        <View style={styles.eventLeft}>
                          <View style={[styles.eventIconCircle, { backgroundColor: `${iconColor}15` }]}>
                            <MaterialIcons name={icon} size={18} color={iconColor} />
                          </View>
                          <View style={styles.flex1}>
                            <Text style={styles.eventName} numberOfLines={1}>
                              {ev.name?.trim() ? ev.name : (ev.type === 'bill' ? 'Upcoming Bill' : ev.type === 'sip' ? 'Investment SIP' : 'Scheduled Charge')}
                            </Text>
                            <View style={styles.eventMetaRow}>
                              <Text style={styles.eventDate}>
                                {ev.date} ({ev.dayOfWeek})
                              </Text>
                              <View style={styles.metaDot} />
                              <Text style={[styles.eventTypeTag, { color: iconColor }]}>
                                {ev.type.toUpperCase()}
                              </Text>
                            </View>
                          </View>
                        </View>

                        <Text
                          style={[
                            styles.eventAmount,
                            isIncome ? styles.incomeAmount : { color: colors.onSurface },
                          ]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                        >
                          {isIncome ? '+' : '-'}
                          {formatCurrencyPrivacy(ev.amount, false, hideBalances)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* CASH FLOW CONFIGURATION MODAL */}
      <Modal
        visible={showConfigModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfigModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { backgroundColor: colors.surfaceContainerLowest }]}>
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalTitleRow}>
                <MaterialIcons name="tune" size={20} color={colors.primary} />
                <Text style={styles.modalTitle}>Cash Flow Settings</Text>
              </View>
              <TouchableOpacity onPress={() => setShowConfigModal(false)}>
                <MaterialIcons name="close" size={20} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalLabel}>Payday / Income Day of Month (1 - 31)</Text>
              <Text style={styles.modalHelper}>
                The recurring day each month when your salary or primary income arrives.
              </Text>
              <TextInput
                style={[
                  styles.modalInput,
                  {
                    backgroundColor: colors.surfaceContainerLow,
                    borderColor: colors.outlineVariant,
                    color: colors.onSurface,
                  },
                ]}
                keyboardType="number-pad"
                maxLength={2}
                value={tempPayday}
                onChangeText={setTempPayday}
                placeholder="1"
                placeholderTextColor={colors.outline}
              />
            </View>

            <View style={styles.modalInputGroup}>
              <Text style={styles.modalLabel}>Emergency Safety Buffer Amount</Text>
              <Text style={styles.modalHelper}>
                Minimum reserve balance held untouched in liquid accounts before calculating daily safe-to-spend.
              </Text>
              <TextInput
                style={[
                  styles.modalInput,
                  {
                    backgroundColor: colors.surfaceContainerLow,
                    borderColor: colors.outlineVariant,
                    color: colors.onSurface,
                  },
                ]}
                keyboardType="decimal-pad"
                value={tempBuffer}
                onChangeText={setTempBuffer}
                placeholder="2000"
                placeholderTextColor={colors.outline}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.outlineVariant }]}
                onPress={() => setShowConfigModal(false)}
              >
                <Text style={[styles.modalCancelText, { color: colors.onSurface }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: colors.primary }]}
                onPress={handleSaveConfig}
              >
                <Text style={[styles.modalSaveText, { color: colors.onPrimary }]}>Save Settings</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
    flex1: {
      flex: 1,
    },
    rowGap6: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    heroLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
      marginRight: 8,
    },
    liquidCashVal: {
      color: '#10B981',
    },
    billsVal: {
      color: '#3B82F6',
    },
    chartTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
    },
    filterTabTextActive: {
      fontFamily: 'Manrope_700Bold',
    },
    filterTabTextInactive: {
      fontFamily: 'Manrope_600SemiBold',
    },
    incomeAmount: {
      color: '#10B981',
    },
    modalTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerIconBtn: {
      padding: 6,
      borderRadius: radius.md,
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
      fontSize: 10,
      letterSpacing: Platform.OS === 'ios' ? 0.8 : 0,
      color: colors.onSurfaceVariant,
    },
    statusPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.full,
      borderWidth: 1,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusPillText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 10,
    },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
      marginBottom: 2,
    },
    heroAmount: {
      ...typography.headlineSm,
      fontFamily: 'Manrope_700Bold',
      fontSize: 30,
      color: colors.onSurface,
      lineHeight: 38,
    },
    heroUnit: {
      ...typography.bodyMd,
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 14,
      color: colors.onSurfaceVariant,
    },
    heroSubtitle: {
      ...typography.bodyMd,
      fontSize: 12,
      color: colors.onSurfaceVariant,
      marginBottom: 14,
    },
    deficitCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      borderWidth: 1,
      borderColor: 'rgba(239, 68, 68, 0.25)',
      borderRadius: radius.lg,
      padding: 12,
      marginBottom: 14,
    },
    deficitTitle: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 12,
      color: '#EF4444',
      marginBottom: 1,
    },
    deficitText: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurface,
      lineHeight: 16,
    },
    breakdownGrid: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: colors.surfaceContainerHigh,
    },
    breakdownCol: {
      flex: 1,
      alignItems: 'center',
    },
    breakdownLabel: {
      ...typography.labelMd,
      fontSize: 10,
      color: colors.onSurfaceVariant,
      marginBottom: 2,
    },
    breakdownVal: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      color: colors.onSurface,
    },
    gridDivider: {
      width: 1,
      height: 24,
    },
    chartCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 16,
      marginBottom: 14,
    },
    chartHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    cardTitle: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      color: colors.onSurface,
    },
    modeToggleRow: {
      flexDirection: 'row',
      borderRadius: radius.full,
      padding: 2,
    },
    modeToggleBtn: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radius.full,
    },
    modeToggleText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 10,
    },
    chartExplainer: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      lineHeight: 16,
      marginBottom: 12,
    },
    chartWrapper: {
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
      height: 145,
      overflow: 'visible',
    },
    chartAxisRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
      marginTop: 8,
    },
    axisDateText: {
      ...typography.labelMd,
      fontSize: 10,
      fontFamily: 'Manrope_600SemiBold',
    },
    timelineSection: {
      marginBottom: 16,
    },
    timelineHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
      paddingHorizontal: 2,
    },
    timelineCount: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      fontFamily: 'Manrope_600SemiBold',
    },
    filterScroll: {
      marginBottom: 12,
    },
    filterTabPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radius.full,
      marginRight: 8,
    },
    filterTabText: {
      ...typography.labelMd,
      fontSize: 11,
    },
    emptyEventsBox: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 24,
      alignItems: 'center',
      gap: 6,
    },
    emptyEventsTitle: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      color: colors.onSurface,
      marginTop: 4,
    },
    emptyEventsSub: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
    },
    eventsList: {
      gap: 8,
    },
    eventCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    eventLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    eventIconCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    eventName: {
      ...typography.bodyMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      color: colors.onSurface,
      marginBottom: 2,
    },
    eventMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    eventDate: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
    },
    metaDot: {
      width: 3,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: colors.outlineVariant,
    },
    eventTypeTag: {
      ...typography.labelMd,
      fontSize: 9,
      fontFamily: 'Manrope_700Bold',
    },
    eventAmount: {
      ...typography.headlineSm,
      fontFamily: 'Manrope_700Bold',
      fontSize: 14,
      marginLeft: 8,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalBox: {
      width: '100%',
      maxWidth: 380,
      borderRadius: radius.xl,
      padding: 20,
    },
    modalHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    modalTitle: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 15,
      color: colors.onSurface,
    },
    modalInputGroup: {
      marginBottom: 14,
    },
    modalLabel: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 12,
      color: colors.onSurface,
      marginBottom: 2,
    },
    modalHelper: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      lineHeight: 15,
      marginBottom: 6,
    },
    modalInput: {
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 8,
      ...typography.bodyMd,
      fontSize: 14,
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 10,
    },
    modalCancelBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    modalCancelText: {
      ...typography.labelMd,
      fontSize: 12,
    },
    modalSaveBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: radius.md,
    },
    modalSaveText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 12,
    },
  });
  return styles;
};

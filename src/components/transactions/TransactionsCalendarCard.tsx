import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { DailyTransactionSummary } from '@/services/database/transaction-dao';
import { ThemeColors, radius, typography, useTheme } from '@/theme';
import {
  CalendarDateRange,
  CalendarDayCell,
  buildMonthCalendarGrid,
  formatCompactCalendarAmount,
  getCalendarGridCellIndex,
  nextCalendarDateRange,
  normalizeCalendarRange,
  summarizeCalendarRange,
  summarizeMonthDailyTotals,
} from '@/utils/calendar-utils';
import { getLocalTodayYmd } from '@/utils/date';
import { formatCurrencyPrivacy, formatDate, getCurrencySymbol } from '@/utils/format';
import { haptics } from '@/utils/haptics';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;
const INCOME_COLOR = '#10B981';

interface TransactionsCalendarCardProps {
  year: number;
  month: number; // 1-12
  selectedRange: CalendarDateRange | null;
  dailyTotals: DailyTransactionSummary[];
  dailyMap: Record<string, DailyTransactionSummary>;
  rangeSummaryOverride?: {
    income: number;
    expense: number;
    transfer: number;
    net: number;
    count: number;
  } | null;
  isLoading?: boolean;
  currencyCode: string;
  hideBalances?: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onJumpToToday: () => void;
  onSelectRange: (range: CalendarDateRange | null) => void;
  onGlideStateChange?: (gliding: boolean) => void;
}

export function TransactionsCalendarCard({
  year,
  month,
  selectedRange,
  dailyTotals,
  dailyMap,
  rangeSummaryOverride = null,
  isLoading = false,
  currencyCode,
  hideBalances = false,
  onPrevMonth,
  onNextMonth,
  onJumpToToday,
  onSelectRange,
  onGlideStateChange,
}: TransactionsCalendarCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const [glidePreviewRange, setGlidePreviewRange] = useState<CalendarDateRange | null>(null);
  const activeRange = glidePreviewRange ?? selectedRange;

  const todayYmd = getLocalTodayYmd();
  const [todayYear, todayMonth] = todayYmd.split('-').map(Number);
  const isCurrentMonth = year === todayYear && month === todayMonth;
  const isOnlyTodaySelected =
    selectedRange?.start === todayYmd && selectedRange?.end === todayYmd;
  const showTodayShortcut = !isCurrentMonth || !isOnlyTodaySelected;

  const currencySymbol = useMemo(() => getCurrencySymbol(), [currencyCode]);

  const monthLabel = useMemo(() => {
    const dt = new Date(year, month - 1, 1);
    return dt.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }, [year, month]);

  const monthSummary = useMemo(() => summarizeMonthDailyTotals(dailyTotals), [dailyTotals]);

  const { cells, weeks } = useMemo(() => {
    const flatCells = buildMonthCalendarGrid(year, month, todayYmd);
    const rows: CalendarDayCell[][] = [];
    for (let i = 0; i < flatCells.length; i += 7) {
      rows.push(flatCells.slice(i, i + 7));
    }
    return { cells: flatCells, weeks: rows };
  }, [year, month, todayYmd]);

  const gridRef = useRef<View>(null);
  const gridWindowOriginRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const cellsRef = useRef<CalendarDayCell[]>(cells);
  cellsRef.current = cells;
  const rowCountRef = useRef(weeks.length);
  rowCountRef.current = weeks.length;
  const onSelectRangeRef = useRef(onSelectRange);
  onSelectRangeRef.current = onSelectRange;
  const onGlideStateChangeRef = useRef(onGlideStateChange);
  onGlideStateChangeRef.current = onGlideStateChange;

  const glideAnchorRef = useRef<string | null>(null);
  const lastHoveredRef = useRef<string | null>(null);
  const isGlideActiveRef = useRef(false);

  const measureGrid = () => {
    gridRef.current?.measureInWindow((wx, wy, ww, wh) => {
      if (ww > 0 && wh > 0) {
        gridWindowOriginRef.current = { x: wx, y: wy, width: ww, height: wh };
      }
    });
  };

  const resolveDateAtWindowPoint = (
    winX: number,
    winY: number,
    origin = gridWindowOriginRef.current
  ): string | null => {
    const { x, y, width, height } = origin;
    const idx = getCalendarGridCellIndex(
      winX - x,
      winY - y,
      width,
      height,
      rowCountRef.current
    );
    if (idx === null) return null;
    return cellsRef.current[idx]?.dateStr ?? null;
  };

  const panResponder = useRef(
    PanResponder.create({
      // Only engage glide on deliberate horizontal swipes across day cells so taps and vertical FlatList scroll stay effortless
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 14 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.35,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (_, gs) => {
        isGlideActiveRef.current = true;
        onGlideStateChangeRef.current?.(true);
        const startX = gs.x0;
        const startY = gs.y0;
        const currentX = gs.moveX || gs.x0;
        const currentY = gs.moveY || gs.y0;

        gridRef.current?.measureInWindow((wx, wy, ww, wh) => {
          if (!isGlideActiveRef.current) return;
          if (ww > 0 && wh > 0) {
            const freshOrigin = { x: wx, y: wy, width: ww, height: wh };
            gridWindowOriginRef.current = freshOrigin;
            const anchor = resolveDateAtWindowPoint(startX, startY, freshOrigin);
            const hovered = resolveDateAtWindowPoint(currentX, currentY, freshOrigin) ?? anchor;
            if (anchor) {
              glideAnchorRef.current = anchor;
              lastHoveredRef.current = hovered;
              setGlidePreviewRange(normalizeCalendarRange(anchor, hovered ?? anchor));
              haptics.selection();
            }
          }
        });
      },
      onPanResponderMove: (_, gs) => {
        if (!glideAnchorRef.current) {
          const fallbackAnchor = resolveDateAtWindowPoint(gs.x0, gs.y0);
          if (fallbackAnchor) {
            glideAnchorRef.current = fallbackAnchor;
          }
        }
        const hovered = resolveDateAtWindowPoint(gs.moveX, gs.moveY);
        if (glideAnchorRef.current && hovered && hovered !== lastHoveredRef.current) {
          lastHoveredRef.current = hovered;
          haptics.selection();
          setGlidePreviewRange(normalizeCalendarRange(glideAnchorRef.current, hovered));
        }
      },
      onPanResponderRelease: () => {
        isGlideActiveRef.current = false;
        onGlideStateChangeRef.current?.(false);
        if (glideAnchorRef.current) {
          const end = lastHoveredRef.current ?? glideAnchorRef.current;
          onSelectRangeRef.current(normalizeCalendarRange(glideAnchorRef.current, end));
        }
        glideAnchorRef.current = null;
        lastHoveredRef.current = null;
        setGlidePreviewRange(null);
      },
      onPanResponderTerminate: () => {
        isGlideActiveRef.current = false;
        onGlideStateChangeRef.current?.(false);
        glideAnchorRef.current = null;
        lastHoveredRef.current = null;
        setGlidePreviewRange(null);
      },
    })
  ).current;

  const isSingleDay = Boolean(activeRange && activeRange.start === activeRange.end);
  const selectedRangeSummary = useMemo(() => {
    if (!activeRange) return null;
    if (rangeSummaryOverride) {
      return rangeSummaryOverride;
    }
    if (activeRange.start === activeRange.end) {
      return dailyMap[activeRange.start] ?? null;
    }
    return summarizeCalendarRange(dailyMap, activeRange);
  }, [activeRange, dailyMap, rangeSummaryOverride]);

  return (
    <View style={styles.card}>
      {/* Month Navigation Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.navButton}
          onPress={() => {
            haptics.selection();
            onPrevMonth();
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Previous month"
        >
          <MaterialIcons name="chevron-left" size={22} color={colors.onSurface} />
        </TouchableOpacity>

        <View style={styles.monthTitleRow}>
          <Text style={styles.monthTitle}>{monthLabel}</Text>
          {isLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : showTodayShortcut ? (
            <TouchableOpacity
              style={styles.todayChip}
              onPress={() => {
                haptics.selection();
                onJumpToToday();
              }}
              activeOpacity={0.75}
            >
              <Text style={styles.todayChipText}>Today</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          style={styles.navButton}
          onPress={() => {
            haptics.selection();
            onNextMonth();
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Next month"
        >
          <MaterialIcons name="chevron-right" size={22} color={colors.onSurface} />
        </TouchableOpacity>
      </View>

      {/* Monthly Summary Strip */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Inflow</Text>
          <Text style={[styles.summaryValue, { color: INCOME_COLOR }]} numberOfLines={1} adjustsFontSizeToFit>
            +{formatCurrencyPrivacy(monthSummary.income, false, hideBalances)}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Outflow</Text>
          <Text style={[styles.summaryValue, { color: colors.error }]} numberOfLines={1} adjustsFontSizeToFit>
            -{formatCurrencyPrivacy(monthSummary.expense, false, hideBalances)}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Net</Text>
          <Text
            style={[
              styles.summaryValue,
              {
                color:
                  monthSummary.net > 0
                    ? INCOME_COLOR
                    : monthSummary.net < 0
                    ? colors.error
                    : colors.onSurface,
              },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {monthSummary.net > 0 ? '+' : monthSummary.net < 0 ? '-' : ''}
            {formatCurrencyPrivacy(Math.abs(monthSummary.net), false, hideBalances)}
          </Text>
        </View>
      </View>

      {/* Weekday Row */}
      <View style={styles.weekdaysRow}>
        {WEEKDAYS.map((day) => (
          <View key={day} style={styles.weekdayCell}>
            <Text style={styles.weekdayText}>{day}</Text>
          </View>
        ))}
      </View>

      {/* 7-Column Calendar Grid */}
      <View
        ref={gridRef}
        style={styles.gridContainer}
        onLayout={measureGrid}
        {...panResponder.panHandlers}
      >
        {weeks.map((week, weekIdx) => (
          <View key={`week-${weekIdx}`} style={styles.weekRow}>
            {week.map((cell) => {
              const summary = cell.isCurrentMonth ? dailyMap[cell.dateStr] : undefined;
              const isRangeStart = Boolean(activeRange && cell.dateStr === activeRange.start);
              const isRangeEnd = Boolean(activeRange && cell.dateStr === activeRange.end);
              const isRangeEndpoint = isRangeStart || isRangeEnd;
              const isMultiDayRange = Boolean(activeRange && activeRange.start !== activeRange.end);
              const isInRange = Boolean(
                activeRange &&
                  cell.dateStr > activeRange.start &&
                  cell.dateStr < activeRange.end
              );
              const hasIncome = (summary?.income ?? 0) > 0;
              const hasExpense = (summary?.expense ?? 0) > 0;
              const hasTransfer = (summary?.transfer ?? 0) > 0;

              let compactAmtLabel = '';
              let compactAmtColor: string = colors.onSurfaceVariant;
              if (summary && !hideBalances) {
                if (hasExpense) {
                  compactAmtLabel = `-${formatCompactCalendarAmount(summary.expense, currencySymbol, currencyCode)}`;
                  compactAmtColor = isRangeEndpoint
                    ? colors.onPrimary
                    : isInRange
                      ? colors.onPrimaryContainer
                      : colors.error;
                } else if (hasIncome) {
                  compactAmtLabel = `+${formatCompactCalendarAmount(summary.income, currencySymbol, currencyCode)}`;
                  compactAmtColor = isRangeEndpoint
                    ? colors.onPrimary
                    : isInRange
                      ? colors.onPrimaryContainer
                      : INCOME_COLOR;
                } else if (hasTransfer) {
                  compactAmtLabel = formatCompactCalendarAmount(summary.transfer, currencySymbol, currencyCode);
                  compactAmtColor = isRangeEndpoint
                    ? colors.onPrimary
                    : isInRange
                      ? colors.onPrimaryContainer
                      : colors.primary;
                }
              }

              return (
                <TouchableOpacity
                  key={cell.dateStr}
                  style={[
                    styles.dayCell,
                    cell.isToday && !isRangeEndpoint && !isInRange && styles.todayCell,
                    isInRange && styles.inRangeCell,
                    isRangeEndpoint && styles.selectedCell,
                    isMultiDayRange && isRangeStart && !isRangeEnd && styles.rangeStartCell,
                    isMultiDayRange && isRangeEnd && !isRangeStart && styles.rangeEndCell,
                    !cell.isCurrentMonth && !isRangeEndpoint && !isInRange && styles.outsideMonthCell,
                  ]}
                  onPress={() => {
                    haptics.selection();
                    onSelectRange(nextCalendarDateRange(selectedRange, cell.dateStr));
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${cell.dateStr}${summary ? `, ${summary.count} transactions` : ''}`}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      cell.isToday && !isRangeEndpoint && !isInRange && styles.todayNumber,
                      isInRange && styles.inRangeDayNumber,
                      isRangeEndpoint && styles.selectedDayNumber,
                      !cell.isCurrentMonth && styles.outsideMonthNumber,
                    ]}
                  >
                    {cell.day}
                  </Text>

                  {(hasIncome || hasExpense || hasTransfer) && (
                    <View style={styles.dotsRow}>
                      {hasIncome && (
                        <View
                          style={[
                            styles.dot,
                            { backgroundColor: isRangeEndpoint ? colors.onPrimary : INCOME_COLOR },
                          ]}
                        />
                      )}
                      {hasExpense && (
                        <View
                          style={[
                            styles.dot,
                            { backgroundColor: isRangeEndpoint ? colors.onPrimary : colors.error },
                          ]}
                        />
                      )}
                      {hasTransfer && (
                        <View
                          style={[
                            styles.dot,
                            { backgroundColor: isRangeEndpoint ? colors.onPrimary : colors.primary },
                          ]}
                        />
                      )}
                    </View>
                  )}

                  {compactAmtLabel ? (
                    <Text
                      style={[styles.dayAmountText, { color: compactAmtColor }]}
                      numberOfLines={1}
                    >
                      {compactAmtLabel}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>

      {/* Selected Date / Range Drill-Down Bar */}
      {activeRange ? (
        <View style={styles.selectedBar}>
          <View style={styles.selectedInfo}>
            <Text style={styles.selectedDateText} numberOfLines={1}>
              {isSingleDay
                ? formatDate(activeRange.start, 'short')
                : `${formatDate(activeRange.start, 'short')} – ${formatDate(activeRange.end, 'short')}`}
              {selectedRangeSummary && selectedRangeSummary.count > 0
                ? ` • ${selectedRangeSummary.count} ${selectedRangeSummary.count === 1 ? 'txn' : 'txns'}`
                : ' • No activity'}
            </Text>
            {selectedRangeSummary &&
            (selectedRangeSummary.income > 0 || selectedRangeSummary.expense > 0) ? (
              <Text style={styles.selectedBreakdown} numberOfLines={1}>
                {selectedRangeSummary.income > 0
                  ? `+${formatCurrencyPrivacy(selectedRangeSummary.income, false, hideBalances)}`
                  : ''}
                {selectedRangeSummary.income > 0 && selectedRangeSummary.expense > 0 ? '  |  ' : ''}
                {selectedRangeSummary.expense > 0
                  ? `-${formatCurrencyPrivacy(selectedRangeSummary.expense, false, hideBalances)}`
                  : ''}
              </Text>
            ) : isSingleDay ? (
              <Text style={styles.selectedBreakdown} numberOfLines={1}>
                Tap another date to select a range · Tap again to clear
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.allMonthChip}
            onPress={() => {
              haptics.selection();
              onSelectRange(null);
            }}
            activeOpacity={0.75}
          >
            <Text style={styles.allMonthText}>All Month</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.hintBar}>
          <MaterialIcons name="date-range" size={14} color={colors.onSurfaceVariant} />
          <Text style={styles.hintText} numberOfLines={1}>
            Tap start & end date (even across months) or swipe horizontally
          </Text>
        </View>
      )}
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 14,
      marginBottom: 16,
      gap: 12,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    navButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.surfaceContainerLow,
      alignItems: 'center',
      justifyContent: 'center',
    },
    monthTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    monthTitle: {
      ...typography.headlineSm,
      fontSize: 16,
      fontFamily: 'Manrope_700Bold',
      color: colors.onSurface,
    },
    todayChip: {
      backgroundColor: colors.primaryContainer,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.full,
    },
    todayChipText: {
      ...typography.labelMd,
      fontSize: 10,
      fontFamily: 'Manrope_700Bold',
      color: colors.onPrimaryContainer,
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radius.lg,
      paddingVertical: 8,
      paddingHorizontal: 8,
    },
    summaryBox: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: 4,
    },
    summaryDivider: {
      width: 1,
      height: 24,
      backgroundColor: colors.outlineVariant,
    },
    summaryLabel: {
      ...typography.labelMd,
      fontSize: 10,
      color: colors.onSurfaceVariant,
    },
    summaryValue: {
      ...typography.labelMd,
      fontSize: 12,
      fontFamily: 'Manrope_700Bold',
    },
    weekdaysRow: {
      flexDirection: 'row',
    },
    weekdayCell: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 2,
    },
    weekdayText: {
      ...typography.labelMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      fontFamily: 'Manrope_600SemiBold',
    },
    gridContainer: {
      gap: 4,
    },
    weekRow: {
      flexDirection: 'row',
      gap: 2,
    },
    dayCell: {
      flex: 1,
      minHeight: 48,
      borderRadius: radius.md,
      alignItems: 'center',
      paddingTop: 5,
      paddingBottom: 4,
      paddingHorizontal: 2,
      gap: 2,
    },
    todayCell: {
      borderWidth: 1.5,
      borderColor: colors.primary,
      backgroundColor: colors.surfaceContainerLow,
    },
    selectedCell: {
      backgroundColor: colors.primary,
    },
    rangeStartCell: {
      borderTopLeftRadius: radius.md,
      borderBottomLeftRadius: radius.md,
      borderTopRightRadius: 4,
      borderBottomRightRadius: 4,
    },
    rangeEndCell: {
      borderTopRightRadius: radius.md,
      borderBottomRightRadius: radius.md,
      borderTopLeftRadius: 4,
      borderBottomLeftRadius: 4,
    },
    inRangeCell: {
      backgroundColor: colors.primaryContainer,
      borderRadius: 4,
    },
    outsideMonthCell: {
      opacity: 0.4,
    },
    dayNumber: {
      ...typography.bodyMd,
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      color: colors.onSurface,
    },
    todayNumber: {
      color: colors.primary,
      fontFamily: 'Manrope_700Bold',
    },
    inRangeDayNumber: {
      color: colors.onPrimaryContainer,
      fontFamily: 'Manrope_700Bold',
    },
    selectedDayNumber: {
      color: colors.onPrimary,
      fontFamily: 'Manrope_700Bold',
    },
    outsideMonthNumber: {
      color: colors.onSurfaceVariant,
    },
    dotsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2.5,
      height: 5,
    },
    dot: {
      width: 4,
      height: 4,
      borderRadius: 2,
    },
    dayAmountText: {
      fontSize: 8.5,
      fontFamily: 'Manrope_700Bold',
      lineHeight: 11,
      textAlign: 'center',
    },
    selectedBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radius.lg,
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 8,
    },
    selectedInfo: {
      flex: 1,
      gap: 2,
    },
    selectedDateText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      color: colors.onSurface,
    },
    selectedBreakdown: {
      ...typography.labelMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
    },
    allMonthChip: {
      backgroundColor: colors.primaryContainer,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.full,
    },
    allMonthText: {
      ...typography.labelMd,
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
      color: colors.onPrimaryContainer,
    },
    hintBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radius.lg,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    hintText: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      flex: 1,
    },
  });
  return styles;
};

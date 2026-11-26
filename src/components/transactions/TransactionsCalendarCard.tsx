import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { DailyTransactionSummary } from '@/services/database/transaction-dao';
import { ThemeColors, radius, typography, useTheme } from '@/theme';
import {
  buildMonthCalendarGrid,
  formatCompactCalendarAmount,
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
  selectedDate: string | null;
  dailyTotals: DailyTransactionSummary[];
  dailyMap: Record<string, DailyTransactionSummary>;
  isLoading?: boolean;
  currencyCode: string;
  hideBalances?: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onJumpToToday: () => void;
  onSelectDate: (dateStr: string) => void;
  onClearSelectedDate: () => void;
}

export function TransactionsCalendarCard({
  year,
  month,
  selectedDate,
  dailyTotals,
  dailyMap,
  isLoading = false,
  currencyCode,
  hideBalances = false,
  onPrevMonth,
  onNextMonth,
  onJumpToToday,
  onSelectDate,
  onClearSelectedDate,
}: TransactionsCalendarCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const todayYmd = getLocalTodayYmd();
  const [todayYear, todayMonth] = todayYmd.split('-').map(Number);
  const isCurrentMonth = year === todayYear && month === todayMonth;
  const showTodayShortcut = !isCurrentMonth || selectedDate !== todayYmd;

  const currencySymbol = useMemo(() => getCurrencySymbol(), [currencyCode]);

  const monthLabel = useMemo(() => {
    const dt = new Date(year, month - 1, 1);
    return dt.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }, [year, month]);

  const monthSummary = useMemo(() => summarizeMonthDailyTotals(dailyTotals), [dailyTotals]);

  const weeks = useMemo(() => {
    const cells = buildMonthCalendarGrid(year, month, todayYmd);
    const rows: typeof cells[] = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    return rows;
  }, [year, month, todayYmd]);

  const selectedDaySummary = selectedDate ? dailyMap[selectedDate] : undefined;

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
      <View style={styles.gridContainer}>
        {weeks.map((week, weekIdx) => (
          <View key={`week-${weekIdx}`} style={styles.weekRow}>
            {week.map((cell) => {
              const summary = cell.isCurrentMonth ? dailyMap[cell.dateStr] : undefined;
              const isSelected = selectedDate === cell.dateStr;
              const hasIncome = (summary?.income ?? 0) > 0;
              const hasExpense = (summary?.expense ?? 0) > 0;
              const hasTransfer = (summary?.transfer ?? 0) > 0;

              let compactAmtLabel = '';
              let compactAmtColor: string = colors.onSurfaceVariant;
              if (summary && !hideBalances) {
                if (hasExpense) {
                  compactAmtLabel = `-${formatCompactCalendarAmount(summary.expense, currencySymbol, currencyCode)}`;
                  compactAmtColor = isSelected ? colors.onPrimary : colors.error;
                } else if (hasIncome) {
                  compactAmtLabel = `+${formatCompactCalendarAmount(summary.income, currencySymbol, currencyCode)}`;
                  compactAmtColor = isSelected ? colors.onPrimary : INCOME_COLOR;
                } else if (hasTransfer) {
                  compactAmtLabel = formatCompactCalendarAmount(summary.transfer, currencySymbol, currencyCode);
                  compactAmtColor = isSelected ? colors.onPrimary : colors.primary;
                }
              }

              return (
                <TouchableOpacity
                  key={cell.dateStr}
                  style={[
                    styles.dayCell,
                    cell.isToday && !isSelected && styles.todayCell,
                    isSelected && styles.selectedCell,
                    !cell.isCurrentMonth && styles.outsideMonthCell,
                  ]}
                  onPress={() => {
                    haptics.selection();
                    onSelectDate(cell.dateStr);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${cell.dateStr}${summary ? `, ${summary.count} transactions` : ''}`}
                >
                  <Text
                    style={[
                      styles.dayNumber,
                      cell.isToday && !isSelected && styles.todayNumber,
                      isSelected && styles.selectedDayNumber,
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
                            { backgroundColor: isSelected ? colors.onPrimary : INCOME_COLOR },
                          ]}
                        />
                      )}
                      {hasExpense && (
                        <View
                          style={[
                            styles.dot,
                            { backgroundColor: isSelected ? colors.onPrimary : colors.error },
                          ]}
                        />
                      )}
                      {hasTransfer && (
                        <View
                          style={[
                            styles.dot,
                            { backgroundColor: isSelected ? colors.onPrimary : colors.primary },
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

      {/* Selected Day Drill-Down Bar */}
      {selectedDate && (
        <View style={styles.selectedBar}>
          <View style={styles.selectedInfo}>
            <Text style={styles.selectedDateText} numberOfLines={1}>
              {formatDate(selectedDate, 'short')}
              {selectedDaySummary
                ? ` • ${selectedDaySummary.count} ${selectedDaySummary.count === 1 ? 'txn' : 'txns'}`
                : ' • No activity'}
            </Text>
            {selectedDaySummary && (selectedDaySummary.income > 0 || selectedDaySummary.expense > 0) && (
              <Text style={styles.selectedBreakdown} numberOfLines={1}>
                {selectedDaySummary.income > 0
                  ? `+${formatCurrencyPrivacy(selectedDaySummary.income, false, hideBalances)}`
                  : ''}
                {selectedDaySummary.income > 0 && selectedDaySummary.expense > 0 ? '  |  ' : ''}
                {selectedDaySummary.expense > 0
                  ? `-${formatCurrencyPrivacy(selectedDaySummary.expense, false, hideBalances)}`
                  : ''}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.allMonthChip}
            onPress={() => {
              haptics.selection();
              onClearSelectedDate();
            }}
            activeOpacity={0.75}
          >
            <Text style={styles.allMonthText}>All Month</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
      ...typography.titleMd,
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
  });

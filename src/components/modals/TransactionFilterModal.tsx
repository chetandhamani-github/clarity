import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { Text } from '@/components/ui';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme, typography, radius, ThemeColors } from '@/theme';
import { useAccounts } from '@/hooks/use-accounts';
import { useCategories } from '@/hooks/use-budget';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useTags } from '@/hooks/use-tags';
import {
  CalendarRangePreset,
  applyCustomRangeEndpoint,
  buildMonthCalendarGrid,
  isValidYmd,
  normalizeCalendarRange,
} from '@/utils/calendar-utils';
import { getLocalTodayYmd } from '@/utils/date';
import { formatDate, formatLocalDate } from '@/utils/format';

export type DatePreset = CalendarRangePreset;

export const VALID_DATE_PRESETS: ReadonlySet<DatePreset> = new Set([
  'all',
  'this_month',
  'last_7_days',
  'last_30_days',
  'last_month',
  'last_90_days',
  'custom',
]);

export interface ActiveFilters {
  accountId?: string;
  category?: string;
  tag?: string;
  datePreset: DatePreset;
  customDateFrom?: string;
  customDateTo?: string;
  type?: 'all' | 'expense' | 'income' | 'transfer';
}

interface Props {
  visible: boolean;
  filters: ActiveFilters;
  lockedAccountId?: string;
  onClose: () => void;
  onApply: (filters: ActiveFilters) => void;
}

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'all', label: 'All Time' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_7_days', label: 'Last 7 Days' },
  { id: 'last_30_days', label: 'Last 30 Days' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'last_90_days', label: 'Last 90 Days' },
  { id: 'custom', label: 'Custom Range' },
];

const TYPE_OPTIONS: { id: 'all' | 'expense' | 'income' | 'transfer'; label: string }[] = [
  { id: 'all', label: 'All Types' },
  { id: 'expense', label: 'Expenses' },
  { id: 'income', label: 'Income' },
  { id: 'transfer', label: 'Transfers' },
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

function getDefaultCustomBounds() {
  const now = new Date();
  const start = formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const end = getLocalTodayYmd();
  return { start, end };
}

export function TransactionFilterModal({
  visible,
  filters,
  lockedAccountId,
  onClose,
  onApply,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const insets = useSafeInsets();
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const { tags } = useTags();

  const [selectedType, setSelectedType] = useState<'all' | 'expense' | 'income' | 'transfer'>(
    filters.type || 'all'
  );
  const [selectedDatePreset, setSelectedDatePreset] = useState<DatePreset>(
    filters.datePreset || 'all'
  );
  const [customFrom, setCustomFrom] = useState<string>(() => getDefaultCustomBounds().start);
  const [customTo, setCustomTo] = useState<string>(() => getDefaultCustomBounds().end);
  const [activeEndpoint, setActiveEndpoint] = useState<'start' | 'end'>('start');
  const [pickerYear, setPickerYear] = useState<number>(() => new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState<number>(() => new Date().getMonth() + 1);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(
    lockedAccountId ?? filters.accountId
  );
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(
    filters.category
  );
  const [selectedTag, setSelectedTag] = useState<string | undefined>(
    filters.tag
  );

  useEffect(() => {
    if (visible) {
      const defaults = getDefaultCustomBounds();
      const rawStart = isValidYmd(filters.customDateFrom) ? filters.customDateFrom : defaults.start;
      const rawEnd = isValidYmd(filters.customDateTo) ? filters.customDateTo : defaults.end;
      const normalized = normalizeCalendarRange(rawStart, rawEnd);
      const [y, m] = normalized.start.split('-').map(Number);

      setSelectedType(filters.type || 'all');
      setSelectedDatePreset(filters.datePreset || 'all');
      setCustomFrom(normalized.start);
      setCustomTo(normalized.end);
      setActiveEndpoint('start');
      if (y && m) {
        setPickerYear(y);
        setPickerMonth(m);
      }
      setSelectedAccountId(lockedAccountId ?? filters.accountId);
      setSelectedCategory(filters.category);
      setSelectedTag(filters.tag);
    }
  }, [visible, filters, lockedAccountId]);

  const todayYmd = getLocalTodayYmd();

  const pickerMonthLabel = useMemo(() => {
    return new Date(pickerYear, pickerMonth - 1, 1).toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  }, [pickerYear, pickerMonth]);

  const calendarWeeks = useMemo(() => {
    const cells = buildMonthCalendarGrid(pickerYear, pickerMonth, todayYmd);
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    return rows;
  }, [pickerYear, pickerMonth, todayYmd]);

  if (!visible) return null;

  const handleSelectDatePreset = (preset: DatePreset) => {
    setSelectedDatePreset(preset);
    if (preset === 'custom') {
      const [y, m] = customFrom.split('-').map(Number);
      if (y && m) {
        setPickerYear(y);
        setPickerMonth(m);
      }
    }
  };

  const handlePrevMonth = () => {
    if (pickerMonth === 1) {
      setPickerMonth(12);
      setPickerYear((y) => y - 1);
    } else {
      setPickerMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (pickerMonth === 12) {
      setPickerMonth(1);
      setPickerYear((y) => y + 1);
    } else {
      setPickerMonth((m) => m + 1);
    }
  };

  const handleJumpToToday = () => {
    const [y, m] = todayYmd.split('-').map(Number);
    if (y && m) {
      setPickerYear(y);
      setPickerMonth(m);
    }
  };

  const handleTapCalendarDate = (dateStr: string) => {
    const result = applyCustomRangeEndpoint(customFrom, customTo, activeEndpoint, dateStr);
    setCustomFrom(result.start);
    setCustomTo(result.end);
    setActiveEndpoint(result.nextEndpoint);
  };

  const handleFocusEndpoint = (endpoint: 'start' | 'end') => {
    setActiveEndpoint(endpoint);
    const targetDate = endpoint === 'start' ? customFrom : customTo;
    const [y, m] = targetDate.split('-').map(Number);
    if (y && m) {
      setPickerYear(y);
      setPickerMonth(m);
    }
  };

  const handleReset = () => {
    const defaults = getDefaultCustomBounds();
    setSelectedType('all');
    setSelectedDatePreset('all');
    setCustomFrom(defaults.start);
    setCustomTo(defaults.end);
    setActiveEndpoint('start');
    setSelectedAccountId(lockedAccountId);
    setSelectedCategory(undefined);
    setSelectedTag(undefined);
  };

  const handleApply = () => {
    const normalizedCustom =
      selectedDatePreset === 'custom'
        ? normalizeCalendarRange(customFrom, customTo)
        : null;

    onApply({
      type: selectedType,
      datePreset: selectedDatePreset,
      customDateFrom: normalizedCustom?.start,
      customDateTo: normalizedCustom?.end,
      accountId: lockedAccountId ?? selectedAccountId,
      category: selectedCategory,
      tag: selectedTag,
    });
    onClose();
  };

  const activeCount =
    (selectedType !== 'all' ? 1 : 0) +
    (selectedDatePreset !== 'all' ? 1 : 0) +
    (!lockedAccountId && selectedAccountId ? 1 : 0) +
    (selectedCategory ? 1 : 0) +
    (selectedTag ? 1 : 0);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Filter Transactions</Text>
            {activeCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{activeCount}</Text>
              </View>
            )}
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={handleReset} style={styles.resetButton}>
              <Text style={styles.resetText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="close" size={24} color={colors.onSurface} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Filters Scroll */}
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Section: Type */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Transaction Type</Text>
            <View style={styles.chipRow}>
              {TYPE_OPTIONS.map((item) => {
                const isSelected = selectedType === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => setSelectedType(item.id)}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Section: Date Range */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Time Period</Text>
            <View style={styles.chipRow}>
              {DATE_PRESETS.map((item) => {
                const isSelected = selectedDatePreset === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => handleSelectDatePreset(item.id)}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {selectedDatePreset === 'custom' && (
              <View style={styles.customRangeCard}>
                {/* From / To Endpoint Selectors */}
                <View style={styles.endpointRow}>
                  <TouchableOpacity
                    style={[
                      styles.endpointBox,
                      activeEndpoint === 'start' && styles.endpointBoxActive,
                    ]}
                    onPress={() => handleFocusEndpoint('start')}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.endpointLabel}>FROM</Text>
                    <Text
                      style={[
                        styles.endpointValue,
                        activeEndpoint === 'start' && styles.endpointValueActive,
                      ]}
                      numberOfLines={1}
                    >
                      {formatDate(customFrom, 'short')}
                    </Text>
                  </TouchableOpacity>

                  <MaterialIcons name="arrow-forward" size={16} color={colors.onSurfaceVariant} />

                  <TouchableOpacity
                    style={[
                      styles.endpointBox,
                      activeEndpoint === 'end' && styles.endpointBoxActive,
                    ]}
                    onPress={() => handleFocusEndpoint('end')}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.endpointLabel}>TO</Text>
                    <Text
                      style={[
                        styles.endpointValue,
                        activeEndpoint === 'end' && styles.endpointValueActive,
                      ]}
                      numberOfLines={1}
                    >
                      {formatDate(customTo, 'short')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Inline Calendar Navigation */}
                <View style={styles.inlineCalHeader}>
                  <TouchableOpacity
                    style={styles.inlineNavBtn}
                    onPress={handlePrevMonth}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Previous month"
                  >
                    <MaterialIcons name="chevron-left" size={20} color={colors.onSurface} />
                  </TouchableOpacity>

                  <View style={styles.inlineTitleGroup}>
                    <Text style={styles.inlineMonthTitle}>{pickerMonthLabel}</Text>
                    <TouchableOpacity style={styles.inlineTodayChip} onPress={handleJumpToToday}>
                      <Text style={styles.inlineTodayText}>Today</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.inlineNavBtn}
                    onPress={handleNextMonth}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Next month"
                  >
                    <MaterialIcons name="chevron-right" size={20} color={colors.onSurface} />
                  </TouchableOpacity>
                </View>

                {/* Weekday Row */}
                <View style={styles.inlineWeekdays}>
                  {WEEKDAYS.map((wd) => (
                    <View key={wd} style={styles.inlineWeekdayCell}>
                      <Text style={styles.inlineWeekdayText}>{wd}</Text>
                    </View>
                  ))}
                </View>

                {/* Calendar Days */}
                <View style={styles.inlineGrid}>
                  {calendarWeeks.map((week, wIdx) => (
                    <View key={`w-${wIdx}`} style={styles.inlineWeekRow}>
                      {week.map((cell) => {
                        const isStart = cell.dateStr === customFrom;
                        const isEnd = cell.dateStr === customTo;
                        const isEndpoint = isStart || isEnd;
                        const isMultiDay = customFrom !== customTo;
                        const isInRange = cell.dateStr > customFrom && cell.dateStr < customTo;

                        return (
                          <TouchableOpacity
                            key={cell.dateStr}
                            style={[
                              styles.inlineDayCell,
                              cell.isToday && !isEndpoint && !isInRange && styles.inlineTodayCell,
                              isInRange && styles.inlineInRangeCell,
                              isEndpoint && styles.inlineEndpointCell,
                              isMultiDay && isStart && !isEnd && styles.inlineStartCell,
                              isMultiDay && isEnd && !isStart && styles.inlineEndCell,
                              !cell.isCurrentMonth && !isEndpoint && !isInRange && styles.inlineOutsideCell,
                            ]}
                            onPress={() => handleTapCalendarDate(cell.dateStr)}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.inlineDayText,
                                cell.isToday && !isEndpoint && !isInRange && styles.inlineTodayTextNum,
                                isInRange && styles.inlineInRangeText,
                                isEndpoint && styles.inlineEndpointText,
                              ]}
                            >
                              {cell.day}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </View>

                <Text style={styles.inlineHelperText}>
                  {activeEndpoint === 'start'
                    ? 'Tap a start date on the calendar'
                    : 'Now tap an end date on the calendar'}
                </Text>
              </View>
            )}
          </View>

          {/* Section: Account */}
          {!lockedAccountId && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Account</Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, !selectedAccountId && styles.chipSelected]}
                  onPress={() => setSelectedAccountId(undefined)}
                >
                  <Text style={[styles.chipText, !selectedAccountId && styles.chipTextSelected]}>
                    All Accounts
                  </Text>
                </TouchableOpacity>
                {accounts.map((acc) => {
                  const isSelected = selectedAccountId === acc.id;
                  return (
                    <TouchableOpacity
                      key={acc.id}
                      style={[styles.chip, isSelected && styles.chipSelected]}
                      onPress={() => setSelectedAccountId(isSelected ? undefined : acc.id)}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                        {acc.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Section: Category */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Category</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, !selectedCategory && styles.chipSelected]}
                onPress={() => setSelectedCategory(undefined)}
              >
                <Text style={[styles.chipText, !selectedCategory && styles.chipTextSelected]}>
                  All Categories
                </Text>
              </TouchableOpacity>
              {categories.map((cat) => {
                const isSelected = selectedCategory === cat.name;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => setSelectedCategory(isSelected ? undefined : cat.name)}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Section: Tags */}
          {tags.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Tags</Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, !selectedTag && styles.chipSelected]}
                  onPress={() => setSelectedTag(undefined)}
                >
                  <Text style={[styles.chipText, !selectedTag && styles.chipTextSelected]}>
                    All Tags
                  </Text>
                </TouchableOpacity>
                {tags.map((t) => {
                  const isSelected = selectedTag === t.name;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.chip, isSelected && styles.chipSelected]}
                      onPress={() => setSelectedTag(isSelected ? undefined : t.name)}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                        #{t.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </ScrollView>

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 28) + 16 }]}>
          <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
            <Text style={styles.applyButtonText}>
              Apply Filters {activeCount > 0 ? `(${activeCount})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineVariant,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    title: {
      ...typography.headlineSm,
      color: colors.onSurface,
      fontWeight: '700',
    },
    badge: {
      backgroundColor: colors.primary,
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: {
      ...typography.labelMd,
      color: colors.onPrimary,
      fontSize: 11,
      fontWeight: '700',
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    resetText: {
      ...typography.labelMd,
      color: colors.primary,
      fontWeight: '600',
    },
    resetButton: {
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      gap: 24,
      paddingBottom: 40,
    },
    section: {
      gap: 12,
    },
    sectionTitle: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      fontFamily: 'Manrope_700Bold',
      textTransform: 'uppercase',
      letterSpacing: Platform.OS === 'ios' ? 0.5 : 0,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 20,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    chipSelected: {
      backgroundColor: colors.primaryContainer,
      borderColor: colors.primary,
    },
    chipText: {
      ...typography.bodyMd,
      fontSize: 13,
      color: colors.onSurfaceVariant,
      fontWeight: '500',
    },
    chipTextSelected: {
      color: colors.onPrimaryContainer,
      fontWeight: '700',
    },
    customRangeCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: 12,
      gap: 10,
    },
    endpointRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    endpointBox: {
      flex: 1,
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 2,
    },
    endpointBoxActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primaryContainer + '35',
    },
    endpointLabel: {
      ...typography.labelMd,
      fontSize: 10,
      color: colors.onSurfaceVariant,
      fontFamily: 'Manrope_700Bold',
    },
    endpointValue: {
      ...typography.bodyMd,
      fontSize: 13,
      fontFamily: 'Manrope_700Bold',
      color: colors.onSurface,
    },
    endpointValueActive: {
      color: colors.primary,
    },
    inlineCalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 2,
    },
    inlineNavBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.surfaceContainerLow,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inlineTitleGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    inlineMonthTitle: {
      ...typography.labelMd,
      fontSize: 14,
      fontFamily: 'Manrope_700Bold',
      color: colors.onSurface,
    },
    inlineTodayChip: {
      backgroundColor: colors.primaryContainer,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    inlineTodayText: {
      ...typography.labelMd,
      fontSize: 10,
      fontFamily: 'Manrope_700Bold',
      color: colors.onPrimaryContainer,
    },
    inlineWeekdays: {
      flexDirection: 'row',
    },
    inlineWeekdayCell: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 2,
    },
    inlineWeekdayText: {
      ...typography.labelMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      fontFamily: 'Manrope_600SemiBold',
    },
    inlineGrid: {
      gap: 4,
    },
    inlineWeekRow: {
      flexDirection: 'row',
      gap: 2,
    },
    inlineDayCell: {
      flex: 1,
      height: 34,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inlineTodayCell: {
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    inlineInRangeCell: {
      backgroundColor: colors.primaryContainer,
      borderRadius: 4,
    },
    inlineEndpointCell: {
      backgroundColor: colors.primary,
    },
    inlineStartCell: {
      borderTopLeftRadius: radius.md,
      borderBottomLeftRadius: radius.md,
      borderTopRightRadius: 4,
      borderBottomRightRadius: 4,
    },
    inlineEndCell: {
      borderTopRightRadius: radius.md,
      borderBottomRightRadius: radius.md,
      borderTopLeftRadius: 4,
      borderBottomLeftRadius: 4,
    },
    inlineOutsideCell: {
      opacity: 0.38,
    },
    inlineDayText: {
      ...typography.bodyMd,
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      color: colors.onSurface,
    },
    inlineTodayTextNum: {
      color: colors.primary,
      fontFamily: 'Manrope_700Bold',
    },
    inlineInRangeText: {
      color: colors.onPrimaryContainer,
      fontFamily: 'Manrope_700Bold',
    },
    inlineEndpointText: {
      color: colors.onPrimary,
      fontFamily: 'Manrope_700Bold',
    },
    inlineHelperText: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
    },
    footer: {
      padding: 20,
      borderTopWidth: 1,
      borderTopColor: colors.outlineVariant,
      backgroundColor: colors.surface,
    },
    applyButton: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    applyButtonText: {
      ...typography.labelMd,
      color: colors.onPrimary,
      fontWeight: '700',
      fontSize: 15,
    },
  });
  return styles;
};

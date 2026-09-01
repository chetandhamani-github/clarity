import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Text } from './Text';
import { MaterialIcons } from '@expo/vector-icons';
import { typography, radius, useTheme, ThemeColors } from '@/theme';

interface DatePickerModalProps {
  visible: boolean;
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  onClose: () => void;
  maxDate?: string;
  minDate?: string;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function DatePickerModal({
  visible,
  value,
  onChange,
  onClose,
  maxDate,
  minDate,
}: DatePickerModalProps) {
  const { colors } = useTheme();
  const styles = getStyles(colors);

  const initialDate = useMemo(() => {
    if (value && !isNaN(new Date(value).getTime())) {
      const parts = value.split('-').map(Number);
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    return new Date();
  }, [value]);

  const [currentMonth, setCurrentMonth] = useState(initialDate.getMonth());
  const [currentYear, setCurrentYear] = useState(initialDate.getFullYear());
  const [selectedDateStr, setSelectedDateStr] = useState(value || new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (visible) {
      if (value && !isNaN(new Date(value).getTime())) {
        const parts = value.split('-').map(Number);
        setCurrentMonth(parts[1] - 1);
        setCurrentYear(parts[0]);
        setSelectedDateStr(value);
      } else {
        const now = new Date();
        setCurrentMonth(now.getMonth());
        setCurrentYear(now.getFullYear());
        setSelectedDateStr(now.toISOString().split('T')[0]);
      }
    }
  }, [visible, value]);

  const monthName = new Date(currentYear, currentMonth, 1).toLocaleString('default', {
    month: 'long',
  });

  const todayStr = useMemo(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const yesterdayStr = useMemo(() => {
    const yday = new Date();
    yday.setDate(yday.getDate() - 1);
    const y = yday.getFullYear();
    const m = String(yday.getMonth() + 1).padStart(2, '0');
    const d = String(yday.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const twoDaysAgoStr = useMemo(() => {
    const d2 = new Date();
    d2.setDate(d2.getDate() - 2);
    const y = d2.getFullYear();
    const m = String(d2.getMonth() + 1).padStart(2, '0');
    const d = String(d2.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const calendarDays = useMemo(() => {
    const days: { day: number; dateStr: string; isCurrentMonth: boolean; isDisabled: boolean }[] = [];

    // First day of month (0 = Sun, 1 = Mon, ..., 6 = Sat)
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    // Days in current month
    const totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    // Days in previous month
    const totalDaysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

    // Previous month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = totalDaysInPrevMonth - i;
      const prevM = currentMonth === 0 ? 12 : currentMonth;
      const prevY = currentMonth === 0 ? currentYear - 1 : currentYear;
      const dStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      days.push({
        day: dayNum,
        dateStr: dStr,
        isCurrentMonth: false,
        isDisabled: (maxDate && dStr > maxDate) || (minDate && dStr < minDate) || false,
      });
    }

    // Current month days
    for (let i = 1; i <= totalDaysInMonth; i++) {
      const dStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push({
        day: i,
        dateStr: dStr,
        isCurrentMonth: true,
        isDisabled: (maxDate && dStr > maxDate) || (minDate && dStr < minDate) || false,
      });
    }

    // Next month padding to fill grid (always multiple of 7)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const nextM = currentMonth === 11 ? 1 : currentMonth + 2;
      const nextY = currentMonth === 11 ? currentYear + 1 : currentYear;
      const dStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push({
        day: i,
        dateStr: dStr,
        isCurrentMonth: false,
        isDisabled: (maxDate && dStr > maxDate) || (minDate && dStr < minDate) || false,
      });
    }

    return days;
  }, [currentYear, currentMonth, maxDate, minDate]);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const handleSelectDate = (dateStr: string) => {
    setSelectedDateStr(dateStr);
    onChange(dateStr);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTouch} activeOpacity={1} onPress={onClose} />
        <View style={styles.modalCard}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconCircle, { backgroundColor: colors.primaryContainer }]}>
                <MaterialIcons name="event" size={20} color={colors.onPrimaryContainer} />
              </View>
              <Text style={styles.modalTitle}>Select Date</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="close" size={22} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          {/* Quick Shortcuts */}
          <View style={styles.quickShortcutsRow}>
            {[
              { label: 'Today', date: todayStr },
              { label: 'Yesterday', date: yesterdayStr },
              { label: '2 Days Ago', date: twoDaysAgoStr },
            ].map((shortcut) => {
              const isSelected = selectedDateStr === shortcut.date;
              return (
                <TouchableOpacity
                  key={shortcut.label}
                  style={[
                    styles.shortcutChip,
                    isSelected && {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() => handleSelectDate(shortcut.date)}
                >
                  <Text
                    style={[
                      styles.shortcutText,
                      isSelected && { color: colors.onPrimary, fontWeight: '700' },
                    ]}
                  >
                    {shortcut.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Month Navigation */}
          <View style={styles.monthNavRow}>
            <TouchableOpacity
              style={styles.monthNavBtn}
              onPress={handlePrevMonth}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="chevron-left" size={24} color={colors.onSurface} />
            </TouchableOpacity>
            <Text style={styles.monthYearTitle}>
              {monthName} {currentYear}
            </Text>
            <TouchableOpacity
              style={styles.monthNavBtn}
              onPress={handleNextMonth}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="chevron-right" size={24} color={colors.onSurface} />
            </TouchableOpacity>
          </View>

          {/* Weekday Headers */}
          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((wd) => (
              <View key={wd} style={styles.weekdayCell}>
                <Text style={styles.weekdayText}>{wd}</Text>
              </View>
            ))}
          </View>

          {/* Days Grid */}
          <View style={styles.daysGrid}>
            {calendarDays.map((item, index) => {
              const isSelected = selectedDateStr === item.dateStr;
              const isToday = item.dateStr === todayStr;

              return (
                <TouchableOpacity
                  key={`${item.dateStr}_${index}`}
                  style={styles.dayCell}
                  onPress={() => !item.isDisabled && handleSelectDate(item.dateStr)}
                  disabled={item.isDisabled}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.dayCircle,
                      isSelected && {
                        backgroundColor: colors.primary,
                        borderColor: colors.primary,
                      },
                      isToday && !isSelected && {
                        borderColor: colors.primary,
                        borderWidth: 1.5,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNumberText,
                        !item.isCurrentMonth && { color: colors.outline, opacity: 0.4 },
                        isSelected && { color: colors.onPrimary, fontWeight: '700' },
                        isToday && !isSelected && { color: colors.primary, fontWeight: '700' },
                        item.isDisabled && { color: colors.outline, opacity: 0.3 },
                      ]}
                    >
                      {item.day}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    backdropTouch: {
      flex: 1,
    },
    modalCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      paddingBottom: 32,
      borderTopWidth: 1,
      borderColor: colors.surfaceVariant,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalTitle: {
      ...typography.headlineSm,
      fontWeight: '700',
      color: colors.onSurface,
    },
    closeBtn: {
      padding: 4,
    },
    quickShortcutsRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
    },
    shortcutChip: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      backgroundColor: colors.surfaceContainerLow,
    },
    shortcutText: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      fontWeight: '600',
    },
    monthNavRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      paddingHorizontal: 8,
    },
    monthNavBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceContainerHigh,
    },
    monthYearTitle: {
      ...typography.bodyLg,
      fontWeight: '700',
      color: colors.onSurface,
    },
    weekdayRow: {
      flexDirection: 'row',
      marginBottom: 8,
    },
    weekdayCell: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 4,
    },
    weekdayText: {
      ...typography.labelMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      fontWeight: '700',
    },
    daysGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    dayCell: {
      width: '14.28%', // 100% / 7 columns
      aspectRatio: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 2,
    },
    dayCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayNumberText: {
      ...typography.bodyMd,
      fontWeight: '500',
      color: colors.onSurface,
    },
  });

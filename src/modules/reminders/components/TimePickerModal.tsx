import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { fontFamilies, radius, typography, useTheme } from '@/theme';

interface TimePickerModalProps {
  visible: boolean;
  value: string; // HH:mm
  title?: string;
  onChange: (timeHm: string) => void;
  onClose: () => void;
}

const PRESETS: { label: string; value: string }[] = [
  { label: '8:00 AM', value: '08:00' },
  { label: '9:00 AM', value: '09:00' },
  { label: '12:30 PM', value: '12:30' },
  { label: '6:00 PM', value: '18:00' },
  { label: '8:00 PM', value: '20:00' },
  { label: '9:30 PM', value: '21:30' },
];

function parseHm(value: string): { hour: number; minute: number } {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  if (!match) return { hour: 9, minute: 0 };
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function formatTimeDisplay(timeHm: string): string {
  const { hour, minute } = parseHm(timeHm);
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}

export function TimePickerModal({
  visible,
  value,
  title = 'Select Reminder Time',
  onChange,
  onClose,
}: TimePickerModalProps) {
  const { colors } = useTheme();
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);

  useEffect(() => {
    if (visible) {
      const parsed = parseHm(value);
      setHour(parsed.hour);
      setMinute(parsed.minute);
    }
  }, [visible, value]);

  const currentHm = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const isPm = hour >= 12;
  const displayHour12 = hour % 12 === 0 ? 12 : hour % 12;

  const stepHour = (delta: number) => {
    setHour((prev) => (prev + delta + 24) % 24);
  };

  const stepMinute = (delta: number) => {
    setMinute((prev) => (prev + delta + 60) % 60);
  };

  const togglePeriod = (nextPm: boolean) => {
    setHour((prev) => {
      if (nextPm && prev < 12) return prev + 12;
      if (!nextPm && prev >= 12) return prev - 12;
      return prev;
    });
  };

  const handleConfirm = () => {
    onChange(currentHm);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          <Text style={[styles.title, { color: colors.onSurface }]}>{title}</Text>

          <View style={styles.stepperRow}>
            <View style={styles.stepperCol}>
              <TouchableOpacity
                style={[styles.stepBtn, { backgroundColor: colors.surfaceContainerHighest }]}
                onPress={() => stepHour(1)}
              >
                <MaterialIcons name="keyboard-arrow-up" size={24} color={colors.onSurface} />
              </TouchableOpacity>
              <Text style={[styles.timeDigit, { color: colors.onSurface }]}>
                {String(displayHour12).padStart(2, '0')}
              </Text>
              <TouchableOpacity
                style={[styles.stepBtn, { backgroundColor: colors.surfaceContainerHighest }]}
                onPress={() => stepHour(-1)}
              >
                <MaterialIcons name="keyboard-arrow-down" size={24} color={colors.onSurface} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.colon, { color: colors.onSurfaceVariant }]}>:</Text>

            <View style={styles.stepperCol}>
              <TouchableOpacity
                style={[styles.stepBtn, { backgroundColor: colors.surfaceContainerHighest }]}
                onPress={() => stepMinute(5)}
              >
                <MaterialIcons name="keyboard-arrow-up" size={24} color={colors.onSurface} />
              </TouchableOpacity>
              <Text style={[styles.timeDigit, { color: colors.onSurface }]}>
                {String(minute).padStart(2, '0')}
              </Text>
              <TouchableOpacity
                style={[styles.stepBtn, { backgroundColor: colors.surfaceContainerHighest }]}
                onPress={() => stepMinute(-5)}
              >
                <MaterialIcons name="keyboard-arrow-down" size={24} color={colors.onSurface} />
              </TouchableOpacity>
            </View>

            <View style={styles.periodCol}>
              <TouchableOpacity
                style={[
                  styles.periodBtn,
                  {
                    backgroundColor: !isPm ? colors.primary : colors.surfaceContainerHighest,
                  },
                ]}
                onPress={() => togglePeriod(false)}
              >
                <Text
                  style={[
                    styles.periodText,
                    { color: !isPm ? colors.onPrimary : colors.onSurfaceVariant },
                  ]}
                >
                  AM
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.periodBtn,
                  {
                    backgroundColor: isPm ? colors.primary : colors.surfaceContainerHighest,
                  },
                ]}
                onPress={() => togglePeriod(true)}
              >
                <Text
                  style={[
                    styles.periodText,
                    { color: isPm ? colors.onPrimary : colors.onSurfaceVariant },
                  ]}
                >
                  PM
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={[styles.presetsHeading, { color: colors.onSurfaceVariant }]}>
            Quick Presets
          </Text>
          <View style={styles.presetsGrid}>
            {PRESETS.map((preset) => {
              const active = preset.value === currentHm;
              return (
                <TouchableOpacity
                  key={preset.value}
                  style={[
                    styles.presetChip,
                    {
                      backgroundColor: active ? colors.primaryContainer : colors.surfaceContainerHighest,
                      borderColor: active ? colors.primary : 'transparent',
                    },
                  ]}
                  onPress={() => {
                    const parsed = parseHm(preset.value);
                    setHour(parsed.hour);
                    setMinute(parsed.minute);
                  }}
                >
                  <Text
                    style={[
                      styles.presetText,
                      { color: active ? colors.onPrimaryContainer : colors.onSurface },
                    ]}
                  >
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={[styles.cancelText, { color: colors.onSurfaceVariant }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
              onPress={handleConfirm}
            >
              <Text style={[styles.confirmText, { color: colors.onPrimary }]}>Set Time</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 20,
  },
  title: {
    ...typography.headlineSm,
    fontFamily: fontFamilies.bold,
    textAlign: 'center',
    marginBottom: 16,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 18,
  },
  stepperCol: {
    alignItems: 'center',
    gap: 6,
  },
  stepBtn: {
    width: 48,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeDigit: {
    ...typography.headlineMd,
    fontFamily: fontFamilies.bold,
    fontSize: 28,
    minWidth: 48,
    textAlign: 'center',
  },
  colon: {
    ...typography.headlineMd,
    fontFamily: fontFamilies.bold,
    fontSize: 28,
  },
  periodCol: {
    gap: 8,
    marginLeft: 6,
  },
  periodBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  periodText: {
    ...typography.labelMd,
    fontFamily: fontFamilies.bold,
  },
  presetsHeading: {
    ...typography.labelMd,
    marginBottom: 8,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  presetText: {
    ...typography.labelMd,
    fontFamily: fontFamilies.semiBold,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelText: {
    ...typography.labelMd,
    fontFamily: fontFamilies.semiBold,
  },
  confirmBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  confirmText: {
    ...typography.labelMd,
    fontFamily: fontFamilies.bold,
  },
});

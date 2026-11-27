import React, { useEffect, useState } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DatePickerModal, Header, Text, useAlert, useToast } from '@/components/ui';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useAppStore } from '@/store/use-app-store';
import { fontFamilies, radius, typography, useTheme } from '@/theme';
import { getLocalTodayYmd } from '@/utils/date';
import { formatDate, getCurrencySymbol } from '@/utils/format';
import { formatTimeDisplay, TimePickerModal } from '../components/TimePickerModal';
import { useReminders } from '../hooks/useReminders';
import {
  REMINDER_CATEGORIES,
  REMINDER_REPEAT_OPTIONS,
  type ReminderCategory,
  type ReminderLinkedType,
  type ReminderRepeatRule,
} from '../types/reminder.types';

const ADVANCE_OPTIONS = [
  { value: 0, label: 'On day' },
  { value: 1, label: '1 day early' },
  { value: 3, label: '3 days early' },
  { value: 7, label: '7 days early' },
];

export function AddReminderScreen() {
  const { colors } = useTheme();
  const insets = useSafeInsets();
  const router = useRouter();
  const { showToast } = useToast();
  const { showAlert } = useAlert();
  const defaultReminderTime = useAppStore((s) => s.defaultReminderTime);

  const params = useLocalSearchParams<{
    reminderId?: string;
    title?: string;
    category?: ReminderCategory;
    amount?: string;
    notes?: string;
    linkedType?: ReminderLinkedType;
    linkedId?: string;
  }>();

  const isEditing = Boolean(params.reminderId);
  const {
    customReminders,
    completedReminders,
    createReminder,
    updateReminder,
    deleteReminder,
  } = useReminders();

  const existing = [...customReminders, ...completedReminders].find(
    (r) => r.id === params.reminderId
  );
  const effectiveLinkedType = existing?.linkedType ?? params.linkedType;

  const [title, setTitle] = useState(params.title ?? '');
  const [category, setCategory] = useState<ReminderCategory>(params.category ?? 'general');
  const [amountStr, setAmountStr] = useState(params.amount ?? '');
  const [remindAtDate, setRemindAtDate] = useState(getLocalTodayYmd);
  const [remindAtTime, setRemindAtTime] = useState(defaultReminderTime || '09:00');
  const [repeatRule, setRepeatRule] = useState<ReminderRepeatRule>('none');
  const [advanceDays, setAdvanceDays] = useState<number>(0);
  const [notes, setNotes] = useState(params.notes ?? '');
  const [initialized, setInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    if (isEditing && existing && !initialized) {
      setTitle(existing.title);
      setCategory(existing.category);
      setAmountStr(existing.amount !== undefined ? existing.amount.toString() : '');
      setRemindAtDate(existing.remindAtDate);
      setRemindAtTime(existing.remindAtTime);
      setRepeatRule(existing.repeatRule);
      setAdvanceDays(existing.advanceDays);
      setNotes(existing.notes);
      setInitialized(true);
    }
  }, [isEditing, existing, initialized]);

  const handleSave = async () => {
    if (!title.trim()) {
      showToast('Please enter a reminder title', 'error');
      return;
    }

    let parsedAmount: number | undefined;
    if (amountStr.trim()) {
      const n = parseFloat(amountStr);
      if (Number.isNaN(n) || n < 0) {
        showToast('Please enter a valid non-negative amount', 'error');
        return;
      }
      parsedAmount = n;
    }

    try {
      setIsSaving(true);
      if (isEditing && params.reminderId) {
        await updateReminder(params.reminderId, {
          title: title.trim(),
          category,
          amount: parsedAmount ?? null,
          remindAtDate,
          remindAtTime,
          repeatRule,
          advanceDays,
          notes: notes.trim(),
          status: 'pending',
          snoozeUntil: null,
        });
        showToast('Reminder updated', 'success');
      } else {
        await createReminder({
          title: title.trim(),
          category,
          amount: parsedAmount,
          remindAtDate,
          remindAtTime,
          repeatRule,
          advanceDays,
          notes: notes.trim(),
          linkedType: params.linkedType,
          linkedId: params.linkedId,
        });
        showToast('Reminder scheduled', 'success');
      }
      router.back();
    } catch {
      showToast('Could not save reminder', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!params.reminderId) return;
    showAlert('Delete Reminder', `Delete "${title || 'this reminder'}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteReminder(params.reminderId!);
          showToast('Reminder deleted', 'info');
          router.back();
        },
      },
    ]);
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <Header
        title={isEditing ? 'Edit Reminder' : 'New Reminder'}
        showBack
        rightNode={
          isEditing ? (
            <TouchableOpacity
              onPress={handleDelete}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="delete-outline" size={22} color={colors.error} />
            </TouchableOpacity>
          ) : undefined
        }
      />

      <KeyboardAwareScrollView
        style={styles.flex1}
        contentContainerStyle={StyleSheet.flatten([
          styles.scrollContent,
          { paddingBottom: 32 },
        ])}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        enableResetScrollToCoords={false}
        extraScrollHeight={Platform.OS === 'ios' ? 140 : 160}
        extraHeight={Platform.OS === 'ios' ? 75 : 140}
        keyboardOpeningTime={0}
      >
        {effectiveLinkedType ? (
          <View
            style={[
              styles.linkedBanner,
              {
                backgroundColor: colors.primaryContainer,
                borderColor: colors.primary,
              },
            ]}
          >
            <MaterialIcons name="link" size={16} color={colors.onPrimaryContainer} />
            <Text style={[styles.linkedBannerText, { color: colors.onPrimaryContainer }]}>
              Linked to {effectiveLinkedType.replace('_', ' ')}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>Title</Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
              color: colors.onSurface,
            },
          ]}
          placeholder="e.g., File advance tax, Cancel trial, Collect IOU"
          placeholderTextColor={colors.onSurfaceVariant}
          value={title}
          onChangeText={setTitle}
        />

        <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>Category</Text>
        <View style={styles.wrapRow}>
          {REMINDER_CATEGORIES.map((cat) => {
            const active = category === cat.value;
            return (
              <TouchableOpacity
                key={cat.value}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.primaryContainer : colors.surfaceContainerLow,
                    borderColor: active ? colors.primary : colors.outlineVariant,
                  },
                ]}
                onPress={() => setCategory(cat.value)}
              >
                <MaterialIcons
                  name={cat.icon as keyof typeof MaterialIcons.glyphMap}
                  size={16}
                  color={active ? colors.onPrimaryContainer : colors.onSurfaceVariant}
                />
                <Text
                  variant="labelMd"
                  numberOfLines={1}
                  style={[
                    styles.chipText,
                    { color: active ? colors.onPrimaryContainer : colors.onSurface },
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>
          Amount (Optional)
        </Text>
        <View
          style={[
            styles.amountRow,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          <Text style={[styles.currencyPrefix, { color: colors.onSurfaceVariant }]}>
            {getCurrencySymbol()}
          </Text>
          <TextInput
            style={[styles.amountInput, { color: colors.onSurface }]}
            placeholder="0.00"
            placeholderTextColor={colors.onSurfaceVariant}
            keyboardType="decimal-pad"
            value={amountStr}
            onChangeText={setAmountStr}
          />
        </View>

        <View style={styles.dateTimeRow}>
          <View style={styles.flex1}>
            <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>Date</Text>
            <TouchableOpacity
              style={[
                styles.pickerBtn,
                {
                  backgroundColor: colors.surfaceContainerLow,
                  borderColor: colors.outlineVariant,
                },
              ]}
              onPress={() => setShowDatePicker(true)}
            >
              <MaterialIcons name="event" size={18} color={colors.primary} />
              <Text variant="bodyMd" numberOfLines={1} style={[styles.pickerText, { color: colors.onSurface }]}>
                {formatDate(remindAtDate)}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.flex1}>
            <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>Time</Text>
            <TouchableOpacity
              style={[
                styles.pickerBtn,
                {
                  backgroundColor: colors.surfaceContainerLow,
                  borderColor: colors.outlineVariant,
                },
              ]}
              onPress={() => setShowTimePicker(true)}
            >
              <MaterialIcons name="schedule" size={18} color={colors.primary} />
              <Text variant="bodyMd" numberOfLines={1} style={[styles.pickerText, { color: colors.onSurface }]}>
                {formatTimeDisplay(remindAtTime)}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>Repeat</Text>
        <View style={styles.wrapRow}>
          {REMINDER_REPEAT_OPTIONS.map((opt) => {
            const active = repeatRule === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.textChip,
                  {
                    backgroundColor: active ? colors.primaryContainer : colors.surfaceContainerLow,
                    borderColor: active ? colors.primary : colors.outlineVariant,
                  },
                ]}
                onPress={() => setRepeatRule(opt.value)}
              >
                <Text
                  variant="labelMd"
                  numberOfLines={1}
                  style={[
                    styles.chipText,
                    { color: active ? colors.onPrimaryContainer : colors.onSurface },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>Notify Me</Text>
        <View style={styles.wrapRow}>
          {ADVANCE_OPTIONS.map((opt) => {
            const active = advanceDays === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.textChip,
                  {
                    backgroundColor: active ? colors.primaryContainer : colors.surfaceContainerLow,
                    borderColor: active ? colors.primary : colors.outlineVariant,
                  },
                ]}
                onPress={() => setAdvanceDays(opt.value)}
              >
                <Text
                  variant="labelMd"
                  numberOfLines={1}
                  style={[
                    styles.chipText,
                    { color: active ? colors.onPrimaryContainer : colors.onSurface },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.label, { color: colors.onSurfaceVariant }]}>Notes (Optional)</Text>
        <TextInput
          style={[
            styles.notesInput,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
              color: colors.onSurface,
            },
          ]}
          placeholder="Add context, links, or details..."
          placeholderTextColor={colors.onSurfaceVariant}
          value={notes}
          onChangeText={setNotes}
          multiline
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[
            styles.saveBtn,
            { backgroundColor: colors.primary },
            isSaving && styles.saveBtnDisabled,
          ]}
          onPress={handleSave}
          disabled={isSaving}
        >
          <MaterialIcons name="alarm-on" size={20} color={colors.onPrimary} />
          <Text style={[styles.saveBtnText, { color: colors.onPrimary }]}>
            {isEditing ? 'Update Reminder' : 'Save Reminder'}
          </Text>
        </TouchableOpacity>
      </KeyboardAwareScrollView>

      <DatePickerModal
        visible={showDatePicker}
        value={remindAtDate}
        minDate={getLocalTodayYmd()}
        onChange={setRemindAtDate}
        onClose={() => setShowDatePicker(false)}
      />

      <TimePickerModal
        visible={showTimePicker}
        value={remindAtTime}
        onChange={setRemindAtTime}
        onClose={() => setShowTimePicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  label: {
    ...typography.labelMd,
    fontFamily: fontFamilies.bold,
    marginBottom: 8,
    marginTop: 14,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...typography.bodyMd,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    flexShrink: 0,
  },
  textChip: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    flexShrink: 0,
  },
  chipText: {
    ...typography.labelMd,
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
    lineHeight: 18,
    flexShrink: 0,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  currencyPrefix: {
    ...typography.headlineSm,
    fontFamily: fontFamilies.bold,
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 12,
    ...typography.bodyLg,
    fontFamily: fontFamilies.semiBold,
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  flex1: {
    flex: 1,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  pickerText: {
    ...typography.bodyMd,
    fontFamily: fontFamilies.semiBold,
    flexShrink: 1,
  },
  notesInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 88,
    ...typography.bodyMd,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.md,
    paddingVertical: 14,
    marginTop: 24,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  linkedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 4,
  },
  linkedBannerText: {
    ...typography.labelMd,
    fontFamily: fontFamilies.semiBold,
    textTransform: 'capitalize',
  },
  saveBtnText: {
    ...typography.labelMd,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
  },
});

import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text, useAlert, useToast } from '@/components/ui';
import { useAppStore } from '@/store/use-app-store';
import { fontFamilies, radius, typography, useTheme } from '@/theme';
import { getLocalTodayYmd, shiftYmdDays } from '@/utils/date';
import { formatCurrencyPrivacy, formatDate } from '@/utils/format';
import {
  REMINDER_CATEGORIES,
  type Reminder,
  type UnifiedReminderItem,
} from '../types/reminder.types';
import { formatTimeDisplay } from './TimePickerModal';

interface ReminderCardProps {
  item: UnifiedReminderItem;
  onComplete: (id: string) => Promise<unknown>;
  onSnooze: (id: string, hours: number) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}

interface CompletedReminderCardProps {
  reminder: Reminder;
  onDelete: (id: string) => Promise<unknown>;
}

const SOURCE_LABELS: Record<UnifiedReminderItem['sourceKind'], string> = {
  custom: 'Reminder',
  bill: 'Bill',
  subscription: 'Subscription',
  credit_card: 'Card Due',
  goal: 'Goal',
};

function getCategoryVisual(category: string, sourceKind: UnifiedReminderItem['sourceKind']) {
  const customMatch = REMINDER_CATEGORIES.find((c) => c.value === category);
  if (customMatch) return customMatch;

  switch (sourceKind) {
    case 'bill':
      return { value: category, label: 'Bill', icon: 'receipt-long', color: '#4f46e5' };
    case 'subscription':
      return { value: category, label: 'Subscription', icon: 'autorenew', color: '#0891b2' };
    case 'credit_card':
      return { value: category, label: 'Card Due', icon: 'credit-card', color: '#dc2626' };
    case 'goal':
      return { value: category, label: 'Goal', icon: 'flag', color: '#059669' };
    default:
      return { value: category, label: 'Reminder', icon: 'notifications-none', color: '#6366f1' };
  }
}

function getRelativeDueBadge(dueDate: string, isOverdue: boolean, isSnoozed: boolean) {
  if (isSnoozed) return { label: 'Snoozed', tone: 'snoozed' as const };
  if (isOverdue) return { label: 'Overdue', tone: 'overdue' as const };
  const today = getLocalTodayYmd();
  if (dueDate === today) return { label: 'Today', tone: 'today' as const };
  if (dueDate === shiftYmdDays(today, 1)) return { label: 'Tomorrow', tone: 'soon' as const };
  return { label: formatDate(dueDate), tone: 'normal' as const };
}

export function ReminderCard({
  item,
  onComplete,
  onSnooze,
  onDelete,
}: ReminderCardProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const { hideBalances } = useAppStore();
  const { showAlert } = useAlert();
  const { showToast } = useToast();

  const isCustom = item.sourceKind === 'custom';
  const visual = getCategoryVisual(item.category, item.sourceKind);
  const dueBadge = getRelativeDueBadge(item.dueDate, item.isOverdue, item.isSnoozed);

  const badgeColors =
    dueBadge.tone === 'overdue'
      ? { bg: colors.errorContainer, text: colors.onErrorContainer }
      : dueBadge.tone === 'today'
        ? { bg: colors.primaryContainer, text: colors.onPrimaryContainer }
        : dueBadge.tone === 'snoozed'
          ? { bg: colors.tertiaryContainer, text: colors.onTertiaryContainer }
          : { bg: colors.surfaceContainerHighest, text: colors.onSurfaceVariant };

  const handlePress = () => {
    if (isCustom) {
      router.navigate({
        pathname: '/(app)/add-reminder',
        params: { reminderId: item.sourceId },
      });
      return;
    }
    router.navigate(item.actionUrl as never);
  };

  const handleMarkDone = async () => {
    try {
      await onComplete(item.sourceId);
      showToast(`Completed "${item.title}"`, 'success');
    } catch {
      showToast('Could not complete reminder', 'error');
    }
  };

  const handleMore = () => {
    showAlert('Reminder Options', item.title, [
      {
        text: 'Snooze 3 Hours',
        onPress: async () => {
          await onSnooze(item.sourceId, 3);
          showToast('Snoozed for 3 hours', 'info');
        },
      },
      {
        text: 'Snooze 1 Day',
        onPress: async () => {
          await onSnooze(item.sourceId, 24);
          showToast('Snoozed for 1 day', 'info');
        },
      },
      {
        text: 'Edit',
        onPress: () =>
          router.navigate({
            pathname: '/(app)/add-reminder',
            params: { reminderId: item.sourceId },
          }),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await onDelete(item.sourceId);
          showToast('Reminder deleted', 'info');
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={handlePress}
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceContainerLowest,
          borderColor: item.isOverdue ? colors.error : colors.outlineVariant,
        },
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.leftGroup}>
          <View style={[styles.iconBox, { backgroundColor: `${visual.color}18` }]}>
            <MaterialIcons
              name={visual.icon as keyof typeof MaterialIcons.glyphMap}
              size={20}
              color={visual.color}
            />
          </View>
          <View style={styles.textCol}>
            <Text style={[styles.title, { color: colors.onSurface }]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={[styles.subtitle, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
              {item.subtitle}
            </Text>
          </View>
        </View>

        {item.amount !== undefined && item.amount > 0 ? (
          <Text style={[styles.amount, { color: colors.onSurface }]}>
            {formatCurrencyPrivacy(item.amount, hideBalances)}
          </Text>
        ) : null}
      </View>

      <View style={styles.metaRow}>
        <View style={[styles.pill, { backgroundColor: badgeColors.bg }]}>
          <Text style={[styles.pillText, { color: badgeColors.text }]}>{dueBadge.label}</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: colors.surfaceContainerHighest }]}>
          <MaterialIcons name="schedule" size={12} color={colors.onSurfaceVariant} />
          <Text style={[styles.pillText, { color: colors.onSurfaceVariant }]}>
            {formatTimeDisplay(item.remindTime)}
          </Text>
        </View>
        {item.repeatRule !== 'none' && (
          <View style={[styles.pill, { backgroundColor: colors.secondaryContainer }]}>
            <MaterialIcons name="repeat" size={12} color={colors.onSecondaryContainer} />
            <Text style={[styles.pillText, { color: colors.onSecondaryContainer }]}>
              {item.repeatRule}
            </Text>
          </View>
        )}
        <View style={[styles.pill, { backgroundColor: colors.surfaceContainerHigh }]}>
          <Text style={[styles.pillText, { color: colors.onSurfaceVariant }]}>
            {SOURCE_LABELS[item.sourceKind]}
          </Text>
        </View>
      </View>

      {isCustom ? (
        <View style={[styles.actionRow, { borderTopColor: colors.outlineVariant }]}>
          <TouchableOpacity
            style={[styles.primaryBtn, { borderColor: colors.primary }]}
            onPress={handleMarkDone}
          >
            <MaterialIcons name="check-circle-outline" size={16} color={colors.primary} />
            <Text style={[styles.primaryBtnText, { color: colors.primary }]}>MARK DONE</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.moreBtn, { borderColor: colors.outlineVariant }]}
            onPress={handleMore}
          >
            <MaterialIcons name="more-horiz" size={18} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.actionRow, { borderTopColor: colors.outlineVariant }]}>
          <TouchableOpacity
            style={[styles.primaryBtn, { borderColor: colors.outlineVariant }]}
            onPress={handlePress}
          >
            <Text style={[styles.primaryBtnText, { color: colors.primary }]}>
              OPEN {SOURCE_LABELS[item.sourceKind].toUpperCase()}
            </Text>
            <MaterialIcons name="arrow-forward" size={14} color={colors.primary} />
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function CompletedReminderCard({ reminder, onDelete }: CompletedReminderCardProps) {
  const { colors } = useTheme();
  const { hideBalances } = useAppStore();
  const { showToast } = useToast();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceContainerLow,
          borderColor: colors.outlineVariant,
          opacity: 0.85,
        },
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.leftGroup}>
          <View style={[styles.iconBox, { backgroundColor: colors.surfaceContainerHighest }]}>
            <MaterialIcons name="check-circle" size={20} color={colors.primary} />
          </View>
          <View style={styles.textCol}>
            <Text
              style={[styles.title, styles.completedTitle, { color: colors.onSurfaceVariant }]}
              numberOfLines={1}
            >
              {reminder.title}
            </Text>
            <Text style={[styles.subtitle, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
              {reminder.completedAt
                ? `Completed ${formatDate(reminder.completedAt.split('T')[0])}`
                : formatDate(reminder.remindAtDate)}
            </Text>
          </View>
        </View>
        {reminder.amount !== undefined && reminder.amount > 0 ? (
          <Text style={[styles.amount, { color: colors.onSurfaceVariant }]}>
            {formatCurrencyPrivacy(reminder.amount, hideBalances)}
          </Text>
        ) : null}
        <TouchableOpacity
          onPress={async () => {
            await onDelete(reminder.id);
            showToast('Reminder removed', 'info');
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name="delete-outline" size={20} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
  },
  title: {
    ...typography.bodyLg,
    fontFamily: fontFamilies.bold,
    fontSize: 15,
  },
  completedTitle: {
    textDecorationLine: 'line-through',
  },
  subtitle: {
    ...typography.bodyMd,
    fontSize: 12,
    marginTop: 2,
  },
  amount: {
    ...typography.headlineSm,
    fontFamily: fontFamilies.bold,
    fontSize: 16,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pillText: {
    ...typography.labelMd,
    fontSize: 11,
    fontFamily: fontFamilies.semiBold,
    textTransform: 'capitalize',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 7,
  },
  primaryBtnText: {
    ...typography.labelMd,
    fontFamily: fontFamilies.bold,
    fontSize: 11,
  },
  moreBtn: {
    padding: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
});

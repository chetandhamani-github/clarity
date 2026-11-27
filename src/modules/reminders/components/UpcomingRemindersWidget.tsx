import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui';
import { useAppStore } from '@/store/use-app-store';
import { fontFamilies, radius, typography, useTheme } from '@/theme';
import { formatCurrencyPrivacy, formatDate } from '@/utils/format';
import { useReminders } from '../hooks/useReminders';
import { formatTimeDisplay } from './TimePickerModal';

export function UpcomingRemindersWidget() {
  const { colors } = useTheme();
  const router = useRouter();
  const { hideBalances } = useAppStore();
  const { unifiedUpcoming, summary, isLoading } = useReminders(30);

  const previewItems = unifiedUpcoming.slice(0, 3);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.title, { color: colors.onSurface }]}>Reminders & Dues</Text>
          {summary.upcomingCount > 0 && (
            <View
              style={[
                styles.badge,
                {
                  backgroundColor:
                    summary.overdueCount > 0 ? colors.errorContainer : colors.primaryContainer,
                },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  {
                    color:
                      summary.overdueCount > 0
                        ? colors.onErrorContainer
                        : colors.onPrimaryContainer,
                  },
                ]}
              >
                {summary.overdueCount > 0
                  ? `${summary.overdueCount} overdue`
                  : `${summary.upcomingCount} upcoming`}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => router.navigate('/(app)/add-reminder')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="add-alarm" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.navigate('/(app)/reminders')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.viewAll, { color: colors.primary }]}>VIEW ALL</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceContainerLowest,
            borderColor: colors.surfaceVariant,
          },
        ]}
      >
        {isLoading && previewItems.length === 0 ? (
          <Text style={[styles.emptySub, { color: colors.onSurfaceVariant }]}>
            Checking upcoming reminders...
          </Text>
        ) : previewItems.length === 0 ? (
          <TouchableOpacity
            style={styles.emptyCta}
            onPress={() => router.navigate('/(app)/add-reminder')}
            activeOpacity={0.8}
          >
            <View style={[styles.emptyIcon, { backgroundColor: colors.primaryContainer }]}>
              <MaterialIcons name="alarm-add" size={20} color={colors.onPrimaryContainer} />
            </View>
            <View style={styles.flex1}>
              <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>
                Add a Financial Reminder
              </Text>
              <Text style={[styles.emptySub, { color: colors.onSurfaceVariant }]}>
                Track tax deadlines, insurance renewals, free trials, or daily logging nudges
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.outline} />
          </TouchableOpacity>
        ) : (
          previewItems.map((item, idx) => (
            <React.Fragment key={item.id}>
              <TouchableOpacity
                style={styles.row}
                onPress={() =>
                  router.navigate(
                    (item.sourceKind === 'custom'
                      ? { pathname: '/(app)/add-reminder', params: { reminderId: item.sourceId } }
                      : item.actionUrl) as never
                  )
                }
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: item.isOverdue ? colors.error : colors.primary },
                  ]}
                />
                <View style={styles.flex1}>
                  <Text style={[styles.itemTitle, { color: colors.onSurface }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text
                    style={[
                      styles.itemMeta,
                      { color: item.isOverdue ? colors.error : colors.onSurfaceVariant },
                    ]}
                    numberOfLines={1}
                  >
                    {formatDate(item.dueDate)} • {formatTimeDisplay(item.remindTime)}
                  </Text>
                </View>
                {item.amount !== undefined && item.amount > 0 ? (
                  <Text style={[styles.itemAmount, { color: colors.onSurface }]}>
                    {formatCurrencyPrivacy(item.amount, hideBalances)}
                  </Text>
                ) : (
                  <MaterialIcons name="chevron-right" size={18} color={colors.outline} />
                )}
              </TouchableOpacity>
              {idx < previewItems.length - 1 && (
                <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
              )}
            </React.Fragment>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    ...typography.headlineSm,
    fontFamily: fontFamilies.bold,
    fontSize: 17,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeText: {
    ...typography.labelMd,
    fontSize: 11,
    fontFamily: fontFamilies.bold,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  viewAll: {
    ...typography.labelMd,
    fontFamily: fontFamilies.bold,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  emptyIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...typography.bodyMd,
    fontFamily: fontFamilies.bold,
  },
  emptySub: {
    ...typography.bodySm,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  flex1: {
    flex: 1,
  },
  itemTitle: {
    ...typography.bodyMd,
    fontFamily: fontFamilies.semiBold,
  },
  itemMeta: {
    ...typography.labelMd,
    fontSize: 11,
    marginTop: 2,
  },
  itemAmount: {
    ...typography.bodyMd,
    fontFamily: fontFamilies.bold,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
});

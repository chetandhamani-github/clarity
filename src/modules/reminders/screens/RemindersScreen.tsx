import React, { useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Header, ListSkeleton, Text } from '@/components/ui';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { fontFamilies, radius, typography, useTheme } from '@/theme';
import { CompletedReminderCard, ReminderCard } from '../components/ReminderCard';
import { useReminders } from '../hooks/useReminders';
import type { RemindersTab } from '../store/reminders.store';
import { REMINDER_CATEGORIES } from '../types/reminder.types';

export function RemindersScreen() {
  const { colors } = useTheme();
  const insets = useSafeInsets();
  const router = useRouter();

  const {
    filteredUpcoming,
    filteredCompleted,
    summary,
    isLoading,
    refetch,
    selectedTab,
    selectedCategory,
    searchQuery,
    setSelectedTab,
    setSelectedCategory,
    setSearchQuery,
    completeReminder,
    snoozeReminder,
    deleteReminder,
    syncAllSchedules,
  } = useReminders(45);

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await syncAllSchedules().catch(() => {});
    await refetch();
    setRefreshing(false);
  };

  const tabs: { key: RemindersTab; label: string; count?: number }[] = [
    { key: 'upcoming', label: 'Upcoming', count: summary.upcomingCount },
    { key: 'custom', label: 'Custom', count: summary.customActiveCount },
    { key: 'dues', label: 'Bills & Cards' },
    { key: 'snoozed', label: 'Snoozed', count: summary.snoozedCount },
    { key: 'completed', label: 'Completed', count: summary.completedCount },
  ];

  const showingCompleted = selectedTab === 'completed';

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
        title="Reminders"
        showBack
        rightNode={
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => router.navigate('/(app)/settings')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="tune" size={20} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => router.navigate('/(app)/add-reminder')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="add" size={24} color={colors.onSurface} />
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {isLoading && filteredUpcoming.length === 0 && filteredCompleted.length === 0 ? (
          <ListSkeleton />
        ) : (
          <>
            {/* Summary Cards */}
            <View style={styles.summaryRow}>
              <View
                style={[
                  styles.summaryCard,
                  {
                    backgroundColor: colors.surfaceContainerLow,
                    borderColor: colors.outlineVariant,
                  },
                ]}
              >
                <Text style={[styles.summaryLabel, { color: colors.onSurfaceVariant }]}>
                  UPCOMING
                </Text>
                <Text style={[styles.summaryValue, { color: colors.onSurface }]}>
                  {summary.upcomingCount}
                </Text>
                <Text style={[styles.summarySub, { color: colors.onSurfaceVariant }]}>
                  {summary.customActiveCount} custom tasks
                </Text>
              </View>

              <View
                style={[
                  styles.summaryCard,
                  {
                    backgroundColor: colors.surfaceContainerLow,
                    borderColor: summary.overdueCount > 0 ? colors.error : colors.outlineVariant,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.summaryLabel,
                    { color: summary.overdueCount > 0 ? colors.error : colors.onSurfaceVariant },
                  ]}
                >
                  OVERDUE
                </Text>
                <Text
                  style={[
                    styles.summaryValue,
                    { color: summary.overdueCount > 0 ? colors.error : colors.onSurface },
                  ]}
                >
                  {summary.overdueCount}
                </Text>
                <Text style={[styles.summarySub, { color: colors.onSurfaceVariant }]}>
                  {summary.completedCount} completed
                </Text>
              </View>
            </View>

            {/* Search Input */}
            <View
              style={[
                styles.searchBar,
                {
                  backgroundColor: colors.surfaceContainerLow,
                  borderColor: colors.outlineVariant,
                },
              ]}
            >
              <MaterialIcons name="search" size={18} color={colors.onSurfaceVariant} />
              <TextInput
                style={[styles.searchInput, { color: colors.onSurface }]}
                placeholder="Search reminders, bills, or cards..."
                placeholderTextColor={colors.onSurfaceVariant}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <MaterialIcons name="close" size={18} color={colors.onSurfaceVariant} />
                </TouchableOpacity>
              )}
            </View>

            {/* Filter Tabs */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsRow}
            >
              {tabs.map((tab) => {
                const active = selectedTab === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    style={[
                      styles.tabPill,
                      {
                        backgroundColor: active ? colors.primary : colors.surfaceContainerHighest,
                      },
                    ]}
                    onPress={() => setSelectedTab(tab.key)}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        { color: active ? colors.onPrimary : colors.onSurfaceVariant },
                      ]}
                    >
                      {tab.label}
                    </Text>
                    {tab.count !== undefined && tab.count > 0 && (
                      <View
                        style={[
                          styles.tabBadge,
                          {
                            backgroundColor: active
                              ? colors.primaryContainer
                              : colors.surfaceContainerLowest,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.tabBadgeText,
                            {
                              color: active ? colors.onPrimaryContainer : colors.onSurfaceVariant,
                            },
                          ]}
                        >
                          {tab.count}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Category Chips (for custom / upcoming views) */}
            {(selectedTab === 'custom' || selectedTab === 'completed') && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryRow}
              >
                <TouchableOpacity
                  style={[
                    styles.catChip,
                    {
                      backgroundColor:
                        selectedCategory === 'all'
                          ? colors.secondaryContainer
                          : colors.surfaceContainerLow,
                      borderColor: colors.outlineVariant,
                    },
                  ]}
                  onPress={() => setSelectedCategory('all')}
                >
                  <Text
                    style={[
                      styles.catChipText,
                      {
                        color:
                          selectedCategory === 'all'
                            ? colors.onSecondaryContainer
                            : colors.onSurfaceVariant,
                      },
                    ]}
                  >
                    All
                  </Text>
                </TouchableOpacity>
                {REMINDER_CATEGORIES.map((cat) => {
                  const active = selectedCategory === cat.value;
                  return (
                    <TouchableOpacity
                      key={cat.value}
                      style={[
                        styles.catChip,
                        {
                          backgroundColor: active
                            ? colors.secondaryContainer
                            : colors.surfaceContainerLow,
                          borderColor: active ? colors.secondary : colors.outlineVariant,
                        },
                      ]}
                      onPress={() => setSelectedCategory(cat.value)}
                    >
                      <Text
                        style={[
                          styles.catChipText,
                          {
                            color: active
                              ? colors.onSecondaryContainer
                              : colors.onSurfaceVariant,
                          },
                        ]}
                      >
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* List */}
            {showingCompleted ? (
              filteredCompleted.length === 0 ? (
                <View style={styles.emptyBox}>
                  <MaterialIcons name="task-alt" size={48} color={colors.onSurfaceVariant} />
                  <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>
                    No Completed Reminders
                  </Text>
                  <Text style={[styles.emptySub, { color: colors.onSurfaceVariant }]}>
                    Finished custom reminders appear here for reference.
                  </Text>
                </View>
              ) : (
                filteredCompleted.map((reminder) => (
                  <CompletedReminderCard
                    key={reminder.id}
                    reminder={reminder}
                    onDelete={deleteReminder}
                  />
                ))
              )
            ) : filteredUpcoming.length === 0 ? (
              <View style={styles.emptyBox}>
                <MaterialIcons name="alarm-on" size={52} color={colors.onSurfaceVariant} />
                <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>
                  Nothing Scheduled Yet
                </Text>
                <Text style={[styles.emptySub, { color: colors.onSurfaceVariant }]}>
                  Add reminders for advance tax, insurance renewals, trial cancellations, or IOUs.
                </Text>
                <TouchableOpacity
                  style={[styles.emptyCta, { backgroundColor: colors.primary }]}
                  onPress={() => router.navigate('/(app)/add-reminder')}
                >
                  <MaterialIcons name="add" size={18} color={colors.onPrimary} />
                  <Text style={[styles.emptyCtaText, { color: colors.onPrimary }]}>
                    Add Reminder
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              filteredUpcoming.map((item) => (
                <ReminderCard
                  key={item.id}
                  item={item}
                  onComplete={completeReminder}
                  onSnooze={snoozeReminder}
                  onDelete={deleteReminder}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    padding: 4,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  summaryCard: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 14,
  },
  summaryLabel: {
    ...typography.labelMd,
    fontSize: 11,
    fontFamily: fontFamilies.bold,
  },
  summaryValue: {
    ...typography.headlineMd,
    fontFamily: fontFamilies.bold,
    marginTop: 4,
  },
  summarySub: {
    ...typography.bodySm,
    marginTop: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    ...typography.bodyMd,
    paddingVertical: 2,
  },
  tabsRow: {
    gap: 8,
    paddingBottom: 12,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  tabText: {
    ...typography.labelMd,
    fontFamily: fontFamilies.semiBold,
  },
  tabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  tabBadgeText: {
    fontSize: 11,
    fontFamily: fontFamilies.bold,
  },
  categoryRow: {
    gap: 8,
    paddingBottom: 12,
  },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  catChipText: {
    ...typography.labelMd,
    fontFamily: fontFamilies.semiBold,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    ...typography.headlineSm,
    fontFamily: fontFamilies.bold,
    marginTop: 12,
  },
  emptySub: {
    ...typography.bodyMd,
    textAlign: 'center',
    marginTop: 6,
  },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: radius.md,
    marginTop: 18,
  },
  emptyCtaText: {
    ...typography.labelMd,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
  },
});

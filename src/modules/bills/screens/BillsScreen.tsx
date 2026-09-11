import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Text, Header } from '@/components/ui';
import { typography, useTheme, radius } from '@/theme';
import { useAppStore } from '@/store/use-app-store';
import { formatCurrencyPrivacy } from '@/utils/format';
import { useBills } from '../hooks/useBills';
import { BillCard } from '../components/BillCard';
import { SubscriptionCard } from '../components/SubscriptionCard';
import { BILL_CATEGORIES } from '../types/bill.types';
import type { BillsTab } from '../store/bills.store';

export function BillsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { hideBalances } = useAppStore();

  const {
    bills,
    subscriptions,
    summary,
    selectedTab,
    selectedCategory,
    searchQuery,
    isLoading,
    refresh,
    setSelectedTab,
    setSelectedCategory,
    setSearchQuery,
  } = useBills();

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const tabs: { key: BillsTab; label: string; count?: number }[] = [
    { key: 'upcoming', label: 'Upcoming', count: summary.upcomingCount },
    { key: 'paid', label: 'Paid', count: summary.paidCount },
    { key: 'overdue', label: 'Overdue', count: summary.overdueCount },
    { key: 'subscriptions', label: 'Subscriptions', count: summary.activeSubscriptionCount },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Header
        title="Bills & Utilities"
        showBack
        rightNode={
          <TouchableOpacity
            style={styles.headerAddButton}
            onPress={() => router.push('/(app)/add-bill')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="add" size={24} color={colors.primary} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || isLoading}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* Top Summary Dashboard Cards (2x2 Grid) */}
        <View style={styles.summaryGrid}>
          {/* 1. Upcoming Bills */}
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: colors.surfaceContainerLow,
                borderColor: colors.outlineVariant,
              },
            ]}
          >
            <View style={styles.summaryCardTop}>
              <Text style={[styles.summaryCardLabel, { color: colors.onSurfaceVariant }]}>
                UPCOMING
              </Text>
              <View style={[styles.miniIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                <MaterialIcons name="schedule" size={16} color="#3b82f6" />
              </View>
            </View>
            <Text style={[styles.summaryCardAmount, { color: colors.onSurface }]}>
              {formatCurrencyPrivacy(summary.upcomingAmount, hideBalances)}
            </Text>
            <Text style={[styles.summaryCardSubtext, { color: colors.onSurfaceVariant }]}>
              {summary.upcomingCount} {summary.upcomingCount === 1 ? 'bill' : 'bills'} due
            </Text>
          </View>

          {/* 2. Overdue Bills */}
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: colors.surfaceContainerLow,
                borderColor: colors.outlineVariant,
              },
              summary.overdueCount > 0 && styles.summaryCardAlert,
            ]}
          >
            <View style={styles.summaryCardTop}>
              <Text
                style={[
                  styles.summaryCardLabel,
                  { color: summary.overdueCount > 0 ? '#ef4444' : colors.onSurfaceVariant },
                ]}
              >
                OVERDUE
              </Text>
              <View style={[styles.miniIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                <MaterialIcons name="warning" size={16} color="#ef4444" />
              </View>
            </View>
            <Text
              style={[
                styles.summaryCardAmount,
                { color: summary.overdueCount > 0 ? '#ef4444' : colors.onSurface },
              ]}
            >
              {formatCurrencyPrivacy(summary.overdueAmount, hideBalances)}
            </Text>
            <Text style={[styles.summaryCardSubtext, { color: colors.onSurfaceVariant }]}>
              {summary.overdueCount} {summary.overdueCount === 1 ? 'bill' : 'bills'} overdue
            </Text>
          </View>

          {/* 3. Paid This Month */}
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: colors.surfaceContainerLow,
                borderColor: colors.outlineVariant,
              },
            ]}
          >
            <View style={styles.summaryCardTop}>
              <Text style={[styles.summaryCardLabel, { color: colors.onSurfaceVariant }]}>
                PAID THIS MONTH
              </Text>
              <View style={[styles.miniIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                <MaterialIcons name="check-circle" size={16} color="#10b981" />
              </View>
            </View>
            <Text style={[styles.summaryCardAmount, { color: '#10b981' }]}>
              {formatCurrencyPrivacy(summary.paidThisMonthAmount, hideBalances)}
            </Text>
            <Text style={[styles.summaryCardSubtext, { color: colors.onSurfaceVariant }]}>
              {summary.paidCount} {summary.paidCount === 1 ? 'bill' : 'bills'} settled
            </Text>
          </View>

          {/* 4. Monthly Subscriptions */}
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: colors.surfaceContainerLow,
                borderColor: colors.outlineVariant,
              },
            ]}
          >
            <View style={styles.summaryCardTop}>
              <Text style={[styles.summaryCardLabel, { color: colors.onSurfaceVariant }]}>
                SUBSCRIPTIONS
              </Text>
              <View style={[styles.miniIconBox, { backgroundColor: 'rgba(168, 85, 247, 0.12)' }]}>
                <MaterialIcons name="subscriptions" size={16} color="#a855f7" />
              </View>
            </View>
            <Text style={[styles.summaryCardAmount, { color: colors.onSurface }]}>
              {formatCurrencyPrivacy(summary.monthlySubscriptionSpend, hideBalances)}
              <Text style={[styles.monthUnit, { color: colors.onSurfaceVariant }]}>/mo</Text>
            </Text>
            <Text style={[styles.summaryCardSubtext, { color: colors.onSurfaceVariant }]}>
              {summary.activeSubscriptionCount} active services
            </Text>
          </View>
        </View>

        {/* Tab Selector (4 Tabs) */}
        <View
          style={[
            styles.tabBar,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          {tabs.map((tab) => {
            const isActive = selectedTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.tabButton,
                  isActive && { backgroundColor: colors.primary },
                ]}
                onPress={() => setSelectedTab(tab.key)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    { color: isActive ? colors.onPrimary : colors.onSurfaceVariant },
                    isActive && styles.tabButtonTextActive,
                  ]}
                >
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 ? ` (${tab.count})` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Search Input Bar */}
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          <MaterialIcons name="search" size={20} color={colors.onSurfaceVariant} />
          <TextInput
            placeholder="Search bills, merchant, or notes..."
            placeholderTextColor={colors.onSurfaceVariant}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={[styles.searchInput, { color: colors.onSurface }]}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <MaterialIcons name="close" size={18} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          )}
        </View>

        {/* Category Pills Horizontal Scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
        >
          <TouchableOpacity
            style={[
              styles.categoryPill,
              {
                backgroundColor:
                  selectedCategory === 'all'
                    ? colors.primaryContainer
                    : colors.surfaceContainerLow,
                borderColor:
                  selectedCategory === 'all' ? colors.primary : colors.outlineVariant,
              },
            ]}
            onPress={() => setSelectedCategory('all')}
          >
            <Text
              style={[
                styles.categoryPillText,
                {
                  color:
                    selectedCategory === 'all'
                      ? colors.onPrimaryContainer
                      : colors.onSurfaceVariant,
                },
                selectedCategory === 'all' && styles.categoryPillTextActive,
              ]}
            >
              All Categories
            </Text>
          </TouchableOpacity>

          {BILL_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.value;
            return (
              <TouchableOpacity
                key={cat.value}
                style={[
                  styles.categoryPill,
                  {
                    backgroundColor: isSelected
                      ? colors.primaryContainer
                      : colors.surfaceContainerLow,
                    borderColor: isSelected ? colors.primary : colors.outlineVariant,
                  },
                ]}
                onPress={() => setSelectedCategory(cat.value)}
              >
                <MaterialIcons
                  name={cat.icon as any}
                  size={15}
                  color={isSelected ? colors.onPrimaryContainer : colors.onSurfaceVariant}
                />
                <Text
                  style={[
                    styles.categoryPillText,
                    {
                      color: isSelected
                        ? colors.onPrimaryContainer
                        : colors.onSurfaceVariant,
                    },
                    isSelected && styles.categoryPillTextActive,
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Main List */}
        {selectedTab === 'subscriptions' ? (
          // Subscriptions View
          subscriptions.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View
                style={[
                  styles.emptyIconCircle,
                  { backgroundColor: colors.surfaceContainerLow },
                ]}
              >
                <MaterialIcons name="subscriptions" size={36} color={colors.onSurfaceVariant} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>
                No Subscriptions Found
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.onSurfaceVariant }]}>
                Add your OTT, music, SaaS, or gym subscriptions to track renewal cycles and monthly spend.
              </Text>
              <TouchableOpacity
                style={[styles.emptyAddButton, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/(app)/add-bill')}
                activeOpacity={0.85}
              >
                <MaterialIcons name="add" size={18} color={colors.onPrimary} />
                <Text style={[styles.emptyAddButtonText, { color: colors.onPrimary }]}>
                  Add Subscription
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.itemsList}>
              {subscriptions.map((sub) => (
                <SubscriptionCard key={sub.id} subscription={sub} />
              ))}
            </View>
          )
        ) : (
          // Bills View (Upcoming, Paid, Overdue)
          bills.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View
                style={[
                  styles.emptyIconCircle,
                  { backgroundColor: colors.surfaceContainerLow },
                ]}
              >
                <MaterialIcons
                  name={
                    selectedTab === 'paid'
                      ? 'history'
                      : selectedTab === 'overdue'
                        ? 'check-circle'
                        : 'receipt-long'
                  }
                  size={36}
                  color={colors.onSurfaceVariant}
                />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>
                {selectedTab === 'paid'
                  ? 'No Paid Bills Yet'
                  : selectedTab === 'overdue'
                    ? 'No Overdue Bills!'
                    : 'No Upcoming Bills'}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.onSurfaceVariant }]}>
                {selectedTab === 'paid'
                  ? 'Bills marked as paid will show up here.'
                  : selectedTab === 'overdue'
                    ? 'Great job! You have no pending overdue bills.'
                    : 'You have no pending bills scheduled. Add utility bills, rent, or EMIs to stay on track.'}
              </Text>
              {selectedTab === 'upcoming' && (
                <TouchableOpacity
                  style={[styles.emptyAddButton, { backgroundColor: colors.primary }]}
                  onPress={() => router.push('/(app)/add-bill')}
                  activeOpacity={0.85}
                >
                  <MaterialIcons name="add" size={18} color={colors.onPrimary} />
                  <Text style={[styles.emptyAddButtonText, { color: colors.onPrimary }]}>
                    Add Bill
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.itemsList}>
              {bills.map((bill) => (
                <BillCard key={bill.id} bill={bill} />
              ))}
            </View>
          )
        )}
      </ScrollView>

      {/* Floating Action Button (FAB) */}
      <TouchableOpacity
        style={[
          styles.fab,
          {
            backgroundColor: colors.primary,
            bottom: Math.max(24, insets.bottom + 16),
          },
        ]}
        onPress={() => router.push('/(app)/add-bill')}
        activeOpacity={0.85}
      >
        <MaterialIcons name="add" size={24} color={colors.onPrimary} />
        <Text style={[styles.fabText, { color: colors.onPrimary }]}>Add Bill</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerAddButton: {
    padding: 4,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  summaryCard: {
    width: '48.5%',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 14,
    justifyContent: 'space-between',
  },
  summaryCardAlert: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.04)',
  },
  summaryCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  summaryCardLabel: {
    ...typography.labelMd,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  miniIconBox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCardAmount: {
    ...typography.headlineSm,
    fontWeight: '800',
    fontSize: 17,
    marginBottom: 2,
  },
  monthUnit: {
    fontSize: 12,
    fontWeight: '600',
  },
  summaryCardSubtext: {
    ...typography.bodyMd,
    fontSize: 11,
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
    borderWidth: 1,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  tabButtonText: {
    ...typography.labelMd,
    fontWeight: '600',
    fontSize: 11,
  },
  tabButtonTextActive: {
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    ...typography.bodyMd,
    padding: 0,
    fontSize: 13,
  },
  categoryScroll: {
    gap: 8,
    paddingBottom: 14,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryPillText: {
    ...typography.labelMd,
    fontWeight: '600',
    fontSize: 12,
  },
  categoryPillTextActive: {
    fontWeight: '700',
  },
  itemsList: {
    gap: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 44,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    ...typography.headlineSm,
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 6,
  },
  emptySubtitle: {
    ...typography.bodyMd,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 20,
  },
  emptyAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  emptyAddButtonText: {
    ...typography.labelMd,
    fontWeight: '700',
    fontSize: 13,
  },
  fab: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: {
    ...typography.labelMd,
    fontWeight: '700',
    fontSize: 14,
  },
});

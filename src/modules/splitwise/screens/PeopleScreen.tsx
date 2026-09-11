import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  DeviceEventEmitter,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Text, Header } from '@/components/ui';
import { typography, useTheme, radius } from '@/theme';
import { useAppStore } from '@/store/use-app-store';
import { formatCurrencyPrivacy } from '@/utils/format';
import { useSplitwiseStore } from '../store/splitwise.store';
import { BalanceCalculator, DetailedPersonBalance } from '../services/BalanceCalculator';

type PeopleFilterTab = 'ALL' | 'OWE_ME' | 'I_OWE' | 'SETTLED';

export function PeopleScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { hideBalances } = useAppStore();

  const {
    people,
    debts,
    settlements,
    isLoading,
    loadAllData,
  } = useSplitwiseStore();

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<PeopleFilterTab>('ALL');

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  }, [loadAllData]);

  useEffect(() => {
    handleRefresh();
    const sub = DeviceEventEmitter.addListener('splitwiseUpdated', () => {
      loadAllData();
    });
    return () => {
      sub.remove();
    };
  }, [handleRefresh, loadAllData]);

  // Compute all person balances using pure function
  const allPersonBalances = useMemo(() => {
    return BalanceCalculator.calculatePeopleBalances(people, debts, settlements);
  }, [people, debts, settlements]);

  // Tab counts
  const tabCounts = useMemo(() => {
    let owedToMeCount = 0;
    let youOweCount = 0;
    let settledCount = 0;

    for (const pb of allPersonBalances) {
      if (pb.status === 'OWED_TO_ME') owedToMeCount++;
      else if (pb.status === 'YOU_OWE') youOweCount++;
      else if (pb.status === 'SETTLED') settledCount++;
    }

    return {
      all: allPersonBalances.length,
      owedToMe: owedToMeCount,
      youOwe: youOweCount,
      settled: settledCount,
    };
  }, [allPersonBalances]);

  // Filtered person balances
  const filteredPersonBalances = useMemo(() => {
    let list = allPersonBalances;

    if (activeTab === 'OWE_ME') {
      list = list.filter((p) => p.status === 'OWED_TO_ME');
    } else if (activeTab === 'I_OWE') {
      list = list.filter((p) => p.status === 'YOU_OWE');
    } else if (activeTab === 'SETTLED') {
      list = list.filter((p) => p.status === 'SETTLED');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((p) => {
        const name = (p.personName || '').toLowerCase();
        return name.includes(q);
      });
    }

    return list;
  }, [allPersonBalances, activeTab, searchQuery]);

  const handlePersonPress = (personId: string) => {
    router.push({
      pathname: '/(app)/splitwise-person-details',
      params: { personId },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Header
        title="Friends & Balances"
        showBack
        rightNode={
          <TouchableOpacity
            style={[styles.headerAddBtn, { backgroundColor: colors.surfaceContainerLow }]}
            onPress={() => router.push('/(app)/add-splitwise-person')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="person-add" size={20} color={colors.primary} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
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
        {/* Search Bar */}
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
            style={[styles.searchInput, { color: colors.onSurface }]}
            placeholder="Search by friend's name..."
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
        <View
          style={[
            styles.tabBar,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          {(
            [
              { key: 'ALL', label: `All (${tabCounts.all})` },
              { key: 'OWE_ME', label: `Owes You (${tabCounts.owedToMe})` },
              { key: 'I_OWE', label: `You Owe (${tabCounts.youOwe})` },
              { key: 'SETTLED', label: `Settled (${tabCounts.settled})` },
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.tabButton,
                  isActive && { backgroundColor: colors.primary },
                ]}
                onPress={() => setActiveTab(tab.key)}
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
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* People List */}
        {filteredPersonBalances.length > 0 ? (
          <View style={styles.peopleList}>
            {filteredPersonBalances.map((item) => (
              <PeopleListItem
                key={item.personId}
                balance={item}
                hideBalances={hideBalances}
                onPress={() => handlePersonPress(item.personId)}
              />
            ))}
          </View>
        ) : (
          /* Empty State */
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.surfaceContainerLow }]}>
              <MaterialIcons name="person-search" size={36} color={colors.onSurfaceVariant} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>
              {people.length === 0
                ? 'No friends added yet'
                : searchQuery.trim()
                  ? `No friend found for "${searchQuery}"`
                  : 'No contacts in this category'}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.onSurfaceVariant }]}>
              {people.length === 0
                ? 'Add friends to track shared expenses, bills, and record UPI settlements.'
                : 'Try adjusting your search query or switching tabs.'}
            </Text>

            {people.length === 0 && (
              <TouchableOpacity
                style={[styles.emptyAddBtn, { backgroundColor: colors.primary }]}
                onPress={() => router.push('/(app)/add-splitwise-person')}
                activeOpacity={0.85}
              >
                <MaterialIcons name="person-add" size={18} color={colors.onPrimary} />
                <Text style={[styles.emptyAddBtnText, { color: colors.onPrimary }]}>
                  Add New Friend
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ----------------------------------------------------------------------------
// Person List Item Component
// ----------------------------------------------------------------------------

interface PeopleListItemProps {
  balance: DetailedPersonBalance;
  hideBalances?: boolean;
  onPress: () => void;
}

function PeopleListItem({ balance, hideBalances, onPress }: PeopleListItemProps) {
  const { colors } = useTheme();

  const isOwedToMe = balance.status === 'OWED_TO_ME';
  const isYouOwe = balance.status === 'YOU_OWE';
  const isSettled = balance.status === 'SETTLED';

  const badgeBg = isOwedToMe
    ? 'rgba(16, 185, 129, 0.12)'
    : isYouOwe
      ? 'rgba(239, 68, 68, 0.12)'
      : 'rgba(148, 163, 184, 0.12)';

  const badgeColor = isOwedToMe ? '#10b981' : isYouOwe ? '#ef4444' : colors.onSurfaceVariant;

  const initials = (balance.personName || 'Friend')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  // Status text example: "Owes You ₹2000" or "You Owe ₹500" or "Settled up"
  const formattedStatusText = isOwedToMe
    ? `Owes You ${formatCurrencyPrivacy(balance.netBalance, hideBalances)}`
    : isYouOwe
      ? `You Owe ${formatCurrencyPrivacy(Math.abs(balance.netBalance), hideBalances)}`
      : 'Settled up';

  return (
    <TouchableOpacity
      style={[
        styles.personCard,
        {
          backgroundColor: colors.surfaceContainerLow,
          borderColor: colors.outlineVariant,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.personCardLeft}>
        <View
          style={[
            styles.avatarCircle,
            {
              backgroundColor: isOwedToMe
                ? 'rgba(16, 185, 129, 0.12)'
                : isYouOwe
                  ? 'rgba(239, 68, 68, 0.12)'
                  : colors.surfaceContainerHigh,
            },
          ]}
        >
          <Text
            style={[
              styles.avatarText,
              { color: isOwedToMe ? '#10b981' : isYouOwe ? '#ef4444' : colors.primary },
            ]}
          >
            {initials}
          </Text>
        </View>

        <View style={styles.nameContainer}>
          <Text style={[styles.personNameText, { color: colors.onSurface }]} numberOfLines={1}>
            {balance.personName || 'Friend'}
          </Text>

          <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
            <Text style={[styles.statusBadgeText, { color: badgeColor }]}>
              {formattedStatusText}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.personCardRight}>
        <Text
          style={[
            styles.balanceAmountText,
            { color: badgeColor },
          ]}
        >
          {isOwedToMe ? '+' : ''}
          {formatCurrencyPrivacy(Math.abs(balance.netBalance), hideBalances)}
        </Text>
        <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
      </View>
    </TouchableOpacity>
  );
}

// ----------------------------------------------------------------------------
// Styles
// ----------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerAddBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    ...typography.bodyMd,
    fontSize: 13,
    padding: 0,
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    marginBottom: 14,
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
    fontSize: 11,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    fontWeight: '700',
  },
  peopleList: {
    gap: 8,
  },
  personCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  personCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.labelMd,
    fontWeight: '800',
    fontSize: 15,
  },
  nameContainer: {
    flex: 1,
    gap: 4,
  },
  personNameText: {
    ...typography.headlineSm,
    fontWeight: '700',
    fontSize: 15,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    ...typography.labelMd,
    fontSize: 11,
    fontWeight: '700',
  },
  personCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  balanceAmountText: {
    ...typography.headlineSm,
    fontWeight: '800',
    fontSize: 15,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
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
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...typography.bodyMd,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  emptyAddBtnText: {
    ...typography.labelMd,
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 20,
  },
});

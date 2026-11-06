import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Platform,
  Modal,
  DeviceEventEmitter,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useRouter } from 'expo-router';
import { Text, Header } from '@/components/ui';
import { typography, useTheme, radius } from '@/theme';
import { useAppStore } from '@/store/use-app-store';
import { formatCurrencyPrivacy } from '@/utils/format';
import { useSplitwiseStore } from '../store/splitwise.store';
import { SplitwiseRepository } from '../database/splitwise.repository';
import {
  BalanceCalculator,
  DetailedPersonBalance,
} from '../services/BalanceCalculator';
import type {
  SplitwiseActivityItem,
} from '../types/splitwise.types';

type FilterTab = 'ALL' | 'OWE_ME' | 'I_OWE' | 'SETTLED';

export function SplitwiseHomeScreen() {
  const { colors } = useTheme();
  const insets = useSafeInsets();
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
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [recentActivities, setRecentActivities] = useState<SplitwiseActivityItem[]>([]);
  const [showChooserModal, setShowChooserModal] = useState(false);

  // Load activity history
  const loadRecentActivities = useCallback(async () => {
    try {
      const activities = await SplitwiseRepository.getAllActivityHistory(10);
      setRecentActivities(activities);
    } catch {
      // Ignore
    }
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadAllData(), loadRecentActivities()]);
    setRefreshing(false);
  }, [loadAllData, loadRecentActivities]);

  useEffect(() => {
    handleRefresh();
    const subscription = DeviceEventEmitter.addListener('splitwiseUpdated', () => {
      loadAllData();
      loadRecentActivities();
    });
    return () => {
      subscription.remove();
    };
  }, [handleRefresh, loadAllData, loadRecentActivities]);

  // Overall summary calculated safely with pure functions
  const overallSummary = useMemo(() => {
    return BalanceCalculator.calculateOverallSummary(people, debts, settlements);
  }, [people, debts, settlements]);

  // Person balances calculated with pure functions
  const allPersonBalances = useMemo(() => {
    return BalanceCalculator.calculatePeopleBalances(people, debts, settlements);
  }, [people, debts, settlements]);

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
      list = list.filter((p) => (p.personName || '').toLowerCase().includes(q));
    }

    return list;
  }, [allPersonBalances, activeTab, searchQuery]);

  const openAction = (type: 'PERSON' | 'DEBT' | 'SETTLEMENT') => {
    setShowChooserModal(false);
    if (type === 'PERSON') {
      router.push('/(app)/add-splitwise-person');
    } else if (type === 'DEBT') {
      router.push('/(app)/add-splitwise-debt');
    } else if (type === 'SETTLEMENT') {
      router.push('/(app)/add-splitwise-settlement');
    }
  };

  const netBalance = overallSummary.netBalance;
  const isNetOwed = netBalance > 0;
  const isNetOwe = netBalance < 0;
  const netColor = isNetOwed ? '#10b981' : isNetOwe ? '#ef4444' : colors.onSurface;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 20 : 16),
        },
      ]}
    >
      <Header
        title="Splitwise & Shared"
        showBack
        rightNode={
          <TouchableOpacity
            style={[styles.headerAddBtn, { backgroundColor: colors.surfaceContainerLow }]}
            onPress={() => setShowChooserModal(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="add" size={22} color={colors.primary} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 40 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing || isLoading}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* HERO BANNER CARD */}
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          <View style={styles.heroTopRow}>
            <View>
              <Text style={[styles.heroSubLabel, { color: colors.onSurfaceVariant }]}>
                OVERALL NET BALANCE
              </Text>
              <Text style={[styles.heroMainAmount, { color: netColor }]}>
                {isNetOwed ? '+' : ''}
                {formatCurrencyPrivacy(netBalance, hideBalances)}
              </Text>
            </View>

            <View
              style={[
                styles.peopleCountBadge,
                { backgroundColor: colors.surfaceContainerHigh },
              ]}
            >
              <MaterialIcons name="people" size={16} color={colors.primary} />
              <Text style={[styles.peopleCountText, { color: colors.onSurface }]}>
                {overallSummary.totalPeopleCount} {overallSummary.totalPeopleCount === 1 ? 'Friend' : 'Friends'}
              </Text>
            </View>
          </View>

          {/* Sub Metrics: Receivable vs Payable */}
          <View style={[styles.heroDivider, { backgroundColor: colors.outlineVariant }]} />

          <View style={styles.heroMetricsGrid}>
            {/* Total Receivable */}
            <View style={styles.metricColumn}>
              <View style={styles.metricLabelRow}>
                <View style={[styles.miniDot, { backgroundColor: '#10b981' }]} />
                <Text style={[styles.metricLabel, { color: colors.onSurfaceVariant }]}>
                  Total Receivable
                </Text>
              </View>
              <Text style={[styles.metricAmount, { color: '#10b981' }]}>
                +{formatCurrencyPrivacy(overallSummary.remainingReceivable, hideBalances)}
              </Text>
              <Text style={[styles.metricSubtext, { color: colors.onSurfaceVariant }]}>
                Owed to you
              </Text>
            </View>

            <View style={[styles.verticalDivider, { backgroundColor: colors.outlineVariant }]} />

            {/* Total Payable */}
            <View style={styles.metricColumn}>
              <View style={styles.metricLabelRow}>
                <View style={[styles.miniDot, { backgroundColor: '#ef4444' }]} />
                <Text style={[styles.metricLabel, { color: colors.onSurfaceVariant }]}>
                  Total Payable
                </Text>
              </View>
              <Text style={[styles.metricAmount, { color: '#ef4444' }]}>
                -{formatCurrencyPrivacy(overallSummary.remainingPayable, hideBalances)}
              </Text>
              <Text style={[styles.metricSubtext, { color: colors.onSurfaceVariant }]}>
                You owe
              </Text>
            </View>
          </View>
        </View>

        {/* QUICK ACTION BUTTONS */}
        <View style={styles.quickActionRow}>
          <TouchableOpacity
            style={[styles.quickActionBtn, { backgroundColor: colors.primary }]}
            onPress={() => openAction('DEBT')}
            activeOpacity={0.85}
          >
            <MaterialIcons name="add" size={18} color={colors.onPrimary} />
            <Text style={[styles.quickActionBtnText, { color: colors.onPrimary }]}>
              Add Debt
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.quickActionBtn,
              {
                backgroundColor: colors.surfaceContainerHigh,
                borderColor: colors.outlineVariant,
                borderWidth: 1,
              },
            ]}
            onPress={() => openAction('SETTLEMENT')}
            activeOpacity={0.85}
          >
            <MaterialIcons name="handshake" size={18} color={colors.primary} />
            <Text style={[styles.quickActionBtnText, { color: colors.onSurface }]}>
              Settle Up
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.quickActionBtnSmall,
              {
                backgroundColor: colors.surfaceContainerLow,
                borderColor: colors.outlineVariant,
                borderWidth: 1,
              },
            ]}
            onPress={() => openAction('PERSON')}
            activeOpacity={0.85}
          >
            <MaterialIcons name="person-add" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* FRIENDS SECTION HEADER */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>
            Friends & Balances
          </Text>
          <Text style={[styles.sectionSubtitle, { color: colors.onSurfaceVariant }]}>
            {overallSummary.activePeopleCount} active · {overallSummary.settledPeopleCount} settled
          </Text>
        </View>

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
          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === 'ALL' && { backgroundColor: colors.primary },
            ]}
            onPress={() => setActiveTab('ALL')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabButtonText,
                {
                  color: activeTab === 'ALL' ? colors.onPrimary : colors.onSurfaceVariant,
                  fontFamily: activeTab === 'ALL' ? 'Manrope_700Bold' : 'Manrope_600SemiBold',
                },
              ]}
            >
              All ({allPersonBalances.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === 'OWE_ME' && { backgroundColor: colors.primary },
            ]}
            onPress={() => setActiveTab('OWE_ME')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabButtonText,
                {
                  color: activeTab === 'OWE_ME' ? colors.onPrimary : colors.onSurfaceVariant,
                  fontFamily: activeTab === 'OWE_ME' ? 'Manrope_700Bold' : 'Manrope_600SemiBold',
                },
              ]}
            >
              Owes You
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === 'I_OWE' && { backgroundColor: colors.primary },
            ]}
            onPress={() => setActiveTab('I_OWE')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabButtonText,
                {
                  color: activeTab === 'I_OWE' ? colors.onPrimary : colors.onSurfaceVariant,
                  fontFamily: activeTab === 'I_OWE' ? 'Manrope_700Bold' : 'Manrope_600SemiBold',
                },
              ]}
            >
              You Owe
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabButton,
              activeTab === 'SETTLED' && { backgroundColor: colors.primary },
            ]}
            onPress={() => setActiveTab('SETTLED')}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.tabButtonText,
                {
                  color: activeTab === 'SETTLED' ? colors.onPrimary : colors.onSurfaceVariant,
                  fontFamily: activeTab === 'SETTLED' ? 'Manrope_700Bold' : 'Manrope_600SemiBold',
                },
              ]}
            >
              Settled
            </Text>
          </TouchableOpacity>
        </View>

        {/* FRIENDS LIST */}
        {filteredPersonBalances.length > 0 ? (
          <View style={styles.peopleList}>
            {filteredPersonBalances.map((item) => (
              <PersonCard
                key={item.personId}
                balance={item}
                hideBalances={hideBalances}
                onPress={() => {
                  router.push({
                    pathname: '/(app)/splitwise-person-details',
                    params: { personId: item.personId },
                  });
                }}
                onSettlePress={() => {
                  const isOwe = item.status === 'YOU_OWE';
                  const targetAmt = isOwe
                    ? (item.remainingPayable ?? Math.abs(item.netBalance))
                    : item.remainingReceivable;

                  router.push({
                    pathname: '/(app)/add-splitwise-settlement',
                    params: {
                      personId: item.personId,
                      type: isOwe ? 'YOU_PAID' : 'THEY_PAID',
                      amount: targetAmt > 0 ? targetAmt.toString() : undefined,
                    },
                  });
                }}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.surfaceContainerLow }]}>
              <MaterialIcons name="group" size={32} color={colors.onSurfaceVariant} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>
              {people.length === 0 ? 'No friends added yet' : 'No matching balances found'}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.onSurfaceVariant }]}>
              {people.length === 0
                ? 'Add friends to start tracking IOUs, shared dining, and bill splits.'
                : 'Try adjusting your search query or filter tab.'}
            </Text>
            {people.length === 0 && (
              <TouchableOpacity
                style={[styles.emptyAddBtn, { backgroundColor: colors.primary }]}
                onPress={() => openAction('PERSON')}
                activeOpacity={0.85}
              >
                <MaterialIcons name="person-add" size={18} color={colors.onPrimary} />
                <Text style={[styles.emptyAddBtnText, { color: colors.onPrimary }]}>
                  Add Your First Friend
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* RECENT ACTIVITY STREAM */}
        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>
            Recent Activity
          </Text>
          <Text style={[styles.sectionSubtitle, { color: colors.onSurfaceVariant }]}>
            Latest splits & settlements
          </Text>
        </View>

        {recentActivities.length > 0 ? (
          <View
            style={[
              styles.activityCardContainer,
              {
                backgroundColor: colors.surfaceContainerLow,
                borderColor: colors.outlineVariant,
              },
            ]}
          >
            {recentActivities.map((act, index) => (
              <React.Fragment key={act.id}>
                {index > 0 && (
                  <View style={[styles.activityDivider, { backgroundColor: colors.outlineVariant }]} />
                )}
                <View style={styles.activityRow}>
                  <View
                    style={[
                      styles.activityIconCircle,
                      {
                        backgroundColor:
                          act.activityType === 'settlement'
                            ? colors.primaryContainer + '25'
                            : act.debtType === 'OWE_ME'
                              ? 'rgba(16, 185, 129, 0.12)'
                              : 'rgba(239, 68, 68, 0.12)',
                      },
                    ]}
                  >
                    <MaterialIcons
                      name={
                        act.activityType === 'settlement'
                          ? 'handshake'
                          : act.debtType === 'OWE_ME'
                            ? 'call-received'
                            : 'call-made'
                      }
                      size={18}
                      color={
                        act.activityType === 'settlement'
                          ? colors.primary
                          : act.debtType === 'OWE_ME'
                            ? '#10b981'
                            : '#ef4444'
                      }
                    />
                  </View>

                  <View style={styles.activityDetailsCol}>
                    <Text style={[styles.activityTitle, { color: colors.onSurface }]} numberOfLines={1}>
                      {act.description}
                    </Text>
                    <Text style={[styles.activitySub, { color: colors.onSurfaceVariant }]}>
                      {act.personName} · {formatDate(act.createdAt)}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.activityAmount,
                      {
                        color:
                          act.activityType === 'settlement'
                            ? colors.primary
                            : act.debtType === 'OWE_ME'
                              ? '#10b981'
                              : '#ef4444',
                      },
                    ]}
                  >
                    {act.activityType === 'debt' ? (act.debtType === 'OWE_ME' ? '+' : '-') : ''}
                    {formatCurrencyPrivacy(act.amount, hideBalances)}
                  </Text>
                </View>
              </React.Fragment>
            ))}
          </View>
        ) : (
          <View
            style={[
              styles.activityEmptyCard,
              {
                backgroundColor: colors.surfaceContainerLow,
                borderColor: colors.outlineVariant,
              },
            ]}
          >
            <Text style={[styles.activityEmptyText, { color: colors.onSurfaceVariant }]}>
              No recent split activities recorded yet.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* ACTION CHOOSER BOTTOM SHEET MODAL */}
      <Modal
        visible={showChooserModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowChooserModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.surfaceContainerLowest,
                borderColor: colors.outlineVariant,
                paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 40 : 24),
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Quick Action</Text>
              <TouchableOpacity
                onPress={() => setShowChooserModal(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={22} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <View style={styles.chooserContainer}>
              <TouchableOpacity
                style={[styles.chooserItem, { backgroundColor: colors.surfaceContainerLow }]}
                onPress={() => openAction('DEBT')}
              >
                <View style={[styles.chooserIconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                  <MaterialIcons name="receipt-long" size={22} color="#10b981" />
                </View>
                <View style={styles.chooserTextCol}>
                  <Text style={[styles.chooserItemTitle, { color: colors.onSurface }]}>
                    Add Split / Debt
                  </Text>
                  <Text style={[styles.chooserItemSub, { color: colors.onSurfaceVariant }]}>
                    Record a shared bill or IOU with a friend
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.chooserItem, { backgroundColor: colors.surfaceContainerLow }]}
                onPress={() => openAction('SETTLEMENT')}
              >
                <View style={[styles.chooserIconCircle, { backgroundColor: colors.primaryContainer + '25' }]}>
                  <MaterialIcons name="handshake" size={22} color={colors.primary} />
                </View>
                <View style={styles.chooserTextCol}>
                  <Text style={[styles.chooserItemTitle, { color: colors.onSurface }]}>
                    Record Settlement
                  </Text>
                  <Text style={[styles.chooserItemSub, { color: colors.onSurfaceVariant }]}>
                    Record a payment made via UPI, cash, or transfer
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.chooserItem, { backgroundColor: colors.surfaceContainerLow }]}
                onPress={() => openAction('PERSON')}
              >
                <View style={[styles.chooserIconCircle, { backgroundColor: colors.surfaceContainerHigh }]}>
                  <MaterialIcons name="person-add" size={22} color={colors.primary} />
                </View>
                <View style={styles.chooserTextCol}>
                  <Text style={[styles.chooserItemTitle, { color: colors.onSurface }]}>
                    Add New Friend
                  </Text>
                  <Text style={[styles.chooserItemSub, { color: colors.onSurfaceVariant }]}>
                    Add a contact to start splitting bills
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ----------------------------------------------------------------------------
// Person Card Component
// ----------------------------------------------------------------------------

interface PersonCardProps {
  balance: DetailedPersonBalance;
  hideBalances?: boolean;
  onPress?: () => void;
  onSettlePress: () => void;
}

function PersonCard({ balance, hideBalances, onPress, onSettlePress }: PersonCardProps) {
  const { colors } = useTheme();
  const isOwedToMe = balance.status === 'OWED_TO_ME';
  const isYouOwe = balance.status === 'YOU_OWE';
  const isSettled = balance.status === 'SETTLED';

  const badgeBg = isOwedToMe
    ? 'rgba(16, 185, 129, 0.12)'
    : isYouOwe
      ? 'rgba(239, 68, 68, 0.12)'
      : colors.surfaceContainerHigh;

  const badgeColor = isOwedToMe ? '#10b981' : isYouOwe ? '#ef4444' : colors.onSurfaceVariant;

  const initials = (balance.personName || 'Friend')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'F';

  return (
    <TouchableOpacity
      style={[
        styles.personCardContainer,
        {
          backgroundColor: colors.surfaceContainerLow,
          borderColor: colors.outlineVariant,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.personCardLeft}>
        <View style={[styles.avatarCircle, { backgroundColor: colors.primaryContainer }]}>
          <Text style={[styles.avatarText, { color: colors.onPrimaryContainer }]}>{initials}</Text>
        </View>

        <View style={styles.nameCol}>
          <Text style={[styles.nameText, { color: colors.onSurface }]} numberOfLines={1}>
            {balance.personName || 'Unnamed Friend'}
          </Text>

          <View style={styles.subRow}>
            <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
              <Text style={[styles.statusBadgeText, { color: badgeColor }]}>
                {balance.statusLabel}
              </Text>
            </View>
            {balance.totalSettled > 0 && (
              <Text style={[styles.settledSubtext, { color: colors.onSurfaceVariant }]}>
                · Settled {formatCurrencyPrivacy(balance.totalSettled, hideBalances)}
              </Text>
            )}
          </View>
        </View>
      </View>

      <View style={styles.personCardRight}>
        <Text style={[styles.balanceAmount, { color: badgeColor }]}>
          {isOwedToMe ? '+' : isYouOwe ? '-' : ''}
          {formatCurrencyPrivacy(Math.abs(balance.netBalance), hideBalances)}
        </Text>

        {!isSettled && (
          <TouchableOpacity
            style={[styles.quickSettleBtn, { backgroundColor: colors.surfaceContainerHigh }]}
            onPress={onSettlePress}
            activeOpacity={0.7}
          >
            <Text style={[styles.quickSettleText, { color: colors.primary }]}>Settle</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  } catch {
    return 'Recent';
  }
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
  heroCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 18,
    marginBottom: 14,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  heroSubLabel: {
    ...typography.labelMd,
    fontSize: 11,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  heroMainAmount: {
    ...typography.displayLg,
    fontFamily: 'Manrope_700Bold',
    fontSize: 28,
    lineHeight: 36,
  },
  peopleCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  peopleCountText: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  heroDivider: {
    height: 1,
    marginVertical: 14,
  },
  heroMetricsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricColumn: {
    flex: 1,
  },
  verticalDivider: {
    width: 1,
    height: 38,
    marginHorizontal: 12,
  },
  metricLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  miniDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  metricLabel: {
    ...typography.labelMd,
    fontSize: 11,
    fontFamily: 'Manrope_600SemiBold',
  },
  metricAmount: {
    ...typography.headlineSm,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Manrope_700Bold',
    marginBottom: 1,
  },
  metricSubtext: {
    ...typography.bodyMd,
    fontSize: 11,
    lineHeight: 14,
  },
  quickActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.lg,
  },
  quickActionBtnSmall: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionBtnText: {
    ...typography.labelMd,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Manrope_700Bold',
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    ...typography.headlineSm,
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
    lineHeight: 24,
  },
  sectionSubtitle: {
    ...typography.bodyMd,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
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
    borderRadius: 14,
    padding: 3,
    borderWidth: 1,
    marginBottom: 14,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  tabButtonText: {
    ...typography.labelMd,
    fontSize: 11,
    lineHeight: 15,
  },
  peopleList: {
    gap: 8,
  },
  personCardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  personCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
    lineHeight: 20,
  },
  nameCol: {
    flex: 1,
  },
  nameText: {
    ...typography.bodyMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    lineHeight: 18,
    marginBottom: 2,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  statusBadgeText: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    lineHeight: 14,
  },
  settledSubtext: {
    ...typography.bodyMd,
    fontSize: 11,
    lineHeight: 14,
  },
  personCardRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  balanceAmount: {
    ...typography.headlineSm,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    lineHeight: 18,
  },
  quickSettleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  quickSettleText: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    lineHeight: 14,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: {
    ...typography.headlineSm,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    lineHeight: 22,
  },
  emptySubtitle: {
    ...typography.bodyMd,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    maxWidth: 240,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
    gap: 6,
    marginTop: 8,
  },
  emptyAddBtnText: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
  },
  activityCardContainer: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  activityDivider: {
    height: 1,
    marginHorizontal: 12,
  },
  activityIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityDetailsCol: {
    flex: 1,
  },
  activityTitle: {
    ...typography.bodyMd,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    lineHeight: 17,
    marginBottom: 2,
  },
  activitySub: {
    ...typography.bodyMd,
    fontSize: 11,
    lineHeight: 14,
  },
  activityAmount: {
    ...typography.headlineSm,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
    lineHeight: 17,
  },
  activityEmptyCard: {
    padding: 20,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
  },
  activityEmptyText: {
    ...typography.bodyMd,
    fontSize: 12,
    textAlign: 'center',
  },
  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    ...typography.headlineSm,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    lineHeight: 24,
  },
  chooserContainer: {
    gap: 10,
  },
  chooserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: radius.lg,
    gap: 12,
  },
  chooserIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chooserTextCol: {
    flex: 1,
  },
  chooserItemTitle: {
    ...typography.bodyMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    lineHeight: 18,
    marginBottom: 2,
  },
  chooserItemSub: {
    ...typography.bodyMd,
    fontSize: 11,
    lineHeight: 15,
  },
});

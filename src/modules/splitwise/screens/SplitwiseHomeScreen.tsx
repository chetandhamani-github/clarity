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
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  DebtType,
  SplitwiseActivityItem,
} from '../types/splitwise.types';

type FilterTab = 'ALL' | 'OWE_ME' | 'I_OWE' | 'SETTLED';

export function SplitwiseHomeScreen() {
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
    addPerson,
    addDebt,
    addSettlement,
  } = useSplitwiseStore();

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [recentActivities, setRecentActivities] = useState<SplitwiseActivityItem[]>([]);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalType, setModalType] = useState<'PERSON' | 'DEBT' | 'SETTLEMENT' | 'CHOOSER'>('CHOOSER');

  // Form states
  const [personName, setPersonName] = useState('');
  const [personPhone, setPersonPhone] = useState('');
  const [personNotes, setPersonNotes] = useState('');

  const [selectedPersonId, setSelectedPersonId] = useState<string>('');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtType, setDebtType] = useState<DebtType>('OWE_ME');
  const [debtDescription, setDebtDescription] = useState('');

  const [settlementAmount, setSettlementAmount] = useState('');
  const [settlementDescription, setSettlementDescription] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load activity history
  const loadRecentActivities = useCallback(async () => {
    try {
      const activities = await SplitwiseRepository.getAllActivityHistory(10);
      setRecentActivities(activities);
    } catch {
      // Fallback
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

  const handleCreatePerson = async () => {
    if (!personName.trim()) {
      Alert.alert('Required', 'Please enter a person name.');
      return;
    }
    setIsSubmitting(true);
    try {
      await addPerson({
        name: personName.trim(),
        phone: personPhone.trim() || undefined,
        notes: personNotes.trim() || undefined,
      });
      setPersonName('');
      setPersonPhone('');
      setPersonNotes('');
      setShowAddModal(false);
      handleRefresh();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to add friend');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateDebt = async () => {
    const amountNum = parseFloat(debtAmount);
    if (!selectedPersonId) {
      Alert.alert('Required', 'Please select a friend.');
      return;
    }
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Required', 'Please enter a valid amount.');
      return;
    }
    if (!debtDescription.trim()) {
      Alert.alert('Required', 'Please enter a description.');
      return;
    }

    setIsSubmitting(true);
    try {
      await addDebt({
        personId: selectedPersonId,
        amount: amountNum,
        type: debtType,
        description: debtDescription.trim(),
      });
      setDebtAmount('');
      setDebtDescription('');
      setShowAddModal(false);
      handleRefresh();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to add debt');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateSettlement = async () => {
    const amountNum = parseFloat(settlementAmount);
    if (!selectedPersonId) {
      Alert.alert('Required', 'Please select a friend.');
      return;
    }
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Required', 'Please enter a valid amount.');
      return;
    }

    setIsSubmitting(true);
    try {
      await addSettlement({
        personId: selectedPersonId,
        amount: amountNum,
        description: settlementDescription.trim() || 'Settlement payment',
      });
      setSettlementAmount('');
      setSettlementDescription('');
      setShowAddModal(false);
      handleRefresh();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to record settlement');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openAction = (type: 'PERSON' | 'DEBT' | 'SETTLEMENT') => {
    if (type === 'PERSON') {
      setShowAddModal(false);
      router.push('/(app)/add-splitwise-person');
      return;
    }
    if (people.length > 0 && !selectedPersonId) {
      setSelectedPersonId(people[0].id);
    }
    setModalType(type);
    setShowAddModal(true);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Header
        title="Splitwise & Shared"
        showBack
        rightNode={
          <TouchableOpacity
            style={[styles.headerAddBtn, { backgroundColor: colors.surfaceContainerLow }]}
            onPress={() => {
              setModalType('CHOOSER');
              setShowAddModal(true);
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="add" size={22} color={colors.primary} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 140 }]}
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
              <Text
                style={[
                  styles.heroMainAmount,
                  {
                    color:
                      overallSummary.netBalance > 0
                        ? '#10b981'
                        : overallSummary.netBalance < 0
                          ? '#ef4444'
                          : colors.onSurface,
                  },
                ]}
              >
                {overallSummary.netBalance > 0 ? '+' : ''}
                {formatCurrencyPrivacy(overallSummary.netBalance, hideBalances)}
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
                +{formatCurrencyPrivacy(overallSummary.totalReceivable, hideBalances)}
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
                -{formatCurrencyPrivacy(overallSummary.totalPayable, hideBalances)}
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
            activeOpacity={0.8}
          >
            <MaterialIcons name="add" size={18} color={colors.onPrimary} />
            <Text style={[styles.quickActionBtnText, { color: colors.onPrimary }]}>
              Add Split / Debt
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.quickActionBtn,
              { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant, borderWidth: 1 },
            ]}
            onPress={() => openAction('SETTLEMENT')}
            activeOpacity={0.8}
          >
            <MaterialIcons name="handshake" size={18} color={colors.primary} />
            <Text style={[styles.quickActionBtnText, { color: colors.onSurface }]}>
              Settle Up
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.quickActionBtnSmall,
              { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant, borderWidth: 1 },
            ]}
            onPress={() => openAction('PERSON')}
            activeOpacity={0.8}
          >
            <MaterialIcons name="person-add" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* FRIENDS SECTION HEADER & TABS */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>
            Friends & Contacts
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
          {(
            [
              { key: 'ALL', label: 'All' },
              { key: 'OWE_ME', label: 'Owes You' },
              { key: 'I_OWE', label: 'You Owe' },
              { key: 'SETTLED', label: 'Settled' },
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
                  setSelectedPersonId(item.personId);
                  openAction('SETTLEMENT');
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
                activeOpacity={0.8}
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
        <View style={[styles.sectionHeader, { marginTop: 28 }]}>
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
                      styles.activityIconBox,
                      {
                        backgroundColor:
                          act.activityType === 'settlement'
                            ? 'rgba(6, 182, 212, 0.12)'
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
                          ? '#06b6d4'
                          : act.debtType === 'OWE_ME'
                            ? '#10b981'
                            : '#ef4444'
                      }
                    />
                  </View>

                  <View style={styles.activityInfo}>
                    <Text style={[styles.activityDesc, { color: colors.onSurface }]} numberOfLines={1}>
                      {act.description}
                    </Text>
                    <Text style={[styles.activitySub, { color: colors.onSurfaceVariant }]}>
                      {act.personName || 'Friend'} · {formatDate(act.createdAt)}
                    </Text>
                  </View>

                  <View style={styles.activityAmountBox}>
                    <Text
                      style={[
                        styles.activityAmount,
                        {
                          color:
                            act.activityType === 'settlement'
                              ? '#06b6d4'
                              : act.debtType === 'OWE_ME'
                                ? '#10b981'
                                : '#ef4444',
                        },
                      ]}
                    >
                      {act.activityType === 'settlement'
                        ? 'Settled '
                        : act.debtType === 'OWE_ME'
                          ? '+'
                          : '-'}
                      {formatCurrencyPrivacy(act.amount, hideBalances)}
                    </Text>
                  </View>
                </View>
              </React.Fragment>
            ))}
          </View>
        ) : (
          <View
            style={[
              styles.activityEmptyBox,
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

      {/* FLOATING ACTION BUTTON (FAB) */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary, bottom: insets.bottom + 85 }]}
        onPress={() => {
          setModalType('CHOOSER');
          setShowAddModal(true);
        }}
        activeOpacity={0.85}
      >
        <MaterialIcons name="add" size={24} color={colors.onPrimary} />
        <Text style={[styles.fabText, { color: colors.onPrimary }]}>Add Split</Text>
      </TouchableOpacity>

      {/* ACTION MODAL */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.surfaceContainerLowest }]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.onSurface }]}>
                {modalType === 'CHOOSER' && 'Quick Action'}
                {modalType === 'PERSON' && 'Add Friend'}
                {modalType === 'DEBT' && 'Log Split / Debt'}
                {modalType === 'SETTLEMENT' && 'Record Settlement'}
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <MaterialIcons name="close" size={22} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            {/* CHOOSER VIEW */}
            {modalType === 'CHOOSER' && (
              <View style={styles.chooserContainer}>
                <TouchableOpacity
                  style={[styles.chooserItem, { backgroundColor: colors.surfaceContainerLow }]}
                  onPress={() => openAction('DEBT')}
                >
                  <View style={[styles.chooserIconCircle, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                    <MaterialIcons name="receipt-long" size={24} color="#3b82f6" />
                  </View>
                  <View style={styles.chooserTextCol}>
                    <Text style={[styles.chooserItemTitle, { color: colors.onSurface }]}>
                      Add Split / Debt
                    </Text>
                    <Text style={[styles.chooserItemSub, { color: colors.onSurfaceVariant }]}>
                      Record an expense or IOU with a friend
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.chooserItem, { backgroundColor: colors.surfaceContainerLow }]}
                  onPress={() => openAction('SETTLEMENT')}
                >
                  <View style={[styles.chooserIconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                    <MaterialIcons name="handshake" size={24} color="#10b981" />
                  </View>
                  <View style={styles.chooserTextCol}>
                    <Text style={[styles.chooserItemTitle, { color: colors.onSurface }]}>
                      Record Settlement
                    </Text>
                    <Text style={[styles.chooserItemSub, { color: colors.onSurfaceVariant }]}>
                      Settle a balance via UPI, cash, or transfer
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.chooserItem, { backgroundColor: colors.surfaceContainerLow }]}
                  onPress={() => openAction('PERSON')}
                >
                  <View style={[styles.chooserIconCircle, { backgroundColor: 'rgba(168, 85, 247, 0.12)' }]}>
                    <MaterialIcons name="person-add" size={24} color="#a855f7" />
                  </View>
                  <View style={styles.chooserTextCol}>
                    <Text style={[styles.chooserItemTitle, { color: colors.onSurface }]}>
                      Add New Friend
                    </Text>
                    <Text style={[styles.chooserItemSub, { color: colors.onSurfaceVariant }]}>
                      Add a contact name to track shared expenses
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* ADD PERSON FORM */}
            {modalType === 'PERSON' && (
              <View style={styles.formContainer}>
                <Text style={[styles.inputLabel, { color: colors.onSurfaceVariant }]}>Friend Name *</Text>
                <TextInput
                  style={[styles.formInput, { color: colors.onSurface, borderColor: colors.outlineVariant }]}
                  placeholder="e.g., Rohit Sharma"
                  placeholderTextColor={colors.onSurfaceVariant}
                  value={personName}
                  onChangeText={setPersonName}
                />

                <Text style={[styles.inputLabel, { color: colors.onSurfaceVariant }]}>Phone Number (Optional)</Text>
                <TextInput
                  style={[styles.formInput, { color: colors.onSurface, borderColor: colors.outlineVariant }]}
                  placeholder="+91 98765 43210"
                  placeholderTextColor={colors.onSurfaceVariant}
                  keyboardType="phone-pad"
                  value={personPhone}
                  onChangeText={setPersonPhone}
                />

                <Text style={[styles.inputLabel, { color: colors.onSurfaceVariant }]}>Notes (Optional)</Text>
                <TextInput
                  style={[styles.formInput, { color: colors.onSurface, borderColor: colors.outlineVariant }]}
                  placeholder="e.g., Flatmate / Office lunch"
                  placeholderTextColor={colors.onSurfaceVariant}
                  value={personNotes}
                  onChangeText={setPersonNotes}
                />

                <TouchableOpacity
                  style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                  onPress={handleCreatePerson}
                  disabled={isSubmitting}
                >
                  <Text style={[styles.submitBtnText, { color: colors.onPrimary }]}>
                    {isSubmitting ? 'Adding...' : 'Add Friend'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ADD DEBT FORM */}
            {modalType === 'DEBT' && (
              <View style={styles.formContainer}>
                <Text style={[styles.inputLabel, { color: colors.onSurfaceVariant }]}>Select Friend *</Text>
                {people.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.personSelectorScroll}>
                    {people.map((p) => {
                      const isSelected = selectedPersonId === p.id;
                      return (
                        <TouchableOpacity
                          key={p.id}
                          style={[
                            styles.personChip,
                            {
                              backgroundColor: isSelected ? colors.primary : colors.surfaceContainerLow,
                              borderColor: isSelected ? colors.primary : colors.outlineVariant,
                            },
                          ]}
                          onPress={() => setSelectedPersonId(p.id)}
                        >
                          <Text
                            style={[
                              styles.personChipText,
                              { color: isSelected ? colors.onPrimary : colors.onSurface },
                            ]}
                          >
                            {p.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <TouchableOpacity
                    style={[styles.noFriendsBox, { borderColor: colors.outlineVariant }]}
                    onPress={() => openAction('PERSON')}
                  >
                    <Text style={{ color: colors.primary, fontWeight: '600' }}>+ Add a friend first</Text>
                  </TouchableOpacity>
                )}

                <Text style={[styles.inputLabel, { color: colors.onSurfaceVariant }]}>Who Paid / Direction *</Text>
                <View style={[styles.debtTypeToggle, { borderColor: colors.outlineVariant }]}>
                  <TouchableOpacity
                    style={[
                      styles.debtTypeOption,
                      debtType === 'OWE_ME' && { backgroundColor: '#10b981' },
                    ]}
                    onPress={() => setDebtType('OWE_ME')}
                  >
                    <Text
                      style={[
                        styles.debtTypeText,
                        { color: debtType === 'OWE_ME' ? '#fff' : colors.onSurfaceVariant },
                      ]}
                    >
                      I Paid (They Owe Me)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.debtTypeOption,
                      debtType === 'I_OWE' && { backgroundColor: '#ef4444' },
                    ]}
                    onPress={() => setDebtType('I_OWE')}
                  >
                    <Text
                      style={[
                        styles.debtTypeText,
                        { color: debtType === 'I_OWE' ? '#fff' : colors.onSurfaceVariant },
                      ]}
                    >
                      They Paid (I Owe)
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.inputLabel, { color: colors.onSurfaceVariant }]}>Amount (₹) *</Text>
                <TextInput
                  style={[styles.formInput, { color: colors.onSurface, borderColor: colors.outlineVariant }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.onSurfaceVariant}
                  keyboardType="numeric"
                  value={debtAmount}
                  onChangeText={setDebtAmount}
                />

                <Text style={[styles.inputLabel, { color: colors.onSurfaceVariant }]}>Description *</Text>
                <TextInput
                  style={[styles.formInput, { color: colors.onSurface, borderColor: colors.outlineVariant }]}
                  placeholder="e.g., Dinner at Punjabi Rasoi, Uber ride"
                  placeholderTextColor={colors.onSurfaceVariant}
                  value={debtDescription}
                  onChangeText={setDebtDescription}
                />

                <TouchableOpacity
                  style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                  onPress={handleCreateDebt}
                  disabled={isSubmitting || people.length === 0}
                >
                  <Text style={[styles.submitBtnText, { color: colors.onPrimary }]}>
                    {isSubmitting ? 'Saving...' : 'Save Debt / Split'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* RECORD SETTLEMENT FORM */}
            {modalType === 'SETTLEMENT' && (
              <View style={styles.formContainer}>
                <Text style={[styles.inputLabel, { color: colors.onSurfaceVariant }]}>Select Friend *</Text>
                {people.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.personSelectorScroll}>
                    {people.map((p) => {
                      const isSelected = selectedPersonId === p.id;
                      return (
                        <TouchableOpacity
                          key={p.id}
                          style={[
                            styles.personChip,
                            {
                              backgroundColor: isSelected ? colors.primary : colors.surfaceContainerLow,
                              borderColor: isSelected ? colors.primary : colors.outlineVariant,
                            },
                          ]}
                          onPress={() => setSelectedPersonId(p.id)}
                        >
                          <Text
                            style={[
                              styles.personChipText,
                              { color: isSelected ? colors.onPrimary : colors.onSurface },
                            ]}
                          >
                            {p.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <TouchableOpacity
                    style={[styles.noFriendsBox, { borderColor: colors.outlineVariant }]}
                    onPress={() => openAction('PERSON')}
                  >
                    <Text style={{ color: colors.primary, fontWeight: '600' }}>+ Add a friend first</Text>
                  </TouchableOpacity>
                )}

                <Text style={[styles.inputLabel, { color: colors.onSurfaceVariant }]}>Settlement Amount (₹) *</Text>
                <TextInput
                  style={[styles.formInput, { color: colors.onSurface, borderColor: colors.outlineVariant }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.onSurfaceVariant}
                  keyboardType="numeric"
                  value={settlementAmount}
                  onChangeText={setSettlementAmount}
                />

                <Text style={[styles.inputLabel, { color: colors.onSurfaceVariant }]}>Payment Note / Method</Text>
                <TextInput
                  style={[styles.formInput, { color: colors.onSurface, borderColor: colors.outlineVariant }]}
                  placeholder="e.g., Paid via Google Pay UPI"
                  placeholderTextColor={colors.onSurfaceVariant}
                  value={settlementDescription}
                  onChangeText={setSettlementDescription}
                />

                <TouchableOpacity
                  style={[styles.submitBtn, { backgroundColor: '#10b981' }]}
                  onPress={handleCreateSettlement}
                  disabled={isSubmitting || people.length === 0}
                >
                  <Text style={[styles.submitBtnText, { color: '#ffffff' }]}>
                    {isSubmitting ? 'Recording...' : 'Record Settlement'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
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
      : 'rgba(148, 163, 184, 0.12)';

  const badgeColor = isOwedToMe ? '#10b981' : isYouOwe ? '#ef4444' : colors.onSurfaceVariant;

  const initials = (balance.personName || 'Friend')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

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

        <View style={[styles.avatarCircle, { backgroundColor: colors.surfaceContainerHigh }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>{initials}</Text>
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
          {isOwedToMe ? '+' : ''}
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
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
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
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  heroMainAmount: {
    ...typography.headlineSm,
    fontSize: 28,
    fontWeight: '800',
  },
  peopleCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  peopleCountText: {
    ...typography.labelMd,
    fontWeight: '700',
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
    height: 40,
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
    fontWeight: '600',
  },
  metricAmount: {
    ...typography.headlineSm,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 1,
  },
  metricSubtext: {
    ...typography.bodyMd,
    fontSize: 11,
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
    borderRadius: 14,
  },
  quickActionBtnSmall: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionBtnText: {
    ...typography.labelMd,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    ...typography.headlineSm,
    fontSize: 17,
    fontWeight: '800',
  },
  sectionSubtitle: {
    ...typography.bodyMd,
    fontSize: 12,
    marginTop: 2,
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
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    fontWeight: '700',
  },
  peopleList: {
    gap: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 16,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    ...typography.headlineSm,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySubtitle: {
    ...typography.bodyMd,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 16,
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
  activityCardContainer: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  activityDivider: {
    height: 1,
    marginLeft: 54,
  },
  activityIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityInfo: {
    flex: 1,
  },
  activityDesc: {
    ...typography.bodyMd,
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 2,
  },
  activitySub: {
    ...typography.bodyMd,
    fontSize: 11,
  },
  activityAmountBox: {
    alignItems: 'flex-end',
  },
  activityAmount: {
    ...typography.labelMd,
    fontWeight: '800',
    fontSize: 13,
  },
  activityEmptyBox: {
    padding: 20,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  activityEmptyText: {
    ...typography.bodyMd,
    fontSize: 12,
  },
  fab: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 99,
  },
  fabText: {
    ...typography.labelMd,
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 20,
  },
  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    ...typography.headlineSm,
    fontSize: 18,
    fontWeight: '800',
  },
  chooserContainer: {
    gap: 10,
  },
  chooserItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  chooserIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chooserTextCol: {
    flex: 1,
  },
  chooserItemTitle: {
    ...typography.headlineSm,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  chooserItemSub: {
    ...typography.bodyMd,
    fontSize: 12,
  },
  formContainer: {
    gap: 8,
  },
  inputLabel: {
    ...typography.labelMd,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  formInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  submitBtn: {
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    ...typography.labelMd,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  personSelectorScroll: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  personChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 6,
  },
  personChipText: {
    ...typography.labelMd,
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 16,
  },
  noFriendsBox: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  debtTypeToggle: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 6,
  },
  debtTypeOption: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  debtTypeText: {
    ...typography.labelMd,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  // Person Card Styles
  personCardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
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
  nameCol: {
    flex: 1,
  },
  nameText: {
    ...typography.headlineSm,
    fontWeight: '700',
    fontSize: 15,
    marginBottom: 4,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    ...typography.labelMd,
    fontSize: 11,
    fontWeight: '700',
  },
  settledSubtext: {
    ...typography.bodyMd,
    fontSize: 11,
  },
  personCardRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
  },
  balanceAmount: {
    ...typography.headlineSm,
    fontWeight: '800',
    fontSize: 15,
  },
  quickSettleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  quickSettleText: {
    ...typography.labelMd,
    fontSize: 11,
    fontWeight: '700',
  },
});

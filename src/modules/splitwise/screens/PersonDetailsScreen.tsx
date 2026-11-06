import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  DeviceEventEmitter,
  Alert,
  Modal,
  Platform,
  Linking,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Text, Header } from '@/components/ui';
import { typography, useTheme, radius } from '@/theme';
import { useAppStore } from '@/store/use-app-store';
import { formatCurrencyPrivacy } from '@/utils/format';
import { useSplitwiseStore } from '../store/splitwise.store';
import { BalanceCalculator } from '../services/BalanceCalculator';
import type { Debt, Settlement } from '../types/splitwise.types';

type ActivityTab = 'ALL' | 'DEBTS' | 'SETTLEMENTS';

interface ActivityItem {
  id: string;
  kind: 'debt' | 'settlement';
  createdAt: string;
  debt?: Debt;
  settlement?: Settlement;
}

export function PersonDetailsScreen() {
  const { colors } = useTheme();
  const insets = useSafeInsets();
  const router = useRouter();
  const { hideBalances } = useAppStore();
  const { personId } = useLocalSearchParams<{ personId: string }>();

  const {
    people,
    debts,
    settlements,
    isLoading,
    loadAllData,
    updatePerson,
    deletePerson,
    deleteDebt,
    deleteSettlement,
  } = useSplitwiseStore();

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ActivityTab>('ALL');

  // Modal states - Edit Friend
  const [showEditPersonModal, setShowEditPersonModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const person = useMemo(() => people.find((p) => p.id === personId), [people, personId]);

  const personDebts = useMemo(
    () =>
      debts
        .filter((d) => d.personId === personId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [debts, personId]
  );

  const personSettlements = useMemo(
    () =>
      settlements
        .filter((s) => s.personId === personId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [settlements, personId]
  );

  const personBalance = useMemo(() => {
    if (!person) return null;
    return BalanceCalculator.calculatePersonBalance(person.id, debts, settlements, person);
  }, [person, debts, settlements]);

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

  const openEditModal = () => {
    if (!person) return;
    setEditName(person.name);
    setEditPhone(person.phone || '');
    setEditNotes(person.notes || '');
    setShowEditPersonModal(true);
  };

  const handleSaveEditPerson = async () => {
    if (!person || !editName.trim()) {
      Alert.alert('Required', 'Person name cannot be empty');
      return;
    }
    setIsSubmitting(true);
    try {
      await updatePerson(person.id, {
        name: editName.trim(),
        phone: editPhone.trim() || undefined,
        notes: editNotes.trim() || undefined,
      });
      setShowEditPersonModal(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to update person';
      Alert.alert('Error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePerson = () => {
    if (!person) return;
    Alert.alert(
      'Delete Friend',
      `Are you sure you want to delete ${person.name}? All associated debts and settlement records will also be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePerson(person.id);
              router.back();
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : 'Failed to delete friend';
              Alert.alert('Error', msg);
            }
          },
        },
      ]
    );
  };

  const handleDeleteDebt = (debt: Debt) => {
    Alert.alert(
      'Delete Debt',
      `Are you sure you want to delete "${debt.description}" (₹${debt.amount})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDebt(debt.id);
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : 'Failed to delete debt';
              Alert.alert('Error', msg);
            }
          },
        },
      ]
    );
  };

  const handleDeleteSettlement = (settlement: Settlement) => {
    Alert.alert(
      'Delete Settlement',
      `Are you sure you want to delete this settlement record of ₹${settlement.amount}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSettlement(settlement.id);
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : 'Failed to delete settlement';
              Alert.alert('Error', msg);
            }
          },
        },
      ]
    );
  };

  const handlePhoneCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Unable to open dialer', `Phone: ${phone}`);
    });
  };

  // Activity list filtered by active tab
  const activities = useMemo<ActivityItem[]>(() => {
    const list: ActivityItem[] = [];

    if (activeTab === 'ALL' || activeTab === 'DEBTS') {
      for (const d of personDebts) {
        list.push({
          id: `debt-${d.id}`,
          kind: 'debt',
          createdAt: d.createdAt,
          debt: d,
        });
      }
    }

    if (activeTab === 'ALL' || activeTab === 'SETTLEMENTS') {
      for (const s of personSettlements) {
        list.push({
          id: `settlement-${s.id}`,
          kind: 'settlement',
          createdAt: s.createdAt,
          settlement: s,
        });
      }
    }

    return list.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [personDebts, personSettlements, activeTab]);

  if (!person || !personBalance) {
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
        <Header title="Friend Details" showBack />
        <View style={styles.notFoundContainer}>
          <MaterialIcons name="person-off" size={48} color={colors.onSurfaceVariant} style={styles.emptyIcon} />
          <Text style={[styles.notFoundText, { color: colors.onSurfaceVariant }]}>
            Friend not found or may have been deleted.
          </Text>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
          >
            <Text style={[styles.backBtnText, { color: colors.onPrimary }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const isOwedToMe = personBalance.status === 'OWED_TO_ME';
  const isYouOwe = personBalance.status === 'YOU_OWE';
  const isSettled = personBalance.status === 'SETTLED';

  const balanceColor = isOwedToMe ? '#10b981' : isYouOwe ? '#ef4444' : colors.onSurface;
  const balanceBg = isOwedToMe
    ? 'rgba(16, 185, 129, 0.12)'
    : isYouOwe
      ? 'rgba(239, 68, 68, 0.12)'
      : colors.surfaceContainerHigh;

  const initials =
    person.name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() || '?';

  const personFirstName = person.name.split(' ')[0];

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
        title={person.name}
        showBack
        rightNode={
          <View style={styles.headerActions}>
            {person.phone && (
              <TouchableOpacity
                style={styles.headerBtn}
                onPress={() => handlePhoneCall(person.phone!)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="phone" size={20} color={colors.primary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={openEditModal}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="edit" size={20} color={colors.onSurface} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={handleDeletePerson}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="delete-outline" size={22} color={colors.error} />
            </TouchableOpacity>
          </View>
        }
      />

      <FlatList<ActivityItem>
        data={activities}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 40 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || isLoading}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <View style={styles.listHeaderContainer}>
            {/* HERO PROFILE CARD */}
            <View
              style={[
                styles.profileCard,
                {
                  backgroundColor: colors.surfaceContainerLow,
                  borderColor: colors.outlineVariant,
                },
              ]}
            >
              <View
                style={[
                  styles.avatarLarge,
                  {
                    backgroundColor: colors.primaryContainer,
                  },
                ]}
              >
                <Text style={[styles.avatarLargeText, { color: colors.onPrimaryContainer }]}>
                  {initials}
                </Text>
              </View>

              <Text style={[styles.personName, { color: colors.onSurface }]}>{person.name}</Text>

              {person.phone && (
                <TouchableOpacity
                  style={[styles.phonePill, { backgroundColor: colors.surfaceContainerHigh }]}
                  onPress={() => handlePhoneCall(person.phone!)}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="call" size={13} color={colors.primary} />
                  <Text style={[styles.personPhone, { color: colors.primary }]}>{person.phone}</Text>
                </TouchableOpacity>
              )}

              {person.notes && (
                <View
                  style={[
                    styles.notesContainer,
                    {
                      backgroundColor: colors.surfaceContainer,
                      borderColor: colors.outlineVariant,
                    },
                  ]}
                >
                  <MaterialIcons
                    name="notes"
                    size={14}
                    color={colors.onSurfaceVariant}
                    style={styles.notesIcon}
                  />
                  <Text style={[styles.notesText, { color: colors.onSurfaceVariant }]}>
                    {person.notes}
                  </Text>
                </View>
              )}

              {/* NET BALANCE HERO DISPLAY */}
              <View style={styles.balanceSection}>
                <Text style={[styles.balanceSubLabel, { color: colors.onSurfaceVariant }]}>
                  CURRENT BALANCE
                </Text>
                <Text style={[styles.balanceMainAmount, { color: balanceColor }]}>
                  {isOwedToMe ? '+' : isYouOwe ? '-' : ''}
                  {formatCurrencyPrivacy(Math.abs(personBalance.netBalance), hideBalances)}
                </Text>

                <View style={[styles.statusBadge, { backgroundColor: balanceBg }]}>
                  <Text style={[styles.statusBadgeText, { color: balanceColor }]}>
                    {personBalance.statusLabel}
                  </Text>
                </View>
              </View>

              {/* 3-COLUMN METRICS BREAKDOWN */}
              <View style={[styles.breakdownDivider, { backgroundColor: colors.outlineVariant }]} />

              <View style={styles.breakdownRow}>
                <View style={styles.breakdownCol}>
                  <Text style={[styles.breakdownLabel, { color: colors.onSurfaceVariant }]}>
                    Owed To You
                  </Text>
                  <Text style={[styles.breakdownValue, { color: '#10b981' }]}>
                    +{formatCurrencyPrivacy(personBalance.remainingReceivable, hideBalances)}
                  </Text>
                </View>

                <View style={[styles.verticalDivider, { backgroundColor: colors.outlineVariant }]} />

                <View style={styles.breakdownCol}>
                  <Text style={[styles.breakdownLabel, { color: colors.onSurfaceVariant }]}>
                    You Owe
                  </Text>
                  <Text style={[styles.breakdownValue, { color: '#ef4444' }]}>
                    -{formatCurrencyPrivacy(personBalance.remainingPayable ?? personBalance.totalPayable, hideBalances)}
                  </Text>
                </View>

                <View style={[styles.verticalDivider, { backgroundColor: colors.outlineVariant }]} />

                <View style={styles.breakdownCol}>
                  <Text style={[styles.breakdownLabel, { color: colors.onSurfaceVariant }]}>
                    Settled
                  </Text>
                  <Text style={[styles.breakdownValue, { color: colors.onSurfaceVariant }]}>
                    {formatCurrencyPrivacy(personBalance.totalSettled, hideBalances)}
                  </Text>
                </View>
              </View>
            </View>

            {/* ACTION BUTTONS */}
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  styles.actionBtnPrimary,
                  { backgroundColor: colors.primary },
                ]}
                onPress={() => {
                  router.push({
                    pathname: '/add-splitwise-settlement',
                    params: {
                      personId: person.id,
                      type: personBalance.status === 'YOU_OWE' ? 'YOU_PAID' : 'THEY_PAID',
                    },
                  });
                }}
                activeOpacity={0.85}
              >
                <MaterialIcons name="handshake" size={18} color={colors.onPrimary} />
                <Text style={[styles.actionBtnPrimaryText, { color: colors.onPrimary }]}>
                  Record Settlement
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  styles.actionBtnSecondary,
                  {
                    backgroundColor: colors.surfaceContainerHigh,
                    borderColor: colors.outlineVariant,
                  },
                ]}
                onPress={() => {
                  router.push({
                    pathname: '/add-splitwise-debt',
                    params: { personId: person.id },
                  });
                }}
                activeOpacity={0.85}
              >
                <MaterialIcons name="add" size={18} color={colors.onSurface} />
                <Text style={[styles.actionBtnSecondaryText, { color: colors.onSurface }]}>
                  Add Debt
                </Text>
              </TouchableOpacity>
            </View>

            {/* SEGMENTED ACTIVITY TABS */}
            <View
              style={[
                styles.tabContainer,
                {
                  backgroundColor: colors.surfaceContainerLow,
                  borderColor: colors.outlineVariant,
                },
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.tabItem,
                  activeTab === 'ALL' && { backgroundColor: colors.primary },
                ]}
                onPress={() => setActiveTab('ALL')}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.tabItemText,
                    {
                      color: activeTab === 'ALL' ? colors.onPrimary : colors.onSurfaceVariant,
                      fontFamily: activeTab === 'ALL' ? 'Manrope_700Bold' : 'Manrope_600SemiBold',
                    },
                  ]}
                >
                  All ({personDebts.length + personSettlements.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.tabItem,
                  activeTab === 'DEBTS' && { backgroundColor: colors.primary },
                ]}
                onPress={() => setActiveTab('DEBTS')}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.tabItemText,
                    {
                      color: activeTab === 'DEBTS' ? colors.onPrimary : colors.onSurfaceVariant,
                      fontFamily: activeTab === 'DEBTS' ? 'Manrope_700Bold' : 'Manrope_600SemiBold',
                    },
                  ]}
                >
                  Debts ({personDebts.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.tabItem,
                  activeTab === 'SETTLEMENTS' && { backgroundColor: colors.primary },
                ]}
                onPress={() => setActiveTab('SETTLEMENTS')}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.tabItemText,
                    {
                      color:
                        activeTab === 'SETTLEMENTS' ? colors.onPrimary : colors.onSurfaceVariant,
                      fontFamily:
                        activeTab === 'SETTLEMENTS' ? 'Manrope_700Bold' : 'Manrope_600SemiBold',
                    },
                  ]}
                >
                  Settled ({personSettlements.length})
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === 'debt' && item.debt) {
            const debt = item.debt;
            const isOweMe = debt.type === 'OWE_ME';
            const itemColor = isOweMe ? '#10b981' : '#ef4444';
            const itemBg = isOweMe ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)';

            return (
              <View
                style={[
                  styles.itemCard,
                  {
                    backgroundColor: colors.surfaceContainerLowest,
                    borderColor: colors.surfaceVariant,
                  },
                ]}
              >
                <View style={[styles.iconCircle, { backgroundColor: itemBg }]}>
                  <MaterialIcons
                    name={isOweMe ? 'call-received' : 'call-made'}
                    size={20}
                    color={itemColor}
                  />
                </View>

                <View style={styles.itemDetails}>
                  <Text style={[styles.itemTitle, { color: colors.onSurface }]} numberOfLines={1}>
                    {debt.description}
                  </Text>
                  <View style={styles.itemMetaRow}>
                    <Text style={[styles.itemDate, { color: colors.onSurfaceVariant }]}>
                      {formatDate(debt.createdAt)}
                    </Text>
                    <View style={[styles.metaDot, { backgroundColor: colors.outlineVariant }]} />
                    <Text style={[styles.itemTypeTag, { color: itemColor }]}>
                      {isOweMe ? 'Owed to you' : 'You owe'}
                    </Text>
                  </View>
                </View>

                <View style={styles.itemRight}>
                  <Text style={[styles.itemAmount, { color: itemColor }]}>
                    {isOweMe ? '+' : '-'}
                    {formatCurrencyPrivacy(debt.amount, hideBalances)}
                  </Text>
                  <TouchableOpacity
                    style={styles.itemDeleteBtn}
                    onPress={() => handleDeleteDebt(debt)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons name="delete-outline" size={16} color={colors.onSurfaceVariant} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }

          if (item.kind === 'settlement' && item.settlement) {
            const settlement = item.settlement;
            const isYouPaid = settlement.settlementType === 'YOU_PAID';
            const title = isYouPaid
              ? `You paid ${personFirstName}`
              : `${personFirstName} paid you`;

            return (
              <View
                style={[
                  styles.itemCard,
                  {
                    backgroundColor: colors.surfaceContainerLowest,
                    borderColor: colors.surfaceVariant,
                  },
                ]}
              >
                <View
                  style={[
                    styles.iconCircle,
                    {
                      backgroundColor: isYouPaid
                        ? 'rgba(239, 68, 68, 0.12)'
                        : 'rgba(16, 185, 129, 0.12)',
                    },
                  ]}
                >
                  <MaterialIcons
                    name={isYouPaid ? 'call-made' : 'call-received'}
                    size={20}
                    color={isYouPaid ? '#ef4444' : '#10b981'}
                  />
                </View>

                <View style={styles.itemDetails}>
                  <Text style={[styles.itemTitle, { color: colors.onSurface }]} numberOfLines={1}>
                    {settlement.description || title}
                  </Text>
                  <View style={styles.itemMetaRow}>
                    <Text style={[styles.itemDate, { color: colors.onSurfaceVariant }]}>
                      {formatDate(settlement.createdAt)}
                    </Text>
                    <View style={[styles.metaDot, { backgroundColor: colors.outlineVariant }]} />
                    <Text style={[styles.itemTypeTag, { color: colors.primary }]}>
                      {isYouPaid ? 'Paid by you' : 'Received'}
                    </Text>
                  </View>
                </View>

                <View style={styles.itemRight}>
                  <Text style={[styles.itemAmount, { color: colors.onSurface }]}>
                    {formatCurrencyPrivacy(settlement.amount, hideBalances)}
                  </Text>
                  <TouchableOpacity
                    style={styles.itemDeleteBtn}
                    onPress={() => handleDeleteSettlement(settlement)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons name="delete-outline" size={16} color={colors.onSurfaceVariant} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }

          return null;
        }}
        ListEmptyComponent={
          <View
            style={[
              styles.emptyCard,
              {
                backgroundColor: colors.surfaceContainerLow,
                borderColor: colors.outlineVariant,
              },
            ]}
          >
            <MaterialIcons
              name={activeTab === 'DEBTS' ? 'receipt-long' : 'handshake'}
              size={36}
              color={colors.onSurfaceVariant}
              style={{ marginBottom: 8 }}
            />
            <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>
              {activeTab === 'DEBTS'
                ? 'No Debts Recorded'
                : activeTab === 'SETTLEMENTS'
                  ? 'No Settlements Recorded'
                  : 'No Activity Yet'}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.onSurfaceVariant }]}>
              {activeTab === 'DEBTS'
                ? `You don't have any pending or past debts with ${personFirstName}.`
                : activeTab === 'SETTLEMENTS'
                  ? `No payment settlements recorded with ${personFirstName} yet.`
                  : `Start by recording a shared expense or settling a balance with ${personFirstName}.`}
            </Text>
          </View>
        }
      />

      {/* EDIT FRIEND MODAL */}
      <Modal
        visible={showEditPersonModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditPersonModal(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAwareScrollView
            contentContainerStyle={styles.modalScrollContainer}
            keyboardShouldPersistTaps="handled"
            enableOnAndroid
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View
              style={[
                styles.modalContent,
                {
                  backgroundColor: colors.surfaceContainerLowest,
                  borderColor: colors.outlineVariant,
                  paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 40 : 24),
                },
              ]}
            >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Edit Friend</Text>
              <TouchableOpacity
                onPress={() => setShowEditPersonModal(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={22} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.onSurfaceVariant }]}>Name *</Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: colors.surfaceContainerLow,
                  borderColor: colors.outlineVariant,
                  color: colors.onSurface,
                },
              ]}
              value={editName}
              onChangeText={setEditName}
              placeholder="Friend's name"
              placeholderTextColor={colors.onSurfaceVariant}
            />

            <Text style={[styles.fieldLabel, { color: colors.onSurfaceVariant }]}>Phone Number</Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: colors.surfaceContainerLow,
                  borderColor: colors.outlineVariant,
                  color: colors.onSurface,
                },
              ]}
              value={editPhone}
              onChangeText={setEditPhone}
              placeholder="e.g. +91 98765 43210"
              placeholderTextColor={colors.onSurfaceVariant}
              keyboardType="phone-pad"
            />

            <Text style={[styles.fieldLabel, { color: colors.onSurfaceVariant }]}>
              Notes / Relation
            </Text>
            <TextInput
              style={[
                styles.textInput,
                styles.notesAreaInput,
                {
                  backgroundColor: colors.surfaceContainerLow,
                  borderColor: colors.outlineVariant,
                  color: colors.onSurface,
                },
              ]}
              value={editNotes}
              onChangeText={setEditNotes}
              placeholder="e.g. Roommate, Colleague, Trip buddy"
              placeholderTextColor={colors.onSurfaceVariant}
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.primary }]}
              onPress={handleSaveEditPerson}
              disabled={isSubmitting}
              activeOpacity={0.85}
            >
              <Text style={[styles.submitBtnText, { color: colors.onPrimary }]}>
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollView>
      </View>
    </Modal>
    </View>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = d.toDateString() === yesterday.toDateString();

    if (isToday) return 'Today';
    if (isYesterday) return 'Yesterday';

    return d.toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  } catch {
    return 'Recent';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerBtn: {
    padding: 4,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  listHeaderContainer: {
    marginBottom: 4,
  },
  notFoundContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyIcon: {
    marginBottom: 12,
  },
  notFoundText: {
    ...typography.bodyMd,
    textAlign: 'center',
    marginBottom: 16,
  },
  backBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  backBtnText: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
  },
  profileCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    marginBottom: 14,
  },
  avatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarLargeText: {
    ...typography.headlineSm,
    fontFamily: 'Manrope_700Bold',
    fontSize: 22,
    lineHeight: 28,
  },
  personName: {
    ...typography.headlineSm,
    fontFamily: 'Manrope_700Bold',
    fontSize: 20,
    lineHeight: 26,
    marginBottom: 2,
    textAlign: 'center',
  },
  phonePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    marginTop: 4,
  },
  personPhone: {
    ...typography.labelMd,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Manrope_600SemiBold',
  },
  notesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginTop: 6,
    maxWidth: '92%',
  },
  notesIcon: {
    marginRight: 6,
  },
  notesText: {
    ...typography.bodyMd,
    fontSize: 12,
    lineHeight: 16,
  },
  balanceSection: {
    alignItems: 'center',
    marginTop: 16,
    width: '100%',
  },
  balanceSubLabel: {
    ...typography.labelMd,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    fontFamily: 'Manrope_700Bold',
  },
  balanceMainAmount: {
    ...typography.displayLg,
    fontFamily: 'Manrope_700Bold',
    fontSize: 32,
    lineHeight: 40,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.full,
    marginTop: 6,
  },
  statusBadgeText: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
    lineHeight: 16,
  },
  breakdownDivider: {
    height: 1,
    width: '100%',
    marginVertical: 16,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  breakdownCol: {
    flex: 1,
    alignItems: 'center',
  },
  verticalDivider: {
    width: 1,
    height: 32,
  },
  breakdownLabel: {
    ...typography.labelMd,
    fontSize: 11,
    lineHeight: 14,
    marginBottom: 4,
  },
  breakdownValue: {
    ...typography.headlineSm,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Manrope_700Bold',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    gap: 6,
  },
  actionBtnPrimary: {},
  actionBtnPrimaryText: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
    lineHeight: 18,
  },
  actionBtnSecondary: {
    borderWidth: 1,
  },
  actionBtnSecondaryText: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
    lineHeight: 18,
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 3,
    borderWidth: 1,
    marginBottom: 10,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  tabItemText: {
    ...typography.labelMd,
    fontSize: 12,
    lineHeight: 16,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemDetails: {
    flex: 1,
  },
  itemTitle: {
    ...typography.bodyMd,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    lineHeight: 18,
    marginBottom: 2,
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemDate: {
    ...typography.bodyMd,
    fontSize: 11,
    lineHeight: 14,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  itemTypeTag: {
    ...typography.labelMd,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Manrope_600SemiBold',
  },
  itemRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  itemAmount: {
    ...typography.headlineSm,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Manrope_700Bold',
  },
  itemDeleteBtn: {
    padding: 2,
  },
  emptyCard: {
    padding: 24,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  emptyTitle: {
    ...typography.headlineSm,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Manrope_700Bold',
    marginBottom: 4,
  },
  emptySubtitle: {
    ...typography.bodyMd,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalScrollContainer: {
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
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
    marginBottom: 12,
  },
  modalTitle: {
    ...typography.headlineSm,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    lineHeight: 24,
  },
  fieldLabel: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 6,
    marginTop: 8,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...typography.bodyMd,
    fontSize: 14,
    marginBottom: 8,
  },
  notesAreaInput: {
    height: 72,
    textAlignVertical: 'top',
  },
  submitBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radius.md,
    marginTop: 14,
  },
  submitBtnText: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    lineHeight: 18,
  },
});

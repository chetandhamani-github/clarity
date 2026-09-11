import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  DeviceEventEmitter,
  Alert,
  Modal,
  Platform,
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Text, Header } from '@/components/ui';
import { typography, useTheme, radius } from '@/theme';
import { useAppStore } from '@/store/use-app-store';
import { formatCurrencyPrivacy } from '@/utils/format';
import { useSplitwiseStore } from '../store/splitwise.store';
import { BalanceCalculator } from '../services/BalanceCalculator';
import type {
  Debt,
  Settlement,
  DebtType,
} from '../types/splitwise.types';

interface DebtSection {
  title: string;
  type: 'debt';
  icon: keyof typeof MaterialIcons.glyphMap;
  data: Debt[];
}

interface SettlementSection {
  title: string;
  type: 'settlement';
  icon: keyof typeof MaterialIcons.glyphMap;
  data: Settlement[];
}

type SplitwiseSection = DebtSection | SettlementSection;

export function PersonDetailsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
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
    addDebt,
    deleteDebt,
    addSettlement,
    deleteSettlement,
  } = useSplitwiseStore();

  const [refreshing, setRefreshing] = useState(false);

  // Modal states
  const [showAddDebtModal, setShowAddDebtModal] = useState(false);
  const [showAddSettlementModal, setShowAddSettlementModal] = useState(false);
  const [showEditPersonModal, setShowEditPersonModal] = useState(false);

  // Form states - Add Debt
  const [debtAmount, setDebtAmount] = useState('');
  const [debtType, setDebtType] = useState<DebtType>('OWE_ME');
  const [debtDescription, setDebtDescription] = useState('');

  // Form states - Add Settlement
  const [settlementAmount, setSettlementAmount] = useState('');
  const [settlementDescription, setSettlementDescription] = useState('');

  // Form states - Edit Person
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const person = useMemo(() => people.find((p) => p.id === personId), [people, personId]);

  const personDebts = useMemo(
    () => debts.filter((d) => d.personId === personId).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ),
    [debts, personId]
  );

  const personSettlements = useMemo(
    () => settlements.filter((s) => s.personId === personId).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ),
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

  // Init edit fields when person loads or modal opens
  const openEditModal = () => {
    if (!person) return;
    setEditName(person.name);
    setEditPhone(person.phone || '');
    setEditNotes(person.notes || '');
    setShowEditPersonModal(true);
  };

  const openAddSettlementModal = () => {
    if (!personBalance) return;
    const remainingReceivable = personBalance.remainingReceivable;
    if (remainingReceivable > 0) {
      setSettlementAmount(remainingReceivable.toString());
    } else if (personBalance.totalPayable > 0) {
      setSettlementAmount(personBalance.totalPayable.toString());
    } else {
      setSettlementAmount('');
    }
    setSettlementDescription('Cash / UPI Settlement');
    setShowAddSettlementModal(true);
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

  const handleSaveDebt = async () => {
    if (!person) return;
    const parsedAmount = parseFloat(debtAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than 0');
      return;
    }
    if (!debtDescription.trim()) {
      Alert.alert('Required', 'Please enter a description for this debt');
      return;
    }

    setIsSubmitting(true);
    try {
      await addDebt({
        personId: person.id,
        amount: parsedAmount,
        type: debtType,
        description: debtDescription.trim(),
      });
      setDebtAmount('');
      setDebtDescription('');
      setShowAddDebtModal(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to record debt';
      Alert.alert('Error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveSettlement = async () => {
    if (!person) return;
    const parsedAmount = parseFloat(settlementAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than 0');
      return;
    }

    setIsSubmitting(true);
    try {
      await addSettlement({
        personId: person.id,
        amount: parsedAmount,
        description: settlementDescription.trim() || undefined,
      });
      setSettlementAmount('');
      setSettlementDescription('');
      setShowAddSettlementModal(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to record settlement';
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

  if (!person || !personBalance) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
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
  const badgeColor = isOwedToMe ? '#10b981' : isYouOwe ? '#ef4444' : colors.onSurfaceVariant;
  const badgeBg = isOwedToMe
    ? 'rgba(16, 185, 129, 0.12)'
    : isYouOwe
      ? 'rgba(239, 68, 68, 0.12)'
      : 'rgba(148, 163, 184, 0.12)';

  const initials = person.name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || '?';

  const sections: SplitwiseSection[] = [
    {
      title: 'Debt History',
      type: 'debt',
      icon: 'receipt-long',
      data: personDebts,
    },
    {
      title: 'Settlement History',
      type: 'settlement',
      icon: 'handshake',
      data: personSettlements,
    },
  ];

  const quickDebtTags = ['Lunch / Dinner', 'Groceries', 'Movie Tickets', 'Cab / Travel', 'Shopping', 'Shared Bill'];

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Header
        title={person.name}
        showBack
        rightNode={
          <View style={styles.headerActions}>
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
              <MaterialIcons name="delete-outline" size={22} color="#ef4444" />
            </TouchableOpacity>
          </View>
        }
      />

      <SectionList<Debt | Settlement, SplitwiseSection>
        sections={sections}
        keyExtractor={(item) => item.id}
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
        ListHeaderComponent={
          <View style={styles.listHeaderContainer}>
            {/* Person Information Hero Card */}
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
                    backgroundColor: isOwedToMe
                      ? 'rgba(16, 185, 129, 0.15)'
                      : isYouOwe
                        ? 'rgba(239, 68, 68, 0.15)'
                        : colors.surfaceContainerHigh,
                  },
                ]}
              >
                <Text style={[styles.avatarLargeText, { color: badgeColor }]}>{initials}</Text>
              </View>

              <Text style={[styles.personName, { color: colors.onSurface }]}>{person.name}</Text>

              {person.phone && (
                <TouchableOpacity
                  style={styles.phoneRow}
                  onPress={() => handlePhoneCall(person.phone!)}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="phone" size={14} color={colors.primary} />
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
                  <MaterialIcons name="notes" size={14} color={colors.onSurfaceVariant} style={styles.notesIcon} />
                  <Text style={[styles.notesText, { color: colors.onSurfaceVariant }]}>{person.notes}</Text>
                </View>
              )}

              <Text style={[styles.memberSinceText, { color: colors.onSurfaceVariant }]}>
                Member since {formatDate(person.createdAt)}
              </Text>

              {/* Status Badge */}
              <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
                <Text style={[styles.statusBadgeText, { color: badgeColor }]}>
                  {personBalance.statusLabel} {formatCurrencyPrivacy(Math.abs(personBalance.netBalance), hideBalances)}
                </Text>
              </View>

              {/* Breakdown Grid */}
              <View style={[styles.breakdownDivider, { backgroundColor: colors.outlineVariant }]} />

              <View style={styles.breakdownRow}>
                <View style={styles.breakdownCol}>
                  <Text style={[styles.breakdownLabel, { color: colors.onSurfaceVariant }]}>Owed To You</Text>
                  <Text style={[styles.breakdownValue, { color: '#10b981' }]}>
                    +{formatCurrencyPrivacy(personBalance.totalReceivable, hideBalances)}
                  </Text>
                </View>

                <View style={[styles.verticalDivider, { backgroundColor: colors.outlineVariant }]} />

                <View style={styles.breakdownCol}>
                  <Text style={[styles.breakdownLabel, { color: colors.onSurfaceVariant }]}>You Owe</Text>
                  <Text style={[styles.breakdownValue, { color: '#ef4444' }]}>
                    -{formatCurrencyPrivacy(personBalance.totalPayable, hideBalances)}
                  </Text>
                </View>

                <View style={[styles.verticalDivider, { backgroundColor: colors.outlineVariant }]} />

                <View style={styles.breakdownCol}>
                  <Text style={[styles.breakdownLabel, { color: colors.onSurfaceVariant }]}>Settled</Text>
                  <Text style={[styles.breakdownValue, { color: '#06b6d4' }]}>
                    {formatCurrencyPrivacy(personBalance.totalSettled, hideBalances)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Quick Actions Row */}
            <View style={styles.actionButtonsRow}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnDebt, { backgroundColor: '#10b981' }]}
                onPress={() => {
                  router.push({
                    pathname: '/add-splitwise-debt',
                    params: { personId: person.id },
                  });
                }}
                activeOpacity={0.8}
              >
                <MaterialIcons name="add" size={18} color="#ffffff" />
                <Text style={styles.actionBtnText}>Add Debt</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnSettle, { backgroundColor: '#06b6d4' }]}
                onPress={() => {
                  router.push({
                    pathname: '/add-splitwise-settlement',
                    params: { personId: person.id },
                  });
                }}
                activeOpacity={0.8}
              >
                <MaterialIcons name="handshake" size={18} color="#ffffff" />
                <Text style={styles.actionBtnText}>Record Settlement</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  styles.actionBtnEdit,
                  {
                    backgroundColor: colors.surfaceContainerHigh,
                    borderColor: colors.outlineVariant,
                  },
                ]}
                onPress={openEditModal}
                activeOpacity={0.8}
              >
                <MaterialIcons name="edit" size={16} color={colors.onSurface} />
                <Text style={[styles.actionBtnText, { color: colors.onSurface }]}>Edit</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View
            style={[
              styles.sectionHeaderContainer,
              {
                backgroundColor: colors.background,
              },
            ]}
          >
            <View style={styles.sectionHeaderTitleRow}>
              <MaterialIcons
                name={section.icon}
                size={18}
                color={section.type === 'debt' ? '#10b981' : '#06b6d4'}
              />
              <Text style={[styles.sectionHeaderText, { color: colors.onSurface }]}>
                {section.title}
              </Text>
            </View>
            <View
              style={[
                styles.sectionBadge,
                {
                  backgroundColor: colors.surfaceContainerHigh,
                },
              ]}
            >
              <Text style={[styles.sectionBadgeText, { color: colors.onSurfaceVariant }]}>
                {section.data.length}
              </Text>
            </View>
          </View>
        )}
        renderItem={({ item, section }) => {
          if (section.type === 'debt') {
            const debt = item as Debt;
            const isOweMe = debt.type === 'OWE_ME';
            const itemColor = isOweMe ? '#10b981' : '#ef4444';
            const itemBg = isOweMe ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)';

            return (
              <View
                style={[
                  styles.itemCard,
                  {
                    backgroundColor: colors.surfaceContainerLow,
                    borderColor: colors.outlineVariant,
                  },
                ]}
              >
                <View style={[styles.iconCircle, { backgroundColor: itemBg }]}>
                  <MaterialIcons
                    name={isOweMe ? 'call-received' : 'call-made'}
                    size={18}
                    color={itemColor}
                  />
                </View>

                <View style={styles.itemDetails}>
                  <Text style={[styles.itemTitle, { color: colors.onSurface }]}>{debt.description}</Text>
                  <View style={styles.itemMetaRow}>
                    <Text style={[styles.itemDate, { color: colors.onSurfaceVariant }]}>
                      {formatDate(debt.createdAt)}
                    </Text>
                    <View style={styles.metaDot} />
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

          const settlement = item as Settlement;
          return (
            <View
              style={[
                styles.itemCard,
                {
                  backgroundColor: colors.surfaceContainerLow,
                  borderColor: colors.outlineVariant,
                },
              ]}
            >
              <View style={[styles.iconCircle, { backgroundColor: 'rgba(6, 182, 212, 0.12)' }]}>
                <MaterialIcons name="handshake" size={18} color="#06b6d4" />
              </View>

              <View style={styles.itemDetails}>
                <Text style={[styles.itemTitle, { color: colors.onSurface }]}>
                  {settlement.description || 'Settlement Payment'}
                </Text>
                <View style={styles.itemMetaRow}>
                  <Text style={[styles.itemDate, { color: colors.onSurfaceVariant }]}>
                    {formatDate(settlement.createdAt)}
                  </Text>
                  <View style={styles.metaDot} />
                  <Text style={[styles.itemTypeTag, { color: '#06b6d4' }]}>Settled</Text>
                </View>
              </View>

              <View style={styles.itemRight}>
                <Text style={[styles.itemAmount, { color: '#06b6d4' }]}>
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
        }}
        renderSectionFooter={({ section }) => {
          if (section.data.length === 0) {
            return (
              <View
                style={[
                  styles.sectionEmptyBox,
                  {
                    backgroundColor: colors.surfaceContainerLow,
                    borderColor: colors.outlineVariant,
                  },
                ]}
              >
                <MaterialIcons
                  name={section.type === 'debt' ? 'receipt-long' : 'handshake'}
                  size={24}
                  color={colors.onSurfaceVariant}
                  style={styles.emptySectionIcon}
                />
                <Text style={[styles.sectionEmptyText, { color: colors.onSurfaceVariant }]}>
                  {section.type === 'debt'
                    ? `No debts recorded with ${person.name} yet.`
                    : `No settlements recorded with ${person.name} yet.`}
                </Text>
              </View>
            );
          }
          return <View style={styles.sectionSpacer} />;
        }}
      />

      {/* ========================================================================= */}
      {/* ADD DEBT MODAL */}
      {/* ========================================================================= */}
      <Modal
        visible={showAddDebtModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddDebtModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: colors.surface,
                borderColor: colors.outlineVariant,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Add Debt</Text>
              <TouchableOpacity
                onPress={() => setShowAddDebtModal(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={24} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSub, { color: colors.onSurfaceVariant }]}>
              Recording debt with <Text style={styles.bold}>{person.name}</Text>
            </Text>

            {/* Debt Type Selector */}
            <View
              style={[
                styles.typeToggleContainer,
                {
                  backgroundColor: colors.surfaceContainerHigh,
                },
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.typeToggleBtn,
                  debtType === 'OWE_ME' && {
                    backgroundColor: '#10b981',
                  },
                ]}
                onPress={() => setDebtType('OWE_ME')}
              >
                <MaterialIcons
                  name="call-received"
                  size={16}
                  color={debtType === 'OWE_ME' ? '#ffffff' : colors.onSurfaceVariant}
                />
                <Text
                  style={[
                    styles.typeToggleText,
                    {
                      color: debtType === 'OWE_ME' ? '#ffffff' : colors.onSurfaceVariant,
                      fontWeight: debtType === 'OWE_ME' ? '700' : '500',
                    },
                  ]}
                >
                  They Owe Me
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.typeToggleBtn,
                  debtType === 'I_OWE' && {
                    backgroundColor: '#ef4444',
                  },
                ]}
                onPress={() => setDebtType('I_OWE')}
              >
                <MaterialIcons
                  name="call-made"
                  size={16}
                  color={debtType === 'I_OWE' ? '#ffffff' : colors.onSurfaceVariant}
                />
                <Text
                  style={[
                    styles.typeToggleText,
                    {
                      color: debtType === 'I_OWE' ? '#ffffff' : colors.onSurfaceVariant,
                      fontWeight: debtType === 'I_OWE' ? '700' : '500',
                    },
                  ]}
                >
                  I Owe Them
                </Text>
              </TouchableOpacity>
            </View>

            {/* Amount Input */}
            <Text style={[styles.fieldLabel, { color: colors.onSurfaceVariant }]}>Amount (₹) *</Text>
            <View
              style={[
                styles.amountInputContainer,
                {
                  backgroundColor: colors.surfaceContainerLow,
                  borderColor: colors.outlineVariant,
                },
              ]}
            >
              <Text style={[styles.amountCurrencyPrefix, { color: colors.onSurface }]}>₹</Text>
              <TextInput
                style={[styles.amountInput, { color: colors.onSurface }]}
                placeholder="0.00"
                placeholderTextColor={colors.onSurfaceVariant}
                keyboardType="numeric"
                value={debtAmount}
                onChangeText={setDebtAmount}
                autoFocus
              />
            </View>

            {/* Description Input */}
            <Text style={[styles.fieldLabel, { color: colors.onSurfaceVariant }]}>Description *</Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: colors.surfaceContainerLow,
                  borderColor: colors.outlineVariant,
                  color: colors.onSurface,
                },
              ]}
              placeholder="e.g. Dinner, Movie ticket, Groceries"
              placeholderTextColor={colors.onSurfaceVariant}
              value={debtDescription}
              onChangeText={setDebtDescription}
            />

            {/* Quick Description Suggestions */}
            <View style={styles.quickTagsContainer}>
              {quickDebtTags.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  style={[
                    styles.quickTagPill,
                    {
                      backgroundColor:
                        debtDescription === tag
                          ? colors.primaryContainer
                          : colors.surfaceContainerHigh,
                    },
                  ]}
                  onPress={() => setDebtDescription(tag)}
                >
                  <Text
                    style={[
                      styles.quickTagText,
                      {
                        color:
                          debtDescription === tag
                            ? colors.onPrimaryContainer
                            : colors.onSurfaceVariant,
                      },
                    ]}
                  >
                    {tag}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[
                styles.submitBtn,
                {
                  backgroundColor: debtType === 'OWE_ME' ? '#10b981' : '#ef4444',
                },
              ]}
              onPress={handleSaveDebt}
              disabled={isSubmitting}
            >
              <Text style={styles.submitBtnText}>
                {isSubmitting ? 'Saving...' : 'Record Debt'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* RECORD SETTLEMENT MODAL */}
      {/* ========================================================================= */}
      <Modal
        visible={showAddSettlementModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddSettlementModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: colors.surface,
                borderColor: colors.outlineVariant,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Record Settlement</Text>
              <TouchableOpacity
                onPress={() => setShowAddSettlementModal(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={24} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSub, { color: colors.onSurfaceVariant }]}>
              Record a payment with <Text style={styles.bold}>{person.name}</Text>
            </Text>

            {/* Amount Input */}
            <Text style={[styles.fieldLabel, { color: colors.onSurfaceVariant }]}>Amount Settled (₹) *</Text>
            <View
              style={[
                styles.amountInputContainer,
                {
                  backgroundColor: colors.surfaceContainerLow,
                  borderColor: colors.outlineVariant,
                },
              ]}
            >
              <Text style={[styles.amountCurrencyPrefix, { color: colors.onSurface }]}>₹</Text>
              <TextInput
                style={[styles.amountInput, { color: colors.onSurface }]}
                placeholder="0.00"
                placeholderTextColor={colors.onSurfaceVariant}
                keyboardType="numeric"
                value={settlementAmount}
                onChangeText={setSettlementAmount}
                autoFocus
              />
            </View>

            {/* Quick Settle Pill */}
            {personBalance.remainingReceivable > 0 && (
              <TouchableOpacity
                style={[
                  styles.quickSettleBanner,
                  {
                    backgroundColor: 'rgba(6, 182, 212, 0.12)',
                    borderColor: 'rgba(6, 182, 212, 0.3)',
                  },
                ]}
                onPress={() => setSettlementAmount(personBalance.remainingReceivable.toString())}
              >
                <MaterialIcons name="auto-fix-high" size={16} color="#06b6d4" />
                <Text style={styles.quickSettleText}>
                  Settle full remaining balance: ₹{personBalance.remainingReceivable}
                </Text>
              </TouchableOpacity>
            )}

            {/* Description Input */}
            <Text style={[styles.fieldLabel, { color: colors.onSurfaceVariant }]}>Payment Note</Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: colors.surfaceContainerLow,
                  borderColor: colors.outlineVariant,
                  color: colors.onSurface,
                },
              ]}
              placeholder="e.g. UPI, GPay, Cash, Bank Transfer"
              placeholderTextColor={colors.onSurfaceVariant}
              value={settlementDescription}
              onChangeText={setSettlementDescription}
            />

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: '#06b6d4' }]}
              onPress={handleSaveSettlement}
              disabled={isSubmitting}
            >
              <Text style={styles.submitBtnText}>
                {isSubmitting ? 'Recording...' : 'Confirm Settlement'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ========================================================================= */}
      {/* EDIT PERSON MODAL */}
      {/* ========================================================================= */}
      <Modal
        visible={showEditPersonModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditPersonModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: colors.surface,
                borderColor: colors.outlineVariant,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Edit Friend</Text>
              <TouchableOpacity
                onPress={() => setShowEditPersonModal(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={24} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            {/* Name Input */}
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
              placeholder="Friend's Full Name"
              placeholderTextColor={colors.onSurfaceVariant}
              value={editName}
              onChangeText={setEditName}
            />

            {/* Phone Input */}
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
              placeholder="+91 9876543210"
              placeholderTextColor={colors.onSurfaceVariant}
              keyboardType="phone-pad"
              value={editPhone}
              onChangeText={setEditPhone}
            />

            {/* Notes Input */}
            <Text style={[styles.fieldLabel, { color: colors.onSurfaceVariant }]}>Notes / Relation</Text>
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
              placeholder="e.g. College roommate, Office colleague"
              placeholderTextColor={colors.onSurfaceVariant}
              multiline
              numberOfLines={3}
              value={editNotes}
              onChangeText={setEditNotes}
            />

            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.primary }]}
              onPress={handleSaveEditPerson}
              disabled={isSubmitting}
            >
              <Text style={[styles.submitBtnText, { color: colors.onPrimary }]}>
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
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
    gap: 8,
  },
  headerBtn: {
    padding: 6,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  listHeaderContainer: {
    marginBottom: 8,
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
    fontSize: 14,
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
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  profileCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarLarge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  avatarLargeText: {
    ...typography.headlineSm,
    fontSize: 22,
    fontWeight: '800',
  },
  personName: {
    ...typography.headlineSm,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  personPhone: {
    ...typography.bodyMd,
    fontSize: 13,
    fontWeight: '600',
  },
  notesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginTop: 4,
    marginBottom: 6,
    maxWidth: '90%',
  },
  notesIcon: {
    marginRight: 6,
  },
  notesText: {
    ...typography.bodyMd,
    fontSize: 12,
  },
  memberSinceText: {
    ...typography.bodyMd,
    fontSize: 11,
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginTop: 2,
  },
  statusBadgeText: {
    ...typography.labelMd,
    fontSize: 13,
    fontWeight: '700',
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
    height: 36,
  },
  breakdownLabel: {
    ...typography.labelMd,
    fontSize: 11,
    marginBottom: 2,
  },
  breakdownValue: {
    ...typography.headlineSm,
    fontSize: 13,
    fontWeight: '800',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    gap: 4,
  },
  actionBtnDebt: {
    flex: 1.2,
  },
  actionBtnSettle: {
    flex: 1.5,
  },
  actionBtnEdit: {
    flex: 0.8,
    borderWidth: 1,
  },
  actionBtnText: {
    ...typography.labelMd,
    color: '#ffffff',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  sectionHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  sectionHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeaderText: {
    ...typography.headlineSm,
    fontSize: 15,
    fontWeight: '700',
  },
  sectionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  sectionBadgeText: {
    ...typography.labelMd,
    fontSize: 11,
    fontWeight: '700',
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemDetails: {
    flex: 1,
  },
  itemTitle: {
    ...typography.bodyMd,
    fontSize: 14,
    fontWeight: '700',
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
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#94a3b8',
  },
  itemTypeTag: {
    ...typography.labelMd,
    fontSize: 11,
    fontWeight: '600',
  },
  itemRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  itemAmount: {
    ...typography.headlineSm,
    fontSize: 14,
    fontWeight: '800',
  },
  itemDeleteBtn: {
    padding: 2,
  },
  sectionEmptyBox: {
    padding: 20,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptySectionIcon: {
    marginBottom: 6,
  },
  sectionEmptyText: {
    ...typography.bodyMd,
    fontSize: 12,
    textAlign: 'center',
  },
  sectionSpacer: {
    height: 8,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
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
    marginBottom: 4,
  },
  modalTitle: {
    ...typography.headlineSm,
    fontSize: 18,
    fontWeight: '800',
  },
  modalSub: {
    ...typography.bodyMd,
    fontSize: 13,
    marginBottom: 16,
  },
  bold: {
    fontWeight: '700',
  },
  typeToggleContainer: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  typeToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radius.sm,
    gap: 6,
  },
  typeToggleText: {
    ...typography.labelMd,
    fontSize: 13,
  },
  fieldLabel: {
    ...typography.labelMd,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 6,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  amountCurrencyPrefix: {
    ...typography.headlineSm,
    fontSize: 20,
    fontWeight: '800',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    ...typography.headlineSm,
    fontSize: 20,
    fontWeight: '800',
    paddingVertical: 10,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...typography.bodyMd,
    fontSize: 14,
    marginBottom: 12,
  },
  notesAreaInput: {
    height: 72,
    textAlignVertical: 'top',
  },
  quickTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  quickTagPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  quickTagText: {
    ...typography.bodyMd,
    fontSize: 11,
    fontWeight: '600',
  },
  quickSettleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: 6,
    marginBottom: 12,
  },
  quickSettleText: {
    ...typography.labelMd,
    fontSize: 12,
    fontWeight: '700',
    color: '#06b6d4',
  },
  submitBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: radius.md,
    marginTop: 8,
  },
  submitBtnText: {
    ...typography.labelMd,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
});

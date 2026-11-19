import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  DeviceEventEmitter,
  Platform,
  Alert,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Text, Header, useAlert, useToast } from '@/components/ui';
import { typography, useTheme, radius } from '@/theme';
import { useAppStore } from '@/store/use-app-store';
import { formatCurrencyPrivacy, formatLocalDate, parseDateSafely } from '@/utils/format';
import { useSplitwiseStore } from '../store/splitwise.store';
import { BalanceCalculator } from '../services/BalanceCalculator';
import type { ExpenseWithSplits, SimplifiedDebt } from '../types/splitwise.types';

type GroupTab = 'EXPENSES' | 'BALANCES';

export function GroupDetailsScreen() {
  const { colors } = useTheme();
  const insets = useSafeInsets();
  const router = useRouter();
  const { hideBalances } = useAppStore();
  const { showAlert } = useAlert();
  const { showToast } = useToast();
  const { groupId } = useLocalSearchParams<{ groupId: string }>();

  const {
    people,
    groups,
    activeGroupId,
    activeGroupExpenses,
    activeGroupBalances,
    activeGroupMembers,
    loadGroupDetails,
    addGroupMembers,
    deleteGroup,
    deleteExpense,
    loadAllData,
  } = useSplitwiseStore();

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<GroupTab>('EXPENSES');
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [selectedAddMemberIds, setSelectedAddMemberIds] = useState<string[]>([]);

  const group = useMemo(() => groups.find((g) => g.id === groupId), [groups, groupId]);

  const candidateFriends = useMemo(() => {
    const existingIds = new Set(activeGroupMembers.map((m) => m.id));
    return people.filter((p) => !existingIds.has(p.id) && p.id !== 'current_user');
  }, [people, activeGroupMembers]);

  const loadData = useCallback(async () => {
    if (!groupId) return;
    await loadGroupDetails(groupId);
  }, [groupId, loadGroupDetails]);

  useEffect(() => {
    loadData();
    const sub = DeviceEventEmitter.addListener('splitwiseUpdated', loadData);
    return () => {
      sub.remove();
    };
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadData(), loadAllData()]);
    setRefreshing(false);
  }, [loadData, loadAllData]);

  // Compute simplified debts across group members
  const simplifiedDebts: SimplifiedDebt[] = useMemo(() => {
    if (!activeGroupBalances?.members) return [];
    return BalanceCalculator.simplifyDebts(
      activeGroupBalances.members.map((m) => ({
        personId: m.person.id,
        personName: m.person.name,
        netBalance: m.netBalance,
      }))
    );
  }, [activeGroupBalances]);

  const handleAddMembers = async () => {
    if (!groupId || selectedAddMemberIds.length === 0) return;
    try {
      await addGroupMembers(groupId, selectedAddMemberIds);
      showToast('Members added to group', 'success');
      setSelectedAddMemberIds([]);
      setShowAddMemberModal(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to add members';
      showAlert('Error', msg);
    }
  };

  const toggleSelectCandidate = (personId: string) => {
    setSelectedAddMemberIds((prev) =>
      prev.includes(personId) ? prev.filter((id) => id !== personId) : [...prev, personId]
    );
  };

  const handleDeleteGroup = () => {
    showAlert(
      'Delete Group',
      `Are you sure you want to delete "${group?.name || 'this group'}"? All group expenses and splits will be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (groupId) {
                await deleteGroup(groupId);
                showToast('Group deleted successfully', 'success');
                router.back();
              }
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Failed to delete group';
              showAlert('Error', msg);
            }
          },
        },
      ]
    );
  };

  const handleDeleteExpense = (expense: ExpenseWithSplits) => {
    showAlert(
      'Delete Expense',
      `Delete "${expense.description}" (₹${expense.amount})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteExpense(expense.id);
              showToast('Expense deleted', 'success');
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Failed to delete expense';
              showAlert('Error', msg);
            }
          },
        },
      ]
    );
  };

  const totalSpend = activeGroupBalances?.totalGroupSpend || 0;
  const memberCount = activeGroupMembers.length;
  const myBalance = activeGroupBalances?.myBalance ?? 0;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
        },
      ]}
    >
      <Header
        title={group?.name || 'Group Details'}
        showBack
        rightNode={
          <TouchableOpacity
            onPress={handleDeleteGroup}
            style={styles.headerIconBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="delete-outline" size={22} color={colors.error} />
          </TouchableOpacity>
        }
      />

      {/* OVERVIEW HERO CARD */}
      <View style={styles.overviewContainer}>
        <View
          style={[
            styles.overviewCard,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          <View style={styles.groupHeaderRow}>
            <View
              style={[
                styles.groupIconCircle,
                { backgroundColor: colors.primaryContainer },
              ]}
            >
              <MaterialIcons
                name={(group?.icon as any) || 'group'}
                size={24}
                color={colors.onPrimaryContainer}
              />
            </View>
            <View style={styles.groupInfoCol}>
              <Text style={[styles.groupTitle, { color: colors.onSurface }]}>
                {group?.name}
              </Text>
              <Text style={[styles.groupSubtitle, { color: colors.onSurfaceVariant }]}>
                {memberCount} {memberCount === 1 ? 'member' : 'members'}
                {group?.category ? ` • ${group.category.toUpperCase()}` : ''}
              </Text>
            </View>
          </View>

          <View style={[styles.statsDivider, { backgroundColor: colors.outlineVariant }]} />

          <View style={styles.statsRow}>
            <View style={styles.statCol}>
              <Text style={[styles.statLabel, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
                TOTAL SPEND
              </Text>
              <Text style={[styles.statValue, { color: colors.onSurface }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatCurrencyPrivacy(totalSpend, hideBalances)}
              </Text>
            </View>

            <View style={styles.statCol}>
              <Text style={[styles.statLabel, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
                EXPENSES
              </Text>
              <Text style={[styles.statValue, { color: colors.primary }]} numberOfLines={1} adjustsFontSizeToFit>
                {activeGroupExpenses.length}
              </Text>
            </View>

            <View style={styles.statCol}>
              <Text style={[styles.statLabel, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
                YOUR POSITION
              </Text>
              <Text
                style={[
                  styles.statValue,
                  {
                    color:
                      myBalance > 0.009
                        ? '#10b981'
                        : myBalance < -0.009
                          ? '#ef4444'
                          : colors.onSurfaceVariant,
                  },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {myBalance > 0.009
                  ? `+${formatCurrencyPrivacy(myBalance, hideBalances)}`
                  : myBalance < -0.009
                    ? `-${formatCurrencyPrivacy(Math.abs(myBalance), hideBalances)}`
                    : 'Settled'}
              </Text>
            </View>
          </View>
        </View>

        {/* TABS SWITCHER */}
        <View
          style={[
            styles.tabSwitcher,
            {
              backgroundColor: colors.surfaceContainerHigh,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeTab === 'EXPENSES' && [
                styles.activeTabBtn,
                { backgroundColor: colors.surfaceContainerLowest },
              ],
            ]}
            onPress={() => setActiveTab('EXPENSES')}
          >
            <MaterialIcons
              name="receipt-long"
              size={18}
              color={activeTab === 'EXPENSES' ? colors.primary : colors.onSurfaceVariant}
            />
            <Text
              style={[
                styles.tabBtnText,
                {
                  color: activeTab === 'EXPENSES' ? colors.onSurface : colors.onSurfaceVariant,
                  fontFamily: activeTab === 'EXPENSES' ? 'Manrope_700Bold' : 'Manrope_600SemiBold',
                },
              ]}
            >
              Expenses ({activeGroupExpenses.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabBtn,
              activeTab === 'BALANCES' && [
                styles.activeTabBtn,
                { backgroundColor: colors.surfaceContainerLowest },
              ],
            ]}
            onPress={() => setActiveTab('BALANCES')}
          >
            <MaterialIcons
              name="account-balance"
              size={18}
              color={activeTab === 'BALANCES' ? colors.primary : colors.onSurfaceVariant}
            />
            <Text
              style={[
                styles.tabBtnText,
                {
                  color: activeTab === 'BALANCES' ? colors.onSurface : colors.onSurfaceVariant,
                  fontFamily: activeTab === 'BALANCES' ? 'Manrope_700Bold' : 'Manrope_600SemiBold',
                },
              ]}
            >
              Balances & Settle
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* TAB CONTENT */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {activeTab === 'EXPENSES' && (
          <View style={styles.tabSection}>
            {activeGroupExpenses.length === 0 ? (
              <View
                style={[
                  styles.emptyStateCard,
                  {
                    backgroundColor: colors.surfaceContainerLow,
                    borderColor: colors.outlineVariant,
                  },
                ]}
              >
                <MaterialIcons name="receipt" size={48} color={colors.outline} />
                <Text style={[styles.emptyStateTitle, { color: colors.onSurface }]}>
                  No group expenses yet
                </Text>
                <Text style={[styles.emptyStateDesc, { color: colors.onSurfaceVariant }]}>
                  Tap below to add an expense and split it among group members.
                </Text>
                <TouchableOpacity
                  style={[styles.addExpenseEmptyBtn, { backgroundColor: colors.primary }]}
                  onPress={() => router.navigate(`/(app)/add-splitwise-expense?groupId=${groupId}`)}
                >
                  <MaterialIcons name="add" size={20} color={colors.onPrimary} />
                  <Text style={[styles.addExpenseEmptyBtnText, { color: colors.onPrimary }]}>
                    Add First Expense
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.expensesList}>
                {activeGroupExpenses.map((expense) => {
                  const dateStr = formatLocalDate(parseDateSafely(expense.date));
                  const payerName = expense.payer?.name || 'Someone';

                  return (
                    <View
                      key={expense.id}
                      style={[
                        styles.expenseCard,
                        {
                          backgroundColor: colors.surfaceContainerLow,
                          borderColor: colors.surfaceVariant,
                        },
                      ]}
                    >
                      <View style={styles.expenseTopRow}>
                        <View style={styles.expenseTitleCol}>
                          <Text style={[styles.expenseTitle, { color: colors.onSurface }]}>
                            {expense.description}
                          </Text>
                          <Text style={[styles.expenseMeta, { color: colors.onSurfaceVariant }]}>
                            Paid by <Text style={{ fontFamily: 'Manrope_700Bold' }}>{payerName}</Text> • {dateStr}
                          </Text>
                        </View>

                        <View style={styles.expenseAmountCol}>
                          <Text style={[styles.expenseAmount, { color: colors.onSurface }]}>
                            {formatCurrencyPrivacy(expense.amount, hideBalances)}
                          </Text>
                          <Text style={[styles.expenseSplitType, { color: colors.primary }]}>
                            {expense.splitType} SPLIT
                          </Text>
                        </View>
                      </View>

                      {/* Splits breakdown summary */}
                      <View
                        style={[
                          styles.splitsPillRow,
                          {
                            backgroundColor: colors.surfaceContainerLowest,
                            borderColor: colors.outlineVariant,
                          },
                        ]}
                      >
                        <MaterialIcons name="people" size={14} color={colors.onSurfaceVariant} />
                        <Text style={[styles.splitsCountText, { color: colors.onSurfaceVariant }]}>
                          Split between {expense.splits.length} participants
                        </Text>
                        <TouchableOpacity
                          onPress={() => handleDeleteExpense(expense)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          style={{ marginLeft: 'auto' }}
                        >
                          <MaterialIcons name="delete-outline" size={18} color={colors.error} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {activeTab === 'BALANCES' && (
          <View style={styles.tabSection}>
            {/* SIMPLIFIED SETTLEMENTS CARD */}
            <View
              style={[
                styles.sectionCard,
                {
                  backgroundColor: colors.surfaceContainerLow,
                  borderColor: colors.outlineVariant,
                },
              ]}
            >
              <View style={styles.sectionHeaderRow}>
                <MaterialIcons name="alt-route" size={18} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>
                  Simplified Debt Settlements
                </Text>
              </View>
              <Text style={[styles.sectionSubtitle, { color: colors.onSurfaceVariant }]}>
                Minimum transactions required to settle up this entire group:
              </Text>

              {simplifiedDebts.length === 0 ? (
                <View style={styles.allSettledRow}>
                  <MaterialIcons name="check-circle" size={24} color="#10b981" />
                  <Text style={[styles.allSettledText, { color: '#10b981' }]}>
                    All settled up! No outstanding balances.
                  </Text>
                </View>
              ) : (
                <View style={styles.simplifiedList}>
                  {simplifiedDebts.map((item, idx) => {
                    const isYouDebtor = item.fromPersonId === 'current_user';
                    const isYouCreditor = item.toPersonId === 'current_user';

                    return (
                      <View
                        key={idx}
                        style={[
                          styles.simplifiedItemCard,
                          {
                            backgroundColor: colors.surfaceContainerLowest,
                            borderColor: colors.surfaceVariant,
                          },
                        ]}
                      >
                        <View style={styles.simplifiedTopRow}>
                          <View style={styles.simplifiedWhoRow}>
                            <Text
                              style={[
                                styles.debtorName,
                                {
                                  color: '#ef4444',
                                  fontFamily: isYouDebtor ? 'Manrope_700Bold' : 'Manrope_600SemiBold',
                                },
                              ]}
                            >
                              {isYouDebtor ? 'You' : item.fromPersonName || 'Member'}
                            </Text>
                            <MaterialIcons
                              name="arrow-forward"
                              size={16}
                              color={colors.onSurfaceVariant}
                            />
                            <Text
                              style={[
                                styles.creditorName,
                                {
                                  color: '#10b981',
                                  fontFamily: isYouCreditor ? 'Manrope_700Bold' : 'Manrope_600SemiBold',
                                },
                              ]}
                            >
                              {isYouCreditor ? 'You' : item.toPersonName || 'Member'}
                            </Text>
                          </View>
                          <Text style={[styles.simplifiedAmount, { color: colors.onSurface }]}>
                            {formatCurrencyPrivacy(item.amount, hideBalances)}
                          </Text>
                        </View>

                        {/* Direct Action Button if Current User is Involved */}
                        {isYouDebtor && (
                          <TouchableOpacity
                            style={[styles.settleInGroupBtn, { backgroundColor: '#ef4444' }]}
                            onPress={() => {
                              router.navigate(
                                `/(app)/add-splitwise-settlement?personId=${item.toPersonId}&groupId=${groupId}&amount=${item.amount}&type=YOU_PAID`
                              );
                            }}
                            activeOpacity={0.8}
                          >
                            <MaterialIcons name="payment" size={14} color="#ffffff" />
                            <Text style={styles.settleInGroupBtnText}>
                              Settle Up with {item.toPersonName || 'Member'}
                            </Text>
                          </TouchableOpacity>
                        )}

                        {isYouCreditor && (
                          <TouchableOpacity
                            style={[styles.settleInGroupBtn, { backgroundColor: '#10b981' }]}
                            onPress={() => {
                              router.navigate(
                                `/(app)/add-splitwise-settlement?personId=${item.fromPersonId}&groupId=${groupId}&amount=${item.amount}&type=THEY_PAID`
                              );
                            }}
                            activeOpacity={0.8}
                          >
                            <MaterialIcons name="done-all" size={14} color="#ffffff" />
                            <Text style={styles.settleInGroupBtnText}>
                              Record Received from {item.fromPersonName || 'Member'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* MEMBER NET BALANCES */}
            <View
              style={[
                styles.sectionCard,
                {
                  backgroundColor: colors.surfaceContainerLow,
                  borderColor: colors.outlineVariant,
                  marginTop: 16,
                },
              ]}
            >
              <View style={styles.sectionHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialIcons name="people" size={18} color={colors.primary} />
                  <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>
                    Member Net Positions
                  </Text>
                </View>

                {candidateFriends.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setShowAddMemberModal(true)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <MaterialIcons name="person-add" size={16} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 13, fontFamily: 'Manrope_700Bold' }}>
                      + Add
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.membersBalancesList}>
                {activeGroupBalances?.members.map((m) => {
                  const isPositive = m.netBalance > 0.009;
                  const isNegative = m.netBalance < -0.009;
                  const statusColor = isPositive ? '#10b981' : isNegative ? '#ef4444' : colors.onSurfaceVariant;
                  const statusText = isPositive
                    ? `gets back ${formatCurrencyPrivacy(m.netBalance, hideBalances)}`
                    : isNegative
                      ? `owes ${formatCurrencyPrivacy(Math.abs(m.netBalance), hideBalances)}`
                      : 'settled';

                  return (
                    <View
                      key={m.person.id}
                      style={[
                        styles.memberBalanceRow,
                        {
                          backgroundColor: colors.surfaceContainerLowest,
                          borderColor: colors.surfaceVariant,
                        },
                      ]}
                    >
                      <View style={styles.memberBalanceInfo}>
                        <Text style={[styles.memberBalanceName, { color: colors.onSurface }]}>
                          {m.person.id === 'current_user' ? 'You' : m.person.name}
                        </Text>
                        <Text style={[styles.memberTotalPaid, { color: colors.onSurfaceVariant }]}>
                          Total paid: {formatCurrencyPrivacy(m.totalOwedToMe, hideBalances)}
                        </Text>
                      </View>

                      <Text
                        style={[
                          styles.memberNetStatus,
                          { color: statusColor, fontFamily: 'Manrope_700Bold' },
                        ]}
                      >
                        {statusText}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* FLOATING ACTION BUTTON */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: colors.background,
            paddingBottom: Math.max(insets.bottom, 28) + 16,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.addExpenseFab, { backgroundColor: colors.primary }]}
          onPress={() => router.navigate(`/(app)/add-splitwise-expense?groupId=${groupId}`)}
          activeOpacity={0.85}
        >
          <MaterialIcons name="receipt-long" size={20} color={colors.onPrimary} />
          <Text style={[styles.addExpenseFabText, { color: colors.onPrimary }]}>
            + Add Group Expense
          </Text>
        </TouchableOpacity>
      </View>

      {/* ADD MEMBER MODAL */}
      <Modal
        visible={showAddMemberModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddMemberModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalBackdropTouch}
            activeOpacity={1}
            onPress={() => setShowAddMemberModal(false)}
          />
          <View
            style={[
              styles.modalContainer,
              {
                backgroundColor: colors.surfaceContainerLow,
                borderColor: colors.outlineVariant,
                paddingBottom: Math.max(insets.bottom, 24) + 16,
              },
            ]}
          >
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.onSurface }]}>
                Add Friends to Group
              </Text>
              <TouchableOpacity onPress={() => setShowAddMemberModal(false)}>
                <MaterialIcons name="close" size={22} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 300 }}>
              {candidateFriends.length === 0 ? (
                <Text style={{ color: colors.onSurfaceVariant, padding: 16, textAlign: 'center' }}>
                  All your friends are already in this group!
                </Text>
              ) : (
                candidateFriends.map((friend) => {
                  const isSelected = selectedAddMemberIds.includes(friend.id);
                  return (
                    <TouchableOpacity
                      key={friend.id}
                      style={[
                        styles.candidateRow,
                        {
                          backgroundColor: isSelected
                            ? colors.primaryContainer + '30'
                            : colors.surfaceContainerLowest,
                          borderColor: isSelected ? colors.primary : colors.surfaceVariant,
                        },
                      ]}
                      onPress={() => toggleSelectCandidate(friend.id)}
                    >
                      <Text style={[styles.candidateName, { color: colors.onSurface }]}>
                        {friend.name}
                      </Text>
                      <MaterialIcons
                        name={isSelected ? 'check-box' : 'check-box-outline-blank'}
                        size={22}
                        color={isSelected ? colors.primary : colors.outline}
                      />
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.addMemberSubmitBtn,
                {
                  backgroundColor:
                    selectedAddMemberIds.length > 0 ? colors.primary : colors.surfaceVariant,
                },
              ]}
              disabled={selectedAddMemberIds.length === 0}
              onPress={handleAddMembers}
            >
              <Text
                style={{
                  color: selectedAddMemberIds.length > 0 ? colors.onPrimary : colors.outline,
                  fontFamily: 'Manrope_700Bold',
                  fontSize: 14,
                }}
              >
                Add {selectedAddMemberIds.length > 0 ? `(${selectedAddMemberIds.length}) ` : ''}to Group
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerIconBtn: {
    padding: 6,
  },
  overviewContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  overviewCard: {
    borderRadius: radius.xl,
    padding: 16,
    borderWidth: 1,
  },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  groupIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupInfoCol: {
    flex: 1,
  },
  groupTitle: {
    fontSize: 18,
    fontFamily: 'Manrope_700Bold',
  },
  groupSubtitle: {
    fontSize: 12,
    fontFamily: 'Manrope_500Medium',
    marginTop: 2,
  },
  statsDivider: {
    height: 1,
    marginVertical: 14,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCol: {
    flex: 1,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: Platform.OS === 'ios' ? 0.5 : 0,
  },
  statValue: {
    fontSize: 18,
    fontFamily: 'Manrope_700Bold',
    marginTop: 4,
  },
  tabSwitcher: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    padding: 4,
    borderWidth: 1,
    marginTop: 12,
    marginBottom: 8,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  activeTabBtn: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabBtnText: {
    fontSize: 13,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  tabSection: {},
  emptyStateCard: {
    borderRadius: radius.xl,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    gap: 12,
    marginTop: 16,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontFamily: 'Manrope_700Bold',
  },
  emptyStateDesc: {
    fontSize: 13,
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
    lineHeight: 18,
  },
  addExpenseEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
    marginTop: 4,
  },
  addExpenseEmptyBtnText: {
    fontSize: 13,
    fontFamily: 'Manrope_700Bold',
  },
  expensesList: {
    gap: 10,
  },
  expenseCard: {
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1,
  },
  expenseTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  expenseTitleCol: {
    flex: 1,
    marginRight: 12,
  },
  expenseTitle: {
    fontSize: 15,
    fontFamily: 'Manrope_700Bold',
  },
  expenseMeta: {
    fontSize: 12,
    fontFamily: 'Manrope_500Medium',
    marginTop: 4,
  },
  expenseAmountCol: {
    alignItems: 'flex-end',
  },
  expenseAmount: {
    fontSize: 16,
    fontFamily: 'Manrope_700Bold',
  },
  expenseSplitType: {
    fontSize: 10,
    fontFamily: 'Manrope_700Bold',
    marginTop: 2,
  },
  splitsPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  splitsCountText: {
    fontSize: 12,
    fontFamily: 'Manrope_500Medium',
  },
  sectionCard: {
    borderRadius: radius.xl,
    padding: 16,
    borderWidth: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: 'Manrope_700Bold',
  },
  sectionSubtitle: {
    fontSize: 12,
    fontFamily: 'Manrope_500Medium',
    marginTop: 4,
    marginBottom: 12,
  },
  allSettledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  allSettledText: {
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
  },
  simplifiedList: {
    gap: 8,
  },
  simplifiedItemCard: {
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 10,
  },
  simplifiedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settleInGroupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  settleInGroupBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
  },
  simplifiedWhoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  debtorName: {
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
  },
  creditorName: {
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
  },
  simplifiedAmount: {
    fontSize: 15,
    fontFamily: 'Manrope_700Bold',
  },
  membersBalancesList: {
    gap: 8,
  },
  memberBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  memberBalanceInfo: {
    flex: 1,
  },
  memberBalanceName: {
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
  },
  memberTotalPaid: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  memberNetStatus: {
    fontSize: 13,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  addExpenseFab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: radius.xl,
  },
  addExpenseFabText: {
    fontSize: 15,
    fontFamily: 'Manrope_700Bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalBackdropTouch: {
    flex: 1,
  },
  modalContainer: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 20,
    borderWidth: 1,
    maxHeight: '80%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: 'Manrope_700Bold',
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: 8,
  },
  candidateName: {
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
  },
  addMemberSubmitBtn: {
    marginTop: 16,
    height: 48,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});


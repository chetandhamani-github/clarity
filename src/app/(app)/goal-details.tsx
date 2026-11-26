import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Platform,
  Modal,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Text, Header, useToast, useAlert, DetailSkeleton, DatePickerModal } from '@/components/ui';
import { typography, useTheme, ThemeColors, fontFamilies, radius } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import Svg, { Path } from 'react-native-svg';
import {
  useGoal,
  useGoalContributions,
  useAddGoalContribution,
  useDeleteGoal,
  useUpdateGoal,
  useDeleteGoalContribution,
} from '@/hooks/use-goals';
import { useAccounts } from '@/hooks/use-accounts';
import { formatCurrency, getCurrencySymbol, formatDate } from '@/utils/format';
import { getLocalTodayYmd } from '@/utils/date';
import { evaluateGoalMilestoneAlerts } from '@/services/notifications/alert-engine';
import type { GoalContribution } from '@/types';

const GOAL_CATEGORIES = [
  'Savings',
  'Emergency',
  'Travel',
  'Vehicle',
  'Gadget',
  'Home',
  'Education',
  'Other',
];

const GOAL_ICONS: Array<{ name: keyof typeof MaterialIcons.glyphMap; label: string; defaultCat: string }> = [
  { name: 'savings', label: 'Savings', defaultCat: 'Savings' },
  { name: 'shield', label: 'Emergency', defaultCat: 'Emergency' },
  { name: 'flight', label: 'Travel', defaultCat: 'Travel' },
  { name: 'directions-car', label: 'Vehicle', defaultCat: 'Vehicle' },
  { name: 'laptop', label: 'Gadget', defaultCat: 'Gadget' },
  { name: 'home', label: 'Home', defaultCat: 'Home' },
  { name: 'school', label: 'Education', defaultCat: 'Education' },
  { name: 'flag', label: 'Milestone', defaultCat: 'Other' },
  { name: 'fitness-center', label: 'Fitness', defaultCat: 'Other' },
  { name: 'card-giftcard', label: 'Gift', defaultCat: 'Other' },
];

export default function GoalDetailsScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const insets = useSafeInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { showAlert } = useAlert();
  const { showToast } = useToast();

  const { goal, isLoading: goalLoading, refetch: refetchGoal } = useGoal(id as string);
  const {
    contributions,
    isLoading: contribLoading,
    refetch: refetchContribs,
  } = useGoalContributions(id as string);
  const { mutate: addContrib, isPending } = useAddGoalContribution();
  const { mutate: deleteGoal, isPending: isDeleting } = useDeleteGoal();
  const { mutate: updateGoal, isPending: isUpdating } = useUpdateGoal();
  const { mutate: deleteContrib } = useDeleteGoalContribution();
  const { accounts } = useAccounts();

  // Contribution Form State
  const [showAdd, setShowAdd] = useState(false);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Edit Goal Modal State
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [editCategory, setEditCategory] = useState('Savings');
  const [editIcon, setEditIcon] = useState('savings');
  const [editTargetDate, setEditTargetDate] = useState('');
  const [showEditDatePicker, setShowEditDatePicker] = useState(false);

  const isLoading = goalLoading || contribLoading;

  if (!goal && !isLoading) {
    return (
      <View style={[styles.container, styles.notFoundContainer, { paddingTop: insets.top }]}>
        <Text style={{ color: colors.error }}>Goal not found</Text>
      </View>
    );
  }

  const handleOpenEditModal = () => {
    if (!goal) return;
    setEditName(goal.name);
    setEditTarget(goal.targetAmount.toString());
    setEditCategory(goal.category || 'Savings');
    setEditIcon(goal.icon || 'savings');
    setEditTargetDate(goal.targetDate || '');
    setIsEditModalVisible(true);
  };

  const handleSaveEdit = () => {
    if (!editName.trim()) {
      showToast('Please enter a goal name', 'error');
      return;
    }
    const targetAmt = parseFloat(editTarget);
    if (isNaN(targetAmt) || targetAmt <= 0) {
      showToast('Please enter a valid target amount', 'error');
      return;
    }

    updateGoal(
      {
        id: goal?.id || '',
        data: {
          name: editName.trim(),
          targetAmount: targetAmt,
          category: editCategory,
          icon: editIcon,
          targetDate: editTargetDate,
        },
      },
      {
        onSuccess: () => {
          showToast('Goal updated successfully', 'info');
          setIsEditModalVisible(false);
          refetchGoal();
        },
      }
    );
  };

  const handleAddContribution = () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      showToast('Please enter a valid contribution amount', 'error');
      return;
    }

    const prevAmount = goal?.currentAmount || 0;
    const goalId = goal?.id || '';

    addContrib(
      {
        data: {
          goalId,
          amount: amt,
          date: getLocalTodayYmd(),
          description: notes.trim() || '',
        },
        accountId: selectedAccountId || undefined,
      },
      {
        onSuccess: () => {
          evaluateGoalMilestoneAlerts(goalId, prevAmount, prevAmount + amt);
          setAmount('');
          setNotes('');
          setShowAdd(false);
          setSelectedAccountId(null);
          refetchGoal();
          refetchContribs();
        },
      }
    );
  };

  const handleDeleteContribution = (contrib: GoalContribution) => {
    showAlert(
      'Delete Contribution',
      `Delete contribution of ${formatCurrency(contrib.amount)}? This will subtract it from your goal and refund the account if it was deducted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteContrib(
              { contributionId: contrib.id, goalId: goal?.id || '' },
              {
                onSuccess: () => {
                  showToast('Contribution removed', 'info');
                  refetchGoal();
                  refetchContribs();
                },
              }
            );
          },
        },
      ]
    );
  };

  const handleDeleteGoal = () => {
    showAlert('Delete Goal', 'Are you sure you want to delete this goal? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteGoal(goal?.id || '', {
            onSuccess: () => {
              router.replace('/goals');
            },
          });
        },
      },
    ]);
  };

  const isCompleted = goal ? goal.targetAmount > 0 && goal.currentAmount >= goal.targetAmount : false;
  const progress =
    goal && goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;
  const strokeDash = `${Math.min(100, Math.max(0, progress))}, 100`;

  // Pacing calculation
  const remainingAmount = goal ? Math.max(0, goal.targetAmount - goal.currentAmount) : 0;
  let pacingData: { days: number; months: number; monthlyAmount: number; isPast: boolean } | null = null;
  if (goal?.targetDate) {
    const diffMs = new Date(goal.targetDate).getTime() - Date.now();
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (days > 0) {
      const months = Math.max(1, Math.round(days / 30.44));
      const monthlyAmount = Math.ceil(remainingAmount / months);
      pacingData = { days, months, monthlyAmount, isPast: false };
    } else {
      pacingData = { days, months: 0, monthlyAmount: 0, isPast: true };
    }
  }

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
        showBack
        title={goal?.name ?? 'Goal Details'}
        rightNode={
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleOpenEditModal}
            >
              <MaterialIcons name="edit" size={22} color={colors.onSurface} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleDeleteGoal}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <MaterialIcons name="delete-outline" size={24} color={colors.error} />
              )}
            </TouchableOpacity>
          </View>
        }
      />

      {goal && (
        <KeyboardAwareScrollView
          style={styles.flex1}
          contentContainerStyle={StyleSheet.flatten([
            styles.scrollContent,
            { paddingBottom: 32 },
          ])}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          enableOnAndroid={true}
          enableAutomaticScroll={true}
          enableResetScrollToCoords={false}
          extraScrollHeight={Platform.OS === 'ios' ? 140 : 160}
          extraHeight={Platform.OS === 'ios' ? 75 : 140}
          keyboardOpeningTime={0}
        >
          {isLoading ? (
            <DetailSkeleton />
          ) : (
            <>
              {/* Header Hero Section */}
              <View style={styles.heroSection}>
                <View style={styles.heroLeft}>
                  <View style={styles.categoryRow}>
                    <MaterialIcons name={(goal.icon || 'savings') as any} size={20} color={colors.primary} />
                    <Text style={styles.categoryText}>{goal.category || 'Savings'}</Text>
                    {isCompleted && (
                      <View style={styles.completedHeaderBadge}>
                        <MaterialIcons name="check-circle" size={14} color={colors.primary} />
                        <Text style={styles.completedHeaderBadgeText}>Goal Reached</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.heroDescription}>Track and manage your savings progress.</Text>
                </View>

                <TouchableOpacity
                  style={styles.addContributionBtn}
                  onPress={() => setShowAdd(!showAdd)}
                >
                  <MaterialIcons
                    name={showAdd ? 'close' : 'add'}
                    size={18}
                    color={colors.onPrimary}
                  />
                  <Text style={styles.addContributionBtnText}>
                    {showAdd ? 'Cancel' : 'Add Contribution'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Add Contribution Form */}
              {showAdd && (
                <View style={styles.addFormCard}>
                  <Text style={styles.addFormTitle}>Add Contribution</Text>
                  <View style={styles.currencyInputRow}>
                    <Text style={styles.currencySymbol}>{getCurrencySymbol()}</Text>
                    <TextInput
                      style={[styles.input, styles.flex1]}
                      placeholder="Amount"
                      placeholderTextColor={colors.outline}
                      keyboardType="decimal-pad"
                      value={amount}
                      onChangeText={setAmount}
                    />
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Notes (optional)"
                    placeholderTextColor={colors.outline}
                    value={notes}
                    onChangeText={setNotes}
                  />
                  <View style={styles.accountSelector}>
                    <Text style={styles.accountSelectorTitle}>Deduct from account (optional)</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.accountChipsScroll}
                    >
                      {accounts.map((acc) => (
                        <TouchableOpacity
                          key={acc.id}
                          style={[
                            styles.accountChip,
                            selectedAccountId === acc.id && {
                              backgroundColor: colors.primary,
                              borderColor: colors.primary,
                            },
                          ]}
                          onPress={() =>
                            setSelectedAccountId(selectedAccountId === acc.id ? null : acc.id)
                          }
                        >
                          <Text
                            style={[
                              styles.accountChipText,
                              selectedAccountId === acc.id && { color: colors.onPrimary },
                            ]}
                            numberOfLines={1}
                          >
                            {acc.name} ({formatCurrency(acc.balance)})
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                  <TouchableOpacity
                    style={styles.saveBtn}
                    onPress={handleAddContribution}
                    disabled={isPending}
                  >
                    {isPending ? (
                      <ActivityIndicator size="small" color={colors.onPrimary} />
                    ) : (
                      <Text style={styles.saveBtnText}>Save Contribution</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* Progress Card (Chart & Stats) */}
              <View style={styles.card}>
                <View style={styles.chartContainer}>
                  <View style={styles.svgWrapper}>
                    <Svg viewBox="0 0 36 36" width="100%" height="100%" style={styles.svgChart}>
                      <Path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke={colors.surfaceVariant}
                        strokeWidth="2.5"
                      />
                      {progress > 0 && (
                        <Path
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                          fill="none"
                          stroke={colors.primary}
                          strokeWidth="2.5"
                          strokeDasharray={strokeDash}
                          strokeLinecap="round"
                        />
                      )}
                    </Svg>
                    <View style={styles.chartCenterTextContainer}>
                      <Text style={styles.chartPercentage}>{progress.toFixed(0)}%</Text>
                      <Text style={styles.chartSubtitle}>{isCompleted ? 'Completed' : 'Funded'}</Text>
                    </View>
                  </View>

                  <View style={styles.amountsRow}>
                    <View>
                      <Text style={styles.amountLabel}>Saved</Text>
                      <Text style={styles.amountCurrent}>{formatCurrency(goal.currentAmount)}</Text>
                    </View>
                    <View style={styles.alignEnd}>
                      <Text style={styles.amountLabel}>Target</Text>
                      <Text style={styles.amountTarget}>{formatCurrency(goal.targetAmount)}</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Guidance & Financial Clarity Card */}
              <View style={styles.guidanceCard}>
                <View style={styles.guidanceHeader}>
                  <View style={styles.guidanceTitleRow}>
                    <MaterialIcons
                      name={isCompleted ? 'check-circle' : 'insights'}
                      size={20}
                      color={colors.primary}
                    />
                    <Text style={styles.guidanceTitle}>
                      {isCompleted ? 'TARGET ACHIEVED' : 'SAVINGS GUIDANCE'}
                    </Text>
                  </View>
                </View>

                {isCompleted ? (
                  <Text style={styles.guidanceBody}>
                    You have achieved your target of {formatCurrency(goal.targetAmount)}. Keep up the consistent savings momentum!
                  </Text>
                ) : (
                  <View style={styles.guidanceDetails}>
                    <View style={styles.guidanceMetricRow}>
                      <Text style={styles.guidanceMetricLabel}>Remaining to save:</Text>
                      <Text style={styles.guidanceMetricValue}>{formatCurrency(remainingAmount)}</Text>
                    </View>

                    {goal.targetDate ? (
                      <>
                        <View style={styles.guidanceMetricRow}>
                          <Text style={styles.guidanceMetricLabel}>Target deadline:</Text>
                          <Text style={styles.guidanceMetricValue}>{formatDate(goal.targetDate, 'short')}</Text>
                        </View>

                        {pacingData && !pacingData.isPast ? (
                          <View style={styles.pacingBox}>
                            <MaterialIcons name="trending-up" size={18} color={colors.primary} />
                            <Text style={styles.pacingText}>
                              Save ~{formatCurrency(pacingData.monthlyAmount)} / month over {pacingData.months} month{pacingData.months > 1 ? 's' : ''} ({pacingData.days} days) to reach your goal on schedule.
                            </Text>
                          </View>
                        ) : (
                          <View style={[styles.pacingBox, { backgroundColor: colors.surfaceContainer }]}>
                            <MaterialIcons name="info-outline" size={18} color={colors.onSurfaceVariant} />
                            <Text style={[styles.pacingText, { color: colors.onSurfaceVariant }]}>
                              Target deadline has passed. Tap Edit above to adjust your deadline or increase contributions.
                            </Text>
                          </View>
                        )}
                      </>
                    ) : (
                      <TouchableOpacity
                        style={styles.setDeadlinePrompt}
                        onPress={handleOpenEditModal}
                      >
                        <MaterialIcons name="event" size={16} color={colors.primary} />
                        <Text style={styles.setDeadlinePromptText}>Set a target deadline to get monthly savings recommendations.</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>

              {/* Timeline / Contribution History Card */}
              <View style={styles.timelineCard}>
                <View style={styles.timelineHeader}>
                  <Text style={styles.timelineTitle}>Contribution History</Text>
                  <Text style={styles.timelineCount}>{contributions.length} recorded</Text>
                </View>

                <View style={styles.transactionList}>
                  {contributions.length === 0 ? (
                    <Text style={styles.emptyContributions}>
                      No contributions yet. Tap "Add Contribution" above to begin.
                    </Text>
                  ) : (
                    contributions.map((contrib: GoalContribution, idx: number) => (
                      <View
                        key={contrib.id}
                        style={[
                          styles.transactionItem,
                          idx === contributions.length - 1 && styles.transactionItemLast,
                        ]}
                      >
                        <View style={styles.transactionItemLeft}>
                          <View style={styles.transactionIconBox}>
                            <MaterialIcons
                              name="south-east"
                              size={18}
                              color={colors.primary}
                            />
                          </View>
                          <View style={styles.transactionTextContent}>
                            <Text style={styles.transactionDesc} numberOfLines={1}>
                              {contrib.description || 'Contribution'}
                            </Text>
                            <Text style={styles.transactionDate}>
                              {formatDate(contrib.date, 'short')}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.transactionItemRight}>
                          <Text style={styles.transactionAmount}>
                            +{formatCurrency(contrib.amount)}
                          </Text>
                          <TouchableOpacity
                            style={styles.deleteContribBtn}
                            onPress={() => handleDeleteContribution(contrib)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <MaterialIcons name="delete-outline" size={18} color={colors.outline} />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </View>
            </>
          )}
        </KeyboardAwareScrollView>
      )}

      {/* Edit Goal Modal */}
      <Modal
        visible={isEditModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <TouchableOpacity
            style={styles.modalBackdropTouch}
            activeOpacity={1}
            onPress={() => {
              Keyboard.dismiss();
              setIsEditModalVisible(false);
            }}
          />
          <View
            style={[
              styles.modalContainer,
              {
                backgroundColor: colors.surfaceContainerLowest,
                paddingBottom: Math.max(insets.bottom, 16) + 12,
              },
            ]}
          >
            {/* Grab Handle */}
            <View style={styles.dragHandle} />

            {/* Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Edit Goal</Text>
                <Text style={styles.modalSubtitle}>Update your savings target and timeline</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => {
                  Keyboard.dismiss();
                  setIsEditModalVisible(false);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <MaterialIcons name="close" size={20} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <KeyboardAwareScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              enableOnAndroid={true}
              extraScrollHeight={Platform.OS === 'ios' ? 24 : 80}
              enableAutomaticScroll={true}
              keyboardDismissMode="none"
              contentContainerStyle={styles.modalScrollContent}
            >
              {/* Goal Name Field */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Goal Name</Text>
                <TextInput
                  style={[styles.textInput, { color: colors.onSurface }]}
                  placeholder="e.g. Education Loan, Vacation Fund"
                  placeholderTextColor={colors.outline}
                  value={editName}
                  onChangeText={setEditName}
                />
              </View>

              {/* Target Amount Field */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Target Amount</Text>
                <View style={styles.currencyInputContainer}>
                  <Text style={styles.currencyPrefix}>{getCurrencySymbol()}</Text>
                  <TextInput
                    style={[styles.amountTextInput, { color: colors.onSurface }]}
                    placeholder="0"
                    placeholderTextColor={colors.outline}
                    keyboardType="decimal-pad"
                    value={editTarget}
                    onChangeText={setEditTarget}
                  />
                </View>
              </View>

              {/* Target Date Trigger */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Target Deadline (Optional)</Text>
                <View style={styles.datePickerRow}>
                  <TouchableOpacity
                    style={styles.datePickerBtn}
                    onPress={() => {
                      Keyboard.dismiss();
                      setShowEditDatePicker(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="event" size={18} color={colors.primary} />
                    <Text
                      style={[
                        styles.datePickerBtnText,
                        editTargetDate ? { color: colors.onSurface } : { color: colors.outline },
                      ]}
                    >
                      {editTargetDate ? formatDate(editTargetDate, 'short') : 'Set Target Date'}
                    </Text>
                  </TouchableOpacity>
                  {editTargetDate ? (
                    <TouchableOpacity
                      style={styles.clearDateBtn}
                      onPress={() => setEditTargetDate('')}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="close" size={18} color={colors.onSurfaceVariant} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {/* Category Selector */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Category</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipsRow}
                  keyboardShouldPersistTaps="handled"
                >
                  {GOAL_CATEGORIES.map((cat) => {
                    const isSelected = editCategory === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[
                          styles.categoryChip,
                          isSelected && {
                            backgroundColor: colors.primary,
                            borderColor: colors.primary,
                          },
                        ]}
                        onPress={() => {
                          setEditCategory(cat);
                          const matching = GOAL_ICONS.find((item) => item.defaultCat === cat);
                          if (matching) setEditIcon(matching.name);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.categoryChipText,
                            isSelected && { color: colors.onPrimary, fontFamily: fontFamilies.bold },
                          ]}
                        >
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Icon Selector */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Icon</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.iconsRow}
                  keyboardShouldPersistTaps="handled"
                >
                  {GOAL_ICONS.map((iconItem) => {
                    const isSelected = editIcon === iconItem.name;
                    return (
                      <TouchableOpacity
                        key={iconItem.name}
                        style={[
                          styles.iconSelectBtn,
                          isSelected && {
                            borderColor: colors.primary,
                            backgroundColor: `${colors.primary}20`,
                          },
                        ]}
                        onPress={() => setEditIcon(iconItem.name)}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons
                          name={iconItem.name as any}
                          size={20}
                          color={isSelected ? colors.primary : colors.onSurfaceVariant}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Save Button */}
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  Keyboard.dismiss();
                  handleSaveEdit();
                }}
                disabled={isUpdating}
                activeOpacity={0.8}
              >
                {isUpdating ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Text style={[styles.saveBtnText, { color: colors.onPrimary }]}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </KeyboardAwareScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* DatePickerModal for Edit Modal */}
      <DatePickerModal
        visible={showEditDatePicker}
        value={editTargetDate || getLocalTodayYmd()}
        minDate={getLocalTodayYmd()}
        onChange={(date) => {
          setEditTargetDate(date);
          setShowEditDatePicker(false);
        }}
        onClose={() => setShowEditDatePicker(false)}
      />
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    flex1: {
      flex: 1,
    },
    notFoundContainer: {
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
    accountChipsScroll: {
      gap: 8,
      paddingVertical: 8,
    },
    alignEnd: {
      alignItems: 'flex-end',
    },
    emptyContributions: {
      padding: 16,
      color: colors.onSurfaceVariant,
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    iconButton: {
      padding: 8,
    },
    scrollContent: {
      padding: 20,
      gap: 20,
    },
    heroSection: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 16,
    },
    heroLeft: {
      flex: 1,
    },
    categoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    categoryText: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      textTransform: 'uppercase',
      letterSpacing: Platform.OS === 'ios' ? 0.6 : 0,
    },
    completedHeaderBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primaryContainer,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
    },
    completedHeaderBadgeText: {
      ...typography.labelMd,
      fontSize: 10,
      fontFamily: 'Manrope_700Bold',
      color: colors.onPrimaryContainer,
    },
    heroDescription: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
    },
    addContributionBtn: {
      backgroundColor: colors.primary,
      borderRadius: 20,
      height: 42,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      gap: 6,
    },
    addContributionBtnText: {
      ...typography.labelMd,
      color: colors.onPrimary,
      fontFamily: 'Manrope_700Bold',
    },
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: 16,
      padding: 20,
    },
    chartContainer: {
      alignItems: 'center',
    },
    svgWrapper: {
      width: '100%',
      maxWidth: 220,
      aspectRatio: 1,
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    svgChart: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    },
    chartCenterTextContainer: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
    chartPercentage: {
      ...typography.displayLg,
      fontSize: 32,
      lineHeight: 38,
      color: colors.onSurface,
    },
    chartSubtitle: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      marginTop: 2,
    },
    amountsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      width: '100%',
      marginTop: 20,
      paddingHorizontal: 8,
    },
    amountLabel: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      marginBottom: 2,
    },
    amountCurrent: {
      ...typography.headlineSm,
      color: colors.primary,
    },
    amountTarget: {
      ...typography.headlineSm,
      color: colors.onSurface,
    },

    /* Guidance Card */
    guidanceCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: 16,
      padding: 18,
      gap: 12,
    },
    guidanceHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    guidanceTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    guidanceTitle: {
      ...typography.labelMd,
      color: colors.primary,
      letterSpacing: Platform.OS === 'ios' ? 0.8 : 0,
    },
    guidanceBody: {
      ...typography.bodyMd,
      color: colors.onSurface,
      lineHeight: 20,
    },
    guidanceDetails: {
      gap: 8,
    },
    guidanceMetricRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    guidanceMetricLabel: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
    },
    guidanceMetricValue: {
      ...typography.bodyMd,
      fontFamily: 'Manrope_700Bold',
      color: colors.onSurface,
    },
    pacingBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.primaryContainer + '33',
      borderRadius: 10,
      padding: 12,
      marginTop: 4,
    },
    pacingText: {
      ...typography.bodyMd,
      fontSize: 13,
      lineHeight: 18,
      color: colors.onSurface,
      flex: 1,
    },
    setDeadlinePrompt: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
    },
    setDeadlinePromptText: {
      ...typography.bodyMd,
      fontSize: 13,
      color: colors.primary,
    },

    /* Timeline Card */
    timelineCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: 16,
      padding: 18,
      gap: 16,
    },
    timelineHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    timelineTitle: {
      ...typography.headlineSm,
      fontSize: 16,
      color: colors.onSurface,
    },
    timelineCount: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
    },
    transactionList: {
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: 12,
      overflow: 'hidden',
    },
    transactionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 14,
      backgroundColor: colors.surfaceContainerLowest,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineVariant,
    },
    transactionItemLast: {
      borderBottomWidth: 0,
    },
    transactionItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      paddingRight: 12,
    },
    transactionTextContent: {
      flex: 1,
    },
    transactionIconBox: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    transactionDesc: {
      ...typography.bodyMd,
      fontFamily: 'Manrope_700Bold',
      color: colors.onSurface,
    },
    transactionDate: {
      ...typography.labelMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      marginTop: 2,
    },
    transactionItemRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    transactionAmount: {
      ...typography.bodyMd,
      fontFamily: 'Manrope_700Bold',
      color: colors.primary,
    },
    deleteContribBtn: {
      padding: 4,
    },

    /* Add Form */
    addFormCard: {
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: 18,
      gap: 14,
    },
    addFormTitle: {
      ...typography.headlineSm,
      fontSize: 16,
      color: colors.onSurface,
    },
    input: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      paddingHorizontal: 16,
      paddingVertical: 12,
      ...typography.bodyMd,
      color: colors.onSurface,
    },
    currencyInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    currencySymbol: {
      ...typography.dataLg,
      color: colors.onSurface,
    },
    saveBtn: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 4,
    },
    saveBtnText: {
      ...typography.labelMd,
      color: colors.onPrimary,
      fontFamily: fontFamilies.bold,
    },
    accountSelector: {
      gap: 4,
    },
    accountSelectorTitle: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
    },
    accountChip: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      backgroundColor: colors.surfaceContainer,
      flexShrink: 0,
    },
    accountChipText: {
      ...typography.labelMd,
      color: colors.onSurface,
    },

    /* Modal Styles */
    modalBackdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalBackdropTouch: {
      flex: 1,
    },
    modalContainer: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 10,
      maxHeight: '90%',
    },
    dragHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.outlineVariant,
      alignSelf: 'center',
      marginBottom: 12,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    modalTitle: {
      ...typography.headlineSm,
      fontSize: 18,
      color: colors.onSurface,
      fontFamily: fontFamilies.bold,
    },
    modalSubtitle: {
      ...typography.bodySm,
      fontSize: 12,
      color: colors.onSurfaceVariant,
      marginTop: 2,
    },
    modalCloseBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalScrollContent: {
      gap: 14,
      paddingBottom: 20,
    },
    formGroup: {
      gap: 6,
    },
    formLabel: {
      ...typography.labelMd,
      fontFamily: fontFamilies.semiBold,
      fontSize: 12,
      color: colors.onSurfaceVariant,
    },
    textInput: {
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      ...typography.bodyMd,
      fontFamily: fontFamilies.medium,
    },
    currencyInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      borderRadius: radius.md,
      paddingHorizontal: 14,
    },
    currencyPrefix: {
      ...typography.bodyLg,
      fontFamily: fontFamilies.bold,
      color: colors.onSurface,
      marginRight: 8,
    },
    amountTextInput: {
      flex: 1,
      paddingVertical: 12,
      ...typography.bodyMd,
      fontFamily: fontFamilies.medium,
    },
    datePickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    datePickerBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    datePickerBtnText: {
      ...typography.bodyMd,
      fontFamily: fontFamilies.medium,
    },
    clearDateBtn: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipsRow: {
      gap: 8,
      paddingVertical: 2,
    },
    categoryChip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: radius.full,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
    },
    categoryChipText: {
      ...typography.labelMd,
      fontFamily: fontFamilies.medium,
      fontSize: 12,
      color: colors.onSurfaceVariant,
    },
    iconsRow: {
      gap: 8,
      paddingVertical: 2,
    },
    iconSelectBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
    },
  });
  return styles;
};

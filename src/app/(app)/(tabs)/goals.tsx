import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Text, Header, GoalsSkeleton, DatePickerModal, useToast } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useRouter, useFocusEffect } from 'expo-router';
import { useGoals, useCreateGoal } from '@/hooks/use-goals';
import { formatCurrency, getCurrencySymbol, formatDate } from '@/utils/format';
import { getLocalTodayYmd } from '@/utils/date';
import type { Goal } from '@/types';

interface GoalsScreenProps {
  showBack?: boolean;
}

type GoalFilter = 'all' | 'active' | 'completed';

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

export default function GoalsScreen({ showBack = false }: GoalsScreenProps = {}) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeInsets();
  const router = useRouter();

  const { goals, isLoading, refetch } = useGoals();
  const { mutate: createGoal, isPending } = useCreateGoal();
  const { showToast } = useToast();

  const [activeFilter, setActiveFilter] = useState<GoalFilter>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalTarget, setNewGoalTarget] = useState('');
  const [newGoalInitial, setNewGoalInitial] = useState('');
  const [newGoalCategory, setNewGoalCategory] = useState('Savings');
  const [newGoalIcon, setNewGoalIcon] = useState<string>('savings');
  const [newGoalTargetDate, setNewGoalTargetDate] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch])
  );

  const { totalSaved, totalTarget, activeGoals, completedGoals, overallProgress } = useMemo(() => {
    let saved = 0;
    let target = 0;
    const active: Goal[] = [];
    const completed: Goal[] = [];

    goals.forEach((g) => {
      saved += g.currentAmount;
      target += g.targetAmount;
      if (g.targetAmount > 0 && g.currentAmount >= g.targetAmount) {
        completed.push(g);
      } else {
        active.push(g);
      }
    });

    const progress = target > 0 ? (saved / target) * 100 : 0;
    return {
      totalSaved: saved,
      totalTarget: target,
      activeGoals: active,
      completedGoals: completed,
      overallProgress: progress,
    };
  }, [goals]);

  const filteredGoals = useMemo(() => {
    if (activeFilter === 'active') return activeGoals;
    if (activeFilter === 'completed') return completedGoals;
    return goals;
  }, [activeFilter, activeGoals, completedGoals, goals]);

  const handleCategorySelect = (category: string) => {
    setNewGoalCategory(category);
    const matchingIcon = GOAL_ICONS.find((item) => item.defaultCat === category);
    if (matchingIcon) {
      setNewGoalIcon(matchingIcon.name);
    }
  };

  const handleResetForm = () => {
    setNewGoalName('');
    setNewGoalTarget('');
    setNewGoalInitial('');
    setNewGoalCategory('Savings');
    setNewGoalIcon('savings');
    setNewGoalTargetDate('');
    setShowAdd(false);
  };

  const handleAddGoal = () => {
    if (!newGoalName.trim()) {
      showToast('Please enter a goal name', 'error');
      return;
    }
    const targetAmt = parseFloat(newGoalTarget);
    if (isNaN(targetAmt) || targetAmt <= 0) {
      showToast('Please enter a valid target amount', 'error');
      return;
    }

    let initialAmt = 0;
    if (newGoalInitial.trim()) {
      initialAmt = parseFloat(newGoalInitial);
      if (isNaN(initialAmt) || initialAmt < 0) {
        showToast('Please enter a valid starting amount', 'error');
        return;
      }
    }

    createGoal(
      {
        name: newGoalName.trim(),
        icon: newGoalIcon,
        targetAmount: targetAmt,
        currentAmount: initialAmt,
        category: newGoalCategory,
        targetDate: newGoalTargetDate,
      },
      {
        onSuccess: () => {
          showToast('Goal created successfully', 'info');
          handleResetForm();
          refetch();
        },
      }
    );
  };

  const todayStr = useMemo(() => getLocalTodayYmd(), []);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: showBack ? insets.bottom : 0 }]}>
      <Header
        isMainTab={!showBack}
        showBack={showBack}
        title="Goals"
        leftNode={
          showBack ? undefined : (
            <TouchableOpacity style={styles.avatarButton} onPress={() => router.navigate('/settings')}>
              <View style={[styles.avatarFallback, { backgroundColor: colors.primaryContainer }]}>
                <MaterialIcons name="person" size={20} color={colors.onPrimaryContainer} />
              </View>
            </TouchableOpacity>
          )
        }
        rightNode={
          <TouchableOpacity style={styles.iconButton} onPress={() => setShowAdd(!showAdd)}>
            <MaterialIcons name={showAdd ? 'close' : 'add'} size={24} color={colors.onSurface} />
          </TouchableOpacity>
        }
      />

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={StyleSheet.flatten([
          styles.scrollContent,
          { paddingBottom: insets.bottom + 140 },
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
          <GoalsSkeleton />
        ) : (
          <>
            {/* Create Goal Form */}
            {showAdd && (
              <View style={styles.addFormCard}>
                <View style={styles.addFormHeader}>
                  <Text style={styles.addFormTitle}>Create New Goal</Text>
                  <TouchableOpacity onPress={handleResetForm}>
                    <MaterialIcons name="close" size={20} color={colors.onSurfaceVariant} />
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={styles.input}
                  placeholder="Goal Name (e.g. Emergency Fund)"
                  placeholderTextColor={colors.outline}
                  value={newGoalName}
                  onChangeText={setNewGoalName}
                />

                <View style={styles.currencyInputRow}>
                  <Text style={styles.currencySymbol}>{getCurrencySymbol()}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Target Amount"
                    placeholderTextColor={colors.outline}
                    keyboardType="decimal-pad"
                    value={newGoalTarget}
                    onChangeText={setNewGoalTarget}
                  />
                </View>

                <View style={styles.currencyInputRow}>
                  <Text style={styles.currencySymbol}>{getCurrencySymbol()}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Starting Saved Amount (optional)"
                    placeholderTextColor={colors.outline}
                    keyboardType="decimal-pad"
                    value={newGoalInitial}
                    onChangeText={setNewGoalInitial}
                  />
                </View>

                {/* Target Date Picker Trigger */}
                <View style={styles.formSection}>
                  <Text style={styles.formSectionLabel}>Target Deadline (Optional)</Text>
                  <View style={styles.datePickerRow}>
                    <TouchableOpacity
                      style={styles.datePickerBtn}
                      onPress={() => setShowDatePicker(true)}
                    >
                      <MaterialIcons name="event" size={18} color={colors.primary} />
                      <Text style={[styles.datePickerBtnText, newGoalTargetDate ? { color: colors.onSurface } : { color: colors.outline }]}>
                        {newGoalTargetDate ? formatDate(newGoalTargetDate, 'short') : 'Set Target Date'}
                      </Text>
                    </TouchableOpacity>
                    {newGoalTargetDate ? (
                      <TouchableOpacity
                        style={styles.clearDateBtn}
                        onPress={() => setNewGoalTargetDate('')}
                      >
                        <MaterialIcons name="close" size={18} color={colors.onSurfaceVariant} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>

                {/* Category Selector */}
                <View style={styles.formSection}>
                  <Text style={styles.formSectionLabel}>Category</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
                    {GOAL_CATEGORIES.map((cat) => (
                      <TouchableOpacity
                        key={cat}
                        style={[
                          styles.chip,
                          newGoalCategory === cat && { backgroundColor: colors.primary, borderColor: colors.primary },
                        ]}
                        onPress={() => handleCategorySelect(cat)}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            newGoalCategory === cat && { color: colors.onPrimary },
                          ]}
                        >
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                {/* Icon Selector */}
                <View style={styles.formSection}>
                  <Text style={styles.formSectionLabel}>Icon</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.iconsRow}>
                    {GOAL_ICONS.map((iconItem) => {
                      const isSelected = newGoalIcon === iconItem.name;
                      return (
                        <TouchableOpacity
                          key={iconItem.name}
                          style={[
                            styles.iconSelectBtn,
                            isSelected && {
                              borderColor: colors.primary,
                              backgroundColor: colors.primaryContainer,
                            },
                          ]}
                          onPress={() => setNewGoalIcon(iconItem.name)}
                        >
                          <MaterialIcons
                            name={iconItem.name as any}
                            size={22}
                            color={isSelected ? colors.onPrimaryContainer : colors.onSurfaceVariant}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={handleAddGoal}
                  disabled={isPending}
                >
                  {isPending ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <Text style={styles.saveBtnText}>Create Goal</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Overview / Summary Card */}
            {goals.length > 0 && (
              <View style={styles.summaryCard}>
                <View style={styles.summaryCardHeader}>
                  <View style={styles.summaryTitleRow}>
                    <MaterialIcons name="track-changes" size={20} color={colors.primary} />
                    <Text style={styles.summaryTitle}>GOALS OVERVIEW</Text>
                  </View>
                  <View style={styles.summaryBadge}>
                    <Text style={styles.summaryBadgeText}>{overallProgress.toFixed(0)}%</Text>
                  </View>
                </View>

                <View style={styles.summaryAmountRow}>
                  <Text style={styles.summarySavedAmount}>{formatCurrency(totalSaved)}</Text>
                  <Text style={styles.summaryTargetAmount}>of {formatCurrency(totalTarget)}</Text>
                </View>

                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: `${Math.min(100, Math.max(0, overallProgress))}%` },
                    ]}
                  />
                </View>

                <View style={styles.summaryStatsRow}>
                  <View style={styles.summaryStatItem}>
                    <Text style={styles.summaryStatLabel}>Active</Text>
                    <Text style={styles.summaryStatValue}>{activeGoals.length}</Text>
                  </View>
                  <View style={styles.summaryStatDivider} />
                  <View style={styles.summaryStatItem}>
                    <Text style={styles.summaryStatLabel}>Completed</Text>
                    <Text style={styles.summaryStatValue}>{completedGoals.length}</Text>
                  </View>
                  <View style={styles.summaryStatDivider} />
                  <View style={styles.summaryStatItem}>
                    <Text style={styles.summaryStatLabel}>Remaining</Text>
                    <Text style={styles.summaryStatValue} numberOfLines={1}>
                      {formatCurrency(Math.max(0, totalTarget - totalSaved))}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Filter Tabs */}
            {goals.length > 0 && (
              <View style={styles.filterRow}>
                <TouchableOpacity
                  style={[styles.filterChip, activeFilter === 'all' && styles.filterChipActive]}
                  onPress={() => setActiveFilter('all')}
                >
                  <Text style={[styles.filterChipText, activeFilter === 'all' && styles.filterChipTextActive]}>
                    All ({goals.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterChip, activeFilter === 'active' && styles.filterChipActive]}
                  onPress={() => setActiveFilter('active')}
                >
                  <Text style={[styles.filterChipText, activeFilter === 'active' && styles.filterChipTextActive]}>
                    Active ({activeGoals.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterChip, activeFilter === 'completed' && styles.filterChipActive]}
                  onPress={() => setActiveFilter('completed')}
                >
                  <Text style={[styles.filterChipText, activeFilter === 'completed' && styles.filterChipTextActive]}>
                    Completed ({completedGoals.length})
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Empty State when no goals at all */}
            {goals.length === 0 && !showAdd && (
              <View style={styles.emptyContainer}>
                <MaterialIcons name="flag" size={64} color={colors.surfaceVariant} />
                <Text style={styles.emptyTitle}>No Goals Yet</Text>
                <Text style={styles.emptySubtitle}>
                  Tap the + button to create a savings goal with target dates and pacing guidance.
                </Text>
              </View>
            )}

            {/* Empty State when filter has no results */}
            {goals.length > 0 && filteredGoals.length === 0 && (
              <View style={styles.emptyContainer}>
                <MaterialIcons name="inbox" size={48} color={colors.surfaceVariant} />
                <Text style={styles.emptyTitle}>
                  {activeFilter === 'completed' ? 'No Completed Goals' : 'No Active Goals'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {activeFilter === 'completed'
                    ? 'Goals you finish will appear here once fully funded.'
                    : 'All your goals are currently completed! Tap + to create a new one.'}
                </Text>
              </View>
            )}

            {/* Goal Cards List */}
            {filteredGoals.map((goal: Goal) => {
              const isCompleted = goal.targetAmount > 0 && goal.currentAmount >= goal.targetAmount;
              const progress =
                goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;

              // Pace calculation
              let paceInfo: string | null = null;
              if (!isCompleted && goal.targetDate) {
                const diffMs = new Date(goal.targetDate).getTime() - Date.now();
                const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                if (diffDays > 0) {
                  const months = Math.max(1, Math.round(diffDays / 30.44));
                  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
                  const monthlyRate = Math.ceil(remaining / months);
                  paceInfo = `~${formatCurrency(monthlyRate)}/mo`;
                } else {
                  paceInfo = 'Target passed';
                }
              }

              return (
                <Pressable
                  key={goal.id}
                  style={styles.goalCard}
                  onPress={() => router.navigate(`/goal-details?id=${goal.id}`)}
                >
                  <View style={styles.goalCardTop}>
                    <View style={styles.goalCardLeft}>
                      <View style={[styles.iconBox, isCompleted && { backgroundColor: colors.primaryContainer }]}>
                        <MaterialIcons
                          name={(goal.icon || 'savings') as any}
                          size={24}
                          color={isCompleted ? colors.onPrimaryContainer : colors.primary}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={styles.goalTitle} numberOfLines={1}>{goal.name}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          {goal.category ? (
                            <View style={styles.categoryBadge}>
                              <Text style={styles.categoryBadgeText}>{goal.category}</Text>
                            </View>
                          ) : null}
                          <Text style={styles.goalAmounts} numberOfLines={1}>
                            {formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {isCompleted ? (
                      <View style={styles.completedBadge}>
                        <MaterialIcons name="check-circle" size={14} color={colors.primary} />
                        <Text style={styles.completedBadgeText}>Completed</Text>
                      </View>
                    ) : (
                      <Text style={styles.goalPercent} numberOfLines={1}>{progress.toFixed(0)}%</Text>
                    )}
                  </View>

                  <View style={styles.goalCardBottom}>
                    <View style={styles.progressBarTrack}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${Math.min(100, Math.max(0, progress))}%`,
                            backgroundColor: isCompleted ? colors.primary : colors.primary,
                          },
                        ]}
                      />
                    </View>

                    <View style={styles.goalMetaRow}>
                      {goal.targetDate ? (
                        <View style={styles.targetDateRow}>
                          <MaterialIcons name="event" size={14} color={colors.onSurfaceVariant} />
                          <Text style={styles.goalTargetDate}>
                            {formatDate(goal.targetDate, 'short')}
                          </Text>
                        </View>
                      ) : (
                        <View />
                      )}

                      {isCompleted ? (
                        <Text style={styles.goalAchievedText}>Target reached</Text>
                      ) : paceInfo ? (
                        <Text style={styles.paceText}>{paceInfo}</Text>
                      ) : (
                        <Text style={styles.remainingText}>
                          {formatCurrency(Math.max(0, goal.targetAmount - goal.currentAmount))} left
                        </Text>
                      )}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </>
        )}
      </KeyboardAwareScrollView>

      {/* Date Picker Modal for Target Date */}
      <DatePickerModal
        visible={showDatePicker}
        value={newGoalTargetDate || todayStr}
        minDate={todayStr}
        onChange={(date) => {
          setNewGoalTargetDate(date);
          setShowDatePicker(false);
        }}
        onClose={() => setShowDatePicker(false)}
      />
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    avatarButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    avatarFallback: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollContent: {
      padding: 20,
      gap: 16,
    },

    /* Summary Card */
    summaryCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: 18,
      gap: 14,
    },
    summaryCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    summaryTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    summaryTitle: {
      ...typography.labelMd,
      color: colors.primary,
      letterSpacing: Platform.OS === 'ios' ? 0.8 : 0,
    },
    summaryBadge: {
      backgroundColor: colors.primaryContainer,
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 12,
    },
    summaryBadgeText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      color: colors.onPrimaryContainer,
    },
    summaryAmountRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
    },
    summarySavedAmount: {
      ...typography.displayLg,
      fontSize: 28,
      lineHeight: 34,
      color: colors.onSurface,
    },
    summaryTargetAmount: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
    },
    summaryStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: colors.outlineVariant,
    },
    summaryStatItem: {
      alignItems: 'center',
      flex: 1,
    },
    summaryStatDivider: {
      width: 1,
      height: 24,
      backgroundColor: colors.outlineVariant,
    },
    summaryStatLabel: {
      ...typography.labelMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      marginBottom: 2,
    },
    summaryStatValue: {
      ...typography.bodyMd,
      fontFamily: 'Manrope_700Bold',
      color: colors.onSurface,
    },

    /* Filter Chips */
    filterRow: {
      flexDirection: 'row',
      gap: 8,
    },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    filterChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterChipText: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
    },
    filterChipTextActive: {
      color: colors.onPrimary,
      fontFamily: 'Manrope_700Bold',
    },

    /* Goal Card */
    goalCard: {
      backgroundColor: colors.surfaceContainerLowest + 'CC',
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: 16,
      padding: 18,
      gap: 14,
    },
    goalCardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    goalCardLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      flex: 1,
      marginRight: 8,
    },
    iconBox: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    goalTitle: {
      ...typography.headlineSm,
      fontSize: 16,
      lineHeight: 22,
      color: colors.onSurface,
    },
    categoryBadge: {
      backgroundColor: colors.surfaceContainer,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 4,
    },
    categoryBadgeText: {
      ...typography.labelMd,
      fontSize: 10,
      color: colors.onSurfaceVariant,
      textTransform: 'uppercase',
    },
    goalAmounts: {
      ...typography.bodyMd,
      fontSize: 13,
      color: colors.onSurfaceVariant,
    },
    goalPercent: {
      ...typography.bodyLg,
      fontFamily: 'Manrope_700Bold',
      color: colors.primary,
      flexShrink: 0,
    },
    completedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primaryContainer,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    completedBadgeText: {
      ...typography.labelMd,
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
      color: colors.onPrimaryContainer,
    },
    goalCardBottom: {
      gap: 8,
    },
    progressBarTrack: {
      width: '100%',
      height: 8,
      backgroundColor: colors.surfaceContainer,
      borderRadius: 4,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: colors.primary,
      borderRadius: 4,
    },
    goalMetaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    targetDateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    goalTargetDate: {
      ...typography.labelMd,
      fontSize: 12,
      color: colors.onSurfaceVariant,
    },
    paceText: {
      ...typography.labelMd,
      fontSize: 12,
      fontFamily: 'Manrope_700Bold',
      color: colors.primary,
    },
    remainingText: {
      ...typography.labelMd,
      fontSize: 12,
      color: colors.onSurfaceVariant,
    },
    goalAchievedText: {
      ...typography.labelMd,
      fontSize: 12,
      fontFamily: 'Manrope_700Bold',
      color: colors.primary,
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
    addFormHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    addFormTitle: {
      ...typography.headlineSm,
      fontSize: 18,
      color: colors.onSurface,
    },
    input: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
      ...typography.bodyLg,
      color: colors.onSurface,
      flex: 1,
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
    formSection: {
      gap: 8,
    },
    formSectionLabel: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
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
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    datePickerBtnText: {
      ...typography.bodyMd,
    },
    clearDateBtn: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipsRow: {
      gap: 8,
      paddingVertical: 2,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    chipText: {
      ...typography.labelMd,
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
      borderColor: colors.outlineVariant,
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
      fontFamily: 'Manrope_700Bold',
      fontSize: 14,
      color: colors.onPrimary,
    },

    /* Empty States */
    emptyContainer: {
      padding: 40,
      alignItems: 'center',
      gap: 8,
    },
    emptyTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
      marginTop: 12,
    },
    emptySubtitle: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
      lineHeight: 20,
    },
  });
  return styles;
};

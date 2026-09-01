import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Image,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Text, Header, GoalsSkeleton } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useGoals, useCreateGoal } from '@/hooks/use-goals';
import { useToast, useAlert } from '@/components/ui';
import { formatCurrency, getCurrencySymbol } from '@/utils/format';
import type { Goal } from '@/types';

export default function GoalsScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { goals, isLoading, refetch } = useGoals();
  const { mutate: createGoal, isPending } = useCreateGoal();

  const [showAdd, setShowAdd] = useState(false);
  const [newGoalName, setNewGoalName] = useState('');
  const [newGoalTarget, setNewGoalTarget] = useState('');

  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch])
  );

  const { showToast } = useToast();
  const { showAlert } = useAlert();

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

    createGoal(
      {
        name: newGoalName.trim(),
        icon: 'star',
        targetAmount: targetAmt,
        currentAmount: 0,
        category: 'Savings',
        targetDate: '',
      },
      {
        onSuccess: () => {
          setNewGoalName('');
          setNewGoalTarget('');
          setShowAdd(false);
          refetch();
        },
      }
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header
        isMainTab
        title="Goals"
        leftNode={
          <TouchableOpacity style={styles.avatarButton} onPress={() => router.push('/settings')}>
            <View style={[styles.avatarFallback, { backgroundColor: colors.primaryContainer }]}>
              <MaterialIcons name="person" size={20} color={colors.onPrimaryContainer} />
            </View>
          </TouchableOpacity>
        }
        rightNode={
          <TouchableOpacity style={styles.iconButton} onPress={() => setShowAdd(!showAdd)}>
            <MaterialIcons name={showAdd ? 'close' : 'add'} size={24} color={colors.onSurface} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <GoalsSkeleton />
        ) : (
          <>
            {showAdd && (
              <View style={styles.addFormCard}>
                <Text style={styles.addFormTitle}>Create New Goal</Text>

                <TextInput
                  style={styles.input}
                  placeholder="Goal Name (e.g. New Laptop)"
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

            {goals.length === 0 && !showAdd && (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <MaterialIcons name="flag" size={64} color={colors.surfaceVariant} />
                <Text style={{ ...typography.headlineSm, color: colors.onSurface, marginTop: 16 }}>
                  No Goals Yet
                </Text>
                <Text
                  style={{
                    ...typography.bodyMd,
                    color: colors.onSurfaceVariant,
                    textAlign: 'center',
                    marginTop: 8,
                  }}
                >
                  Tap the + button to create a savings goal.
                </Text>
              </View>
            )}

            {goals.map((goal: Goal) => {
              const progress =
                goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;
              return (
                <Pressable
                  key={goal.id}
                  style={styles.goalCard}
                  onPress={() => router.push(`/goal-details?id=${goal.id}`)}
                >
                  <View style={styles.goalCardTop}>
                    <View style={styles.goalCardLeft}>
                      <View style={styles.iconBox}>
                        <MaterialIcons name={goal.icon as any} size={24} color={colors.primary} />
                      </View>
                      <View>
                        <Text style={styles.goalTitle}>{goal.name}</Text>
                        <Text style={styles.goalAmounts}>
                          {formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.goalPercent}>{progress.toFixed(0)}%</Text>
                  </View>

                  <View style={styles.goalCardBottom}>
                    <View style={styles.progressBarTrack}>
                      <View
                        style={[styles.progressBarFill, { width: `${Math.min(100, progress)}%` }]}
                      />
                    </View>
                    {goal.targetDate && (
                      <Text style={styles.goalTargetDate}>
                        Target: {new Date(goal.targetDate).toLocaleDateString()}
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background, // colors.background
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
    goalCard: {
      backgroundColor: colors.surfaceContainerLowest + 'CC',
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: 16,
      padding: 20,
      gap: 16,
    },
    goalCardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    goalCardLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    iconBox: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    goalTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
    },
    goalAmounts: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      marginTop: 2,
    },
    goalPercent: {
      ...typography.bodyLg,
      fontWeight: '700',
      color: colors.primary,
    },
    goalCardBottom: {
      gap: 12,
    },
    progressBarTrack: {
      width: '100%',
      height: 10,
      backgroundColor: colors.surfaceContainer,
      borderRadius: 5,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: colors.primary,
      borderRadius: 5,
    },
    goalTargetDate: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      textAlign: 'right',
    },
    addFormCard: {
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: 20,
      gap: 16,
      marginBottom: 16,
    },
    addFormTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
    },
    input: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: 8,
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
    saveBtn: {
      backgroundColor: colors.primary,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
    },
    saveBtnText: {
      ...typography.labelMd,
      color: colors.onPrimary,
    },
  });
  return styles;
};

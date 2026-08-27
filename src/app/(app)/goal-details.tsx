import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { Text, Header, useToast, useAlert, Loader } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useGoal, useGoalContributions, useAddGoalContribution, useDeleteGoal } from '@/hooks/use-goals';
import { useAccounts } from '@/hooks/use-accounts';
import { formatCurrency, getCurrencySymbol } from '@/utils/format';
import type { GoalContribution } from '@/types';

export default function GoalDetailsScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { showAlert } = useAlert();

  const { goal, isLoading: goalLoading, refetch: refetchGoal } = useGoal(id as string);
  const { contributions, isLoading: contribLoading, refetch: refetchContribs } = useGoalContributions(id as string);
  const { mutate: addContrib, isPending } = useAddGoalContribution();
  const { mutate: deleteGoal, isPending: isDeleting } = useDeleteGoal();
  const { accounts } = useAccounts();

  const [showAdd, setShowAdd] = useState(false);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const isLoading = goalLoading || contribLoading;

  if (!goal && !isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.error }}>Goal not found</Text>
      </View>
    );
  }

  const handleAddContribution = () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      showAlert('Validation Error', 'Please enter a valid contribution amount.');
      return;
    }

    addContrib({
      data: {
        goalId: goal?.id || '',
        amount: amt,
        date: new Date().toISOString().split('T')[0],
        description: notes.trim() || ''
      },
      accountId: selectedAccountId || undefined,
    }, {
      onSuccess: () => {
        setAmount('');
        setNotes('');
        setShowAdd(false);
        setSelectedAccountId(null);
        refetchGoal();
        refetchContribs();
      }
    });
  };

  const handleDeleteGoal = () => {
    showAlert(
      'Delete Goal',
      'Are you sure you want to delete this goal? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteGoal(goal?.id || '', {
              onSuccess: () => {
                router.replace('/goals');
              }
            });
          }
        }
      ]
    );
  };

  const progress = goal && goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0;
  // Map progress to dash array (max 100 circumference is roughly `42` in this SVG)
  // Or rather, the path total length for r=15.9155 is exactly 100. So we can use `progress` directly!
  const strokeDash = `${progress}, 100`;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header
        showBack
        title={goal?.name ?? 'Goal Details'}
        rightNode={
          <TouchableOpacity style={styles.iconButton} onPress={handleDeleteGoal} disabled={isDeleting}>
            {isDeleting ? (
              <ActivityIndicator size="small" color={colors.error} />
            ) : (
              <MaterialIcons name="delete-outline" size={24} color={colors.error} />
            )}
          </TouchableOpacity>
        }
      />

      {goal && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]} showsVerticalScrollIndicator={false}>
        { isLoading ? <Loader /> : (<>
        {/* Header Section */}
        <View style={styles.heroSection}>
          <View>
            <View style={styles.categoryRow}>
              <MaterialIcons name={goal.icon as any} size={20} color={colors.primary} />
              <Text style={styles.categoryText}>{goal.category}</Text>
            </View>
            <Text style={styles.heroDescription}>Track your savings progress.</Text>
          </View>
          <TouchableOpacity
            style={styles.addContributionBtn}
            onPress={() => setShowAdd(!showAdd)}
          >
            <MaterialIcons name={showAdd ? "close" : "add"} size={18} color={colors.onPrimary} />
            <Text style={styles.addContributionBtnText}>{showAdd ? 'Cancel' : 'Add Contribution'}</Text>
          </TouchableOpacity>
        </View>

        {showAdd && (
          <View style={styles.addFormCard}>
            <Text style={styles.addFormTitle}>Add Contribution</Text>
            <View style={styles.currencyInputRow}>
              <Text style={styles.currencySymbol}>{getCurrencySymbol()}</Text>
              <TextInput
                style={styles.input}
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
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
                {accounts.map(acc => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[
                      styles.accountChip,
                      selectedAccountId === acc.id && { backgroundColor: colors.primary, borderColor: colors.primary }
                    ]}
                    onPress={() => setSelectedAccountId(selectedAccountId === acc.id ? null : acc.id)}
                  >
                    <Text style={[
                      styles.accountChipText,
                      selectedAccountId === acc.id && { color: colors.onPrimary }
                    ]}>
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
            {/* SVG Donut Chart */}
            <View style={styles.svgWrapper}>
              <Svg viewBox="0 0 36 36" style={styles.svgChart}>
                <Path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke={colors.surfaceVariant}
                  strokeWidth="2.5"
                />
                <Path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke={colors.primary}
                  strokeWidth="2.5"
                  strokeDasharray={strokeDash}
                  strokeLinecap="round"
                />
              </Svg>
              <View style={styles.chartCenterTextContainer}>
                <Text style={styles.chartPercentage}>{progress.toFixed(0)}%</Text>
                <Text style={styles.chartSubtitle}>Funded</Text>
              </View>
            </View>

            <View style={styles.amountsRow}>
              <View>
                <Text style={styles.amountLabel}>Current</Text>
                <Text style={styles.amountCurrent}>{formatCurrency(goal.currentAmount)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.amountLabel}>Target</Text>
                <Text style={styles.amountTarget}>{formatCurrency(goal.targetAmount)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Timeline Card */}
        <View style={styles.timelineCard}>
          <View style={styles.timelineHeader}>
            <Text style={styles.timelineTitle}>Contribution History</Text>
          </View>

          <View style={styles.transactionList}>
            {contributions.length === 0 ? (
               <Text style={{ padding: 16, color: colors.onSurfaceVariant }}>No contributions yet.</Text>
            ) : (
              contributions.map((contrib: GoalContribution, idx: number) => (
                <View key={contrib.id} style={[styles.transactionItem, idx === contributions.length - 1 && styles.transactionItemLast]}>
                  <View style={styles.transactionItemLeft}>
                    <View style={styles.transactionIconBox}>
                      <MaterialIcons name="south-east" size={20} color={colors.onSurfaceVariant} />
                    </View>
                    <View style={styles.transactionTextContent}>
                      <Text style={styles.transactionDesc} numberOfLines={1}>
                        {contrib.description || 'Contribution'}
                      </Text>
                      <Text style={styles.transactionDate}>{contrib.date}</Text>
                    </View>
                  </View>
                  <Text style={styles.transactionAmount}>+{formatCurrency(contrib.amount)}</Text>
                </View>
              ))
            )}
          </View>
        </View>
        </>)}
        </ScrollView>
      )}
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },

    iconButton: {
      padding: 8,
    },
    scrollContent: {
      padding: 20,
      gap: 24,
    },
    heroSection: {
      gap: 16,
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
      letterSpacing: 0.6,
    },
    heroDescription: {
      ...typography.bodyMd,
      color: colors.secondary,
    },
    addContributionBtn: {
      backgroundColor: colors.primary,
      borderRadius: 24,
      height: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      gap: 8,
    },
    addContributionBtnText: {
      ...typography.labelMd,
      color: colors.onPrimary,
    },
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      borderRadius: 16,
      padding: 20,
    },
    chartContainer: {
      alignItems: 'center',
    },
    svgWrapper: {
      width: '100%',
      maxWidth: 240,
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
      transform: [{ rotate: '-90deg' }],
    },
    chartCenterTextContainer: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
    chartPercentage: {
      ...typography.displayLg,
      color: colors.onSurface,
      lineHeight: 40,
    },
    chartSubtitle: {
      ...typography.labelMd,
      color: colors.secondary,
      marginTop: 4,
    },
    amountsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      width: '100%',
      marginTop: 24,
      paddingHorizontal: 16,
    },
    amountLabel: {
      ...typography.labelMd,
      color: colors.secondary,
    },
    amountCurrent: {
      ...typography.dataLg,
      color: colors.onSurface,
    },
    amountTarget: {
      ...typography.headlineSm,
      color: colors.onSurfaceVariant,
    },
    timelineCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      borderRadius: 16,
      padding: 20,
    },
    timelineHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 24,
    },
    timelineTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
    },
    transactionList: {
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      borderRadius: 12,
      overflow: 'hidden',
    },
    transactionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      backgroundColor: colors.surfaceContainerLowest,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceVariant,
    },
    transactionItemLast: {
      borderBottomWidth: 0,
    },
    transactionItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      flex: 1,
      paddingRight: 12,
    },
    transactionTextContent: {
      flex: 1,
    },
    transactionIconBox: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    transactionDesc: {
      ...typography.bodyLg,
      color: colors.onSurface,
    },
    transactionDate: {
      ...typography.bodyMd,
      color: colors.secondary,
    },
    transactionAmount: {
      ...typography.headlineSm,
      color: colors.primary,
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
    accountSelector: {
      marginTop: 8,
    },
    accountSelectorTitle: {
      ...typography.labelMd,
      color: colors.secondary,
      marginBottom: 4,
    },
    accountChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      backgroundColor: colors.surfaceContainerLowest,
    },
    accountChipText: {
      ...typography.labelMd,
      color: colors.onSurface,
    },
  });
  return styles;
};

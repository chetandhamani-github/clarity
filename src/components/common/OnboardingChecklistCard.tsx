import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from '@/components/ui';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme, typography, ThemeColors } from '@/theme';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/store/use-app-store';

interface Props {
  hasAccounts: boolean;
  hasTransactions: boolean;
  hasBudgetPlan: boolean;
  googleDriveConnected: boolean;
}

export function OnboardingChecklistCard({
  hasAccounts,
  hasTransactions,
  hasBudgetPlan,
  googleDriveConnected,
}: Props) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const hasDismissed = useAppStore((state) => state.hasDismissedOnboardingChecklist);
  const setDismissed = useAppStore((state) => state.setHasDismissedOnboardingChecklist);

  const tasks = [
    {
      id: 'accounts',
      title: 'Set up Bank Accounts',
      desc: 'Savings, credit cards, or cash wallets',
      isCompleted: hasAccounts,
      route: '/(app)/(tabs)/accounts',
    },
    {
      id: 'transactions',
      title: 'Scan SMS or Log Transaction',
      desc: 'Import bank SMS or record cash spends',
      isCompleted: hasTransactions,
      route: '/(app)/add-transaction',
    },
    {
      id: 'budget',
      title: 'Set Up Monthly Budget',
      desc: 'Needs, wants, & savings allocations',
      isCompleted: hasBudgetPlan,
      route: '/(app)/budget-setup',
    },
    {
      id: 'backup',
      title: 'Connect Google Drive Backup',
      desc: 'Automatic encrypted cloud backups',
      isCompleted: googleDriveConnected,
      route: '/(app)/settings',
    },
  ];

  const completedCount = tasks.filter((t) => t.isCompleted).length;
  const progressPct = (completedCount / tasks.length) * 100;

  // Do not show if user dismissed it or if all tasks are already completed
  if (hasDismissed || completedCount === tasks.length) {
    return null;
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Getting Started</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {completedCount}/{tasks.length}
              </Text>
            </View>
          </View>
          <Text style={styles.subtitle}>Set up Clarity for complete financial visibility</Text>
        </View>
        <TouchableOpacity
          onPress={() => setDismissed(true)}
          style={styles.closeBtn}
          accessibilityLabel="Dismiss getting started guide"
        >
          <MaterialIcons name="close" size={20} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
      </View>

      {/* Progress Track */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.max(4, progressPct)}%` }]} />
      </View>

      {/* Task List */}
      <View style={styles.taskList}>
        {tasks.map((task) => (
          <TouchableOpacity
            key={task.id}
            style={styles.taskItem}
            onPress={() => router.navigate(task.route as any)}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name={task.isCompleted ? 'check-circle' : 'radio-button-unchecked'}
              size={22}
              color={task.isCompleted ? colors.primary : colors.outline}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={[
                  styles.taskTitle,
                  task.isCompleted && { textDecorationLine: 'line-through', opacity: 0.7 },
                ]}
                numberOfLines={1}
              >
                {task.title}
              </Text>
              <Text style={styles.taskDesc} numberOfLines={1}>
                {task.desc}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={18} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 16,
      marginBottom: 24,
      gap: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    title: {
      ...typography.headlineSm,
      fontSize: 18,
      lineHeight: 24,
      color: colors.onSurface,
      fontWeight: '700',
    },
    badge: {
      backgroundColor: colors.primaryContainer,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    badgeText: {
      ...typography.labelMd,
      color: colors.onPrimaryContainer,
      fontWeight: '700',
    },
    subtitle: {
      ...typography.bodyMd,
      fontSize: 13,
      lineHeight: 18,
      color: colors.onSurfaceVariant,
    },
    closeBtn: {
      padding: 4,
      borderRadius: 12,
    },
    progressTrack: {
      height: 6,
      backgroundColor: colors.surfaceContainerHighest,
      borderRadius: 3,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.primary,
      borderRadius: 3,
    },
    taskList: {
      gap: 10,
    },
    taskItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 6,
    },
    taskTitle: {
      ...typography.bodyMd,
      color: colors.onSurface,
      fontWeight: '600',
    },
    taskDesc: {
      ...typography.bodyMd,
      fontSize: 12,
      lineHeight: 16,
      color: colors.onSurfaceVariant,
    },
  });


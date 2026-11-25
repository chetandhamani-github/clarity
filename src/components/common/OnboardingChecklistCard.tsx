import React from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Text } from '@/components/ui';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme, typography, ThemeColors } from '@/theme';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/store/use-app-store';

interface Props {
  hasAccounts: boolean;
  hasTransactions: boolean;
  hasBudgetPlan: boolean;
  hasGoals?: boolean;
  googleDriveConnected: boolean;
  onEnableAutoTracking?: () => void;
  autoTrackingEnabled?: boolean;
}

export function OnboardingChecklistCard({
  hasAccounts,
  hasTransactions,
  hasBudgetPlan,
  hasGoals = false,
  googleDriveConnected,
  onEnableAutoTracking,
  autoTrackingEnabled = false,
}: Props) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const hasDismissed = useAppStore((state) => state.hasDismissedOnboardingChecklist);
  const setDismissed = useAppStore((state) => state.setHasDismissedOnboardingChecklist);

  const tasks = [
    {
      id: 'accounts',
      title: 'Set up Bank Account',
      desc: 'Savings, credit card, or cash wallet',
      icon: 'account-balance' as const,
      isCompleted: hasAccounts,
      route: '/(app)/(tabs)/accounts',
    },
    {
      id: 'transactions',
      title: Platform.OS === 'android' ? 'Auto-Track Alerts or Log Spend' : 'Import or Log Spend',
      desc:
        Platform.OS === 'android'
          ? 'Enable banking alerts, import PDF/CSV, or record spend'
          : 'Import PDF/CSV statements or record cash expenses',
      icon: 'receipt-long' as const,
      isCompleted: hasTransactions || autoTrackingEnabled,
      route: '/(app)/add-transaction',
      action:
        Platform.OS === 'android' && !autoTrackingEnabled && onEnableAutoTracking
          ? onEnableAutoTracking
          : undefined,
    },
    {
      id: 'budget',
      title: 'Set Up Monthly Budget',
      desc: '50/30/20 needs, wants, & savings allocations',
      icon: 'pie-chart' as const,
      isCompleted: hasBudgetPlan,
      route: '/(app)/budget-setup',
    },
    {
      id: 'goals',
      title: 'Create a Savings Goal',
      desc: 'Emergency fund, travel, or big purchase',
      icon: 'flag' as const,
      isCompleted: hasGoals,
      route: '/(app)/(tabs)/goals',
    },
    {
      id: 'backup',
      title: 'Connect Cloud Backup',
      desc: 'Automatic encrypted Google Drive backups',
      icon: 'cloud-done' as const,
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

  const handleTaskPress = (task: (typeof tasks)[number]) => {
    if (task.action && !task.isCompleted) {
      task.action();
    } else {
      router.navigate(task.route as any);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              Getting Started
            </Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText} numberOfLines={1}>
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
            onPress={() => handleTaskPress(task)}
            activeOpacity={0.7}
          >
            <MaterialIcons
              name={task.isCompleted ? 'check-circle' : 'radio-button-unchecked'}
              size={22}
              color={task.isCompleted ? colors.primary : colors.outline}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.taskTitleRow}>
                <Text
                  style={[
                    styles.taskTitle,
                    task.isCompleted && { textDecorationLine: 'line-through', opacity: 0.7 },
                  ]}
                  numberOfLines={1}
                >
                  {task.title}
                </Text>
              </View>
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

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: 16,
      marginBottom: 20,
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
      fontFamily: 'Manrope_700Bold',
      fontSize: 18,
      lineHeight: 24,
      color: colors.onSurface,
      flexShrink: 1,
    },
    badge: {
      backgroundColor: colors.primaryContainer,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      color: colors.onPrimaryContainer,
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
    taskTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
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
  return styles;
};

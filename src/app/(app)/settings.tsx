import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { Text } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/store/use-app-store';
import { clearDatabase } from '@/services/database';
import { useNotifications } from '@/hooks/use-notifications';
import { useGoals } from '@/hooks/use-goals';
import { useCategorySpending } from '@/hooks/use-budget';
import { formatCurrency } from '@/utils/format';
import { useAlert } from '@/components/ui';

export default function SettingsScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const themeSetting = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const biometricsEnabled = useAppStore(state => state.biometricEnabled);
  const setBiometricsEnabled = useAppStore(state => state.setBiometricEnabled);
  const [isResetting, setIsResetting] = useState(false);
  const { showAlert } = useAlert();

  const now = new Date();
  const { notifications } = useNotifications();
  const { goals } = useGoals();
  const { spending } = useCategorySpending(now.getMonth() + 1, now.getFullYear());

  const topGoal = goals?.[0];
  const topSpending = spending?.filter(s => s.spent > 0).sort((a, b) => b.spent - a.spent)[0];
  const recentAlerts = notifications.filter(n => n.type === 'alert').slice(0, 2);

  const cycleTheme = () => {
    if (themeSetting === 'system') setTheme('light');
    else if (themeSetting === 'light') setTheme('dark');
    else setTheme('system');
  };

  const handleResetData = () => {
    showAlert(
      'Reset App Data',
      'Are you sure you want to delete all data and reset the app? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Reset', 
          style: 'destructive',
          onPress: async () => {
            try {
              setIsResetting(true);
              await clearDatabase();
              showAlert('Success', 'App data has been reset to defaults. Please restart the app.');
            } catch (error) {
              console.error(error);
              showAlert('Error', 'Failed to reset app data.');
            } finally {
              setIsResetting(false);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Intelligence & System
        </Text>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/notifications')}>
          <MaterialIcons name="notifications" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 60 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Intelligence Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Intelligence</Text>
          <View style={styles.grid}>
            <View style={styles.card}>
              <View>
                <View style={[styles.iconBox, { backgroundColor: colors.errorContainer }]}>
                  <MaterialIcons name="trending-up" size={20} color={colors.onErrorContainer} />
                </View>
                <Text style={styles.cardLabel}>TOP SPENDING</Text>
                <Text style={styles.cardBody}>
                  {topSpending 
                    ? `You've spent ${formatCurrency(topSpending.spent)} on ${topSpending.category} this month.`
                    : 'No spending data yet this month.'}
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <View>
                <View style={[styles.iconBox, { backgroundColor: colors.primaryContainer }]}>
                  <MaterialIcons name="flag" size={20} color={colors.onPrimaryContainer} />
                </View>
                <Text style={styles.cardLabel}>GOAL STATUS</Text>
                <Text style={styles.cardBody}>
                  {topGoal 
                    ? `On track for "${topGoal.name}". ${formatCurrency(topGoal.targetAmount - topGoal.currentAmount)} left to target.`
                    : 'Create a savings goal to track progress here.'}
                </Text>
              </View>
              {topGoal && (
                <View style={styles.progressBarTrack}>
                  <View style={[styles.progressBarFill, { width: `${Math.min(100, (topGoal.currentAmount / topGoal.targetAmount) * 100)}%` }]} />
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Alerts Mini Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Alerts</Text>
            <TouchableOpacity onPress={() => router.push('/notifications')}>
              <Text style={styles.actionText}>VIEW ALL</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.listCard}>
            {recentAlerts.length > 0 ? recentAlerts.map(alert => (
              <TouchableOpacity key={alert.id} style={styles.listItem} onPress={() => router.push('/notifications')}>
                <View style={[styles.dot, { backgroundColor: alert.isRead ? 'transparent' : colors.error }]} />
                <View style={styles.listItemContent}>
                  <Text style={styles.listItemTitle}>{alert.title}</Text>
                  <Text style={styles.listItemBody} numberOfLines={1}>{alert.description}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            )) : (
              <View style={[styles.listItem, { justifyContent: 'center' }]}>
                <Text style={styles.listItemBody}>No recent alerts.</Text>
              </View>
            )}
          </View>
        </View>

        {/* Preferences Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.listCard}>
            <TouchableOpacity style={styles.settingItem} onPress={cycleTheme}>
              <View style={styles.settingItemLeft}>
                <MaterialIcons name="palette" size={24} color={colors.secondary} />
                <View>
                  <Text style={styles.settingTitle}>Appearance</Text>
                  <Text style={styles.settingSub}>
                    {themeSetting === 'system'
                      ? 'System Default'
                      : themeSetting === 'light'
                        ? 'Light'
                        : 'Dark'}
                  </Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.outline} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingItem} onPress={() => router.push('/security')}>
              <View style={styles.settingItemLeft}>
                <MaterialIcons name="lock" size={24} color={colors.secondary} />
                <View>
                  <Text style={styles.settingTitle}>Security</Text>
                  <Text style={styles.settingSub}>Biometrics Enabled</Text>
                </View>
              </View>
              <Switch
                value={biometricsEnabled}
                onValueChange={setBiometricsEnabled}
                trackColor={{ false: colors.surfaceVariant, true: colors.primary }}
                thumbColor={colors.surfaceContainerLowest}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Data Vault */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Vault</Text>
          <View style={[styles.card, { minHeight: 'auto', gap: 16 }]}>
            <View>
              <Text style={styles.settingTitle}>Manage your local data.</Text>
            </View>
            <View style={{ gap: 8 }}>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => router.push('/export-success')}
              >
                <Text style={styles.btnSecondaryText}>EXPORT CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: colors.error }]}
                onPress={handleResetData}
                disabled={isResetting}
              >
                <Text style={styles.btnPrimaryText}>{isResetting ? 'RESETTING...' : 'RESET APP DATA'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      height: 64,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.surfaceVariant,
    },
    headerTitle: {
      ...typography.headlineMd,
      color: colors.onSurface,
    },
    iconButton: {
      padding: 8,
    },
    scrollContent: {
      padding: 20,
      gap: 32,
    },
    section: {
      gap: 16,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
    },
    sectionTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
    },
    actionText: {
      ...typography.labelMd,
      color: colors.primary,
    },
    grid: {
      flexDirection: 'row',
      gap: 12,
    },
    card: {
      flex: 1,
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: 16,
      padding: 16,
      justifyContent: 'space-between',
      minHeight: 180,
    },
    iconBox: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    cardLabel: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      marginBottom: 4,
    },
    cardBody: {
      ...typography.bodyLg,
      color: colors.onSurface,
      lineHeight: 20,
    },
    progressBarTrack: {
      width: '100%',
      height: 6,
      backgroundColor: colors.surfaceVariant,
      borderRadius: 3,
      marginTop: 16,
    },
    progressBarFill: {
      height: '100%',
      backgroundColor: colors.primary,
      borderRadius: 3,
    },
    listCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: 16,
      overflow: 'hidden',
    },
    listItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      padding: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.surfaceVariant,
      gap: 12,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginTop: 6,
    },
    listItemContent: {
      flex: 1,
    },
    listItemTitle: {
      ...typography.bodyLg,
      fontWeight: '500',
      color: colors.onSurface,
    },
    listItemBody: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
    },
    settingItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.surfaceVariant,
    },
    settingItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    settingTitle: {
      ...typography.bodyLg,
      color: colors.onSurface,
    },
    settingSub: {
      ...typography.bodyMd,
      color: colors.secondary,
    },
    btnPrimary: {
      backgroundColor: colors.primary,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnPrimaryText: {
      ...typography.labelMd,
      color: colors.onPrimary,
      textAlign: 'center',
    },
    btnSecondary: {
      backgroundColor: colors.surfaceContainerLow,
      paddingVertical: 12,
      paddingHorizontal: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnSecondaryText: {
      ...typography.labelMd,
      color: colors.onSurface,
      textAlign: 'center',
    },
  });
  return styles;
};

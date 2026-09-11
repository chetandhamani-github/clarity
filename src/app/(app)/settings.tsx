import { Header, Text, useAlert, useToast } from '@/components/ui';
import { useCategorySpending } from '@/hooks/use-budget';
import { useGoals } from '@/hooks/use-goals';
import { useGoogleDrive } from '@/hooks/use-google-drive';
import { useNotifications } from '@/hooks/use-notifications';
import { useSmsSync } from '@/hooks/useSmsSync';
import { clearDatabase } from '@/services/database';
import { useAppStore } from '@/store/use-app-store';
import { ThemeColors, typography, useTheme } from '@/theme';
import { formatCurrency } from '@/utils/format';
import { MaterialIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const themeSetting = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const currencySetting = useAppStore((state) => state.currency);
  const setCurrency = useAppStore((state) => state.setCurrency);
  const biometricsEnabled = useAppStore((state) => state.biometricEnabled);
  const [isResetting, setIsResetting] = useState(false);
  const { showAlert } = useAlert();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const {
    isConnected: isDriveConnected,
    userEmail: driveUserEmail,
    lastBackupTime: driveLastBackupTime,
    isConnecting: isConnectingDrive,
    isBackingUp: isBackingUpDrive,
    isRestoring: isRestoringDrive,
    isAutoSyncing,
    autoBackupEnabled,
    setAutoBackupEnabled,
    connect: connectDrive,
    disconnect: disconnectDrive,
    backupNow: backupDriveNow,
    restoreFromDrive,
  } = useGoogleDrive();

  const {
    permissionStatus,
    isSyncing: isSmsSyncing,
    progress: smsProgress,
    lastSyncTimestamp,
    sync: syncSms,
    requestPermission: requestSmsPermission,
  } = useSmsSync();

  const handleSmsScan = async () => {
    try {
      if (permissionStatus === 'permanently_denied') {
        Linking.openSettings();
        return;
      }
      if (permissionStatus !== 'granted') {
        const res = await requestSmsPermission();
        if (res === 'permanently_denied') {
          Linking.openSettings();
          return;
        }
        if (res !== 'granted') {
          showToast('SMS permission is required to scan messages', 'error');
          return;
        }
      }
      await syncSms();
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      showToast('SMS scan completed successfully!', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'SMS scan failed', 'error');
    }
  };

  const now = new Date();
  const { notifications } = useNotifications();
  const { goals } = useGoals();
  const { spending } = useCategorySpending(now.getMonth() + 1, now.getFullYear());

  const topGoal = goals?.[0];
  const topSpending = spending?.filter((s) => s.spent > 0).sort((a, b) => b.spent - a.spent)[0];
  const recentAlerts = notifications.filter((n) => n.type === 'alert').slice(0, 2);

  const cycleTheme = () => {
    if (themeSetting === 'system') setTheme('light');
    else if (themeSetting === 'light') setTheme('dark');
    else setTheme('system');
  };

  const cycleCurrency = () => {
    if (currencySetting === 'INR') setCurrency('USD');
    else if (currencySetting === 'USD') setCurrency('EUR');
    else if (currencySetting === 'EUR') setCurrency('GBP');
    else setCurrency('INR');
  };

  const handleRestoreFromDrive = async () => {
    const backupDateMsg = driveLastBackupTime
      ? ` (Backup from: ${new Date(driveLastBackupTime).toLocaleString()})`
      : '';
    showAlert(
      'Restore from Google Drive',
      `This will restore accounts, transactions, and goals from Google Drive and replace local data${backupDateMsg}. Would you like to proceed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'default',
          onPress: async () => {
            await restoreFromDrive();
          },
        },
      ]
    );
  };

  const handleDisconnectDrive = () => {
    showAlert(
      'Disconnect Google Drive',
      'Are you sure you want to disconnect your Google Drive account? Local data will not be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: disconnectDrive,
        },
      ]
    );
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
              queryClient.clear();
              showToast('App data has been reset to defaults', 'success');
            } catch (error) {
              console.error(error);
              showToast('Failed to reset app data', 'error');
            } finally {
              setIsResetting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header
        showBack
        title="Intelligence & System"
        rightNode={
          <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/notifications')}>
            <MaterialIcons name="notifications" size={24} color={colors.primary} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
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
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min(100, (topGoal.currentAmount / topGoal.targetAmount) * 100)}%`,
                      },
                    ]}
                  />
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
            {recentAlerts.length > 0 ? (
              recentAlerts.map((alert) => (
                <TouchableOpacity
                  key={alert.id}
                  style={styles.listItem}
                  onPress={() => router.push('/notifications')}
                >
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: alert.isRead ? 'transparent' : colors.error },
                    ]}
                  />
                  <View style={styles.listItemContent}>
                    <Text style={styles.listItemTitle}>{alert.title}</Text>
                    <Text style={styles.listItemBody} numberOfLines={1}>
                      {alert.description}
                    </Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
                </TouchableOpacity>
              ))
            ) : (
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
                <View style={styles.settingTextContainer}>
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
            <TouchableOpacity style={styles.settingItem} onPress={cycleCurrency}>
              <View style={styles.settingItemLeft}>
                <MaterialIcons name="payments" size={24} color={colors.secondary} />
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingTitle}>Currency</Text>
                  <Text style={styles.settingSub}>
                    {currencySetting === 'INR'
                      ? 'Indian Rupee (₹)'
                      : currencySetting === 'USD'
                        ? 'US Dollar ($)'
                        : currencySetting === 'EUR'
                          ? 'Euro (€)'
                          : currencySetting === 'GBP'
                            ? 'British Pound (£)'
                            : currencySetting}
                  </Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.outline} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.settingItem} onPress={() => router.push('/security')}>
              <View style={styles.settingItemLeft}>
                <MaterialIcons name="lock" size={24} color={colors.secondary} />
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingTitle}>Security & Privacy</Text>
                  <Text style={styles.settingSub}>
                    {biometricsEnabled ? 'Biometrics Enabled' : 'Biometrics Disabled'}
                  </Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.outline} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => router.push('/(app)/bills')}
            >
              <View style={styles.settingItemLeft}>
                <MaterialIcons name="receipt-long" size={24} color={colors.secondary} />
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingTitle}>Bills & Utilities</Text>
                  <Text style={styles.settingSub}>Reminders, recurring bills & auto-settlement</Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.outline} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => router.push('/(app)/splitwise')}
            >
              <View style={styles.settingItemLeft}>
                <MaterialIcons name="group" size={24} color={colors.primary} />
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingTitle}>Splitwise & Shared Expenses</Text>
                  <Text style={styles.settingSub}>Track friends, debts, IOUs & settlements</Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.outline} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => router.push('/manage-categories')}
            >
              <View style={styles.settingItemLeft}>
                <MaterialIcons name="category" size={24} color={colors.secondary} />
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingTitle}>Manage Categories</Text>
                  <Text style={styles.settingSub}>Customize spending categories</Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={colors.outline} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Google Drive Cloud Backup */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Google Drive Cloud Backup</Text>
          <View style={[styles.card, { minHeight: 'auto', gap: 16 }]}>
            {isDriveConnected ? (
              <>
                <View style={styles.driveStatusRow}>
                  <View
                    style={[
                      styles.driveIconBox,
                      { backgroundColor: colors.primaryContainer },
                    ]}
                  >
                    <MaterialIcons name="cloud-done" size={24} color={colors.onPrimaryContainer} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.driveStatusTitle}>Connected to Google Drive</Text>
                    <Text style={styles.driveStatusEmail} numberOfLines={1}>
                      {driveUserEmail || 'Personal Cloud Vault'}
                    </Text>
                    <Text style={styles.driveLastBackupText}>
                      Last Backup:{' '}
                      {driveLastBackupTime
                        ? new Date(driveLastBackupTime).toLocaleString()
                        : 'Not backed up yet'}
                    </Text>
                  </View>
                </View>

                {/* Automatic Cloud Sync Toggle */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    backgroundColor: colors.surfaceContainer,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.surfaceVariant,
                  }}
                >
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.settingTitle}>Automatic Cloud Sync</Text>
                      {isAutoSyncing && (
                        <ActivityIndicator size="small" color={colors.primary} />
                      )}
                    </View>
                    <Text style={styles.settingSub}>
                      Auto-syncs changes & updates silently in background.
                    </Text>
                  </View>
                  <Switch
                    value={autoBackupEnabled}
                    onValueChange={(val) => setAutoBackupEnabled(val)}
                    trackColor={{ false: colors.surfaceContainerHighest, true: colors.primary }}
                    thumbColor={colors.onPrimary}
                  />
                </View>

                <View style={{ gap: 8 }}>
                  <TouchableOpacity
                    style={styles.btnPrimary}
                    onPress={backupDriveNow}
                    disabled={isBackingUpDrive || isRestoringDrive}
                  >
                    {isBackingUpDrive ? (
                      <ActivityIndicator size="small" color={colors.onPrimary} />
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <MaterialIcons name="cloud-upload" size={18} color={colors.onPrimary} />
                        <Text style={styles.btnPrimaryText}>BACKUP NOW</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.btnSecondary}
                    onPress={handleRestoreFromDrive}
                    disabled={isBackingUpDrive || isRestoringDrive}
                  >
                    {isRestoringDrive ? (
                      <ActivityIndicator size="small" color={colors.onSurface} />
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <MaterialIcons name="cloud-download" size={18} color={colors.onSurface} />
                        <Text style={styles.btnSecondaryText}>RESTORE FROM DRIVE</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.btnSecondary, { borderColor: colors.error, borderWidth: 1 }]}
                    onPress={handleDisconnectDrive}
                    disabled={isBackingUpDrive || isRestoringDrive}
                  >
                    <Text style={[styles.btnSecondaryText, { color: colors.error }]}>
                      DISCONNECT DRIVE
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={styles.driveStatusRow}>
                  <View
                    style={[
                      styles.driveIconBox,
                      { backgroundColor: colors.surfaceContainerHighest },
                    ]}
                  >
                    <MaterialIcons name="cloud-queue" size={24} color={colors.onSurfaceVariant} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.driveStatusTitle}>Cloud Backup Not Connected</Text>
                    <Text style={styles.driveStatusEmail}>
                      Connect Google Drive to safely synchronize accounts, transactions, and goals.
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.btnPrimary}
                  onPress={() => connectDrive()}
                  disabled={isConnectingDrive}
                >
                  {isConnectingDrive ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <MaterialIcons name="add-to-drive" size={18} color={colors.onPrimary} />
                      <Text style={styles.btnPrimaryText}>CONNECT GOOGLE DRIVE</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* SMS Intelligence Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SMS Intelligence</Text>
          <View style={styles.listCard}>
            <View style={styles.settingItem}>
              <View style={styles.settingItemLeft}>
                <MaterialIcons name="sms" size={24} color={colors.primary} />
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingTitle}>SMS Auto-Tracking</Text>
                  <Text style={styles.settingSub}>
                    {permissionStatus === 'granted'
                      ? 'Access granted • 100% offline'
                      : permissionStatus === 'permanently_denied'
                        ? 'Permission blocked in device settings'
                        : 'Permission not granted'}
                  </Text>
                </View>
              </View>
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 8,
                  flexShrink: 0,
                  backgroundColor:
                    permissionStatus === 'granted'
                      ? colors.primaryContainer
                      : colors.surfaceContainerHighest,
                }}
              >
                <Text
                  style={{
                    ...typography.labelMd,
                    color:
                      permissionStatus === 'granted'
                        ? colors.onPrimaryContainer
                        : colors.onSurfaceVariant,
                    fontWeight: '700',
                  }}
                >
                  {permissionStatus === 'granted' ? 'ACTIVE' : 'OFF'}
                </Text>
              </View>
            </View>

            {lastSyncTimestamp ? (
              <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                <Text style={{ ...typography.bodyMd, fontSize: 12, color: colors.onSurfaceVariant }}>
                  Last scanned: {new Date(lastSyncTimestamp).toLocaleString()}
                </Text>
              </View>
            ) : null}

            <View style={{ padding: 16, gap: 8 }}>
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={handleSmsScan}
                disabled={isSmsSyncing}
              >
                {isSmsSyncing ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                    <Text style={styles.btnPrimaryText} numberOfLines={1}>
                      SCANNING ({smsProgress.processed}/{smsProgress.total || '...'})
                    </Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <MaterialIcons
                      name={permissionStatus === 'permanently_denied' ? 'settings' : 'sync'}
                      size={18}
                      color={colors.onPrimary}
                    />
                    <Text style={styles.btnPrimaryText} numberOfLines={1}>
                      {permissionStatus === 'granted'
                        ? 'SCAN SMS NOW'
                        : permissionStatus === 'permanently_denied'
                          ? 'OPEN DEVICE SETTINGS'
                          : 'ENABLE SMS TRACKING'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
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
                onPress={() => router.push('/export-statement')}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <MaterialIcons name="description" size={18} color={colors.onSurface} />
                  <Text style={styles.btnSecondaryText}>EXPORT STATEMENT (PDF / CSV)</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => router.push('/export-success')}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <MaterialIcons name="backup" size={18} color={colors.onSurface} />
                  <Text style={styles.btnSecondaryText}>FULL BACKUP & EXPORT</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPrimary, { backgroundColor: colors.error }]}
                onPress={handleResetData}
                disabled={isResetting}
              >
                <Text style={styles.btnPrimaryText}>
                  {isResetting ? 'RESETTING...' : 'RESET APP DATA'}
                </Text>
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

    iconButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
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
      gap: 12,
    },
    settingItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    settingTextContainer: {
      flex: 1,
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
    driveStatusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    driveIconBox: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    driveStatusTitle: {
      ...typography.bodyLg,
      fontWeight: '600',
      color: colors.onSurface,
    },
    driveStatusEmail: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      fontSize: 13,
      marginTop: 2,
    },
    driveLastBackupText: {
      ...typography.bodyMd,
      color: colors.primary,
      fontSize: 12,
      fontWeight: '500',
      marginTop: 4,
    },
  });
  return styles;
};

import { Header, Text, useAlert, useToast } from '@/components/ui';
import { LegalModal } from '@/components/modals/LegalModal';
import { PassphraseModal } from '@/components/modals/PassphraseModal';
import { useCategorySpending } from '@/hooks/use-budget';
import { useGoals } from '@/hooks/use-goals';
import { useGoogleDrive } from '@/hooks/use-google-drive';
import { useNotifications } from '@/hooks/use-notifications';
import { useSmsSync } from '@/hooks/useSmsSync';
import { clearDatabase } from '@/services/database';
import { useAppStore } from '@/store/use-app-store';
import { useAuthStore } from '@/store/use-auth-store';
import { ThemeColors, typography, useTheme } from '@/theme';
import { formatCurrency } from '@/utils/format';
import { MaterialIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeInsets } from '@/hooks/use-safe-insets';

export default function SettingsScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeInsets();
  const router = useRouter();
  const themeSetting = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const currencySetting = useAppStore((state) => state.currency);
  const setCurrency = useAppStore((state) => state.setCurrency);
  const biometricsEnabled = useAppStore((state) => state.biometricEnabled);
  const [isResetting, setIsResetting] = useState(false);
  const [legalModalType, setLegalModalType] = useState<'privacy' | 'terms' | null>(null);
  const [passphraseModalVisible, setPassphraseModalVisible] = useState(false);
  const [passphraseMode, setPassphraseMode] = useState<'encrypt' | 'decrypt'>('decrypt');
  const { showAlert } = useAlert();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const {
    isConnected: isDriveConnected,
    userEmail: driveUserEmail,
    lastBackupTime: driveLastBackupTime,
    hasCustomBackupPassphrase,
    isConnecting: isConnectingDrive,
    isBackingUp: isBackingUpDrive,
    isRestoring: isRestoringDrive,
    isDeletingBackups: isDeletingDriveBackups,
    isAutoSyncing,
    autoBackupEnabled,
    setAutoBackupEnabled,
    autoBackupOnlyWifi,
    setAutoBackupOnlyWifi,
    connect: connectDrive,
    disconnect: disconnectDrive,
    backupNow: backupDriveNow,
    restoreFromDrive,
    deleteBackupsFromDrive,
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
      await syncSms({ autoCreateClarityTransactions: false });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      showToast('SMS scan completed successfully!', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'SMS scan failed', 'error');
    }
  };

  const now = new Date();
  const { notifications } = useNotifications();
  const unreadNotificationCount = notifications.filter((n) => !n.isRead).length;
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

  const handleRestoreFromDrive = async (passphrase?: string) => {
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
            const res = await restoreFromDrive(passphrase);
            if (!res.success && res.isEncrypted) {
              setPassphraseMode('decrypt');
              setPassphraseModalVisible(true);
            }
          },
        },
      ]
    );
  };

  const handlePassphraseSubmit = async (passphrase: string) => {
    if (passphraseMode === 'decrypt') {
      const res = await restoreFromDrive(passphrase);
      if (res.success) {
        setPassphraseModalVisible(false);
      } else {
        showToast(res.error || 'Incorrect passphrase', 'error');
      }
    } else {
      setPassphraseModalVisible(false);
      const success = await backupDriveNow(passphrase);
      if (success) {
        showToast('Recovery passphrase updated & encrypted backup saved!', 'success');
      }
    }
  };

  const handleConnectDrive = async () => {
    const res = await connectDrive();
    if (!res || !res.success) return;

    if (res.needsPassphraseToRestore) {
      setPassphraseMode('decrypt');
      setPassphraseModalVisible(true);
    } else if (!res.hasExistingBackup && !hasCustomBackupPassphrase) {
      setPassphraseMode('encrypt');
      setPassphraseModalVisible(true);
    }
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

  const handleDeleteDriveBackups = () => {
    showAlert(
      'Delete Cloud Backups?',
      'Are you sure you want to delete all Clarity backup snapshots from your Google Drive? This will permanently delete your cloud backup file. Your local device data will not be affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            await deleteBackupsFromDrive();
          },
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
            } catch {
              showToast('Failed to reset app data', 'error');
            } finally {
              setIsResetting(false);
            }
          },
        },
      ]
    );
  };

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@clarityapp.dev?subject=Clarity%20Feedback%20v1.0.0').catch(() => {
      showToast('Could not open email client. Contact support@clarityapp.dev', 'info');
    });
  };

  const { user, isAuthenticated, signOut, isLoading: isAuthLoading } = useAuthStore();

  const handleSignOut = () => {
    showAlert('Sign Out', 'Are you sure you want to sign out of your account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          showToast('Signed out successfully', 'success');
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header
        showBack
        title="Intelligence & System"
        rightNode={
          <TouchableOpacity style={styles.iconButton} onPress={() => router.navigate('/notifications')}>
            <MaterialIcons name="notifications" size={24} color={colors.onSurface} />
            {unreadNotificationCount > 0 && (
              <View style={styles.unreadBadgeDot}>
                <Text style={styles.unreadBadgeText}>
                  {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.listCard}>
            {isAuthenticated && user ? (
              <View style={styles.accountCard}>
                <View style={[styles.avatarCircle, { backgroundColor: colors.primaryContainer }]}>
                  <Text style={[styles.avatarText, { color: colors.onPrimaryContainer }]}>
                    {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                  </Text>
                </View>
                <View style={styles.accountInfo}>
                  <Text style={styles.accountName}>{user.name}</Text>
                  <Text style={styles.accountEmail}>{user.email}</Text>
                  <View style={styles.badgeRow}>
                    <MaterialIcons name="check-circle" size={14} color={colors.primary} />
                    <Text style={[styles.badgeText, { color: colors.primary }]} numberOfLines={1}>Google Account</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.signOutBtn, { borderColor: colors.outlineVariant }]}
                  onPress={handleSignOut}
                  disabled={isAuthLoading}
                >
                  <Text style={[styles.signOutText, { color: colors.error }]}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.guestCard}>
                <View style={[styles.avatarCircle, { backgroundColor: colors.surfaceContainerHigh }]}>
                  <MaterialIcons name="person-outline" size={24} color={colors.onSurfaceVariant} />
                </View>
                <View style={styles.accountInfo}>
                  <Text style={styles.accountName}>Guest Mode</Text>
                  <Text style={styles.accountEmail}>Offline-only storage</Text>
                </View>
                <TouchableOpacity
                  style={[styles.signInBtn, { backgroundColor: colors.primary }]}
                  onPress={() => router.navigate('/(auth)/login')}
                >
                  <Text style={[styles.signInText, { color: colors.onPrimary }]}>Sign In</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
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
            <TouchableOpacity onPress={() => router.navigate('/notifications')}>
              <Text style={styles.actionText}>VIEW ALL</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.listCard}>
            {recentAlerts.length > 0 ? (
              recentAlerts.map((alert) => (
                <TouchableOpacity
                  key={alert.id}
                  style={styles.listItem}
                  onPress={() => router.navigate('/notifications')}
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
            <TouchableOpacity style={styles.settingItem} onPress={() => router.navigate('/security')}>
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
              onPress={() => router.navigate('/(app)/bills')}
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
              onPress={() => router.navigate('/(app)/splitwise')}
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
              onPress={() => router.navigate('/manage-categories')}
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
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: colors.surfaceContainerHighest,
                        borderRadius: 6,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        gap: 4,
                        marginTop: 6,
                        alignSelf: 'flex-start',
                      }}
                    >
                      <MaterialIcons name="lock" size={13} color={colors.primary} />
                      <Text style={{ ...typography.labelMd, color: colors.primary, fontWeight: '700' }}>
                        AES-256-GCM Encrypted
                      </Text>
                    </View>
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
                      Auto-syncs encrypted snapshots silently in background.
                    </Text>
                  </View>
                  <Switch
                    value={autoBackupEnabled}
                    onValueChange={(val) => setAutoBackupEnabled(val)}
                    trackColor={{ false: colors.surfaceContainerHighest, true: colors.primary }}
                    thumbColor={colors.onPrimary}
                  />
                </View>

                {autoBackupEnabled && (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 12,
                      backgroundColor: colors.surfaceContainerLowest,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.surfaceVariant,
                    }}
                  >
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text style={styles.settingTitle}>Only on Wi-Fi</Text>
                      <Text style={styles.settingSub}>
                        Prevent cloud backups over cellular mobile data.
                      </Text>
                    </View>
                    <Switch
                      value={autoBackupOnlyWifi}
                      onValueChange={(val) => setAutoBackupOnlyWifi(val)}
                      trackColor={{ false: colors.surfaceContainerHighest, true: colors.primary }}
                      thumbColor={colors.onPrimary}
                    />
                  </View>
                )}

                {!hasCustomBackupPassphrase ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 12,
                      backgroundColor: colors.warningContainer,
                      borderRadius: 12,
                      gap: 10,
                      borderWidth: 1,
                      borderColor: colors.warning,
                    }}
                  >
                    <MaterialIcons name="warning" size={22} color={colors.warning} />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          ...typography.labelMd,
                          color: colors.onWarningContainer,
                          fontWeight: '700',
                        }}
                      >
                        No Recovery Passphrase Set
                      </Text>
                      <Text
                        style={{
                          ...typography.bodySm,
                          color: colors.onWarningContainer,
                          lineHeight: 16,
                          marginTop: 2,
                        }}
                      >
                        Without a passphrase, this backup cannot be restored if you lose this device.
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={{
                        backgroundColor: colors.warning,
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        borderRadius: 8,
                      }}
                      onPress={() => {
                        setPassphraseMode('encrypt');
                        setPassphraseModalVisible(true);
                      }}
                    >
                      <Text
                        style={{
                          ...typography.labelSm,
                          color: colors.onWarning,
                          fontWeight: '700',
                        }}
                      >
                        SET KEY
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      backgroundColor: colors.surfaceContainer,
                      borderRadius: 10,
                      gap: 8,
                    }}
                  >
                    <MaterialIcons name="verified-user" size={18} color={colors.primary} />
                    <Text style={{ ...typography.bodySm, color: colors.onSurfaceVariant, flex: 1 }}>
                      End-to-end encrypted with your secret passphrase. Safe for device recovery.
                    </Text>
                  </View>
                )}

                <View style={{ gap: 8 }}>
                  <TouchableOpacity
                    style={styles.btnPrimary}
                    onPress={() => backupDriveNow()}
                    disabled={isBackingUpDrive || isRestoringDrive || isDeletingDriveBackups}
                  >
                    {isBackingUpDrive ? (
                      <ActivityIndicator size="small" color={colors.onPrimary} />
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <MaterialIcons name="cloud-upload" size={18} color={colors.onPrimary} />
                        <Text style={styles.btnPrimaryText}>BACKUP NOW (ENCRYPTED)</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.btnSecondary}
                    onPress={() => {
                      setPassphraseMode('encrypt');
                      setPassphraseModalVisible(true);
                    }}
                    disabled={isBackingUpDrive || isRestoringDrive || isDeletingDriveBackups}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <MaterialIcons name="vpn-key" size={18} color={colors.primary} />
                      <Text style={[styles.btnSecondaryText, { color: colors.primary }]}>
                        SET / CHANGE PASSPHRASE
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.btnSecondary}
                    onPress={() => handleRestoreFromDrive()}
                    disabled={isBackingUpDrive || isRestoringDrive || isDeletingDriveBackups}
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
                    onPress={handleDeleteDriveBackups}
                    disabled={isBackingUpDrive || isRestoringDrive || isDeletingDriveBackups}
                  >
                    {isDeletingDriveBackups ? (
                      <ActivityIndicator size="small" color={colors.error} />
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <MaterialIcons name="delete-forever" size={18} color={colors.error} />
                        <Text style={[styles.btnSecondaryText, { color: colors.error }]}>
                          DELETE CLOUD BACKUPS
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.btnSecondary, { borderColor: colors.outlineVariant, borderWidth: 1 }]}
                    onPress={handleDisconnectDrive}
                    disabled={isBackingUpDrive || isRestoringDrive || isDeletingDriveBackups}
                  >
                    <Text style={[styles.btnSecondaryText, { color: colors.onSurfaceVariant }]}>
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
                  onPress={handleConnectDrive}
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

            {Platform.OS === 'android' && permissionStatus === 'granted' && (
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderTopWidth: 1,
                  borderTopColor: colors.surfaceVariant,
                }}
                onPress={() => Linking.openSettings()}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ ...typography.bodyMd, color: colors.onSurface, fontWeight: '600' }}>
                    Background Auto-Sync Reliability
                  </Text>
                  <Text style={{ ...typography.bodyMd, fontSize: 12, lineHeight: 16, color: colors.onSurfaceVariant }}>
                    Set battery usage to "Unrestricted" to ensure background SMS scans run reliably.
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colors.outline} />
              </TouchableOpacity>
            )}
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
                onPress={() => router.navigate('/export-statement')}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <MaterialIcons name="description" size={18} color={colors.onSurface} />
                  <Text style={styles.btnSecondaryText}>EXPORT STATEMENT (PDF / CSV)</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => router.navigate('/import-statement')}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <MaterialIcons name="file-upload" size={18} color={colors.onSurface} />
                  <Text style={styles.btnSecondaryText}>IMPORT STATEMENT (CSV)</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => router.navigate('/export-success')}
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
                <Text style={[styles.btnPrimaryText, { color: colors.onError }]}>
                  {isResetting ? 'RESETTING...' : 'RESET APP DATA'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* About & Legal */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About & Legal</Text>
          <View style={[styles.card, { minHeight: 'auto', gap: 16 }]}>
            {/* 100% On-device Badge */}
            <View
              style={{
                backgroundColor: colors.surfaceContainer,
                padding: 12,
                borderRadius: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <MaterialIcons name="verified-user" size={24} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ ...typography.bodyMd, fontWeight: '700', color: colors.onSurface }}>
                  100% Private & On-Device
                </Text>
                <Text style={{ ...typography.bodyMd, fontSize: 12, lineHeight: 16, color: colors.onSurfaceVariant }}>
                  Your SMS & transactions are processed strictly on your phone. No personal financial data is ever uploaded or sold.
                </Text>
              </View>
            </View>

            {/* Links */}
            <View style={{ gap: 4 }}>
              <TouchableOpacity
                style={styles.legalRow}
                onPress={() => setLegalModalType('privacy')}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <MaterialIcons name="privacy-tip" size={20} color={colors.onSurfaceVariant} />
                  <Text style={styles.legalRowText}>Privacy Policy</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colors.outline} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.legalRow}
                onPress={() => setLegalModalType('terms')}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <MaterialIcons name="gavel" size={20} color={colors.onSurfaceVariant} />
                  <Text style={styles.legalRowText}>Terms of Service</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colors.outline} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.legalRow}
                onPress={() => Linking.openURL('https://github.com/homerun/clarity')}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <MaterialIcons name="code" size={20} color={colors.onSurfaceVariant} />
                  <Text style={styles.legalRowText}>Open Source & Licenses</Text>
                </View>
                <MaterialIcons name="open-in-new" size={18} color={colors.outline} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.legalRow}
                onPress={handleContactSupport}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <MaterialIcons name="help-outline" size={20} color={colors.onSurfaceVariant} />
                  <Text style={styles.legalRowText}>Report an Issue / Contact Support</Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colors.outline} />
              </TouchableOpacity>
            </View>

            {/* Version Footer */}
            <View style={{ alignItems: 'center', paddingTop: 6 }}>
              <Text style={{ ...typography.labelMd, color: colors.onSurfaceVariant, fontSize: 12 }}>
                Clarity Personal Finance • v{Constants.expoConfig?.version || '1.0.0'} (Production)
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <LegalModal
        visible={!!legalModalType}
        type={legalModalType}
        onClose={() => setLegalModalType(null)}
      />

      <PassphraseModal
        visible={passphraseModalVisible}
        title={passphraseMode === 'encrypt' ? 'Set Recovery Passphrase' : 'Enter Backup Passphrase'}
        description={
          passphraseMode === 'encrypt'
            ? 'Set a secret passphrase to encrypt your cloud backup. You will need this passphrase to restore your financial data if your device is lost or replaced.'
            : 'This backup is client-side encrypted with AES-256-GCM. Enter your secret passphrase to decrypt and restore.'
        }
        confirmText={passphraseMode === 'encrypt' ? 'Encrypt & Backup' : 'Unlock & Restore'}
        onSkip={
          passphraseMode === 'encrypt'
            ? () => {
                setPassphraseModalVisible(false);
                showToast('Using device-only key. You can set a recovery passphrase anytime.', 'info');
              }
            : undefined
        }
        skipText="Skip for now"
        isLoading={isBackingUpDrive || isRestoringDrive}
        onClose={() => setPassphraseModalVisible(false)}
        onSubmit={handlePassphraseSubmit}
      />
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
      position: 'relative',
    },
    unreadBadgeDot: {
      position: 'absolute',
      top: 4,
      right: 4,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: colors.error,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 3,
    },
    unreadBadgeText: {
      color: colors.onError,
      fontSize: 10,
      fontWeight: '700',
      lineHeight: 12,
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
      lineHeight: 18,
      marginTop: 2,
    },
    driveLastBackupText: {
      ...typography.bodyMd,
      color: colors.primary,
      fontSize: 12,
      lineHeight: 16,
      marginTop: 4,
    },
    accountCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      gap: 12,
    },
    guestCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      gap: 12,
    },
    avatarCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      ...typography.headlineSm,
      fontWeight: '700',
    },
    accountInfo: {
      flex: 1,
    },
    accountName: {
      ...typography.bodyLg,
      fontWeight: '600',
      color: colors.onSurface,
    },
    accountEmail: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      fontSize: 13,
      lineHeight: 18,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 2,
      flexShrink: 0,
    },
    badgeText: {
      ...typography.labelMd,
      fontWeight: '600',
      fontSize: 12,
      lineHeight: 16,
    },
    signOutBtn: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
    },
    signOutText: {
      ...typography.labelMd,
      fontWeight: '600',
    },
    signInBtn: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
    },
    signInText: {
      ...typography.labelMd,
      fontWeight: '700',
    },
    legalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.surfaceVariant,
    },
    legalRowText: {
      ...typography.bodyMd,
      color: colors.onSurface,
      fontWeight: '500',
    },
  });
  return styles;
};

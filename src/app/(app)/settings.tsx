import React, { useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';

import { Header, Text, useAlert, useToast } from '@/components/ui';
import { LegalModal } from '@/components/modals/LegalModal';
import { useGoogleDrive } from '@/hooks/use-google-drive';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { resetEntireAppData } from '@/services/app-reset';
import { useAppStore } from '@/store/use-app-store';
import { useAuthStore } from '@/store/use-auth-store';
import { useNotificationStore } from '@/store/useNotificationStore';
import { ThemeColors, fontFamilies, radius, typography, useTheme } from '@/theme';

interface CurrencyOption {
  code: string;
  symbol: string;
  name: string;
}

const CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
];

interface ThemeOption {
  id: 'system' | 'light' | 'dark';
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  description: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'system',
    label: 'System Default',
    icon: 'settings-brightness',
    description: 'Matches your device display settings',
  },
  {
    id: 'light',
    label: 'Light',
    icon: 'light-mode',
    description: 'Crisp light background with dark text',
  },
  {
    id: 'dark',
    label: 'Dark',
    icon: 'dark-mode',
    description: 'Easy on the eyes in low-light environments',
  },
];

interface SettingRowProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle?: string;
  value?: string;
  onPress: () => void;
  showDivider?: boolean;
  destructive?: boolean;
  iconBgColor?: string;
  iconColor?: string;
}

function SettingRow({
  icon,
  title,
  subtitle,
  value,
  onPress,
  showDivider = true,
  destructive = false,
  iconBgColor,
  iconColor,
}: SettingRowProps) {
  const { colors } = useTheme();
  const styles = getStyles(colors);

  return (
    <>
      <TouchableOpacity
        style={styles.settingItem}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={styles.settingItemLeft}>
          <View
            style={[
              styles.iconBox,
              { backgroundColor: iconBgColor || colors.surfaceContainerHighest },
            ]}
          >
            <MaterialIcons
              name={icon}
              size={20}
              color={iconColor || (destructive ? colors.error : colors.primary)}
            />
          </View>
          <View style={styles.settingTextContainer}>
            <Text
              style={[
                styles.settingTitle,
                destructive && { color: colors.error, fontFamily: fontFamilies.semiBold },
              ]}
              numberOfLines={1}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.settingSub} numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.settingItemRight}>
          {value ? <Text style={styles.settingValueText}>{value}</Text> : null}
          <MaterialIcons
            name="chevron-right"
            size={20}
            color={destructive ? colors.error : colors.outline}
          />
        </View>
      </TouchableOpacity>
      {showDivider && <View style={styles.itemDivider} />}
    </>
  );
}

export default function SettingsScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showAlert } = useAlert();
  const { showToast } = useToast();

  const themeSetting = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const currencySetting = useAppStore((state) => state.currency);
  const setCurrency = useAppStore((state) => state.setCurrency);
  const biometricsEnabled = useAppStore((state) => state.biometricEnabled);

  const {
    isConnected: isDriveConnected,
    userEmail: driveUserEmail,
    lastBackupTime,
  } = useGoogleDrive();
  const { user, isAuthenticated, signOut, isLoading: isAuthLoading } = useAuthStore();

  const notificationPermissionStatus = useNotificationStore(
    (state) => state.permissionStatus
  );
  const isNotificationTrackingEnabled = useNotificationStore((state) => state.isEnabled);
  const parseNotificationTransactions = useNotificationStore((state) => state.parseTransactions);
  const parseNotificationBills = useNotificationStore((state) => state.parseBills);
  const notificationHealth = useNotificationStore((state) => state.health);
  const setNotificationTrackingEnabled = useNotificationStore((state) => state.setIsEnabled);
  const setParseNotificationTransactions = useNotificationStore(
    (state) => state.setParseTransactions
  );
  const setParseNotificationBills = useNotificationStore((state) => state.setParseBills);
  const openNotificationDisclosure = useNotificationStore((state) => state.openDisclosure);
  const openBatterySettings = useNotificationStore((state) => state.openBatterySettings);
  const requestRebind = useNotificationStore((state) => state.requestRebind);
  const refreshNotificationHealth = useNotificationStore((state) => state.refreshHealth);

  const [, setIsResetting] = useState(false);
  const [legalModalType, setLegalModalType] = useState<'privacy' | 'terms' | null>(null);
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);

  const currentThemeLabel =
    THEME_OPTIONS.find((t) => t.id === themeSetting)?.label || 'System Default';
  const currentCurrency =
    CURRENCY_OPTIONS.find((c) => c.code === currencySetting) || {
      code: currencySetting,
      symbol: currencySetting,
      name: currencySetting,
    };

  const isAutoTrackingGranted = notificationPermissionStatus === 'granted';
  const isListenerDisconnected =
    isAutoTrackingGranted &&
    Boolean(notificationHealth) &&
    !notificationHealth?.isServiceConnected;

  const handleAutoTrackingAction = async () => {
    if (!isAutoTrackingGranted) {
      openNotificationDisclosure();
      return;
    }

    if (isListenerDisconnected) {
      const rebound = await requestRebind();
      await refreshNotificationHealth();
      if (rebound) {
        showToast('Notification listener reconnected.', 'success');
      } else {
        openNotificationDisclosure();
      }
      return;
    }

    const nextEnabled = !isNotificationTrackingEnabled;
    setNotificationTrackingEnabled(nextEnabled);
    showToast(
      nextEnabled ? 'Auto-tracking resumed.' : 'Auto-tracking paused.',
      'info'
    );
  };

  const handleResetData = () => {
    showAlert(
      'Reset All App Data?',
      'This will permanently delete all local transactions, accounts, categories, receipts, and cached rules from this device. Cloud backups will not be deleted.\n\nThis action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase Everything',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsResetting(true);
              await resetEntireAppData(queryClient);
              showToast('App data reset to factory defaults', 'success');
              router.navigate('/(app)/(tabs)');
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

  const handleContactSupport = () => {
    Linking.openURL(
      `mailto:support@clarityapp.dev?subject=Clarity%20Feedback%20v${Constants.expoConfig?.version || '1.0.0'}`
    ).catch(() => {
      showToast('Could not open email client. Contact support@clarityapp.dev', 'info');
    });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header title="Settings" showBack />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Account Section */}
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
                  <Text style={styles.accountName} numberOfLines={1}>
                    {user.name || 'User'}
                  </Text>
                  <Text style={styles.accountEmail} numberOfLines={1}>
                    {user.email || 'Signed in'}
                  </Text>
                  <View style={styles.badgeRow}>
                    <MaterialIcons name="check-circle" size={13} color={colors.primary} />
                    <Text style={[styles.badgeText, { color: colors.primary }]}>Active Account</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.signOutBtn, { borderColor: colors.outlineVariant }]}
                  onPress={handleSignOut}
                  disabled={isAuthLoading}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.signOutText, { color: colors.error }]}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.accountCard}>
                <View style={[styles.avatarCircle, { backgroundColor: colors.surfaceContainerHigh }]}>
                  <MaterialIcons name="person-outline" size={24} color={colors.onSurfaceVariant} />
                </View>
                <View style={styles.accountInfo}>
                  <Text style={styles.accountName}>Guest Mode</Text>
                  <Text style={styles.accountEmail}>Data saved locally on device</Text>
                </View>
                <TouchableOpacity
                  style={[styles.signInBtn, { backgroundColor: colors.primary }]}
                  onPress={() => router.navigate('/(auth)/login')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.signInText, { color: colors.onPrimary }]}>Sign In</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* 2. Backup & Data Protection (Elevated to top priority) */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Backup & Data Protection</Text>
            {isDriveConnected ? (
              <View style={[styles.statusBadge, { backgroundColor: colors.successContainer }]}>
                <Text style={[styles.statusBadgeText, { color: colors.onSuccessContainer }]}>
                  PROTECTED
                </Text>
              </View>
            ) : (
              <View style={[styles.statusBadge, { backgroundColor: colors.errorContainer }]}>
                <Text style={[styles.statusBadgeText, { color: colors.onErrorContainer }]}>
                  ACTION NEEDED
                </Text>
              </View>
            )}
          </View>

          <View style={styles.listCard}>
            {/* Prominent Google Drive Status Row */}
            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => router.navigate('/(app)/cloud-backup')}
              activeOpacity={0.7}
            >
              <View style={styles.settingItemLeft}>
                <View
                  style={[
                    styles.iconBox,
                    {
                      backgroundColor: isDriveConnected
                        ? colors.primaryContainer
                        : colors.errorContainer,
                    },
                  ]}
                >
                  <MaterialIcons
                    name={isDriveConnected ? 'cloud-done' : 'cloud-off'}
                    size={20}
                    color={isDriveConnected ? colors.onPrimaryContainer : colors.error}
                  />
                </View>
                <View style={styles.settingTextContainer}>
                  <Text style={styles.settingTitle}>Google Drive Cloud Backup</Text>
                  <Text style={styles.settingSub} numberOfLines={2}>
                    {isDriveConnected
                      ? `${driveUserEmail || 'Connected'} • ${
                          lastBackupTime
                            ? `Last sync: ${new Date(lastBackupTime).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}`
                            : 'No backup uploaded yet'
                        }`
                      : 'Not connected • Protect your data against phone loss or switch'}
                  </Text>
                </View>
              </View>

              <View style={styles.settingItemRight}>
                {!isDriveConnected && (
                  <View style={[styles.statusBadge, { backgroundColor: colors.errorContainer }]}>
                    <Text style={[styles.statusBadgeText, { color: colors.onErrorContainer }]}>
                      SETUP NOW
                    </Text>
                  </View>
                )}
                <MaterialIcons name="chevron-right" size={20} color={colors.outline} />
              </View>
            </TouchableOpacity>

            <View style={styles.itemDivider} />

            <SettingRow
              icon="description"
              title="Export Statements (PDF / CSV)"
              subtitle="Generate filtered statements by account and date"
              onPress={() => router.navigate('/export-statement')}
            />
            <SettingRow
              icon="file-upload"
              title="Import Statements (PDF / CSV)"
              subtitle="Bulk import banking transactions and reconcile balances"
              onPress={() => router.navigate('/import-statement')}
            />
            <SettingRow
              icon="backup"
              title="Full Data Backup & Restore"
              subtitle="Export unencrypted or encrypted JSON snapshot file"
              onPress={() => router.navigate('/export-success')}
              showDivider={false}
            />
          </View>
        </View>

        {/* 3. Preferences Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.listCard}>
            <SettingRow
              icon="palette"
              title="Appearance"
              subtitle="Theme and display mode"
              value={currentThemeLabel}
              onPress={() => setThemeModalVisible(true)}
            />
            <SettingRow
              icon="payments"
              title="Default Currency"
              subtitle="Formatting symbol & exchange reference"
              value={`${currentCurrency.code} (${currentCurrency.symbol})`}
              onPress={() => setCurrencyModalVisible(true)}
            />
            <SettingRow
              icon="lock"
              title="Security & Privacy"
              subtitle={biometricsEnabled ? 'Biometrics active' : 'Passcode & app lock'}
              onPress={() => router.navigate('/security')}
            />
            <SettingRow
              icon="category"
              title="Manage Categories"
              subtitle="Customize spending buckets & limits"
              onPress={() => router.navigate('/manage-categories')}
              showDivider={false}
            />
          </View>
        </View>

        {/* 4. Auto-Tracking (Notifications) Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Auto-Tracking</Text>
          <View style={styles.listCard}>
            {Platform.OS === 'android' ? (
              <>
                <View style={styles.settingItem}>
                  <View style={styles.settingItemLeft}>
                    <View style={[styles.iconBox, { backgroundColor: colors.surfaceContainerHighest }]}>
                      <MaterialIcons name="notifications-active" size={20} color={colors.primary} />
                    </View>
                    <View style={styles.settingTextContainer}>
                      <Text style={styles.settingTitle}>UPI & Bank Alert Tracking</Text>
                      <Text style={styles.settingSub}>
                        {!isAutoTrackingGranted
                          ? 'Real-time local extraction from banking & UPI notifications'
                          : isListenerDisconnected
                            ? 'Listener paused by OS — tap Reconnect below'
                            : isNotificationTrackingEnabled
                              ? 'Active • Reading whitelisted banking & UPI alerts on-device'
                              : 'Paused • Toggle resume to capture alerts'}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          isAutoTrackingGranted && isNotificationTrackingEnabled && !isListenerDisconnected
                            ? colors.primaryContainer
                            : colors.surfaceContainerHighest,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeText,
                        {
                          color:
                            isAutoTrackingGranted && isNotificationTrackingEnabled && !isListenerDisconnected
                              ? colors.onPrimaryContainer
                              : colors.onSurfaceVariant,
                        },
                      ]}
                    >
                      {!isAutoTrackingGranted
                        ? 'OFF'
                        : isListenerDisconnected
                          ? 'RECONNECT'
                          : isNotificationTrackingEnabled
                            ? 'ACTIVE'
                            : 'PAUSED'}
                    </Text>
                  </View>
                </View>

                {notificationHealth?.lastEventAt ? (
                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>
                      Last captured: {notificationHealth.lastEventApp || 'Alert'} •{' '}
                      {new Date(notificationHealth.lastEventAt).toLocaleString()}
                    </Text>
                  </View>
                ) : null}

                <View style={styles.actionBtnContainer}>
                  <TouchableOpacity
                    style={styles.btnPrimary}
                    onPress={handleAutoTrackingAction}
                    activeOpacity={0.8}
                  >
                    <View style={styles.btnRow}>
                      <MaterialIcons
                        name={
                          !isAutoTrackingGranted
                            ? 'notifications-active'
                            : isListenerDisconnected
                              ? 'sync'
                              : isNotificationTrackingEnabled
                                ? 'pause-circle-outline'
                                : 'play-circle-outline'
                        }
                        size={18}
                        color={colors.onPrimary}
                      />
                      <Text style={styles.btnPrimaryText}>
                        {!isAutoTrackingGranted
                          ? 'ENABLE AUTO-TRACKING'
                          : isListenerDisconnected
                            ? 'RECONNECT LISTENER'
                            : isNotificationTrackingEnabled
                              ? 'PAUSE AUTO-TRACKING'
                              : 'RESUME AUTO-TRACKING'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {isAutoTrackingGranted && (
                  <>
                    <View style={styles.itemDivider} />
                    <View style={styles.settingItem}>
                      <View style={styles.settingTextContainer}>
                        <Text style={styles.settingTitle}>Parse Transaction Alerts</Text>
                        <Text style={styles.settingSub}>
                          Extract debits and credits from banking & UPI notifications
                        </Text>
                      </View>
                      <Switch
                        value={parseNotificationTransactions}
                        onValueChange={setParseNotificationTransactions}
                        disabled={!isNotificationTrackingEnabled}
                        trackColor={{
                          false: colors.surfaceContainerHighest,
                          true: colors.primary,
                        }}
                        thumbColor={colors.surface}
                      />
                    </View>
                    <View style={styles.itemDivider} />
                    <View style={styles.settingItem}>
                      <View style={styles.settingTextContainer}>
                        <Text style={styles.settingTitle}>Detect Bill Reminders</Text>
                        <Text style={styles.settingSub}>
                          Auto-capture upcoming utility and credit card bill alerts
                        </Text>
                      </View>
                      <Switch
                        value={parseNotificationBills}
                        onValueChange={setParseNotificationBills}
                        disabled={!isNotificationTrackingEnabled}
                        trackColor={{
                          false: colors.surfaceContainerHighest,
                          true: colors.primary,
                        }}
                        thumbColor={colors.surface}
                      />
                    </View>
                    <View style={styles.itemDivider} />
                    <TouchableOpacity
                      style={styles.batteryRow}
                      onPress={() => {
                        openBatterySettings().then((opened) => {
                          if (!opened) Linking.openSettings();
                        });
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.batteryTextCol}>
                        <Text style={styles.batteryTitle}>
                          Background Auto-Tracking Reliability
                          {notificationHealth?.isBatteryOptimizationIgnored ? ' (Unrestricted)' : ''}
                        </Text>
                        <Text style={styles.batterySub}>
                          {notificationHealth?.isBatteryOptimizationIgnored
                            ? 'Battery optimization is already disabled for reliable background capture.'
                            : 'Set battery usage to "Unrestricted" in system settings so alerts are captured reliably.'}
                        </Text>
                      </View>
                      <MaterialIcons name="chevron-right" size={20} color={colors.outline} />
                    </TouchableOpacity>
                  </>
                )}
              </>
            ) : (
              <View style={styles.platformNoticeCard}>
                <MaterialIcons name="info-outline" size={20} color={colors.primary} />
                <View style={styles.platformNoticeTextCol}>
                  <Text style={styles.settingTitle}>iOS Notification Sandboxing</Text>
                  <Text style={styles.settingSub}>
                    iOS prevents apps from reading notifications from other banking apps. You can import statements via PDF / CSV above or log transactions directly.
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* 5. Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.error }]}>Danger Zone</Text>
          <View style={[styles.listCard, { borderColor: colors.errorContainer }]}>
            <SettingRow
              icon="delete-forever"
              title="Reset App Data"
              subtitle="Permanently erase all local accounts, transactions & categories"
              destructive
              iconBgColor={colors.errorContainer}
              iconColor={colors.error}
              onPress={handleResetData}
              showDivider={false}
            />
          </View>
        </View>

        {/* 6. About & Support Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About & Legal</Text>

          {/* Privacy Banner */}
          <View style={styles.privacyBanner}>
            <MaterialIcons name="verified-user" size={24} color={colors.primary} />
            <View style={styles.flex1}>
              <Text style={styles.privacyTitle}>100% Private & On-Device</Text>
              <Text style={styles.privacyBody}>
                All financial calculations, notification analysis, and transaction logs are stored strictly on your phone. Clarity never sells or shares your personal data.
              </Text>
            </View>
          </View>

          {/* Links Card */}
          <View style={styles.listCard}>
            <TouchableOpacity
              style={styles.legalRow}
              onPress={() => setLegalModalType('privacy')}
              activeOpacity={0.7}
            >
              <View style={styles.legalRowLeft}>
                <MaterialIcons name="privacy-tip" size={20} color={colors.onSurfaceVariant} />
                <Text style={styles.legalRowText}>Privacy Policy</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.outline} />
            </TouchableOpacity>

            <View style={styles.itemDivider} />

            <TouchableOpacity
              style={styles.legalRow}
              onPress={() => setLegalModalType('terms')}
              activeOpacity={0.7}
            >
              <View style={styles.legalRowLeft}>
                <MaterialIcons name="gavel" size={20} color={colors.onSurfaceVariant} />
                <Text style={styles.legalRowText}>Terms of Service</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.outline} />
            </TouchableOpacity>

            <View style={styles.itemDivider} />

            <TouchableOpacity
              style={styles.legalRow}
              onPress={() => Linking.openURL('https://github.com/homerun/clarity')}
              activeOpacity={0.7}
            >
              <View style={styles.legalRowLeft}>
                <MaterialIcons name="code" size={20} color={colors.onSurfaceVariant} />
                <Text style={styles.legalRowText}>Open Source & Licenses</Text>
              </View>
              <MaterialIcons name="open-in-new" size={18} color={colors.outline} />
            </TouchableOpacity>

            <View style={styles.itemDivider} />

            <TouchableOpacity
              style={styles.legalRow}
              onPress={handleContactSupport}
              activeOpacity={0.7}
            >
              <View style={styles.legalRowLeft}>
                <MaterialIcons name="help-outline" size={20} color={colors.onSurfaceVariant} />
                <Text style={styles.legalRowText}>Report an Issue / Contact Support</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={colors.outline} />
            </TouchableOpacity>
          </View>

          {/* Version Footer */}
          <View style={styles.versionFooter}>
            <Text style={styles.versionText}>
              Clarity Personal Finance • v{Constants.expoConfig?.version || '1.0.0'}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Theme Picker Modal */}
      <Modal
        visible={themeModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setThemeModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setThemeModalVisible(false)}
        >
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Appearance</Text>
              <TouchableOpacity
                onPress={() => setThemeModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={22} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalOptionList}>
              {THEME_OPTIONS.map((item, idx) => {
                const isSelected = themeSetting === item.id;
                return (
                  <React.Fragment key={item.id}>
                    {idx > 0 && <View style={styles.itemDivider} />}
                    <TouchableOpacity
                      style={styles.modalOptionItem}
                      onPress={() => {
                        setTheme(item.id);
                        setThemeModalVisible(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.modalOptionLeft}>
                        <View
                          style={[
                            styles.iconBox,
                            {
                              backgroundColor: isSelected
                                ? colors.primaryContainer
                                : colors.surfaceContainerHighest,
                            },
                          ]}
                        >
                          <MaterialIcons
                            name={item.icon}
                            size={20}
                            color={isSelected ? colors.onPrimaryContainer : colors.onSurface}
                          />
                        </View>
                        <View style={styles.flex1}>
                          <Text
                            style={[
                              styles.modalOptionLabel,
                              isSelected && { color: colors.primary, fontFamily: fontFamilies.bold },
                            ]}
                          >
                            {item.label}
                          </Text>
                          <Text style={styles.modalOptionSub}>{item.description}</Text>
                        </View>
                      </View>
                      {isSelected ? (
                        <MaterialIcons name="check-circle" size={22} color={colors.primary} />
                      ) : (
                        <View style={styles.unselectedRadio} />
                      )}
                    </TouchableOpacity>
                  </React.Fragment>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Currency Picker Modal */}
      <Modal
        visible={currencyModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setCurrencyModalVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setCurrencyModalVisible(false)}
        >
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Currency</Text>
              <TouchableOpacity
                onPress={() => setCurrencyModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={22} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.currencyScroll}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalOptionList}>
                {CURRENCY_OPTIONS.map((item, idx) => {
                  const isSelected = currencySetting === item.code;
                  return (
                    <React.Fragment key={item.code}>
                      {idx > 0 && <View style={styles.itemDivider} />}
                      <TouchableOpacity
                        style={styles.modalOptionItem}
                        onPress={() => {
                          setCurrency(item.code);
                          setCurrencyModalVisible(false);
                          showToast(`Default currency changed to ${item.name}`, 'success');
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.modalOptionLeft}>
                          <View
                            style={[
                              styles.currencySymbolBox,
                              {
                                backgroundColor: isSelected
                                  ? colors.primaryContainer
                                  : colors.surfaceContainerHighest,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.currencySymbolText,
                                {
                                  color: isSelected
                                    ? colors.onPrimaryContainer
                                    : colors.onSurface,
                                },
                              ]}
                            >
                              {item.symbol}
                            </Text>
                          </View>
                          <View style={styles.flex1}>
                            <Text
                              style={[
                                styles.modalOptionLabel,
                                isSelected && { color: colors.primary, fontFamily: fontFamilies.bold },
                              ]}
                            >
                              {item.name}
                            </Text>
                            <Text style={styles.modalOptionSub}>{item.code}</Text>
                          </View>
                        </View>
                        {isSelected ? (
                          <MaterialIcons name="check-circle" size={22} color={colors.primary} />
                        ) : (
                          <View style={styles.unselectedRadio} />
                        )}
                      </TouchableOpacity>
                    </React.Fragment>
                  );
                })}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <LegalModal
        visible={!!legalModalType}
        type={legalModalType}
        onClose={() => setLegalModalType(null)}
      />
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    flex1: {
      flex: 1,
    },
    batteryTextCol: {
      flex: 1,
      paddingRight: 8,
    },
    platformNoticeTextCol: {
      flex: 1,
      gap: 2,
    },
    currencyScroll: {
      maxHeight: 380,
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      gap: 24,
    },
    section: {
      gap: 10,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingRight: 4,
    },
    sectionTitle: {
      ...typography.labelMd,
      fontFamily: fontFamilies.bold,
      color: colors.onSurfaceVariant,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginLeft: 4,
    },
    listCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: radius.xl,
      overflow: 'hidden',
    },
    accountCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      gap: 12,
    },
    avatarCircle: {
      width: 48,
      height: 48,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      ...typography.headlineSm,
      fontFamily: fontFamilies.bold,
    },
    accountInfo: {
      flex: 1,
      gap: 2,
    },
    accountName: {
      ...typography.bodyLg,
      fontFamily: fontFamilies.semiBold,
      color: colors.onSurface,
    },
    accountEmail: {
      ...typography.bodyMd,
      fontSize: 13,
      color: colors.onSurfaceVariant,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 2,
    },
    badgeText: {
      ...typography.labelSm,
      fontFamily: fontFamilies.semiBold,
    },
    signOutBtn: {
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    signOutText: {
      ...typography.labelSm,
      fontFamily: fontFamilies.semiBold,
    },
    signInBtn: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: radius.md,
    },
    signInText: {
      ...typography.labelSm,
      fontFamily: fontFamilies.bold,
    },
    settingItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
      gap: 12,
    },
    settingItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    settingItemRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    iconBox: {
      width: 38,
      height: 38,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    settingTextContainer: {
      flex: 1,
    },
    settingTitle: {
      ...typography.bodyLg,
      fontFamily: fontFamilies.medium,
      fontSize: 15,
      color: colors.onSurface,
    },
    settingSub: {
      ...typography.bodyMd,
      fontSize: 12,
      lineHeight: 16,
      color: colors.onSurfaceVariant,
      marginTop: 2,
    },
    settingValueText: {
      ...typography.bodyMd,
      fontFamily: fontFamilies.semiBold,
      color: colors.primary,
      fontSize: 13,
    },
    itemDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.surfaceVariant,
      marginLeft: 66,
    },
    statusBadge: {
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: radius.full,
    },
    statusBadgeText: {
      ...typography.labelSm,
      fontFamily: fontFamilies.bold,
      fontSize: 11,
    },
    metaRow: {
      paddingHorizontal: 16,
      paddingBottom: 6,
    },
    metaText: {
      ...typography.bodySm,
      color: colors.onSurfaceVariant,
    },
    actionBtnContainer: {
      padding: 16,
    },
    btnPrimary: {
      backgroundColor: colors.primary,
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    btnPrimaryText: {
      ...typography.labelMd,
      fontFamily: fontFamilies.bold,
      color: colors.onPrimary,
      textAlign: 'center',
    },
    batteryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    batteryTitle: {
      ...typography.bodyMd,
      fontFamily: fontFamilies.semiBold,
      color: colors.onSurface,
    },
    batterySub: {
      ...typography.bodySm,
      color: colors.onSurfaceVariant,
      marginTop: 2,
    },
    platformNoticeCard: {
      flexDirection: 'row',
      padding: 16,
      gap: 12,
      alignItems: 'flex-start',
    },
    privacyBanner: {
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: radius.xl,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    privacyTitle: {
      ...typography.bodyMd,
      fontFamily: fontFamilies.bold,
      color: colors.onSurface,
    },
    privacyBody: {
      ...typography.bodySm,
      color: colors.onSurfaceVariant,
      lineHeight: 17,
      marginTop: 2,
    },
    legalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    legalRowLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    legalRowText: {
      ...typography.bodyMd,
      fontFamily: fontFamilies.medium,
      color: colors.onSurface,
    },
    versionFooter: {
      alignItems: 'center',
      paddingVertical: 10,
    },
    versionText: {
      ...typography.labelSm,
      color: colors.onSurfaceVariant,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: colors.surfaceContainerLowest,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingTop: 12,
      paddingBottom: 28,
      paddingHorizontal: 16,
      gap: 12,
    },
    modalHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.outlineVariant,
      alignSelf: 'center',
      marginBottom: 4,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
      paddingBottom: 8,
    },
    modalTitle: {
      ...typography.headlineSm,
      fontFamily: fontFamilies.bold,
      color: colors.onSurface,
    },
    modalOptionList: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      backgroundColor: colors.surfaceContainerLow,
      overflow: 'hidden',
    },
    modalOptionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 12,
    },
    modalOptionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    modalOptionLabel: {
      ...typography.bodyMd,
      fontFamily: fontFamilies.semiBold,
      color: colors.onSurface,
    },
    modalOptionSub: {
      ...typography.bodySm,
      color: colors.onSurfaceVariant,
      marginTop: 2,
    },
    unselectedRadio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.outlineVariant,
    },
    currencySymbolBox: {
      width: 38,
      height: 38,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    currencySymbolText: {
      ...typography.bodyLg,
      fontFamily: fontFamilies.bold,
    },
  });
  return styles;
};

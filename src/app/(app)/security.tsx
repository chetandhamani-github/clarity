import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Text, Button, Header, useToast, useAlert } from '@/components/ui';
import { spacing, typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '@/store/use-app-store';
import { clearDatabase } from '@/services/database';
import { exportFullBackupToJSON } from '@/services/export/export-service';
import { useAccounts } from '@/hooks/use-accounts';

export default function SecurityPrivacyScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { showAlert } = useAlert();
  const { accounts } = useAccounts();

  const biometricEnabled = useAppStore((state) => state.biometricEnabled);
  const timeoutSetting = useAppStore((state) => state.timeoutSetting);
  const setBiometricEnabled = useAppStore((state) => state.setBiometricEnabled);
  const setTimeoutSetting = useAppStore((state) => state.setTimeoutSetting);

  const [isExporting, setIsExporting] = useState(false);

  const handleToggleBiometrics = async (value: boolean) => {
    if (!value) {
      setBiometricEnabled(false);
      showToast('Biometric unlock disabled', 'info');
      return;
    }

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const enrolledLevel = await LocalAuthentication.getEnrolledLevelAsync();

      if (!hasHardware && enrolledLevel === LocalAuthentication.SecurityLevel.NONE) {
        showAlert(
          'Hardware Unavailable',
          'This device does not support biometric hardware or lock authentication.'
        );
        return;
      }

      if (!isEnrolled && enrolledLevel === LocalAuthentication.SecurityLevel.NONE) {
        showAlert(
          'Not Enrolled',
          'Please set up Face ID / Fingerprint or a device passcode in your device settings.'
        );
        return;
      }

      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Verify Biometrics to Enable',
        fallbackLabel: 'Use Device Passcode',
        disableDeviceFallback: false,
      });

      if (authResult.success) {
        setBiometricEnabled(true);
        showToast('Biometric unlock enabled', 'success');
      } else {
        showToast('Could not verify biometrics', 'error');
      }
    } catch (error: any) {
      console.error(error);
      showToast('Failed to enable biometrics', 'error');
    }
  };

  const handleDownloadArchive = async () => {
    setIsExporting(true);
    try {
      const result = await exportFullBackupToJSON();
      if (
        !result.success &&
        !result.message?.toLowerCase().includes('cancel') &&
        !result.message?.toLowerCase().includes('dismiss')
      ) {
        showToast(result.message || 'Could not export data', 'error');
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteAllData = () => {
    showAlert(
      'Reset All Data',
      'Are you sure you want to permanently delete all accounts, transactions, and categories from this device? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearDatabase();
              showToast('All local data was permanently cleared', 'success');
              router.replace('/(app)/(tabs)/dashboard' as any);
            } catch (err) {
              console.error(err);
              showToast('Failed to clear local data', 'error');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header showBack title="Security & Privacy" />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.introSection}>
          <Text style={styles.introText}>
            Manage your authentication methods and control how your data is handled within Clarity.
          </Text>
        </View>

        {/* Access Controls */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="lock" size={20} color={colors.outline} />
            <Text style={styles.sectionTitle}>Access Controls</Text>
          </View>

          <View style={styles.gridContainer}>
            {/* Biometric */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <View style={styles.iconBox}>
                    <MaterialIcons name="fingerprint" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.cardTextContent}>
                    <Text style={styles.cardTitle}>Biometric Unlock</Text>
                    <Text style={styles.cardSubtitle}>Use Face ID or Touch ID to log in.</Text>
                  </View>
                </View>
                <Switch
                  value={biometricEnabled}
                  onValueChange={handleToggleBiometrics}
                  trackColor={{ false: colors.surfaceVariant, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>

            {/* App Timeout */}
            <View style={styles.cardFullWidth}>
              <View style={styles.timeoutHeaderRow}>
                <View style={styles.iconBox}>
                  <MaterialIcons name="timer" size={20} color={colors.primary} />
                </View>
                <View style={styles.cardTextContent}>
                  <Text style={styles.cardTitle}>Auto-Lock Timeout</Text>
                  <Text style={styles.cardSubtitle}>Time before requiring re-authentication.</Text>
                </View>
              </View>

              <View style={styles.radioGroupRow}>
                <TouchableOpacity
                  style={[
                    styles.radioPill,
                    timeoutSetting === 'immediate' && styles.radioPillActive,
                  ]}
                  onPress={() => setTimeoutSetting('immediate')}
                >
                  <Text
                    style={[
                      styles.radioPillText,
                      timeoutSetting === 'immediate' && styles.radioPillTextActive,
                    ]}
                  >
                    Immediate
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.radioPill, timeoutSetting === '1min' && styles.radioPillActive]}
                  onPress={() => setTimeoutSetting('1min')}
                >
                  <Text
                    style={[
                      styles.radioPillText,
                      timeoutSetting === '1min' && styles.radioPillTextActive,
                    ]}
                  >
                    1 Minute
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.radioPill, timeoutSetting === '5min' && styles.radioPillActive]}
                  onPress={() => setTimeoutSetting('5min')}
                >
                  <Text
                    style={[
                      styles.radioPillText,
                      timeoutSetting === '5min' && styles.radioPillTextActive,
                    ]}
                  >
                    5 Minutes
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.radioPill,
                    timeoutSetting === 'never' && styles.radioPillActive,
                    { opacity: 0.7 },
                  ]}
                  onPress={() => setTimeoutSetting('never')}
                >
                  <Text
                    style={[
                      styles.radioPillText,
                      timeoutSetting === 'never' && styles.radioPillTextActive,
                    ]}
                  >
                    Never
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* Data Privacy */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="data-usage" size={20} color={colors.outline} />
            <Text style={styles.sectionTitle}>Data Privacy & Control</Text>
          </View>

          <View style={styles.listContainer}>
            {/* Linked Accounts */}
            <View style={styles.listItem}>
              <View style={styles.listItemTextContent}>
                <Text style={styles.cardTitle}>Institutions & Linked Accounts</Text>
                <Text style={styles.cardSubtitle}>
                  {accounts.length} active {accounts.length === 1 ? 'account' : 'accounts'} stored
                  securely on this device.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.outlineBtn}
                onPress={() => router.push('/(app)/(tabs)/accounts')}
              >
                <Text style={styles.outlineBtnText}>Manage</Text>
              </TouchableOpacity>
            </View>

            {/* Download Data */}
            <View style={styles.listItem}>
              <View style={styles.listItemTextContent}>
                <Text style={styles.cardTitle}>Download Personal Archive</Text>
                <Text style={styles.cardSubtitle}>
                  Export complete encrypted JSON package of transactions and balance history.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.textBtn}
                onPress={handleDownloadArchive}
                disabled={isExporting}
              >
                {isExporting ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <MaterialIcons name="download" size={18} color={colors.primary} />
                    <Text style={styles.textBtnText}>Export JSON</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Delete Account */}
            <View
              style={[
                styles.listItem,
                styles.listItemNoBorder,
                { backgroundColor: colors.error + '0D' },
              ]}
            >
              <View style={styles.listItemTextContent}>
                <Text style={[styles.cardTitle, { color: colors.error }]}>
                  Reset All Local Data
                </Text>
                <Text style={styles.cardSubtitle}>
                  Permanently wipe all accounts, transactions, and categories from this device.
                </Text>
              </View>
              <TouchableOpacity style={styles.errorBtn} onPress={handleDeleteAllData}>
                <Text style={styles.errorBtnText}>Reset Data</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Save Changes */}
        <View style={styles.footer}>
          <Button title="Save Changes" onPress={() => router.back()} style={styles.saveBtn} />
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

    scrollContent: {
      padding: 20,
      paddingBottom: 60,
      gap: 24,
    },
    introSection: {
      marginBottom: 8,
    },
    introText: {
      ...typography.bodyLg,
      color: colors.secondary,
    },
    section: {
      gap: 16,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sectionTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
    },
    gridContainer: {
      gap: 12,
    },
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: 12,
      padding: 20,
    },
    cardFullWidth: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: 12,
      padding: 20,
      gap: 16,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    cardHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      paddingRight: 16,
    },
    timeoutHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    iconBox: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTextContent: {
      flex: 1,
    },
    cardTitle: {
      ...typography.headlineSm,
      fontSize: 18,
      color: colors.onSurface,
      marginBottom: 4,
    },
    cardSubtitle: {
      ...typography.bodyMd,
      color: colors.secondary,
    },
    radioGroupRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    radioPill: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      backgroundColor: 'transparent',
    },
    radioPillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    radioPillText: {
      ...typography.bodyMd,
      color: colors.onSurface,
    },
    radioPillTextActive: {
      color: colors.onPrimary,
    },
    listContainer: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: 12,
      overflow: 'hidden',
    },
    listItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceVariant,
      gap: 16,
    },
    listItemNoBorder: {
      borderBottomWidth: 0,
    },
    listItemTextContent: {
      flex: 1,
    },
    outlineBtn: {
      borderWidth: 1.5,
      borderColor: colors.onSurface,
      paddingHorizontal: 24,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: 'transparent',
    },
    outlineBtnText: {
      ...typography.labelMd,
      color: colors.onSurface,
    },
    textBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      height: 44,
    },
    textBtnText: {
      ...typography.labelMd,
      color: colors.primary,
    },
    errorBtn: {
      backgroundColor: colors.error,
      paddingHorizontal: 24,
      paddingVertical: 10,
      borderRadius: 8,
    },
    errorBtnText: {
      ...typography.labelMd,
      color: colors.onError,
    },
    footer: {
      marginTop: 16,
      alignItems: 'center',
    },
    saveBtn: {
      minWidth: 200,
      height: 48,
      borderRadius: 12,
      shadowColor: colors.onSurface,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 2,
    },
  });
  return styles;
};

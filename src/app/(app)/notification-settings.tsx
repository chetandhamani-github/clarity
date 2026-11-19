import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Header, Text, useToast } from '@/components/ui';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useTheme, fontFamilies, ThemeColors, radius } from '@/theme';
import { useNotificationStore } from '@/store/useNotificationStore';
import { DEFAULT_TARGET_APPS } from '@/modules/notifications/constants';
import { BillAlertEngine } from '@/services/notifications/bill-alert-engine';

export default function NotificationSettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeInsets();
  const { showToast } = useToast();

  const isEnabled = useNotificationStore((state) => state.isEnabled);
  const permissionStatus = useNotificationStore((state) => state.permissionStatus);
  const parseTransactions = useNotificationStore((state) => state.parseTransactions);
  const parseBills = useNotificationStore((state) => state.parseBills);
  const enabledPackages = useNotificationStore((state) => state.enabledPackages);

  const checkPermission = useNotificationStore((state) => state.checkPermission);
  const requestPermission = useNotificationStore((state) => state.requestPermission);
  const setIsEnabled = useNotificationStore((state) => state.setIsEnabled);
  const setParseTransactions = useNotificationStore((state) => state.setParseTransactions);
  const setParseBills = useNotificationStore((state) => state.setParseBills);
  const togglePackage = useNotificationStore((state) => state.togglePackage);
  const setAllPackagesEnabled = useNotificationStore((state) => state.setAllPackagesEnabled);

  const [isRescheduling, setIsRescheduling] = useState(false);

  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  const handleRequestPermission = async () => {
    try {
      await requestPermission();
    } catch {
      showToast('Could not open Android notification settings', 'error');
    }
  };

  const handleRescheduleReminders = async () => {
    setIsRescheduling(true);
    try {
      await BillAlertEngine.syncAllNativeBillReminders();
      showToast('All native bill reminders synced and rescheduled', 'success');
    } catch {
      showToast('Failed to reschedule reminders', 'error');
    } finally {
      setIsRescheduling(false);
    }
  };

  const allAppsEnabled = enabledPackages.length === DEFAULT_TARGET_APPS.length;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Header title="Notification & Reminders" showBack />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Android vs iOS Platform Notice */}
        {Platform.OS !== 'android' ? (
          <View style={[styles.iosNoticeCard, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }]}>
            <MaterialIcons name="info" size={24} color={colors.primary} />
            <View style={styles.iosNoticeText}>
              <Text style={[styles.cardTitle, { color: colors.onSurface }]}>
                Android Feature
              </Text>
              <Text style={[styles.cardBody, { color: colors.onSurfaceVariant }]}>
                Push notification listening is available on Android. iOS system security prohibits apps from reading status-bar notifications from other apps. You can continue using SMS syncing and manual bill tracking on iOS.
              </Text>
            </View>
          </View>
        ) : (
          <>
            {/* Status Card */}
            <View
              style={[
                styles.statusCard,
                {
                  backgroundColor: colors.surfaceContainerLow,
                  borderColor:
                    permissionStatus === 'granted'
                      ? colors.primary
                      : colors.outlineVariant,
                },
              ]}
            >
              <View style={styles.statusHeaderRow}>
                <View style={styles.statusTitleRow}>
                  <MaterialIcons
                    name={permissionStatus === 'granted' ? 'verified-user' : 'notification-important'}
                    size={22}
                    color={permissionStatus === 'granted' ? colors.primary : colors.error}
                  />
                  <Text style={[styles.cardTitle, { color: colors.onSurface }]}>
                    Notification Access
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor:
                        permissionStatus === 'granted'
                          ? colors.primaryContainer
                          : colors.errorContainer,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      {
                        color:
                          permissionStatus === 'granted'
                            ? colors.onPrimaryContainer
                            : colors.onErrorContainer,
                      },
                    ]}
                  >
                    {permissionStatus === 'granted' ? 'Active & Granted' : 'Action Needed'}
                  </Text>
                </View>
              </View>

              <Text style={[styles.cardBody, { color: colors.onSurfaceVariant, marginTop: 8 }]}>
                {permissionStatus === 'granted'
                  ? 'Clarity is actively listening to push notifications from your selected banking & UPI apps to log transactions, capture bill statements, and schedule timely reminders.'
                  : 'Android requires you to grant Notification Access permission in system settings so Clarity can inspect financial alerts locally on this device.'}
              </Text>

              {permissionStatus !== 'granted' && (
                <TouchableOpacity
                  style={[styles.grantButton, { backgroundColor: colors.primary }]}
                  onPress={handleRequestPermission}
                  activeOpacity={0.85}
                >
                  <MaterialIcons name="settings" size={18} color={colors.onPrimary} />
                  <Text style={[styles.grantButtonText, { color: colors.onPrimary }]}>
                    Grant Access in Settings
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Master Tracking Switch */}
            <View style={[styles.card, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }]}>
              <View style={styles.switchRow}>
                <View style={styles.switchTextContainer}>
                  <Text style={[styles.switchTitle, { color: colors.onSurface }]}>
                    Enable Auto-Detection
                  </Text>
                  <Text style={[styles.switchSubtitle, { color: colors.onSurfaceVariant }]}>
                    Real-time local extraction from push notifications
                  </Text>
                </View>
                <Switch
                  value={isEnabled}
                  onValueChange={setIsEnabled}
                  trackColor={{ false: colors.surfaceContainerHighest, true: colors.primary }}
                  thumbColor={colors.onPrimary}
                />
              </View>

              <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />

              <View style={styles.switchRow}>
                <View style={styles.switchTextContainer}>
                  <Text style={[styles.switchTitle, { color: colors.onSurface }]}>
                    Auto-detect Transactions
                  </Text>
                  <Text style={[styles.switchSubtitle, { color: colors.onSurfaceVariant }]}>
                    Capture UPI debits, credit card spends, and merchant receipts
                  </Text>
                </View>
                <Switch
                  value={parseTransactions}
                  onValueChange={setParseTransactions}
                  disabled={!isEnabled}
                  trackColor={{ false: colors.surfaceContainerHighest, true: colors.primary }}
                  thumbColor={colors.onPrimary}
                />
              </View>

              <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />

              <View style={styles.switchRow}>
                <View style={styles.switchTextContainer}>
                  <Text style={[styles.switchTitle, { color: colors.onSurface }]}>
                    Auto-detect Bills & Due Dates
                  </Text>
                  <Text style={[styles.switchSubtitle, { color: colors.onSurfaceVariant }]}>
                    Extract electricity, broadband, credit card statements, and EMI reminders
                  </Text>
                </View>
                <Switch
                  value={parseBills}
                  onValueChange={setParseBills}
                  disabled={!isEnabled}
                  trackColor={{ false: colors.surfaceContainerHighest, true: colors.primary }}
                  thumbColor={colors.onPrimary}
                />
              </View>
            </View>

            {/* Native OS Scheduled Reminders */}
            <View style={[styles.card, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }]}>
              <View style={styles.sectionHeaderRow}>
                <MaterialIcons name="alarm" size={20} color={colors.primary} />
                <Text style={[styles.cardTitle, { color: colors.onSurface }]}>
                  Native Scheduled Bill Alarms
                </Text>
              </View>

              <Text style={[styles.cardBody, { color: colors.onSurfaceVariant, marginTop: 8 }]}>
                Clarity registers persistent OS system notification reminders for upcoming bills. Reminders fire at 9:00 AM on your reminder window even when Clarity has not been opened in days.
              </Text>

              <TouchableOpacity
                style={[styles.outlineButton, { borderColor: colors.outlineVariant }]}
                onPress={handleRescheduleReminders}
                disabled={isRescheduling}
                activeOpacity={0.8}
              >
                {isRescheduling ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <MaterialIcons name="sync" size={18} color={colors.onSurface} />
                    <Text style={[styles.outlineButtonText, { color: colors.onSurface }]}>
                      Reschedule All Reminders
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Target Apps Allowlist */}
            <View style={[styles.card, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }]}>
              <View style={styles.sectionHeaderRowBetween}>
                <Text style={[styles.cardTitle, { color: colors.onSurface }]}>
                  Monitored Banking & UPI Apps ({enabledPackages.length}/{DEFAULT_TARGET_APPS.length})
                </Text>
                <TouchableOpacity
                  onPress={() => setAllPackagesEnabled(!allAppsEnabled)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={[styles.toggleAllText, { color: colors.primary }]}>
                    {allAppsEnabled ? 'Deselect All' : 'Select All'}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.cardBody, { color: colors.onSurfaceVariant, marginTop: 4, marginBottom: 12 }]}>
                Only notifications from selected apps will be inspected. All non-financial notifications are ignored.
              </Text>

              {DEFAULT_TARGET_APPS.map((app, index) => {
                const isAppChecked = enabledPackages.includes(app.packageName);

                return (
                  <View key={app.packageName}>
                    {index > 0 && <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />}
                    <View style={styles.appRow}>
                      <View style={[styles.appIconBox, { backgroundColor: colors.surfaceContainerHighest }]}>
                        <MaterialIcons name={app.icon} size={20} color={colors.primary} />
                      </View>
                      <View style={styles.appMeta}>
                        <Text style={[styles.appName, { color: colors.onSurface }]}>
                          {app.name}
                        </Text>
                        <Text style={[styles.appCategory, { color: colors.onSurfaceVariant }]}>
                          {app.category === 'upi' ? 'UPI / Wallet' : 'Bank App'}
                        </Text>
                      </View>
                      <Switch
                        value={isAppChecked}
                        onValueChange={() => togglePackage(app.packageName)}
                        disabled={!isEnabled}
                        trackColor={{ false: colors.surfaceContainerHighest, true: colors.primary }}
                        thumbColor={colors.onPrimary}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 16,
  },
  statusCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 16,
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  statusPillText: {
    fontSize: 12,
    fontFamily: fontFamilies.semiBold,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: fontFamilies.semiBold,
  },
  cardBody: {
    fontSize: 13,
    fontFamily: fontFamilies.regular,
    lineHeight: 18,
  },
  grantButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: radius.md,
    marginTop: 14,
  },
  grantButtonText: {
    fontSize: 14,
    fontFamily: fontFamilies.semiBold,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  switchTextContainer: {
    flex: 1,
    paddingRight: 16,
  },
  switchTitle: {
    fontSize: 14,
    fontFamily: fontFamilies.semiBold,
  },
  switchSubtitle: {
    fontSize: 12,
    fontFamily: fontFamilies.regular,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeaderRowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleAllText: {
    fontSize: 12,
    fontFamily: fontFamilies.semiBold,
  },
  outlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: 14,
  },
  outlineButtonText: {
    fontSize: 13,
    fontFamily: fontFamilies.semiBold,
  },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  appIconBox: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  appMeta: {
    flex: 1,
  },
  appName: {
    fontSize: 14,
    fontFamily: fontFamilies.medium,
  },
  appCategory: {
    fontSize: 11,
    fontFamily: fontFamilies.regular,
    marginTop: 1,
  },
  iosNoticeCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 12,
  },
  iosNoticeText: {
    flex: 1,
    gap: 4,
  },
});


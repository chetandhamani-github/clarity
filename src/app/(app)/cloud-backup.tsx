import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Header, Text, useAlert, useToast } from '@/components/ui';
import { useTheme, typography, fontFamilies, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useGoogleDrive } from '@/hooks/use-google-drive';
import { useAppStore } from '@/store/use-app-store';
import { PassphraseModal } from '@/components/modals/PassphraseModal';
import { BackupRevisionsModal } from '@/components/modals/BackupRevisionsModal';
import type { GoogleDriveRevisionInfo } from '@/services/cloud/google-drive-service';

export default function CloudBackupScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeInsets();
  const { showAlert } = useAlert();
  const { showToast } = useToast();

  const isPostResetLocked = useAppStore((state) => state.isPostResetLocked);

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
    getDriveRevisions,
    restoreRevisionFromDrive,
    deleteBackupsFromDrive,
  } = useGoogleDrive();

  const [passphraseModalVisible, setPassphraseModalVisible] = useState(false);
  const [passphraseMode, setPassphraseMode] = useState<'encrypt' | 'decrypt'>('decrypt');
  const [revisionsModalVisible, setRevisionsModalVisible] = useState(false);
  const [driveRevisions, setDriveRevisions] = useState<GoogleDriveRevisionInfo[]>([]);
  const [isLoadingRevisions, setIsLoadingRevisions] = useState(false);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);

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
          onPress: async () => {
            await disconnectDrive();
          },
        },
      ]
    );
  };

  const handleRestoreFromDrive = async (passphrase?: string) => {
    let newerTxCount = 0;
    if (driveLastBackupTime) {
      try {
        const { getLocalTransactionsCountAfter } = await import(
          '@/services/database/backup-restore-service'
        );
        newerTxCount = await getLocalTransactionsCountAfter(driveLastBackupTime);
      } catch {
        // Ignore
      }
    }

    const backupDateMsg = driveLastBackupTime
      ? ` (Backup from: ${new Date(driveLastBackupTime).toLocaleString()})`
      : '';
    const conflictWarning =
      newerTxCount > 0
        ? `\n\n⚠️ Warning: You have ${newerTxCount} local transaction${newerTxCount > 1 ? 's' : ''} logged since this backup was created. Restoring will overwrite them with the backup version.`
        : '';

    showAlert(
      'Restore from Google Drive',
      `This will restore accounts, transactions, and goals from Google Drive and replace local data${backupDateMsg}.${conflictWarning}\n\nWould you like to proceed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: newerTxCount > 0 ? 'destructive' : 'default',
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

  const handleOpenRevisions = async () => {
    setIsLoadingRevisions(true);
    setRevisionsModalVisible(true);
    const revs = await getDriveRevisions();
    setDriveRevisions(revs);
    setIsLoadingRevisions(false);
  };

  const handleSelectRevision = async (rev: GoogleDriveRevisionInfo) => {
    try {
      let newerTxCount = 0;
      if (rev.modifiedTime) {
        try {
          const { getLocalTransactionsCountAfter } = await import(
            '@/services/database/backup-restore-service'
          );
          newerTxCount = await getLocalTransactionsCountAfter(rev.modifiedTime);
        } catch {
          // Ignore
        }
      }

      const conflictWarning =
        newerTxCount > 0
          ? `\n\n⚠️ Warning: You have ${newerTxCount} local transaction${newerTxCount > 1 ? 's' : ''} logged since this snapshot was created. Restoring will overwrite them.`
          : '';

      showAlert(
        'Restore Snapshot Version',
        `Restore snapshot from ${new Date(rev.modifiedTime).toLocaleString()}?${conflictWarning}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            style: newerTxCount > 0 ? 'destructive' : 'default',
            onPress: async () => {
              setSelectedRevisionId(rev.id);
              const res = await restoreRevisionFromDrive(rev.id);
              setRevisionsModalVisible(false);

              if (res.success) {
                setSelectedRevisionId(null);
              } else if (res.isEncrypted) {
                setPassphraseMode('decrypt');
                setPassphraseModalVisible(true);
              }
            },
          },
        ]
      );
    } catch {
      setRevisionsModalVisible(false);
    }
  };

  const handlePassphraseSubmit = async (passphrase: string) => {
    if (passphraseMode === 'decrypt') {
      const res = selectedRevisionId
        ? await restoreRevisionFromDrive(selectedRevisionId, passphrase)
        : await restoreFromDrive(passphrase);
      if (res.success) {
        setPassphraseModalVisible(false);
        setSelectedRevisionId(null);
        setRevisionsModalVisible(false);
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

  const handleDeleteDriveBackups = () => {
    showAlert(
      'Delete All Cloud Backups',
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

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Header showBack title="Cloud Backup & Restore" />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Connection Status Card */}
        <View style={styles.card}>
          <View style={styles.accountHeader}>
            <View
              style={[
                styles.accountIconCircle,
                { backgroundColor: isDriveConnected ? colors.primaryContainer : colors.surfaceContainerHigh },
              ]}
            >
              <MaterialIcons
                name="cloud"
                size={26}
                color={isDriveConnected ? colors.onPrimaryContainer : colors.outline}
              />
            </View>

            <View style={styles.accountDetails}>
              <Text style={styles.accountTitle}>
                {isDriveConnected ? 'Google Drive Connected' : 'Google Drive'}
              </Text>
              <Text style={styles.accountSubtitle}>
                {isDriveConnected ? driveUserEmail : 'Connect your account to enable private cloud backups'}
              </Text>

              {isDriveConnected && (
                <View style={styles.badgeRow}>
                  <View style={styles.badge}>
                    <MaterialIcons name="lock" size={13} color={colors.primary} />
                    <Text style={styles.badgeText} numberOfLines={1}>AES-256-GCM</Text>
                  </View>
                  {hasCustomBackupPassphrase && (
                    <View style={[styles.badge, { backgroundColor: colors.secondaryContainer }]}>
                      <MaterialIcons name="vpn-key" size={13} color={colors.onSecondaryContainer} />
                      <Text style={[styles.badgeText, { color: colors.onSecondaryContainer }]} numberOfLines={1}>
                        Passphrase Protected
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>

          {isDriveConnected && driveLastBackupTime && (
            <View style={styles.lastBackupRow}>
              <MaterialIcons name="schedule" size={16} color={colors.onSurfaceVariant} />
              <Text style={styles.lastBackupText}>
                Last backup: {new Date(driveLastBackupTime).toLocaleString()}
              </Text>
            </View>
          )}

          {!isDriveConnected ? (
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={handleConnectDrive}
              disabled={isConnectingDrive}
            >
              {isConnectingDrive ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <View style={styles.btnRow}>
                  <MaterialIcons name="cloud-sync" size={20} color={colors.onPrimary} />
                  <Text style={styles.btnPrimaryText}>CONNECT GOOGLE DRIVE</Text>
                </View>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.btnOutline, { borderColor: colors.outlineVariant }]}
              onPress={handleDisconnectDrive}
            >
              <Text style={[styles.btnOutlineText, { color: colors.onSurfaceVariant }]}>
                DISCONNECT ACCOUNT
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {isDriveConnected && (
          <>
            {/* Post-Reset Safeguard Banner */}
            {isPostResetLocked && (
              <View style={styles.lockedBanner}>
                <MaterialIcons name="shield" size={22} color={colors.onErrorContainer} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.lockedBannerTitle}>Cloud Sync Paused</Text>
                  <Text style={styles.lockedBannerText}>
                    Cloud sync was paused after app reset to protect existing cloud backups. Tap "Backup Now" or restore an older version to resume.
                  </Text>
                </View>
              </View>
            )}

            {/* Auto Backup Configuration */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Sync Preferences</Text>

              <View style={styles.settingRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.rowTitle}>Automatic Cloud Sync</Text>
                  <Text style={styles.rowSub}>
                    Silently uploads encrypted snapshots in background after changes
                  </Text>
                </View>
                <Switch
                  value={autoBackupEnabled}
                  onValueChange={setAutoBackupEnabled}
                  trackColor={{ false: colors.surfaceContainerHighest, true: colors.primary }}
                  thumbColor={autoBackupEnabled ? colors.onPrimary : colors.outline}
                />
              </View>

              <View style={[styles.settingRow, { borderBottomWidth: 0 }]}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.rowTitle}>Wi-Fi Only</Text>
                  <Text style={styles.rowSub}>Only perform automatic backups when connected to Wi-Fi</Text>
                </View>
                <Switch
                  value={autoBackupOnlyWifi}
                  onValueChange={setAutoBackupOnlyWifi}
                  disabled={!autoBackupEnabled}
                  trackColor={{ false: colors.surfaceContainerHighest, true: colors.primary }}
                  thumbColor={autoBackupOnlyWifi ? colors.onPrimary : colors.outline}
                />
              </View>

              {isAutoSyncing && (
                <View style={styles.syncingIndicator}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.syncingText}>Auto-syncing to Google Drive...</Text>
                </View>
              )}
            </View>

            {/* Actions Card */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Backup & Restore Operations</Text>

              <View style={{ gap: 10, marginTop: 4 }}>
                {/* Backup Now */}
                <TouchableOpacity
                  style={styles.btnPrimary}
                  onPress={() => backupDriveNow()}
                  disabled={isBackingUpDrive || isRestoringDrive || isDeletingDriveBackups}
                >
                  {isBackingUpDrive ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <View style={styles.btnRow}>
                      <MaterialIcons name="cloud-upload" size={18} color={colors.onPrimary} />
                      <Text style={styles.btnPrimaryText}>BACKUP NOW (ENCRYPTED)</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* Set / Change Passphrase */}
                <TouchableOpacity
                  style={styles.btnSecondary}
                  onPress={() => {
                    setPassphraseMode('encrypt');
                    setPassphraseModalVisible(true);
                  }}
                  disabled={isBackingUpDrive || isRestoringDrive || isDeletingDriveBackups}
                >
                  <View style={styles.btnRow}>
                    <MaterialIcons name="vpn-key" size={18} color={colors.primary} />
                    <Text style={[styles.btnSecondaryText, { color: colors.primary }]}>
                      {hasCustomBackupPassphrase ? 'CHANGE RECOVERY PASSPHRASE' : 'SET RECOVERY PASSPHRASE'}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Restore Latest */}
                <TouchableOpacity
                  style={styles.btnSecondary}
                  onPress={() => handleRestoreFromDrive()}
                  disabled={isBackingUpDrive || isRestoringDrive || isDeletingDriveBackups}
                >
                  {isRestoringDrive ? (
                    <ActivityIndicator size="small" color={colors.onSurface} />
                  ) : (
                    <View style={styles.btnRow}>
                      <MaterialIcons name="cloud-download" size={18} color={colors.onSurface} />
                      <Text style={styles.btnSecondaryText}>RESTORE LATEST BACKUP</Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* Version History (Point-in-Time) */}
                <TouchableOpacity
                  style={styles.btnSecondary}
                  onPress={handleOpenRevisions}
                  disabled={isBackingUpDrive || isRestoringDrive || isDeletingDriveBackups}
                >
                  <View style={styles.btnRow}>
                    <MaterialIcons name="history" size={18} color={colors.primary} />
                    <Text style={[styles.btnSecondaryText, { color: colors.primary }]}>
                      VERSION HISTORY (RESTORE POINTS)
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Delete Cloud Backups */}
                <TouchableOpacity
                  style={[styles.btnSecondary, { borderColor: colors.error, borderWidth: 1 }]}
                  onPress={handleDeleteDriveBackups}
                  disabled={isBackingUpDrive || isRestoringDrive || isDeletingDriveBackups}
                >
                  {isDeletingDriveBackups ? (
                    <ActivityIndicator size="small" color={colors.error} />
                  ) : (
                    <View style={styles.btnRow}>
                      <MaterialIcons name="delete-forever" size={18} color={colors.error} />
                      <Text style={[styles.btnSecondaryText, { color: colors.error }]}>
                        DELETE CLOUD BACKUPS
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* Security & Architecture FAQ Card */}
        <View style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <MaterialIcons name="security" size={20} color={colors.primary} />
            <Text style={styles.infoTitle}>Privacy & Security Architecture</Text>
          </View>

          <View style={styles.infoItem}>
            <Text style={styles.infoPointTitle}>• Client-Side Encryption</Text>
            <Text style={styles.infoPointDesc}>
              Financial records are encrypted on your phone with AES-256-GCM before uploading. Google never sees plain text.
            </Text>
          </View>

          <View style={styles.infoItem}>
            <Text style={styles.infoPointTitle}>• Private Application Storage</Text>
            <Text style={styles.infoPointDesc}>
              Backups live in your hidden Google Drive AppData folder, isolated from your general Drive files.
            </Text>
          </View>

          <View style={styles.infoItem}>
            <Text style={styles.infoPointTitle}>• Anti-Overwrite Circuit Breakers</Text>
            <Text style={styles.infoPointDesc}>
              If your phone data is cleared, automatic sync halts immediately to prevent overwriting cloud records.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Modals */}
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

      <BackupRevisionsModal
        visible={revisionsModalVisible}
        revisions={driveRevisions}
        isLoading={isLoadingRevisions}
        isRestoring={isRestoringDrive}
        onClose={() => setRevisionsModalVisible(false)}
        onSelectRevision={handleSelectRevision}
        onRefresh={handleOpenRevisions}
      />
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 12,
      gap: 16,
    },
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      gap: 14,
    },
    sectionCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      gap: 12,
    },
    accountHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    accountIconCircle: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    accountDetails: {
      flex: 1,
      gap: 2,
    },
    accountTitle: {
      ...typography.headlineSm,
      fontFamily: fontFamilies.bold,
      color: colors.onSurface,
    },
    accountSubtitle: {
      ...typography.bodySm,
      color: colors.onSurfaceVariant,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
      flexWrap: 'wrap',
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: colors.surfaceContainer,
      flexShrink: 0,
    },
    badgeText: {
      ...typography.labelSm,
      color: colors.primary,
      fontFamily: fontFamilies.bold,
      fontSize: 10,
    },
    lastBackupRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingTop: 4,
      borderTopWidth: 1,
      borderTopColor: colors.outlineVariant,
    },
    lastBackupText: {
      ...typography.bodySm,
      color: colors.onSurfaceVariant,
    },
    lockedBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      padding: 14,
      backgroundColor: colors.errorContainer,
      borderRadius: 14,
      gap: 10,
    },
    lockedBannerTitle: {
      ...typography.labelMd,
      fontFamily: fontFamilies.bold,
      color: colors.onErrorContainer,
    },
    lockedBannerText: {
      ...typography.bodySm,
      color: colors.onErrorContainer,
      marginTop: 2,
      lineHeight: 18,
    },
    sectionTitle: {
      ...typography.labelMd,
      fontFamily: fontFamilies.bold,
      color: colors.onSurface,
      marginBottom: 4,
    },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineVariant,
    },
    rowTitle: {
      ...typography.bodyLg,
      fontFamily: fontFamilies.semiBold,
      color: colors.onSurface,
    },
    rowSub: {
      ...typography.bodySm,
      color: colors.onSurfaceVariant,
      marginTop: 2,
      lineHeight: 16,
    },
    syncingIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingTop: 8,
    },
    syncingText: {
      ...typography.bodySm,
      color: colors.primary,
    },
    btnPrimary: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnPrimaryText: {
      ...typography.labelMd,
      fontFamily: fontFamilies.bold,
      color: colors.onPrimary,
    },
    btnSecondary: {
      backgroundColor: colors.surfaceContainerLow,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    btnSecondaryText: {
      ...typography.labelMd,
      fontFamily: fontFamilies.semiBold,
      color: colors.onSurface,
    },
    btnOutline: {
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnOutlineText: {
      ...typography.labelMd,
      fontFamily: fontFamilies.semiBold,
    },
    btnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    infoCard: {
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      gap: 12,
    },
    infoHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 2,
    },
    infoTitle: {
      ...typography.headlineSm,
      fontFamily: fontFamilies.bold,
      color: colors.onSurface,
    },
    infoItem: {
      gap: 2,
    },
    infoPointTitle: {
      ...typography.bodyMd,
      fontFamily: fontFamilies.semiBold,
      color: colors.onSurface,
    },
    infoPointDesc: {
      ...typography.bodySm,
      color: colors.onSurfaceVariant,
      lineHeight: 18,
    },
  });
  return styles;
};

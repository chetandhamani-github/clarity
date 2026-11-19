import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  TouchableWithoutFeedback,
  FlatList,
} from 'react-native';
import { Text } from '@/components/ui';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme, typography, ThemeColors } from '@/theme';
import type { GoogleDriveRevisionInfo } from '@/services/cloud/google-drive-service';

interface Props {
  visible: boolean;
  revisions: GoogleDriveRevisionInfo[];
  isLoading: boolean;
  isRestoring?: boolean;
  onClose: () => void;
  onSelectRevision: (revision: GoogleDriveRevisionInfo) => void;
  onRefresh: () => void;
}

export function BackupRevisionsModal({
  visible,
  revisions,
  isLoading,
  isRestoring = false,
  onClose,
  onSelectRevision,
  onRefresh,
}: Props) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const [selectedForConfirm, setSelectedForConfirm] = useState<GoogleDriveRevisionInfo | null>(null);

  useEffect(() => {
    if (!visible) {
      setSelectedForConfirm(null);
    }
  }, [visible]);

  if (!visible) return null;

  const renderRevisionItem = ({ item, index }: { item: GoogleDriveRevisionInfo; index: number }) => {
    const dateObj = new Date(item.modifiedTime);
    const dateStr = dateObj.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const timeStr = dateObj.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
    const sizeKb = item.size ? `${Math.round(item.size / 1024)} KB` : 'Cloud snapshot';

    return (
      <TouchableOpacity
        style={styles.revisionItem}
        activeOpacity={0.7}
        onPress={() => setSelectedForConfirm(item)}
      >
        <View style={styles.itemIconWrapper}>
          <MaterialIcons
            name={index === 0 ? 'cloud-done' : 'history'}
            size={22}
            color={index === 0 ? colors.primary : colors.onSurfaceVariant}
          />
        </View>

        <View style={styles.itemDetails}>
          <View style={styles.itemHeaderRow}>
            <Text style={styles.itemDateText}>{dateStr} • {timeStr}</Text>
            {index === 0 && (
              <View style={[styles.badge, { backgroundColor: colors.primaryContainer }]}>
                <Text style={[styles.badgeText, { color: colors.onPrimaryContainer }]}>Latest</Text>
              </View>
            )}
            {item.keepForever && (
              <View style={[styles.badge, { backgroundColor: colors.secondaryContainer }]}>
                <Text style={[styles.badgeText, { color: colors.onSecondaryContainer }]}>Pinned</Text>
              </View>
            )}
          </View>

          <View style={styles.itemSubRow}>
            <Text style={styles.itemSubText}>{sizeKb}</Text>
            <Text style={styles.restorePromptText}>Tap to restore →</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderConfirmContent = (rev: GoogleDriveRevisionInfo) => {
    const dateObj = new Date(rev.modifiedTime);
    const dateStr = dateObj.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const timeStr = dateObj.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
    const sizeKb = rev.size ? `${Math.round(rev.size / 1024)} KB` : 'Cloud snapshot';

    return (
      <View style={styles.confirmWrapper}>
        <View style={styles.confirmHeader}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primaryContainer }]}>
            <MaterialIcons name="restore" size={24} color={colors.onPrimaryContainer} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Confirm Restore</Text>
            <Text style={styles.description}>Restore this historical snapshot from Google Drive.</Text>
          </View>
        </View>

        <View style={styles.selectedRevCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MaterialIcons name="event" size={20} color={colors.primary} />
            <Text style={styles.selectedRevDateText}>{dateStr}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={styles.selectedRevTimeText}>Time: {timeStr}</Text>
            <Text style={styles.selectedRevSizeText}>{sizeKb}</Text>
          </View>
        </View>

        <View style={styles.warningBox}>
          <MaterialIcons name="warning-amber" size={20} color={colors.error} />
          <Text style={styles.warningText}>
            Restoring this version will replace your current local accounts, transactions, and categories with this backup.
          </Text>
        </View>

        <View style={styles.confirmActions}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setSelectedForConfirm(null)}
            disabled={isRestoring}
          >
            <Text style={styles.cancelButtonText}>Back to List</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.confirmRestoreButton}
            onPress={() => onSelectRevision(rev)}
            disabled={isRestoring}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons name="cloud-download" size={18} color={colors.onPrimary} />
                <Text style={styles.confirmRestoreButtonText}>Restore Version</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={isRestoring ? undefined : onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={styles.card}>
              {isRestoring ? (
                <View style={styles.restoringContainer}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.restoringTitle}>Restoring Snapshot...</Text>
                  <Text style={styles.restoringSubText}>
                    Downloading from Google Drive, decrypting data, and updating local tables. Please wait...
                  </Text>
                </View>
              ) : selectedForConfirm ? (
                renderConfirmContent(selectedForConfirm)
              ) : (
                <>
                  <View style={styles.header}>
                    <View style={styles.iconCircle}>
                      <MaterialIcons name="restore" size={24} color={colors.onPrimaryContainer} />
                    </View>
                    <View style={styles.headerTextWrapper}>
                      <Text style={styles.title}>Backup History</Text>
                      <Text style={styles.description}>
                        Select a previous snapshot from Google Drive to restore point-in-time data.
                      </Text>
                    </View>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                      <MaterialIcons name="close" size={22} color={colors.onSurfaceVariant} />
                    </TouchableOpacity>
                  </View>

                  {isLoading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="large" color={colors.primary} />
                      <Text style={styles.loadingText}>Loading cloud revisions...</Text>
                    </View>
                  ) : revisions.length === 0 ? (
                    <View style={styles.emptyContainer}>
                      <MaterialIcons name="cloud-off" size={40} color={colors.outline} />
                      <Text style={styles.emptyTitle}>No past revisions found</Text>
                      <Text style={styles.emptySubText}>
                        Google Drive currently has only the single active snapshot.
                      </Text>
                      <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
                        <MaterialIcons name="refresh" size={18} color={colors.primary} />
                        <Text style={styles.refreshBtnText}>Check Again</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <FlatList
                      data={revisions}
                      keyExtractor={(item) => item.id}
                      renderItem={renderRevisionItem}
                      style={styles.list}
                      contentContainerStyle={styles.listContent}
                      showsVerticalScrollIndicator={false}
                    />
                  )}

                  <View style={styles.footer}>
                    <TouchableOpacity style={styles.dismissButton} onPress={onClose}>
                      <Text style={styles.dismissButtonText}>Close</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    },
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 24,
      padding: 20,
      width: '100%',
      maxWidth: 420,
      maxHeight: '82%',
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 8,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 16,
    },
    iconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTextWrapper: {
      flex: 1,
    },
    title: {
      ...typography.headlineSm,
      color: colors.onSurface,
      fontWeight: '700',
    },
    description: {
      ...typography.bodySm,
      color: colors.onSurfaceVariant,
      marginTop: 2,
      lineHeight: 18,
    },
    closeButton: {
      padding: 4,
    },
    loadingContainer: {
      paddingVertical: 40,
      alignItems: 'center',
      gap: 12,
    },
    loadingText: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
    },
    restoringContainer: {
      paddingVertical: 40,
      alignItems: 'center',
      gap: 12,
    },
    restoringTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
      fontWeight: '700',
      marginTop: 8,
    },
    restoringSubText: {
      ...typography.bodySm,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
      paddingHorizontal: 16,
      lineHeight: 20,
    },
    emptyContainer: {
      paddingVertical: 36,
      alignItems: 'center',
      gap: 8,
    },
    emptyTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
      fontWeight: '600',
      marginTop: 4,
    },
    emptySubText: {
      ...typography.bodySm,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
      paddingHorizontal: 16,
    },
    refreshBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 12,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.surfaceContainer,
    },
    refreshBtnText: {
      ...typography.labelMd,
      color: colors.primary,
      fontWeight: '600',
    },
    list: {
      width: '100%',
    },
    listContent: {
      gap: 8,
      paddingVertical: 4,
    },
    revisionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 14,
      padding: 12,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    itemIconWrapper: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemDetails: {
      flex: 1,
      gap: 2,
    },
    itemHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    itemDateText: {
      ...typography.bodyMd,
      color: colors.onSurface,
      fontWeight: '600',
    },
    badge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    badgeText: {
      ...typography.labelSm,
      fontWeight: '700',
      fontSize: 10,
    },
    itemSubRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    itemSubText: {
      ...typography.bodySm,
      color: colors.onSurfaceVariant,
    },
    restorePromptText: {
      ...typography.labelSm,
      color: colors.primary,
      fontWeight: '600',
    },
    footer: {
      marginTop: 16,
      width: '100%',
    },
    dismissButton: {
      width: '100%',
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dismissButtonText: {
      ...typography.labelMd,
      color: colors.onSurface,
      fontWeight: '600',
    },
    // Confirmation screen styles
    confirmWrapper: {
      gap: 16,
    },
    confirmHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    selectedRevCard: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    selectedRevDateText: {
      ...typography.bodyLg,
      color: colors.onSurface,
      fontWeight: '700',
    },
    selectedRevTimeText: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
    },
    selectedRevSizeText: {
      ...typography.labelMd,
      color: colors.primary,
      fontWeight: '600',
    },
    warningBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.errorContainer,
      borderRadius: 12,
      padding: 12,
      gap: 8,
    },
    warningText: {
      ...typography.bodySm,
      color: colors.onErrorContainer,
      flex: 1,
      lineHeight: 18,
    },
    confirmActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainerLow,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButtonText: {
      ...typography.labelMd,
      color: colors.onSurface,
      fontWeight: '600',
    },
    confirmRestoreButton: {
      flex: 1.4,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    confirmRestoreButtonText: {
      ...typography.labelMd,
      color: colors.onPrimary,
      fontWeight: '700',
    },
  });

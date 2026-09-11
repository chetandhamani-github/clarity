import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  TouchableWithoutFeedback,
} from 'react-native';
import { Text, useToast } from '@/components/ui';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme, typography, ThemeColors } from '@/theme';
import { useSmsSync } from '@/hooks/useSmsSync';
import { useAppStore } from '@/store/use-app-store';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export function SmsPermissionPromptModal({ visible, onDismiss }: Props) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { requestPermission, startInitialSync, isSyncing, progress } = useSmsSync();
  const setHasSeenSmsPrompt = useAppStore((state) => state.setHasSeenSmsPrompt);
  const { showToast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleEnable = async () => {
    setIsProcessing(true);
    try {
      const status = await requestPermission();
      if (status === 'granted') {
        setHasSeenSmsPrompt(true);
        await startInitialSync();
        showToast('SMS scan completed successfully!', 'success');
        onDismiss();
      } else if (status === 'permanently_denied') {
        setHasSeenSmsPrompt(true);
        showToast('Permission denied. You can enable it in App Settings.', 'error');
        onDismiss();
      } else {
        showToast('SMS access was not granted.', 'info');
      }
    } catch (err: unknown) {
      console.warn('[SmsPermissionPromptModal] Enable failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSkip = () => {
    setHasSeenSmsPrompt(true);
    onDismiss();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleSkip}>
      <TouchableWithoutFeedback onPress={handleSkip}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              {/* Header Icon */}
              <View style={styles.iconContainer}>
                <View style={[styles.iconCircle, { backgroundColor: colors.primaryContainer }]}>
                  <MaterialIcons name="sms" size={40} color={colors.onPrimaryContainer} />
                </View>
              </View>

              {/* Title & Description */}
              <Text style={styles.title}>Automate Expense Tracking</Text>
              <Text style={styles.subtitle}>
                Allow Clarity to scan bank SMS messages on your device to automatically track
                transactions, bills, subscriptions, and salary credits.
              </Text>

              {/* Feature Points */}
              <View style={styles.featuresList}>
                <View style={styles.featureItem}>
                  <MaterialIcons name="security" size={20} color={colors.primary} />
                  <Text style={styles.featureText}>100% offline & private — no data leaves your device</Text>
                </View>
                <View style={styles.featureItem}>
                  <MaterialIcons name="bolt" size={20} color={colors.primary} />
                  <Text style={styles.featureText}>Auto-detects UPI, Card, NetBanking & ATM withdrawals</Text>
                </View>
                <View style={styles.featureItem}>
                  <MaterialIcons name="filter-none" size={20} color={colors.primary} />
                  <Text style={styles.featureText}>Intelligent duplicate prevention & categorization</Text>
                </View>
              </View>

              {/* Syncing Progress if running */}
              {isSyncing && (
                <View style={styles.progressContainer}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.progressText}>
                    Scanning ({progress.processed}/{progress.total || '...'})
                  </Text>
                </View>
              )}

              {/* Buttons */}
              <View style={styles.actionsContainer}>
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                  onPress={handleEnable}
                  disabled={isProcessing || isSyncing}
                  activeOpacity={0.85}
                >
                  {isProcessing || isSyncing ? (
                    <ActivityIndicator color={colors.onPrimary} size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="check-circle-outline" size={20} color={colors.onPrimary} />
                      <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
                        Enable SMS Auto-Tracking
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.skipButton}
                  onPress={handleSkip}
                  disabled={isProcessing || isSyncing}
                >
                  <Text style={[styles.skipButtonText, { color: colors.onSurfaceVariant }]}>
                    Set Up Later in Settings
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 24,
      width: '100%',
      maxWidth: 400,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.25,
      shadowRadius: 20,
      elevation: 12,
    },
    iconContainer: {
      alignItems: 'center',
      marginBottom: 16,
    },
    iconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      ...typography.headlineSm,
      color: colors.onSurface,
      textAlign: 'center',
      fontWeight: '700',
      marginBottom: 8,
    },
    subtitle: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 20,
    },
    featuresList: {
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 16,
      padding: 16,
      gap: 12,
      marginBottom: 20,
    },
    featureItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    featureText: {
      ...typography.bodyMd,
      color: colors.onSurface,
      flex: 1,
      fontSize: 13,
    },
    progressContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 16,
    },
    progressText: {
      ...typography.bodyMd,
      fontSize: 12,
      color: colors.primary,
    },
    actionsContainer: {
      gap: 12,
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingVertical: 14,
      borderRadius: 14,
    },
    primaryButtonText: {
      ...typography.bodyMd,
      fontWeight: '600',
    },
    skipButton: {
      alignItems: 'center',
      paddingVertical: 10,
    },
    skipButtonText: {
      ...typography.bodyMd,
      fontWeight: '500',
    },
  });
  return styles;
};

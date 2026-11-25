import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Platform,
} from 'react-native';
import { Text, useToast } from '@/components/ui';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme, typography, ThemeColors } from '@/theme';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useAppStore } from '@/store/use-app-store';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export function NotificationPermissionPromptModal({ visible, onDismiss }: Props) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const requestPermission = useNotificationStore((state) => state.requestPermission);
  const setHasSeenNotificationPrompt = useAppStore((state) => state.setHasSeenNotificationPrompt);
  const { showToast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  if (Platform.OS !== 'android' || !visible) return null;

  const handleEnable = async () => {
    setIsProcessing(true);
    try {
      setHasSeenNotificationPrompt(true);
      await requestPermission();
      showToast('Toggle Clarity ON in Device Notifications settings', 'info');
      onDismiss();
    } catch {
      showToast('Could not open notification settings', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSkip = () => {
    setHasSeenNotificationPrompt(true);
    onDismiss();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleSkip}>
      <TouchableWithoutFeedback onPress={handleSkip}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              {/* Header Icon */}
              <View style={styles.iconContainer}>
                <View style={[styles.iconCircle, { backgroundColor: colors.primaryContainer }]}>
                  <MaterialIcons name="notifications-active" size={40} color={colors.onPrimaryContainer} />
                </View>
              </View>

              {/* Title & Description */}
              <Text style={styles.title}>Enable Notification Auto-Tracking</Text>
              <Text style={styles.subtitle}>
                Clarity accesses notification titles and text strictly from whitelisted banking and UPI apps to detect transactions and bill reminders automatically.
              </Text>

              {/* Feature Points */}
              <View style={styles.featuresList}>
                <View style={styles.featureItem}>
                  <MaterialIcons name="security" size={20} color={colors.primary} />
                  <Text style={styles.featureText}>100% on-device — never uploaded, shared, or sold</Text>
                </View>
                <View style={styles.featureItem}>
                  <MaterialIcons name="lock" size={20} color={colors.primary} />
                  <Text style={styles.featureText}>Personal chats, SMS messages & OTPs are never read</Text>
                </View>
                <View style={styles.featureItem}>
                  <MaterialIcons name="bolt" size={20} color={colors.primary} />
                  <Text style={styles.featureText}>Real-time UPI, card debit & utility bill capture</Text>
                </View>
              </View>

              {/* Buttons */}
              <View style={styles.actionsContainer}>
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                  onPress={handleEnable}
                  disabled={isProcessing}
                  activeOpacity={0.85}
                >
                  {isProcessing ? (
                    <ActivityIndicator color={colors.onPrimary} size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="check-circle-outline" size={20} color={colors.onPrimary} />
                      <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
                        Agree & Open Settings
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.skipButton}
                  onPress={handleSkip}
                  disabled={isProcessing}
                >
                  <Text style={[styles.skipButtonText, { color: colors.onSurfaceVariant }]}>
                    Not Now
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
      elevation: 8,
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
      marginBottom: 8,
      fontWeight: '700',
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
      marginBottom: 24,
    },
    featureItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    featureText: {
      ...typography.bodySm,
      color: colors.onSurface,
      flex: 1,
      lineHeight: 18,
    },
    actionsContainer: {
      gap: 8,
    },
    primaryButton: {
      flexDirection: 'row',
      height: 48,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
    },
    primaryButtonText: {
      ...typography.labelMd,
      fontWeight: '600',
    },
    skipButton: {
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    skipButtonText: {
      ...typography.labelMd,
      fontWeight: '500',
    },
  });
  return styles;
};


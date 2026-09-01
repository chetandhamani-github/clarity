import React from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  TouchableWithoutFeedback,
} from 'react-native';
import { Text } from '@/components/ui';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme, typography, ThemeColors } from '@/theme';
import { useGoogleDrive } from '@/hooks/use-google-drive';
import { useAppStore } from '@/store/use-app-store';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export function GoogleDrivePromptModal({ visible, onDismiss }: Props) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { connect, isConnecting } = useGoogleDrive();
  const setHasSeenDrivePrompt = useAppStore((state) => state.setHasSeenDrivePrompt);

  const handleConnect = async () => {
    setHasSeenDrivePrompt(true);
    const success = await connect();
    if (success) {
      onDismiss();
    }
  };

  const handleSkip = () => {
    setHasSeenDrivePrompt(true);
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
                  <MaterialIcons name="cloud-sync" size={40} color={colors.onPrimaryContainer} />
                </View>
              </View>

              {/* Title & Description */}
              <Text style={styles.title}>Secure Cloud Backup</Text>
              <Text style={styles.subtitle}>
                Connect Clarity to your private Google Drive to keep your accounts, transactions,
                and budgets safely backed up.
              </Text>

              {/* Feature Points */}
              <View style={styles.featuresList}>
                <View style={styles.featureItem}>
                  <MaterialIcons name="lock-outline" size={20} color={colors.primary} />
                  <Text style={styles.featureText}>100% private to your personal Drive</Text>
                </View>
                <View style={styles.featureItem}>
                  <MaterialIcons name="restore" size={20} color={colors.primary} />
                  <Text style={styles.featureText}>Restore seamlessly anytime from Settings</Text>
                </View>
                <View style={styles.featureItem}>
                  <MaterialIcons name="sync" size={20} color={colors.primary} />
                  <Text style={styles.featureText}>Automatic encrypted local snapshot sync</Text>
                </View>
              </View>

              {/* Buttons */}
              <View style={styles.actionsContainer}>
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: colors.primary }]}
                  onPress={handleConnect}
                  disabled={isConnecting}
                  activeOpacity={0.85}
                >
                  {isConnecting ? (
                    <ActivityIndicator color={colors.onPrimary} size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="add-to-drive" size={20} color={colors.onPrimary} />
                      <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
                        Connect Google Drive
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.skipButton}
                  onPress={handleSkip}
                  disabled={isConnecting}
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
      marginBottom: 24,
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

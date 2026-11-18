import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text } from '@/components/ui';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme, typography, ThemeColors } from '@/theme';

interface Props {
  visible: boolean;
  title: string;
  description: string;
  confirmText?: string;
  isLoading?: boolean;
  onClose: () => void;
  onSubmit: (passphrase: string) => void;
}

export function PassphraseModal({
  visible,
  title,
  description,
  confirmText = 'Confirm',
  isLoading = false,
  onClose,
  onSubmit,
}: Props) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const [passphrase, setPassphrase] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  if (!visible) return null;

  const handleSubmit = () => {
    if (!passphrase.trim()) return;
    onSubmit(passphrase.trim());
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardView}
          >
            <TouchableWithoutFeedback>
              <View style={styles.card}>
                <View style={styles.iconCircle}>
                  <MaterialIcons name="lock" size={28} color={colors.primary} />
                </View>

                <Text style={styles.title}>{title}</Text>
                <Text style={styles.description}>{description}</Text>

                <View style={styles.inputWrapper}>
                  <MaterialIcons name="vpn-key" size={20} color={colors.onSurfaceVariant} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter passphrase"
                    placeholderTextColor={colors.outline}
                    secureTextEntry={!showPassword}
                    value={passphrase}
                    onChangeText={setPassphrase}
                    autoCapitalize="none"
                    autoFocus
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons
                      name={showPassword ? 'visibility-off' : 'visibility'}
                      size={20}
                      color={colors.outline}
                    />
                  </TouchableOpacity>
                </View>

                <View style={styles.actions}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={onClose}
                    disabled={isLoading}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.confirmButton,
                      (!passphrase.trim() || isLoading) && { opacity: 0.5 },
                    ]}
                    onPress={handleSubmit}
                    disabled={!passphrase.trim() || isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color={colors.onPrimary} />
                    ) : (
                      <Text style={styles.confirmText}>{confirmText}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    keyboardView: {
      width: '100%',
      maxWidth: 400,
    },
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 20,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      alignItems: 'center',
      gap: 12,
    },
    iconCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    title: {
      ...typography.headlineSm,
      color: colors.onSurface,
      fontWeight: '700',
      textAlign: 'center',
    },
    description: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
      lineHeight: 20,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainer,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      paddingHorizontal: 12,
      width: '100%',
      height: 48,
      gap: 8,
      marginTop: 8,
    },
    input: {
      flex: 1,
      ...typography.bodyMd,
      color: colors.onSurface,
      height: '100%',
    },
    actions: {
      flexDirection: 'row',
      gap: 12,
      width: '100%',
      marginTop: 12,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: colors.surfaceContainerLow,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelText: {
      ...typography.labelMd,
      color: colors.onSurface,
      fontWeight: '600',
    },
    confirmButton: {
      flex: 1.5,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    confirmText: {
      ...typography.labelMd,
      color: colors.onPrimary,
      fontWeight: '700',
    },
  });


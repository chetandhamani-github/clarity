import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  TouchableWithoutFeedback,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, useToast } from '@/components/ui';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme, typography, ThemeColors } from '@/theme';
import { useGoogleDrive } from '@/hooks/use-google-drive';
import { useAppStore } from '@/store/use-app-store';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

type ModalStep = 'intro' | 'setup_passphrase' | 'restore_passphrase';

export function GoogleDrivePromptModal({ visible, onDismiss }: Props) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { showToast } = useToast();

  const [step, setStep] = useState<ModalStep>('intro');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [existingBackupDate, setExistingBackupDate] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const {
    connect,
    isConnecting,
    backupNow,
    syncInitialBackupIfMeaningful,
    isBackingUp,
    restoreFromDrive,
    isRestoring,
  } = useGoogleDrive();
  const setHasSeenDrivePrompt = useAppStore((state) => state.setHasSeenDrivePrompt);

  useEffect(() => {
    if (visible) {
      setStep('intro');
      setPassphrase('');
      setConfirmPassphrase('');
      setShowPassword(false);
      setInlineError(null);
      setExistingBackupDate(null);
    }
  }, [visible]);

  if (!visible) return null;

  const trimmedSetupPassword = passphrase.trim();
  const trimmedSetupConfirm = confirmPassphrase.trim();
  const isSetupLengthValid = trimmedSetupPassword.length >= 4;
  const isSetupPasswordValid =
    isSetupLengthValid && trimmedSetupPassword === trimmedSetupConfirm;
  const showSetupLengthError = passphrase.length > 0 && !isSetupLengthValid;
  const showSetupMismatchError =
    confirmPassphrase.length > 0 && trimmedSetupPassword !== trimmedSetupConfirm;

  const handleConnect = async () => {
    setInlineError(null);
    const res = await connect({ deferInitialUpload: true });
    if (!res.success) {
      return;
    }

    setHasSeenDrivePrompt(true);

    if (res.needsPassphraseToRestore) {
      setPassphrase('');
      setConfirmPassphrase('');
      setShowPassword(false);
      setExistingBackupDate(res.existingBackupDate || null);
      setStep('restore_passphrase');
    } else if (!res.hasExistingBackup) {
      setPassphrase('');
      setConfirmPassphrase('');
      setShowPassword(false);
      setStep('setup_passphrase');
    } else {
      onDismiss();
    }
  };

  const handleSetPassphraseSubmit = async () => {
    if (trimmedSetupPassword.length < 4) {
      setInlineError('Password must be at least 4 characters long.');
      return;
    }
    if (trimmedSetupPassword !== trimmedSetupConfirm) {
      setInlineError('Passwords do not match.');
      return;
    }
    setInlineError(null);
    const success = await backupNow(trimmedSetupPassword);
    if (success) {
      onDismiss();
    } else {
      setInlineError('Failed to save backup. Please try again.');
    }
  };

  const handleSkipPassphrase = () => {
    void syncInitialBackupIfMeaningful();
    showToast(
      'Backups will be saved without encryption. You can set a password anytime in Cloud Backup.',
      'info'
    );
    onDismiss();
  };

  const handleRestoreSubmit = async () => {
    if (!passphrase.trim()) {
      setInlineError('Please enter your passphrase.');
      return;
    }
    setInlineError(null);
    const res = await restoreFromDrive(passphrase.trim());
    if (res.success) {
      onDismiss();
    } else {
      setInlineError(res.error || 'Incorrect passphrase. Please try again.');
    }
  };

  const handleInitialSkip = () => {
    setHasSeenDrivePrompt(true);
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={
        step === 'setup_passphrase'
          ? handleSkipPassphrase
          : step === 'restore_passphrase'
          ? onDismiss
          : handleInitialSkip
      }
    >
      <TouchableWithoutFeedback onPress={step === 'intro' ? handleInitialSkip : undefined}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
            style={styles.keyboardView}
          >
            <TouchableWithoutFeedback>
              <View style={styles.card}>
                {step === 'intro' && (
                  <>
                    <View style={styles.iconContainer}>
                      <View style={[styles.iconCircle, { backgroundColor: colors.primaryContainer }]}>
                        <MaterialIcons name="cloud-sync" size={40} color={colors.onPrimaryContainer} />
                      </View>
                    </View>

                    <Text style={styles.title}>Google Drive Cloud Backup</Text>
                    <Text style={styles.subtitle}>
                      Back up your accounts and transactions to your private Google Drive AppData folder.
                      You can optionally set a password to encrypt your backups.
                    </Text>

                    <View style={styles.featuresList}>
                      <View style={styles.featureItem}>
                        <MaterialIcons name="lock-outline" size={20} color={colors.primary} />
                        <Text style={styles.featureText}>Optional AES-256-GCM password encryption</Text>
                      </View>
                      <View style={styles.featureItem}>
                        <MaterialIcons name="restore" size={20} color={colors.primary} />
                        <Text style={styles.featureText}>Seamless recovery when changing devices</Text>
                      </View>
                      <View style={styles.featureItem}>
                        <MaterialIcons name="sync" size={20} color={colors.primary} />
                        <Text style={styles.featureText}>Automatic background cloud sync</Text>
                      </View>
                    </View>

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
                        onPress={handleInitialSkip}
                        disabled={isConnecting}
                      >
                        <Text style={[styles.skipButtonText, { color: colors.onSurfaceVariant }]}>
                          Set Up Later in Settings
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {step === 'setup_passphrase' && (
                  <>
                    <View style={styles.iconContainer}>
                      <View style={[styles.iconCircle, { backgroundColor: colors.primaryContainer }]}>
                        <MaterialIcons name="vpn-key" size={36} color={colors.onPrimaryContainer} />
                      </View>
                    </View>

                    <Text style={styles.title}>Set Backup Password</Text>
                    <Text style={styles.subtitle}>
                      Optionally set a password to encrypt your backups with AES-256-GCM. You will
                      need this password when restoring after reinstalling or changing phones.
                    </Text>

                    <View style={styles.inputWrapper}>
                      <MaterialIcons name="lock" size={20} color={colors.onSurfaceVariant} />
                      <TextInput
                        style={styles.input}
                        placeholder="Enter password (min 4 characters)"
                        placeholderTextColor={colors.outline}
                        secureTextEntry={!showPassword}
                        value={passphrase}
                        onChangeText={(txt) => {
                          setPassphrase(txt);
                          if (inlineError) setInlineError(null);
                        }}
                        autoCapitalize="none"
                        autoFocus
                        returnKeyType="next"
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

                    <View style={styles.inputWrapper}>
                      <MaterialIcons name="lock" size={20} color={colors.onSurfaceVariant} />
                      <TextInput
                        style={styles.input}
                        placeholder="Confirm password"
                        placeholderTextColor={colors.outline}
                        secureTextEntry={!showPassword}
                        value={confirmPassphrase}
                        onChangeText={(txt) => {
                          setConfirmPassphrase(txt);
                          if (inlineError) setInlineError(null);
                        }}
                        autoCapitalize="none"
                        returnKeyType="done"
                        onSubmitEditing={handleSetPassphraseSubmit}
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

                    {showSetupLengthError && !inlineError ? (
                      <Text style={[styles.errorText, { color: colors.error }]}>
                        Password must be at least 4 characters
                      </Text>
                    ) : null}

                    {showSetupMismatchError && !inlineError ? (
                      <Text style={[styles.errorText, { color: colors.error }]}>
                        Passwords do not match
                      </Text>
                    ) : null}

                    {inlineError ? (
                      <Text style={[styles.errorText, { color: colors.error }]}>{inlineError}</Text>
                    ) : null}

                    <View style={styles.actionsContainer}>
                      <TouchableOpacity
                        style={[
                          styles.primaryButton,
                          { backgroundColor: colors.primary },
                          (!isSetupPasswordValid || isBackingUp) && { opacity: 0.5 },
                        ]}
                        onPress={handleSetPassphraseSubmit}
                        disabled={!isSetupPasswordValid || isBackingUp}
                        activeOpacity={0.85}
                      >
                        {isBackingUp ? (
                          <ActivityIndicator color={colors.onPrimary} size="small" />
                        ) : (
                          <>
                            <MaterialIcons name="security" size={20} color={colors.onPrimary} />
                            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
                              Encrypt & Finish Setup
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.skipButton}
                        onPress={handleSkipPassphrase}
                        disabled={isBackingUp}
                      >
                        <Text style={[styles.skipButtonText, { color: colors.onSurfaceVariant }]}>
                          Skip — Back up without encryption
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}

                {step === 'restore_passphrase' && (
                  <>
                    <View style={styles.iconContainer}>
                      <View style={[styles.iconCircle, { backgroundColor: colors.primaryContainer }]}>
                        <MaterialIcons name="cloud-download" size={36} color={colors.onPrimaryContainer} />
                      </View>
                    </View>

                    <Text style={styles.title}>Cloud Backup Found</Text>
                    <Text style={styles.subtitle}>
                      We detected an encrypted backup
                      {existingBackupDate ? ` from ${new Date(existingBackupDate).toLocaleDateString()}` : ''}.
                      Enter your passphrase to restore your accounts, transactions, and goals.
                    </Text>

                    <View style={styles.inputWrapper}>
                      <MaterialIcons name="vpn-key" size={20} color={colors.onSurfaceVariant} />
                      <TextInput
                        style={styles.input}
                        placeholder="Enter your backup passphrase"
                        placeholderTextColor={colors.outline}
                        secureTextEntry={!showPassword}
                        value={passphrase}
                        onChangeText={(txt) => {
                          setPassphrase(txt);
                          if (inlineError) setInlineError(null);
                        }}
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

                    {inlineError ? (
                      <Text style={[styles.errorText, { color: colors.error }]}>{inlineError}</Text>
                    ) : null}

                    <View style={styles.actionsContainer}>
                      <TouchableOpacity
                        style={[
                          styles.primaryButton,
                          { backgroundColor: colors.primary },
                          (!passphrase.trim() || isRestoring) && { opacity: 0.5 },
                        ]}
                        onPress={handleRestoreSubmit}
                        disabled={!passphrase.trim() || isRestoring}
                        activeOpacity={0.85}
                      >
                        {isRestoring ? (
                          <ActivityIndicator color={colors.onPrimary} size="small" />
                        ) : (
                          <>
                            <MaterialIcons name="lock-open" size={20} color={colors.onPrimary} />
                            <Text style={[styles.primaryButtonText, { color: colors.onPrimary }]}>
                              Unlock & Restore
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.skipButton}
                        onPress={onDismiss}
                        disabled={isRestoring}
                      >
                        <Text style={[styles.skipButtonText, { color: colors.onSurfaceVariant }]}>
                          Start Fresh / Restore Later
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
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
      fontFamily: 'Manrope_700Bold',
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
      lineHeight: 18,
    },
    actionsContainer: {
      gap: 12,
    },
    keyboardView: {
      width: '100%',
      maxWidth: 400,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainer,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      paddingHorizontal: 14,
      width: '100%',
      height: 50,
      gap: 10,
      marginBottom: 16,
    },
    input: {
      flex: 1,
      ...typography.bodyMd,
      color: colors.onSurface,
      height: '100%',
    },
    errorText: {
      ...typography.bodySm,
      marginBottom: 12,
      textAlign: 'center',
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

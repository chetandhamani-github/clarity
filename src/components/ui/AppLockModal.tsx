import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Text } from './Text';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme, typography } from '@/theme';

interface AppLockModalProps {
  visible: boolean;
  onUnlock: () => void;
}

export function AppLockModal({ visible, onUnlock }: AppLockModalProps) {
  const { colors } = useTheme();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isRunningRef = useRef(false);

  const handleAuthenticate = async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    setIsAuthenticating(true);
    setErrorMessage(null);

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const enrolledLevel = await LocalAuthentication.getEnrolledLevelAsync();

      // If no lock security or biometrics is configured on the device at all
      if (!hasHardware && !isEnrolled && enrolledLevel === LocalAuthentication.SecurityLevel.NONE) {
        onUnlock();
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Clarity',
        fallbackLabel: 'Use Device Passcode',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      if (result.success) {
        setErrorMessage(null);
        onUnlock();
      } else {
        if (result.error !== 'user_cancel' && result.error !== 'app_cancel') {
          setErrorMessage('Authentication failed. Tap below to try again.');
        }
      }
    } catch (e: any) {
      console.error('Biometric authentication failed:', e);
      setErrorMessage(e?.message || 'Authentication error occurred.');
    } finally {
      setIsAuthenticating(false);
      isRunningRef.current = false;
    }
  };

  useEffect(() => {
    if (visible) {
      handleAuthenticate();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent={false} statusBarTranslucent>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.content}>
          <View style={[styles.iconCircle, { backgroundColor: colors.primaryContainer }]}>
            <MaterialIcons name="lock" size={48} color={colors.onPrimaryContainer} />
          </View>
          <Text style={[styles.title, { color: colors.onSurface }]}>Clarity is Locked</Text>
          <Text style={[styles.subtitle, { color: colors.onSurfaceVariant }]}>
            Authenticate with biometrics or device passcode to access your financial vault.
          </Text>

          {errorMessage ? (
            <Text style={[styles.errorText, { color: colors.error }]}>{errorMessage}</Text>
          ) : null}

          <TouchableOpacity
            style={[styles.unlockBtn, { backgroundColor: colors.primary }]}
            onPress={handleAuthenticate}
            activeOpacity={0.8}
            disabled={isAuthenticating}
          >
            {isAuthenticating ? (
              <ActivityIndicator color={colors.onPrimary} size="small" />
            ) : (
              <>
                <MaterialIcons name="fingerprint" size={24} color={colors.onPrimary} />
                <Text style={[styles.unlockBtnText, { color: colors.onPrimary }]}>Unlock App</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'center',
    maxWidth: 360,
    width: '100%',
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    ...typography.headlineMd,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.bodyMd,
    textAlign: 'center',
    marginBottom: 36,
    lineHeight: 22,
  },
  errorText: {
    ...typography.bodyMd,
    textAlign: 'center',
    marginBottom: 16,
  },
  unlockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  unlockBtnText: {
    ...typography.bodyLg,
    fontWeight: '600',
  },
});

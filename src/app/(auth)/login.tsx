import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { Text } from '@/components/ui';
import { typography, useTheme } from '@/theme';
import { useAuthStore } from '@/store/use-auth-store';
import { useAppStore } from '@/store/use-app-store';

function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <Path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z"
      />
      <Path
        fill="#FBBC05"
        d="M5.28 14.27a7.2 7.2 0 0 1 0-4.54V6.58H1.25a11.97 11.97 0 0 0 0 10.84l4.03-3.15Z"
      />
      <Path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
      />
    </Svg>
  );
}

export default function LoginScreen() {
  const { colors, theme } = useTheme();
  const insets = useSafeInsets();
  const { signInWithGoogle, isLoading } = useAuthStore();
  const { setOnboarded } = useAppStore();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    const result = await signInWithGoogle();
    if (result.success) {
      setOnboarded(true);
      router.replace('/(app)/(tabs)');
    } else if (result.error && !result.error.toLowerCase().includes('cancel')) {
      setErrorMessage(result.error);
    }
  };

  const handleContinueAsGuest = () => {
    setOnboarded(true);
    router.replace('/(app)/(tabs)');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar barStyle={theme === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Top Bar with optional Back Button */}
      <View style={styles.topBar}>
        {router.canGoBack() ? (
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.surfaceContainerLow }]}
            onPress={() => router.back()}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <MaterialIcons name="arrow-back" size={22} color={colors.onSurface} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backButtonSpacer} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 24) }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Hero Branding */}
        <View style={styles.heroSection}>
          <View style={[styles.iconContainer, { backgroundColor: colors.primaryContainer }]}>
            <MaterialIcons name="account-balance-wallet" size={40} color={colors.onPrimaryContainer} />
          </View>
          <Text style={[styles.title, { color: colors.onSurface }]}>Clarity</Text>
          <Text style={[styles.subtitle, { color: colors.onSurfaceVariant }]}>
            Personal finances, auto-tracked alerts & collaborative Splitwise.
          </Text>
        </View>

        {/* Feature Highlights Card */}
        <View
          style={[
            styles.featuresCard,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          <View style={styles.featureItem}>
            <View style={[styles.featureIconCircle, { backgroundColor: colors.primaryContainer }]}>
              <MaterialIcons name="group" size={20} color={colors.onPrimaryContainer} />
            </View>
            <View style={styles.featureTextContainer}>
              <Text style={[styles.featureTitle, { color: colors.onSurface }]}>
                Collaborative Splitwise
              </Text>
              <Text style={[styles.featureDesc, { color: colors.onSurfaceVariant }]}>
                Assign expenses to friends and sync balances across accounts automatically.
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <View style={[styles.featureIconCircle, { backgroundColor: colors.primaryContainer }]}>
              <MaterialIcons name="cloud-sync" size={20} color={colors.onPrimaryContainer} />
            </View>
            <View style={styles.featureTextContainer}>
              <Text style={[styles.featureTitle, { color: colors.onSurface }]}>
                Cloud Synchronization
              </Text>
              <Text style={[styles.featureDesc, { color: colors.onSurfaceVariant }]}>
                Keep your budget, debts, and history securely backed up across devices.
              </Text>
            </View>
          </View>

          <View style={styles.featureItem}>
            <View style={[styles.featureIconCircle, { backgroundColor: colors.primaryContainer }]}>
              <MaterialIcons name="security" size={20} color={colors.onPrimaryContainer} />
            </View>
            <View style={styles.featureTextContainer}>
              <Text style={[styles.featureTitle, { color: colors.onSurface }]}>
                Privacy-First Architecture
              </Text>
              <Text style={[styles.featureDesc, { color: colors.onSurfaceVariant }]}>
                Works 100% offline with local SQLite storage. Syncs whenever online.
              </Text>
            </View>
          </View>
        </View>

        {/* Error Alert if any */}
        {errorMessage && (
          <View style={[styles.errorBox, { backgroundColor: colors.errorContainer }]}>
            <MaterialIcons name="error-outline" size={18} color={colors.onErrorContainer} />
            <Text style={[styles.errorText, { color: colors.onErrorContainer }]}>
              {errorMessage}
            </Text>
          </View>
        )}

        {/* Action Buttons Section */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={[
              styles.googleButton,
              { backgroundColor: colors.primary },
              isLoading && styles.googleButtonDisabled,
            ]}
            onPress={handleGoogleSignIn}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <>
                <View style={styles.googleIconCircle}>
                  <GoogleIcon size={18} />
                </View>
                <Text style={[styles.googleButtonText, { color: colors.onPrimary }]}>
                  Continue with Google
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.guestButton,
              {
                backgroundColor: colors.surfaceContainerLow,
                borderColor: colors.outlineVariant,
              },
            ]}
            onPress={handleContinueAsGuest}
            disabled={isLoading}
            activeOpacity={0.7}
          >
            <Text style={[styles.guestButtonText, { color: colors.onSurface }]}>
              Continue as Guest (Offline)
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.disclaimerText, { color: colors.onSurfaceVariant }]}>
          By continuing, your data remains stored locally and syncs securely with Clarity cloud.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 2,
    minHeight: 40,
    justifyContent: 'center',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  heroSection: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  title: {
    ...typography.headlineMd,
    fontSize: 26,
    fontFamily: 'Manrope_700Bold',
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  subtitle: {
    ...typography.bodyMd,
    textAlign: 'center',
    maxWidth: 290,
    lineHeight: 20,
    fontSize: 13,
  },
  featuresCard: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
    marginVertical: 12,
    borderWidth: 1,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  featureIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTextContainer: {
    flex: 1,
  },
  featureTitle: {
    ...typography.headlineSm,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  featureDesc: {
    ...typography.bodyMd,
    fontSize: 12,
    lineHeight: 16,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 10,
  },
  errorText: {
    ...typography.bodyMd,
    fontSize: 12,
    flex: 1,
  },
  actionsSection: {
    gap: 10,
    marginTop: 8,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 13,
    borderRadius: 16,
    minHeight: 52,
  },
  googleButtonDisabled: {
    opacity: 0.7,
  },
  backButtonSpacer: {
    height: 36,
  },
  googleIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleButtonText: {
    ...typography.bodyLg,
    fontWeight: '700',
    fontSize: 15,
  },
  guestButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 48,
  },
  guestButtonText: {
    ...typography.bodyMd,
    fontWeight: '600',
    fontSize: 14,
  },
  disclaimerText: {
    ...typography.labelMd,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 10,
    opacity: 0.7,
  },
});

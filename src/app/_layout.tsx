import '@/lib/reactotron';
import '@/lib/navigation';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { AppState, type AppStateStatus, StyleSheet, View, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import * as SplashScreen from 'expo-splash-screen';
import { initDatabase } from '@/services/database';
import { ToastProvider, AlertProvider, AppLockModal, Text } from '@/components/ui';
import { GoogleDrivePromptModal } from '@/components/modals/GoogleDrivePromptModal';
import { SmsPermissionPromptModal } from '@/components/modals/SmsPermissionPromptModal';
import { SmsTransactionPromptModal } from '@/components/modals/SmsTransactionPromptModal';
import { NotificationPermissionPromptModal } from '@/components/modals/NotificationPermissionPromptModal';
import { useSmsStore } from '@/store/useSmsStore';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { typography } from '@/theme';
import { useTheme } from '@/theme/useTheme';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import { BackendProvider } from '@/providers/BackendProvider';
import { useAppStore } from '@/store/use-app-store';
import { checkUpcomingBillReminders, checkUpcomingGoalDeadlines } from '@/services/notifications/alert-engine';
import { mmkv } from '@/lib/storage';

SplashScreen.preventAutoHideAsync();

function checkInitialLockState(): boolean {
  try {
    const raw = mmkv.getString('app-storage');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.state?.biometricEnabled && parsed?.state?.timeoutSetting !== 'never') {
        return true;
      }
    }
  } catch {
    // Ignore error
  }
  return false;
}

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const [isAppLocked, setIsAppLocked] = useState(checkInitialLockState);
  const [isScreenShielded, setIsScreenShielded] = useState(false);
  const [showDrivePrompt, setShowDrivePrompt] = useState(false);
  const [showSmsPrompt, setShowSmsPrompt] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const isTransactionPromptVisible = useSmsStore((state) => state.isPromptVisible);
  const closeTransactionPrompt = useSmsStore((state) => state.closeTransactionPrompt);
  const lastBackgroundTime = useRef<number | null>(null);

  const biometricEnabled = useAppStore((state) => state.biometricEnabled);
  const timeoutSetting = useAppStore((state) => state.timeoutSetting);
  const hasHydrated = useAppStore((state) => state._hasHydrated);
  const hasSeenDrivePrompt = useAppStore((state) => state.hasSeenDrivePrompt);
  const hasSeenSmsPrompt = useAppStore((state) => state.hasSeenSmsPrompt);
  const hasSeenNotificationPrompt = useAppStore((state) => state.hasSeenNotificationPrompt);
  const googleDriveConnected = useAppStore((state) => state.googleDriveConnected);
  const { expoPushToken } = usePushNotifications();
  const { theme, colors } = useTheme();

  const navigationTheme = useMemo(() => {
    const base = theme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: theme === 'dark',
      colors: {
        ...base.colors,
        background: colors.background,
        card: colors.surfaceContainerLowest,
        text: colors.onSurface,
        border: colors.outlineVariant,
        primary: colors.primary,
        notification: colors.primary,
      },
    };
  }, [theme, colors]);

  // Cold start / App launch lock
  useEffect(() => {
    if (hasHydrated && biometricEnabled && timeoutSetting !== 'never') {
      setIsAppLocked(true);
    }
  }, [hasHydrated, biometricEnabled, timeoutSetting]);

  // First-time launch Google Drive backup prompt
  useEffect(() => {
    if (hasHydrated && dbReady && !hasSeenDrivePrompt && !googleDriveConnected) {
      const timer = setTimeout(() => {
        setShowDrivePrompt(true);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [hasHydrated, dbReady, hasSeenDrivePrompt, googleDriveConnected]);

  // First-time launch SMS permission prompt
  useEffect(() => {
    if (hasHydrated && dbReady && !hasSeenSmsPrompt && !showDrivePrompt) {
      const timer = setTimeout(() => {
        setShowSmsPrompt(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [hasHydrated, dbReady, hasSeenSmsPrompt, showDrivePrompt]);

  // First-time launch Notification tracking permission prompt (Android only)
  useEffect(() => {
    if (
      Platform.OS === 'android' &&
      hasHydrated &&
      dbReady &&
      !hasSeenNotificationPrompt &&
      hasSeenSmsPrompt &&
      !showDrivePrompt &&
      !showSmsPrompt
    ) {
      const timer = setTimeout(() => {
        setShowNotificationPrompt(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [
    hasHydrated,
    dbReady,
    hasSeenNotificationPrompt,
    hasSeenSmsPrompt,
    showDrivePrompt,
    showSmsPrompt,
  ]);

  const [fontsLoaded, fontsError] = useFonts({
    ...MaterialIcons.font,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  useEffect(() => {
    initDatabase()
      .then(async () => {
        try {
          const { processDueRecurringTransactions } =
            await import('@/services/database/recurring-dao');
          await processDueRecurringTransactions();
          await checkUpcomingBillReminders();
          await checkUpcomingGoalDeadlines();

          // Initialize opportunistic background daily auto-backup scheduler
          const { initScheduledBackupListener } = await import(
            '@/services/cloud/auto-backup-scheduler'
          );
          initScheduledBackupListener();

          // Silent cloud backup sync on app launch
          const { syncDatabaseToDriveSilently } = await import(
            '@/services/cloud/google-drive-service'
          );
          syncDatabaseToDriveSilently('app-launch').catch(() => {});

          // Initialize Google user session from secure storage
          const { useAuthStore } = await import('@/store/use-auth-store');
          await useAuthStore.getState().initializeAuth().catch(() => {});

          // Silent incremental SMS scan on app launch (ask user if new transactions found)
          const { SmsPermissionManager } = await import(
            '@/modules/sms/permissions/smsPermissionManager'
          );
          const smsStatus = await SmsPermissionManager.checkSmsPermission();
          if (smsStatus === 'granted') {
            const { SmsSyncService } = await import('@/modules/sms/services/smsSyncService');
            await SmsSyncService.runIncrementalScan({
              autoCreateClarityTransactions: false,
            }).catch(() => null);

            // Bank accounts and bills auto-fetch immediately
            queryClient.invalidateQueries({ queryKey: ['accounts'] });
            queryClient.invalidateQueries({ queryKey: ['bills'] });

            // Only transactions await user confirmation
            const { SmsDao } = await import('@/modules/sms/storage/smsDao');
            const unlinked = await SmsDao.getUnlinkedParsedTransactions();
            if (unlinked.length > 0) {
              const { useSmsStore } = await import('@/store/useSmsStore');
              useSmsStore.getState().setPendingTransactions(unlinked);
            }
          }
        } catch {
          // Recurring processing error ignored
        }
        setDbReady(true);
      })
      .catch(() => {
        setDbReady(true);
      });
  }, []);

  // Inactivity & Auto-lock listener
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        lastBackgroundTime.current = Date.now();
        const state = useAppStore.getState();
        // Mask screen immediately in task switcher if biometric lock is enabled
        if (state.biometricEnabled) {
          setIsScreenShielded(true);
        }
        if (state.biometricEnabled && state.timeoutSetting === 'immediate') {
          setIsAppLocked(true);
        }
      } else if (nextAppState === 'active') {
        const state = useAppStore.getState();
        if (state.biometricEnabled && lastBackgroundTime.current) {
          const elapsedSeconds = (Date.now() - lastBackgroundTime.current) / 1000;
          let threshold = 0;
          if (state.timeoutSetting === 'immediate') threshold = 0;
          else if (state.timeoutSetting === '1min') threshold = 60;
          else if (state.timeoutSetting === '5min') threshold = 300;
          else if (state.timeoutSetting === 'never') threshold = Infinity;

          if (elapsedSeconds >= threshold) {
            setIsAppLocked(true);
          }
        }
        setIsScreenShielded(false);
        lastBackgroundTime.current = null;

        // Process due recurring transactions and bill reminders when resuming app
        import('@/services/database/recurring-dao')
          .then(({ processDueRecurringTransactions }) => processDueRecurringTransactions())
          .catch(() => {});
        checkUpcomingBillReminders().catch(() => {});

        // Silent incremental SMS scan on app resume
        import('@/modules/sms/permissions/smsPermissionManager')
          .then(async ({ SmsPermissionManager }) => {
            const status = await SmsPermissionManager.checkSmsPermission();
            if (status === 'granted') {
              const { SmsSyncService } = await import('@/modules/sms/services/smsSyncService');
              await SmsSyncService.runIncrementalScan({
                autoCreateClarityTransactions: false,
              }).catch(() => null);

              // Bank accounts and bills auto-fetch immediately
              queryClient.invalidateQueries({ queryKey: ['accounts'] });
              queryClient.invalidateQueries({ queryKey: ['bills'] });

              // Only transactions await user confirmation
              const { SmsDao } = await import('@/modules/sms/storage/smsDao');
              const unlinked = await SmsDao.getUnlinkedParsedTransactions();
              if (unlinked.length > 0) {
                const { useSmsStore } = await import('@/store/useSmsStore');
                useSmsStore.getState().setPendingTransactions(unlinked);
              }
            }
          })
          .catch(() => {});
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontsError) && dbReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontsError, dbReady]);

  if ((!fontsLoaded && !fontsError) || !dbReady) {
    return null;
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <QueryClientProvider client={queryClient}>
        <BackendProvider>
          <ToastProvider>
            <AlertProvider>
              <ThemeProvider value={navigationTheme}>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.background },
                  }}
                >
                  <Stack.Screen name="(app)" options={{ headerShown: false }} />
                  <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                </Stack>
                {isScreenShielded && !isAppLocked && (
                  <View
                    style={[
                      StyleSheet.absoluteFill,
                      {
                        backgroundColor: colors.background,
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 99999,
                      },
                    ]}
                  >
                    <MaterialIcons name="security" size={48} color={colors.primary} />
                    <Text style={{ marginTop: 12, ...typography.headlineSm, color: colors.onSurface }}>
                      Clarity Protected
                    </Text>
                  </View>
                )}
                <AppLockModal visible={isAppLocked} onUnlock={() => setIsAppLocked(false)} />
                <GoogleDrivePromptModal
                  visible={showDrivePrompt && !isAppLocked}
                  onDismiss={() => setShowDrivePrompt(false)}
                />
                <SmsPermissionPromptModal
                  visible={showSmsPrompt && !isAppLocked && !showDrivePrompt}
                  onDismiss={() => setShowSmsPrompt(false)}
                />
                <NotificationPermissionPromptModal
                  visible={
                    showNotificationPrompt &&
                    !isAppLocked &&
                    !showDrivePrompt &&
                    !showSmsPrompt
                  }
                  onDismiss={() => setShowNotificationPrompt(false)}
                />
                <SmsTransactionPromptModal
                  visible={
                    isTransactionPromptVisible &&
                    !isAppLocked &&
                    !showDrivePrompt &&
                    !showSmsPrompt &&
                    !showNotificationPrompt
                  }
                  onDismiss={closeTransactionPrompt}
                />
              </ThemeProvider>
            </AlertProvider>
          </ToastProvider>
        </BackendProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

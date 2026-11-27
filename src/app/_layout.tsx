import { GoogleDrivePromptModal } from '@/components/modals/GoogleDrivePromptModal';
import { NotificationPermissionPromptModal } from '@/components/modals/NotificationPermissionPromptModal';
import { SmsTransactionPromptModal } from '@/components/modals/SmsTransactionPromptModal';
import { AlertProvider, AppLockModal, ErrorBoundary, Text, ToastProvider } from '@/components/ui';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import '@/lib/navigation';
import { queryClient } from '@/lib/query-client';
import '@/lib/reactotron';
import { mmkv } from '@/lib/storage';
import { BackendProvider } from '@/providers/BackendProvider';
import { initDatabase } from '@/services/database';
import { checkUpcomingBillReminders, checkUpcomingGoalDeadlines } from '@/services/notifications/alert-engine';
import { useAppStore } from '@/store/use-app-store';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useSmsStore } from '@/store/useSmsStore';
import { typography } from '@/theme';
import { useTheme } from '@/theme/useTheme';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  useFonts,
} from '@expo-google-fonts/manrope';
import { MaterialIcons } from '@expo/vector-icons';
import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus, DeviceEventEmitter, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

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
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const isTransactionPromptVisible = useSmsStore((state) => state.isPromptVisible);
  const closeTransactionPrompt = useSmsStore((state) => state.closeTransactionPrompt);
  const isNotificationDisclosureVisible = useNotificationStore((state) => state.isDisclosureVisible);
  const closeNotificationDisclosure = useNotificationStore((state) => state.closeDisclosure);
  const lastBackgroundTime = useRef<number | null>(null);

  const biometricEnabled = useAppStore((state) => state.biometricEnabled);
  const timeoutSetting = useAppStore((state) => state.timeoutSetting);
  const hasHydrated = useAppStore((state) => state._hasHydrated);
  const hasSeenDrivePrompt = useAppStore((state) => state.hasSeenDrivePrompt);
  const hasSeenNotificationPrompt = useAppStore((state) => state.hasSeenNotificationPrompt);
  const notificationPermissionStatus = useNotificationStore((state) => state.permissionStatus);
  const googleDriveConnected = useAppStore((state) => state.googleDriveConnected);
  const canRequestPushPermissions =
    hasHydrated &&
    dbReady &&
    !isAppLocked &&
    !showNotificationPrompt &&
    !isNotificationDisclosureVisible &&
    (Platform.OS !== 'android' || hasSeenNotificationPrompt);
  usePushNotifications({
    canRequestPermissions: canRequestPushPermissions,
  });
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

  // First-time launch Notification tracking permission prompt (Android only, first priority)
  useEffect(() => {
    if (
      Platform.OS === 'android' &&
      hasHydrated &&
      dbReady &&
      !hasSeenNotificationPrompt &&
      notificationPermissionStatus !== 'granted'
    ) {
      const timer = setTimeout(() => {
        setShowNotificationPrompt(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [hasHydrated, dbReady, hasSeenNotificationPrompt, notificationPermissionStatus]);

  // First-time launch Google Drive backup prompt (staggered after notification prompt)
  useEffect(() => {
    const notificationStepDone = Platform.OS !== 'android' || hasSeenNotificationPrompt;
    if (
      hasHydrated &&
      dbReady &&
      !hasSeenDrivePrompt &&
      !googleDriveConnected &&
      notificationStepDone &&
      !showNotificationPrompt
    ) {
      const timer = setTimeout(() => {
        setShowDrivePrompt(true);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [
    hasHydrated,
    dbReady,
    hasSeenDrivePrompt,
    googleDriveConnected,
    hasSeenNotificationPrompt,
    showNotificationPrompt,
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
          const { ReminderScheduler } = await import('@/modules/reminders/services/ReminderScheduler');
          await ReminderScheduler.syncAll().catch(() => {});

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

          // Refresh review queue and surface any unlinked parsed transactions on app launch
          const { useSmsStore: smsStore } = await import('@/store/useSmsStore');
          await smsStore.getState().refreshReviewQueueCount().catch(() => {});
          const { SmsDao } = await import('@/modules/sms/storage/smsDao');
          const unlinked = await SmsDao.getUnlinkedParsedTransactions();
          if (unlinked.length > 0) {
            smsStore.getState().setPendingTransactions(unlinked);
            smsStore.getState().openTransactionPrompt();
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
        import('@/services/cloud/google-drive-service')
          .then(({ flushPendingAutoBackup }) => flushPendingAutoBackup('app-background'))
          .catch(() => {});
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
        import('@/modules/reminders/services/ReminderScheduler')
          .then(({ ReminderScheduler }) => ReminderScheduler.syncAll())
          .catch(() => {});
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    const txSubscription = DeviceEventEmitter.addListener('transactionsUpdated', () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['categorySpending'] });
    });
    return () => {
      subscription.remove();
      txSubscription.remove();
    };
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
                <ErrorBoundary>
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: colors.background },
                    }}
                  >
                    <Stack.Screen name="(app)" options={{ headerShown: false }} />
                    <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                  </Stack>
                </ErrorBoundary>
                {isScreenShielded && !isAppLocked && (
                  <View
                    style={[
                      StyleSheet.absoluteFill,
                      styles.screenShieldOverlay,
                      { backgroundColor: colors.background },
                    ]}
                  >
                    <MaterialIcons name="security" size={48} color={colors.primary} />
                    <Text style={[styles.screenShieldText, { color: colors.onSurface }]}>
                      Clarity Protected
                    </Text>
                  </View>
                )}
                <AppLockModal visible={isAppLocked} onUnlock={() => setIsAppLocked(false)} />
                <NotificationPermissionPromptModal
                  visible={
                    isNotificationDisclosureVisible ||
                    (showNotificationPrompt && !isAppLocked)
                  }
                  onDismiss={() => {
                    setShowNotificationPrompt(false);
                    closeNotificationDisclosure();
                  }}
                />
                <GoogleDrivePromptModal
                  visible={
                    showDrivePrompt &&
                    !isAppLocked &&
                    !showNotificationPrompt &&
                    !isNotificationDisclosureVisible
                  }
                  onDismiss={() => setShowDrivePrompt(false)}
                />
                <SmsTransactionPromptModal
                  visible={
                    isTransactionPromptVisible &&
                    !isAppLocked &&
                    !showDrivePrompt &&
                    !showNotificationPrompt &&
                    !isNotificationDisclosureVisible
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

const styles = StyleSheet.create({
  screenShieldOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
  },
  screenShieldText: {
    marginTop: 12,
    ...typography.headlineSm,
  },
});

import { Stack } from 'expo-router';
import React, { useEffect, useState, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
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
import { ToastProvider, AlertProvider, AppLockModal } from '@/components/ui';
import { GoogleDrivePromptModal } from '@/components/modals/GoogleDrivePromptModal';
import { SmsPermissionPromptModal } from '@/components/modals/SmsPermissionPromptModal';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme/useTheme';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import { BackendProvider } from '@/providers/BackendProvider';
import { useAppStore } from '@/store/use-app-store';
import { checkUpcomingBillReminders } from '@/services/notifications/alert-engine';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const [isAppLocked, setIsAppLocked] = useState(false);
  const [showDrivePrompt, setShowDrivePrompt] = useState(false);
  const [showSmsPrompt, setShowSmsPrompt] = useState(false);
  const lastBackgroundTime = useRef<number | null>(null);

  const biometricEnabled = useAppStore((state) => state.biometricEnabled);
  const timeoutSetting = useAppStore((state) => state.timeoutSetting);
  const hasHydrated = useAppStore((state) => state._hasHydrated);
  const hasSeenDrivePrompt = useAppStore((state) => state.hasSeenDrivePrompt);
  const hasSeenSmsPrompt = useAppStore((state) => state.hasSeenSmsPrompt);
  const googleDriveConnected = useAppStore((state) => state.googleDriveConnected);
  const { expoPushToken } = usePushNotifications();
  const { theme } = useTheme();

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

          // Silent cloud backup sync on app launch
          const { syncDatabaseToDriveSilently } = await import(
            '@/services/cloud/google-drive-service'
          );
          syncDatabaseToDriveSilently('app-launch').catch(() => {});
        } catch (e) {
          console.error('Failed to process recurring transactions / bills:', e);
        }
        setDbReady(true);
      })
      .catch((err) => {
        console.error('Failed to initialize database:', err);
        setDbReady(true);
      });
  }, []);

  // Inactivity & Auto-lock listener
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        lastBackgroundTime.current = Date.now();
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
        lastBackgroundTime.current = null;

        // Process due recurring transactions and bill reminders when resuming app
        import('@/services/database/recurring-dao')
          .then(({ processDueRecurringTransactions }) => processDueRecurringTransactions())
          .catch((e) => console.error('Foreground recurring sync failed:', e));
        checkUpcomingBillReminders().catch(() => {});
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
    <>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <QueryClientProvider client={queryClient}>
        <BackendProvider>
          <ToastProvider>
            <AlertProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(app)" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              </Stack>
              <AppLockModal visible={isAppLocked} onUnlock={() => setIsAppLocked(false)} />
              <GoogleDrivePromptModal
                visible={showDrivePrompt && !isAppLocked}
                onDismiss={() => setShowDrivePrompt(false)}
              />
              <SmsPermissionPromptModal
                visible={showSmsPrompt && !isAppLocked && !showDrivePrompt}
                onDismiss={() => setShowSmsPrompt(false)}
              />
            </AlertProvider>
          </ToastProvider>
        </BackendProvider>
      </QueryClientProvider>
    </>
  );
}

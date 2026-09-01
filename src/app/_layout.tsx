import { Stack } from 'expo-router';
import React, { useEffect, useState, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
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
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme/useTheme';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/query-client';
import { useAppStore } from '@/store/use-app-store';
import { checkUpcomingBillReminders } from '@/services/notifications/alert-engine';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const [isAppLocked, setIsAppLocked] = useState(false);
  const lastBackgroundTime = useRef<number | null>(null);

  const biometricEnabled = useAppStore((state) => state.biometricEnabled);
  const timeoutSetting = useAppStore((state) => state.timeoutSetting);
  const hasHydrated = useAppStore((state) => state._hasHydrated);
  const { expoPushToken } = usePushNotifications();
  const { theme } = useTheme();

  // Cold start / App launch lock
  useEffect(() => {
    if (hasHydrated && biometricEnabled && timeoutSetting !== 'never') {
      setIsAppLocked(true);
    }
  }, [hasHydrated]);

  const [fontsLoaded, fontsError] = useFonts({
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
        <ToastProvider>
          <AlertProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(app)" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            </Stack>
            <AppLockModal visible={isAppLocked} onUnlock={() => setIsAppLocked(false)} />
          </AlertProvider>
        </ToastProvider>
      </QueryClientProvider>
    </>
  );
}

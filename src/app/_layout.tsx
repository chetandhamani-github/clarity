import { Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import * as SplashScreen from 'expo-splash-screen';
import { initDatabase } from '@/services/database';
import { ToastProvider, AlertProvider, AnimatedSplashScreen } from '@/components/ui';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '@/theme/useTheme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const [isSplashAnimationComplete, setIsSplashAnimationComplete] = useState(false);
  const { expoPushToken } = usePushNotifications();
  const { theme } = useTheme();
  
  const [fontsLoaded, fontsError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  useEffect(() => {
    initDatabase()
      .then(() => setDbReady(true))
      .catch((err) => {
        console.error('Failed to initialize database:', err);
        setDbReady(true);
      });
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
      <ToastProvider>
        <AlertProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(app)" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          </Stack>
        </AlertProvider>
      </ToastProvider>
      {!isSplashAnimationComplete && (
        <AnimatedSplashScreen onAnimationComplete={() => setIsSplashAnimationComplete(true)} />
      )}
    </>
  );
}

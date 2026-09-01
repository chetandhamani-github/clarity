import { useCallback, useRef } from 'react';
import { BackHandler, Platform, ToastAndroid } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * Hook to handle "Double press back to exit" on Android when the user is on the root screen.
 * Uses the native Android system toast.
 * 
 * @param message Optional message to display on the first back press (default: "Press back again to exit")
 * @param delayMs Maximum delay in milliseconds between two back presses (default: 2000ms)
 */
export function useDoubleBackToExit(
  message: string = 'Press back again to exit',
  delayMs: number = 2000
) {
  const lastBackPressTime = useRef<number>(0);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;

      const onBackPress = () => {
        const now = Date.now();
        if (now - lastBackPressTime.current < delayMs) {
          BackHandler.exitApp();
          return true;
        }

        lastBackPressTime.current = now;
        ToastAndroid.show(message, ToastAndroid.SHORT);
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => {
        subscription.remove();
        lastBackPressTime.current = 0;
      };
    }, [message, delayMs])
  );
}

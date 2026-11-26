import { useContext } from 'react';
import { Platform, StatusBar as RNStatusBar } from 'react-native';
import { SafeAreaInsetsContext, EdgeInsets } from 'react-native-safe-area-context';

const ZERO_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export function calculateSafeInsets(
  insets: EdgeInsets,
  platform: typeof Platform.OS,
  statusBarHeight?: number
): EdgeInsets {
  const top =
    insets.top > 0
      ? platform === 'android'
        ? Math.max(insets.top, statusBarHeight ?? 24)
        : insets.top
      : platform === 'android'
        ? (statusBarHeight ?? 28)
        : platform === 'ios'
          ? 20
          : 0;

  const bottom =
    insets.bottom > 0
      ? platform === 'android'
        ? Math.max(insets.bottom, 28)
        : insets.bottom
      : platform === 'android'
        ? 28
        : platform === 'ios'
          ? 20
          : 0;

  return {
    ...insets,
    top,
    bottom,
  };
}

export function useSafeInsets(): EdgeInsets {
  const insets = useContext(SafeAreaInsetsContext) ?? ZERO_INSETS;
  return calculateSafeInsets(insets, Platform.OS, RNStatusBar.currentHeight);
}

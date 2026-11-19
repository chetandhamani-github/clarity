import { Platform, StatusBar as RNStatusBar } from 'react-native';
import { useSafeAreaInsets, EdgeInsets } from 'react-native-safe-area-context';

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
  const insets = useSafeAreaInsets();
  return calculateSafeInsets(insets, Platform.OS, RNStatusBar.currentHeight);
}

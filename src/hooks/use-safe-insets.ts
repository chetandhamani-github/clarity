import { Platform, StatusBar as RNStatusBar } from 'react-native';
import { useSafeAreaInsets, EdgeInsets } from 'react-native-safe-area-context';

export function calculateSafeInsets(
  insets: EdgeInsets,
  platform: typeof Platform.OS,
  statusBarHeight?: number
): EdgeInsets {
  const top =
    insets.top > 0
      ? insets.top
      : platform === 'android'
        ? (statusBarHeight ?? 24)
        : 0;

  const bottom =
    insets.bottom > 0
      ? insets.bottom
      : platform === 'android'
        ? 16
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

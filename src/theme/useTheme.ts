import { useColorScheme } from 'react-native';
import { useAppStore } from '@/store/use-app-store';
import { lightTheme, darkTheme } from './colors';

export type ThemeColors = typeof lightTheme;

export function useTheme() {
  const systemTheme = useColorScheme();
  const themePreference = useAppStore((state) => state.theme);

  const isDark =
    themePreference === 'dark' || (themePreference === 'system' && systemTheme === 'dark');

  return {
    theme: isDark ? 'dark' : 'light',
    colors: isDark ? darkTheme : lightTheme,
  };
}

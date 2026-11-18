import { Platform } from 'react-native';

const androidFontFix = Platform.OS === 'android' ? { includeFontPadding: false as const } : {};

export const typography = {
  displayLg: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 32,
    lineHeight: 42,
    letterSpacing: -0.64, // -0.02em of 32
    ...(Platform.OS === 'ios' ? { fontWeight: '700' as const } : {}),
    ...androidFontFix,
  },
  dataLg: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 28,
    lineHeight: 36,
    letterSpacing: -0.5,
    ...(Platform.OS === 'ios' ? { fontWeight: '500' as const } : {}),
    ...androidFontFix,
  },
  headlineMd: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.24, // -0.01em of 24
    ...(Platform.OS === 'ios' ? { fontWeight: '600' as const } : {}),
    ...androidFontFix,
  },
  headlineSm: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 20,
    lineHeight: 28,
    ...(Platform.OS === 'ios' ? { fontWeight: '600' as const } : {}),
    ...androidFontFix,
  },
  bodyLg: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 16,
    lineHeight: 24,
    ...(Platform.OS === 'ios' ? { fontWeight: '400' as const } : {}),
    ...androidFontFix,
  },
  bodyMd: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    lineHeight: 20,
    ...(Platform.OS === 'ios' ? { fontWeight: '400' as const } : {}),
    ...androidFontFix,
  },
  bodySm: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 16,
    ...(Platform.OS === 'ios' ? { fontWeight: '400' as const } : {}),
    ...androidFontFix,
  },
  labelMd: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 0.5,
    ...(Platform.OS === 'ios' ? { fontWeight: '600' as const } : {}),
    ...androidFontFix,
  },
  labelSm: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.5,
    ...(Platform.OS === 'ios' ? { fontWeight: '600' as const } : {}),
    ...androidFontFix,
  },
};

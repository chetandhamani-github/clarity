import React from 'react';
import { Text as RNText, TextProps, StyleSheet, TextStyle, Platform } from 'react-native';
import { typography, TypographyVariant, fontFamilies } from '../../theme';
import { useTheme } from '@/theme';

interface Props extends TextProps {
  variant?: TypographyVariant;
  color?: string;
}

export const Text = ({ variant = 'bodyMd', color, style, minimumFontScale, ...props }: Props) => {
  const { colors } = useTheme();
  const textColor = color || colors.onSurface;

  const flatStyle = StyleSheet.flatten(style) as TextStyle | undefined;
  const currentLineHeight = typography[variant]?.lineHeight ?? 20;
  const dynamicLineHeight =
    flatStyle?.fontSize && !flatStyle?.lineHeight && flatStyle.fontSize >= currentLineHeight
      ? { lineHeight: Math.round(flatStyle.fontSize * 1.35) }
      : undefined;

  // Resolve font weight into the correct Manrope font family variant
  let resolvedFontFamily = flatStyle?.fontFamily || typography[variant]?.fontFamily || fontFamilies.regular;
  const specifiedWeight = flatStyle?.fontWeight;

  if (specifiedWeight) {
    if (
      specifiedWeight === '700' ||
      specifiedWeight === 'bold' ||
      specifiedWeight === '800' ||
      specifiedWeight === '900'
    ) {
      resolvedFontFamily = fontFamilies.bold;
    } else if (specifiedWeight === '600') {
      resolvedFontFamily = fontFamilies.semiBold;
    } else if (specifiedWeight === '500') {
      resolvedFontFamily = fontFamilies.medium;
    } else if (specifiedWeight === '400' || specifiedWeight === 'normal') {
      resolvedFontFamily = fontFamilies.regular;
    }
  }

  // On Android, specifying `fontWeight` alongside custom fonts that already represent weights
  // (e.g. Manrope_700Bold) causes ReactFontManager to fail font lookup and fall back to the
  // system slab-serif font. We explicitly normalize fontFamily and strip fontWeight on Android.
  const platformFontNormalizer: TextStyle =
    Platform.OS === 'android'
      ? {
          fontFamily: resolvedFontFamily,
          fontWeight: undefined,
          includeFontPadding: false,
        }
      : {
          fontFamily: resolvedFontFamily,
        };

  // Prevent text from shrinking down to microscopic or illegible sizes
  const safeMinFontScale = props.adjustsFontSizeToFit ? (minimumFontScale ?? 0.75) : minimumFontScale;

  return (
    <RNText
      textBreakStrategy={Platform.OS === 'android' ? 'simple' : undefined}
      minimumFontScale={safeMinFontScale}
      style={[
        Platform.OS === 'android' ? styles.androidText : undefined,
        typography[variant],
        { color: textColor },
        dynamicLineHeight,
        style,
        platformFontNormalizer,
      ]}
      {...props}
    />
  );
};

const styles = StyleSheet.create({
  androidText: {
    includeFontPadding: false,
  },
});

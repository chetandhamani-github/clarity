import React from 'react';
import { Text as RNText, TextProps, StyleSheet, TextStyle } from 'react-native';
import { typography } from '../../theme';
import { useTheme } from '@/theme';

interface Props extends TextProps {
  variant?: keyof typeof typography;
  color?: string;
}

export const Text = ({ variant = 'bodyMd', color, style, ...props }: Props) => {
  const { colors } = useTheme();
  const textColor = color || colors.onSurface;

  const flatStyle = StyleSheet.flatten(style) as TextStyle | undefined;
  const currentLineHeight = typography[variant]?.lineHeight ?? 20;
  const dynamicLineHeight =
    flatStyle?.fontSize && !flatStyle?.lineHeight && flatStyle.fontSize >= currentLineHeight
      ? { lineHeight: Math.round(flatStyle.fontSize * 1.35) }
      : undefined;

  return (
    <RNText
      style={[
        typography[variant],
        { color: textColor },
        dynamicLineHeight,
        style,
      ]}
      {...props}
    />
  );
};

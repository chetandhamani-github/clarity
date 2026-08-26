import React from 'react';
import { Text as RNText, TextProps, StyleSheet } from 'react-native';
import { typography } from '../../theme';
import { useTheme } from '@/theme';

interface Props extends TextProps {
  variant?: keyof typeof typography;
  color?: string;
}

export const Text = ({ variant = 'bodyMd', color, style, ...props }: Props) => {
  const { colors } = useTheme();
  const textColor = color || colors.onSurface;
  return <RNText style={[typography[variant], { color: textColor }, style]} {...props} />;
};

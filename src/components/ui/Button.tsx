/* eslint-disable react-native/no-unused-styles */
import React from 'react';
import { TouchableOpacity, Text as RNText, StyleSheet, TouchableOpacityProps } from 'react-native';
import { radius, spacing, typography } from '../../theme';
import { useTheme, ThemeColors } from '@/theme';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline';
}

export const Button = ({ title, variant = 'primary', style, ...props }: ButtonProps) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  return (
    <TouchableOpacity style={[styles.base, (styles as any)[variant], style]} {...props}>
      <RNText style={[styles.text, variant === 'outline' && styles.textOutline]}>{title}</RNText>
    </TouchableOpacity>
  );
};

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    base: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primary: {
      backgroundColor: colors.primary,
    },
    secondary: {
      backgroundColor: colors.surfaceVariant,
    },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.primary,
    },
    text: {
      ...typography.bodyMd,
      fontWeight: '600',
      color: colors.surfaceContainerLowest,
      textAlign: 'center',
    },
    textOutline: {
      color: colors.primary,
    },
  });
  return styles;
};

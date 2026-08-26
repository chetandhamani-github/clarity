import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';
import { radius, spacing } from '../../theme';
import { useTheme, ThemeColors } from '@/theme';

export const Card = ({ style, ...props }: ViewProps) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  return <View style={[styles.card, style]} {...props} />;
};

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.md,
      padding: spacing.md,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
  });
  return styles;
};

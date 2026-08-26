import React from 'react';
import { SafeAreaView, StyleSheet, ViewProps } from 'react-native';

import { useTheme, ThemeColors } from '@/theme';

export const Screen = ({ style, ...props }: ViewProps) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  return <SafeAreaView style={[styles.screen, style]} {...props} />;
};

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
  });
  return styles;
};

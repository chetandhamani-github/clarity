import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useTheme, ThemeColors } from '@/theme';

export interface ScreenProps extends ViewProps {
  edges?: ('top' | 'bottom')[];
}

export const Screen = ({ style, edges = ['top'], ...props }: ScreenProps) => {
  const { colors } = useTheme();
  const insets = useSafeInsets();
  const styles = getStyles(colors);

  const paddingTop = edges.includes('top') ? insets.top : 0;
  const paddingBottom = edges.includes('bottom') ? insets.bottom : 0;

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop,
          paddingBottom,
        },
        style,
      ]}
      {...props}
    />
  );
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

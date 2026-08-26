import React from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { radius } from '../../theme';
import { useTheme, ThemeColors } from '@/theme';

interface ProgressBarProps {
  progress: number; // 0 to 1
  color?: string;
  backgroundColor?: string;
  height?: number;
}

export const ProgressBar = ({ progress, color, backgroundColor, height = 8 }: ProgressBarProps) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);

  const barColor = color || colors.primary;
  const bgColor = backgroundColor || colors.surfaceContainerHigh;

  const width = Math.max(0, Math.min(1, progress)) * 100;

  return (
    <View
      style={[styles.container, { height, backgroundColor: bgColor, borderRadius: radius.full }]}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            width: `${width}%`,
            backgroundColor: barColor,
          },
        ]}
      />
    </View>
  );
};

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      width: '100%',
      overflow: 'hidden',
    },
    fill: {
      height: '100%',
      borderRadius: radius.full,
    },
  });
  return styles;
};

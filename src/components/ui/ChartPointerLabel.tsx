import React from 'react';
import { StyleSheet, View } from 'react-native';
import { radius, ThemeColors, typography, useTheme } from '@/theme';
import { Text } from './Text';

export interface ChartPointerPoint {
  dataPointText?: string;
}

interface ChartPointerLabelProps {
  items: ChartPointerPoint[];
  wide?: boolean;
}

export function ChartPointerLabel({ items, wide = false }: ChartPointerLabelProps) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const label = items?.[0]?.dataPointText;
  if (!label) return null;

  return (
    <View style={[styles.tooltipBox, wide && styles.tooltipBoxWide]}>
      <Text
        style={[styles.tooltipText, wide && styles.tooltipTextWide]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Text>
    </View>
  );
}

export function renderChartPointerLabel(items: ChartPointerPoint[]) {
  return <ChartPointerLabel items={items} />;
}

export function renderWideChartPointerLabel(items: ChartPointerPoint[]) {
  return <ChartPointerLabel items={items} wide />;
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    tooltipBox: {
      height: 32,
      width: 116,
      justifyContent: 'center',
      backgroundColor: colors.surfaceContainerHighest,
      borderRadius: radius.sm,
      paddingHorizontal: 8,
    },
    tooltipBoxWide: {
      height: 'auto',
      width: 'auto',
      paddingVertical: 4,
      alignItems: 'center',
    },
    tooltipText: {
      color: colors.onSurface,
      fontSize: 11,
      fontWeight: 'bold',
      textAlign: 'center',
    },
    tooltipTextWide: {
      ...typography.labelMd,
      fontSize: 10,
      fontFamily: 'Manrope_700Bold',
    },
  });
  return styles;
};


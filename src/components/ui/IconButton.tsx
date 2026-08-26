import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme, ThemeColors } from '@/theme';

interface IconButtonProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  color?: string;
  size?: number;
  style?: ViewStyle;
}

export const IconButton = ({ icon, onPress, color, size = 24, style }: IconButtonProps) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const iconColor = color || colors.onSurface;
  return (
    <TouchableOpacity
      style={[styles.container, style]}
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <MaterialIcons name={icon} size={size} color={iconColor} />
    </TouchableOpacity>
  );
};

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
  return styles;
};

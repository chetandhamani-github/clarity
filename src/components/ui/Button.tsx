import { ThemeColors, useTheme } from '@/theme';
import { StyleSheet, TouchableOpacity, TouchableOpacityProps } from 'react-native';
import { radius, spacing, typography } from '../../theme';
import { Text } from './Text';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline';
}

export const Button = ({ title, variant = 'primary', style, ...props }: ButtonProps) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  return (
    <TouchableOpacity
      style={[
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'outline' && styles.outline,
        style,
      ]}
      activeOpacity={0.8}
      {...props}
    >
      <Text
        style={[
          styles.text,
          variant === 'primary' && styles.textPrimary,
          variant === 'secondary' && styles.textSecondary,
          variant === 'outline' && styles.textOutline,
        ]}
      >
        {title}
      </Text>
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
      backgroundColor: colors.secondaryContainer,
    },
    outline: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.outline,
    },
    text: {
      ...typography.bodyMd,
      fontFamily: 'Manrope_600SemiBold',
      textAlign: 'center',
    },
    textPrimary: {
      color: colors.onPrimary,
    },
    textSecondary: {
      color: colors.onSecondaryContainer,
    },
    textOutline: {
      color: colors.primary,
    },
  });
  return styles;
};

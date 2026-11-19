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
    <TouchableOpacity style={[styles.base, (styles as any)[variant], style]} {...props}>
      <Text style={[styles.text, variant === 'outline' && styles.textOutline]}>{title}</Text>
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
    text: {
      ...typography.bodyMd,
      fontFamily: 'Manrope_600SemiBold',
      color: colors.surfaceContainerLowest,
      textAlign: 'center',
    },
    textOutline: {
      color: colors.primary,
    },
  });
  return styles;
};

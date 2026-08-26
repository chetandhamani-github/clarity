import React from 'react';
import { TextInput, TextInputProps, StyleSheet, View } from 'react-native';
import { radius, spacing, typography } from '../../theme';
import { Text } from './Text';
import { useTheme, ThemeColors } from '@/theme';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
}

export const Input = ({ label, error, style, ...props }: Props) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  return (
    <View style={styles.container}>
      {label && (
        <Text variant="labelMd" style={styles.label}>
          {label}
        </Text>
      )}
      <TextInput
        style={[styles.input, error ? styles.inputError : null, style]}
        placeholderTextColor={colors.onSurfaceVariant}
        {...props}
      />
      {error && (
        <Text variant="labelMd" color={colors.error} style={styles.errorText}>
          {error}
        </Text>
      )}
    </View>
  );
};

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      marginBottom: spacing.md,
    },
    label: {
      marginBottom: spacing.xs,
      fontWeight: '500',
    },
    input: {
      borderWidth: 1,
      borderColor: colors.outline,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      ...typography.bodyMd,
      color: colors.onSurface,
      backgroundColor: colors.surfaceContainerLowest,
    },
    inputError: {
      borderColor: colors.error,
    },
    errorText: {
      marginTop: spacing.xs,
    },
  });
  return styles;
};

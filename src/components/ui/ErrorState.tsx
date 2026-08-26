import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { Button } from './Button';
import { spacing } from '../../theme';
import { useTheme, ThemeColors } from '@/theme';

interface Props {
  message?: string;
  onRetry?: () => void;
}

export const ErrorState = ({ message = 'Something went wrong', onRetry }: Props) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  return (
    <View style={styles.container}>
      <Text variant="headlineSm" color={colors.error} style={styles.message}>
        {message}
      </Text>
      {onRetry && <Button title="Try Again" onPress={onRetry} variant="outline" />}
    </View>
  );
};

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xl,
    },
    message: {
      marginBottom: spacing.lg,
      textAlign: 'center',
    },
  });
  return styles;
};

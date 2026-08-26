import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from './Text';
import { spacing } from '../../theme';
import { useTheme } from '@/theme';

interface Props {
  title: string;
  description?: string;
}

export const EmptyState = ({ title, description }: Props) => {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      <Text variant="headlineSm" style={styles.title}>
        {title}
      </Text>
      {description && (
        <Text variant="bodyMd" color={colors.onSurfaceVariant} style={styles.description}>
          {description}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  title: {
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
  },
});

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/ui';
import { typography, useTheme } from '@/theme';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

export default function SplashLandingScreen() {
  const { colors } = useTheme();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/(app)/(tabs)/dashboard' as never);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.primary }]}>
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: colors.onPrimary + '1A' }]}>
          <MaterialIcons name="account-balance-wallet" size={48} color={colors.onPrimary} />
        </View>
        <Text style={[styles.title, { color: colors.onPrimary }]}>Clarity</Text>
        <Text style={[styles.subtitle, { color: colors.onPrimary + 'B3' }]}>
          Your finances, simplified.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 16,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    ...typography.displayLg,
    fontWeight: '700',
  },
  subtitle: {
    ...typography.bodyLg,
  },
});

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/useTheme';

interface MaintenanceScreenProps {
  onRetry?: () => void;
}

export function MaintenanceScreen({ onRetry }: MaintenanceScreenProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: colors.surfaceContainerHigh },
        ]}
      >
        <MaterialIcons name="build" size={44} color={colors.primary} />
      </View>

      <Text style={[styles.title, { color: colors.onBackground }]}>
        Under Maintenance
      </Text>

      <Text style={[styles.message, { color: colors.secondary }]}>
        Clarity systems are currently undergoing planned maintenance to serve you better.
        Please check back shortly. Your personal data remains safe and stored on your device.
      </Text>

      {onRetry && (
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={onRetry}
          activeOpacity={0.8}
        >
          <Text style={[styles.retryText, { color: colors.onPrimary }]}>
            Check Again
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 22,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
  },
  retryButton: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
  },
  retryText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 15,
  },
});

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/useTheme';

export function FullScreenBlockedScreen() {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: colors.errorContainer },
        ]}
      >
        <MaterialIcons name="block" size={48} color={colors.onErrorContainer} />
      </View>

      <Text style={[styles.title, { color: colors.onBackground }]}>
        Access Restricted
      </Text>

      <Text style={[styles.message, { color: colors.secondary }]}>
        This device installation has been restricted from connecting to Clarity services.
        If you believe this is an error, please contact customer support.
      </Text>
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
  },
});

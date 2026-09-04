import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/theme/useTheme';
import { getCurrentAppVersion } from '@/services/api/device.api';

interface ForceUpdateScreenProps {
  minimumVersion: string;
}

export function ForceUpdateScreen({ minimumVersion }: ForceUpdateScreenProps) {
  const { colors } = useTheme();
  const currentVersion = getCurrentAppVersion();

  const handleUpdate = () => {
    // Open app store or play store
    if (Platform.OS === 'android') {
      Linking.openURL('market://details?id=com.clarity.finance').catch(() => {
        Linking.openURL('https://play.google.com/store/apps/details?id=com.clarity.finance');
      });
    } else {
      Linking.openURL('https://apps.apple.com');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: colors.primaryContainer },
        ]}
      >
        <MaterialIcons name="system-update" size={44} color={colors.onPrimaryContainer} />
      </View>

      <Text style={[styles.title, { color: colors.onBackground }]}>
        Update Required
      </Text>

      <Text style={[styles.message, { color: colors.secondary }]}>
        A critical update is required to keep Clarity running smoothly and securely.
        Please update to the latest version to continue.
      </Text>

      <View style={[styles.versionBox, { backgroundColor: colors.surfaceContainer }]}>
        <Text style={[styles.versionText, { color: colors.secondary }]}>
          Installed: {currentVersion} • Required: {minimumVersion}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.updateButton, { backgroundColor: colors.primary }]}
        onPress={handleUpdate}
        activeOpacity={0.8}
      >
        <Text style={[styles.updateText, { color: colors.onPrimary }]}>
          Update Now
        </Text>
      </TouchableOpacity>
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
    marginBottom: 20,
  },
  versionBox: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 32,
  },
  versionText: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
  },
  updateButton: {
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 14,
  },
  updateText: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 15,
  },
});

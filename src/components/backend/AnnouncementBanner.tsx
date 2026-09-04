import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAnnouncements } from '@/hooks/useAnnouncements';
import { useTheme } from '@/theme/useTheme';

export function AnnouncementBanner() {
  const { announcements, dismiss, hasAnnouncements } = useAnnouncements();
  const { colors } = useTheme();

  if (!hasAnnouncements || announcements.length === 0) {
    return null;
  }

  // Display top announcement
  const current = announcements[0];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surfaceContainerHigh,
          borderColor: colors.outlineVariant,
        },
      ]}
    >
      <View style={styles.contentRow}>
        <View style={[styles.iconWrapper, { backgroundColor: colors.primaryContainer }]}>
          <MaterialIcons name="campaign" size={20} color={colors.onPrimaryContainer} />
        </View>

        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: colors.onSurface }]} numberOfLines={1}>
            {current.title}
          </Text>
          <Text style={[styles.message, { color: colors.secondary }]} numberOfLines={3}>
            {current.message}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => dismiss(current.id)}
          hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
        >
          <MaterialIcons name="close" size={18} color={colors.secondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    marginBottom: 2,
  },
  message: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    lineHeight: 17,
  },
  closeButton: {
    padding: 4,
    marginTop: 2,
  },
});

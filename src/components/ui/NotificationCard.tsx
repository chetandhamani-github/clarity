import React from 'react';
import { View, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { Text } from './Text';
import { radius, spacing, typography } from '../../theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme, ThemeColors } from '@/theme';

interface Props {
  title: string;
  time: string;
  description: string;
  isRead?: boolean;
  type?: 'alert' | 'milestone' | 'default';
  children?: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}

export const NotificationCard = ({
  title,
  time,
  description,
  isRead = false,
  type = 'default',
  children,
  onPress,
  style,
}: Props) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  // Determine icon, , and indicator bar based on type
  let iconName: keyof typeof MaterialIcons.glyphMap = 'notifications';
  let iconColor = colors.onSurfaceVariant;
  let iconBg = colors.surfaceContainerHighest;
  let indicatorColor = 'transparent';

  if (type === 'alert') {
    iconName = 'account-balance-wallet'; // closest match to design
    if (!isRead) {
      iconColor = colors.onErrorContainer;
      iconBg = colors.errorContainer;
      indicatorColor = colors.error;
    }
  } else if (type === 'milestone') {
    iconName = 'flag';
    if (!isRead) {
      iconColor = colors.onPrimaryContainer;
      iconBg = colors.primaryContainer;
      indicatorColor = colors.primary; // using exact gold-bg from design
    }
  }

  // Handle specific "read" icons as per design
  if (isRead) {
    if (type === 'alert') iconName = 'security';
    if (type === 'milestone') iconName = 'emoji-events';
  }

  return (
    <TouchableOpacity
      style={[styles.container, isRead ? styles.containerRead : styles.containerUnread, style]}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      {!isRead && <View style={[styles.indicator, { backgroundColor: indicatorColor }]} />}

      <View style={[styles.iconContainer, { backgroundColor: iconBg }]}>
        <MaterialIcons name={iconName} size={20} color={iconColor} />
      </View>

      <View style={styles.content}>
        <View style={styles.header}>
          <Text
            variant="headlineSm"
            style={[styles.title, isRead && styles.textMuted]}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text variant="bodyMd" style={styles.time}>
            {time}
          </Text>
        </View>

        <Text variant="bodyMd" style={styles.description} numberOfLines={2}>
          {description}
        </Text>

        {children && <View style={styles.childrenContainer}>{children}</View>}
      </View>
    </TouchableOpacity>
  );
};

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flexDirection: 'row',
      padding: spacing.md,
      borderRadius: radius.md,
      marginBottom: spacing.sm,
      position: 'relative',
      overflow: 'hidden',
    },
    containerUnread: {
      backgroundColor: colors.surfaceContainerLowest,
      shadowColor: colors.onSurface,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.04,
      shadowRadius: 24,
      elevation: 2,
    },
    containerRead: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.outlineVariant, // border color from design
      opacity: 0.8,
    },
    indicator: {
      position: 'absolute',
      left: 0,
      top: '50%',
      width: 4,
      height: 32,
      marginTop: -16,
      borderTopRightRadius: radius.full,
      borderBottomRightRadius: radius.full,
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
    },
    content: {
      flex: 1,
      minWidth: 0,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 4,
      gap: 8,
    },
    title: {
      ...typography.bodyLg,
      color: colors.onSurface, // charcoal-text
      flex: 1,
    },
    textMuted: {
      opacity: 0.8,
    },
    time: {
      fontSize: 12,
      color: colors.onSurfaceVariant,
      flexShrink: 0,
    },
    description: {
      color: colors.onSurfaceVariant,
    },
    childrenContainer: {
      marginTop: spacing.sm,
    },
  });
  return styles;
};

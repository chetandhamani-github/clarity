import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Pressable, ActivityIndicator } from 'react-native';
import { Text, Header } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useNotifications, useMarkNotificationAsRead, useMarkAllNotificationsAsRead } from '@/hooks/use-notifications';
import { formatTime } from '@/utils/format';

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { notifications, isLoading, refetch } = useNotifications();
  const { mutate: markAsRead } = useMarkNotificationAsRead();
  const { mutate: markAllAsRead, isPending: markingAll } = useMarkAllNotificationsAsRead();

  const handleMarkAllRead = () => {
    markAllAsRead({ onSuccess: refetch });
  };

  const handlePressNotification = (id: string, isRead: boolean, url?: string) => {
    if (!isRead) {
      markAsRead(id, { onSuccess: refetch });
    }
    if (url) {
      router.push(url as any);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const alerts = notifications.filter(n => n.type === 'alert');
  const milestones = notifications.filter(n => n.type === 'milestone');
  const other = notifications.filter(n => n.type !== 'alert' && n.type !== 'milestone');

  const renderNotification = (n: any) => {
    let iconName = 'notifications';
    if (n.type === 'alert') iconName = 'warning';
    if (n.type === 'milestone') iconName = 'emoji-events';

    return (
      <Pressable 
        key={n.id} 
        style={[styles.notificationCard, n.isRead && styles.notificationCardRead]}
        onPress={() => handlePressNotification(n.id, n.isRead, n.actionUrl)}
      >
        {!n.isRead && (
          <View style={[styles.unreadIndicator, { backgroundColor: n.type === 'alert' ? colors.error : colors.primary }]} />
        )}
        <View style={[
          styles.iconBox, 
          { backgroundColor: n.isRead ? colors.surfaceContainerHighest : (n.type === 'alert' ? colors.errorContainer : colors.primaryContainer) }
        ]}>
          <MaterialIcons 
            name={iconName as any} 
            size={20} 
            color={n.isRead ? colors.onSurfaceVariant : (n.type === 'alert' ? colors.onErrorContainer : colors.onPrimaryContainer)} 
          />
        </View>
        <View style={styles.cardContent}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {n.title}
            </Text>
            <Text style={styles.cardTime}>{formatTime(n.createdAt)}</Text>
          </View>
          <Text style={styles.cardBody} numberOfLines={2}>
            {n.description}
          </Text>
          {!!n.actionUrl && (
            <View style={styles.inlineActionBtn}>
              <Text style={styles.inlineActionText}>VIEW DETAILS</Text>
              <MaterialIcons name="arrow-forward" size={14} color={colors.primary} />
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header
        showBack
        title="Notifications"
        rightNode={
          <TouchableOpacity style={styles.iconButton}>
            <MaterialIcons name="more-vert" size={24} color={colors.primary} />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 60 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.topActions}>
          <TouchableOpacity style={styles.markReadBtn} onPress={handleMarkAllRead} disabled={markingAll}>
            <Text style={styles.markReadBtnText}>{markingAll ? 'MARKING...' : 'MARK ALL AS READ'}</Text>
          </TouchableOpacity>
        </View>

        {notifications.length === 0 && (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <MaterialIcons name="notifications-none" size={64} color={colors.surfaceVariant} />
            <Text style={{ ...typography.headlineSm, color: colors.onSurface, marginTop: 16 }}>All Caught Up!</Text>
            <Text style={{ ...typography.bodyMd, color: colors.onSurfaceVariant, textAlign: 'center', marginTop: 8 }}>
              You don't have any new notifications at this time.
            </Text>
          </View>
        )}

        {/* Alerts Section */}
        {alerts.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="warning" size={16} color={colors.error} />
              <Text style={styles.sectionTitle}>ALERTS</Text>
            </View>
            <View style={styles.listContainer}>
              {alerts.map(renderNotification)}
            </View>
          </View>
        )}

        {/* Milestones Section */}
        {milestones.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="star" size={16} color={colors.primary} />
              <Text style={styles.sectionTitle}>MILESTONES</Text>
            </View>
            <View style={styles.listContainer}>
              {milestones.map(renderNotification)}
            </View>
          </View>
        )}

        {/* Other Section */}
        {other.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="info" size={16} color={colors.onSurfaceVariant} />
              <Text style={styles.sectionTitle}>OTHER</Text>
            </View>
            <View style={styles.listContainer}>
              {other.map(renderNotification)}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surfaceContainerLow,
    },

    iconButton: {
      padding: 8,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    topActions: {
      alignItems: 'flex-end',
      marginBottom: 16,
    },
    markReadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    markReadBtnText: {
      ...typography.labelMd,
      color: colors.primary,
      letterSpacing: 1,
    },
    section: {
      marginBottom: 32,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    sectionTitle: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      letterSpacing: 1,
    },
    listContainer: {
      gap: 8,
    },
    notificationCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: 16,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 16,
      overflow: 'hidden',
      position: 'relative',
    },
    notificationCardRead: {
      opacity: 0.8,
    },
    unreadIndicator: {
      position: 'absolute',
      left: 0,
      top: '50%',
      width: 4,
      height: 32,
      borderTopRightRadius: 4,
      borderBottomRightRadius: 4,
      transform: [{ translateY: -4 }], 
    },
    iconBox: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    cardContent: {
      flex: 1,
      minWidth: 0, 
    },
    cardHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: 8,
      marginBottom: 4,
    },
    cardTitle: {
      ...typography.bodyLg,
      fontWeight: '600', 
      color: colors.onSurface,
      flex: 1,
    },
    cardTime: {
      ...typography.bodyMd,
      fontSize: 12,
      color: colors.onSurfaceVariant,
      flexShrink: 0,
    },
    cardBody: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
    },
    inlineActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 8,
    },
    inlineActionText: {
      ...typography.labelMd,
      color: colors.primary,
    },
  });
  return styles;
};

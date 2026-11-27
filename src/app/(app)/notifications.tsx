import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { Text, Header, ListSkeleton, useToast, useAlert } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useRouter } from 'expo-router';
import {
  useNotifications,
  useMarkNotificationAsRead,
  useMarkAllNotificationsAsRead,
  useClearAllNotifications,
  useDeleteNotification,
} from '@/hooks/use-notifications';
import { formatNotificationTime } from '@/utils/format';
import type { Notification, NotificationType } from '@/types';

type FilterTab = 'all' | 'unread' | 'alert' | 'bill' | 'budget';

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeInsets();
  const router = useRouter();
  const { showToast } = useToast();
  const { showAlert } = useAlert();

  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const { notifications, setNotifications, isLoading, refetch } = useNotifications();
  const { mutate: markAsRead } = useMarkNotificationAsRead();
  const { mutate: markAllAsRead, isPending: markingAll } = useMarkAllNotificationsAsRead();
  const { mutate: clearAll, isPending: clearingAll } = useClearAllNotifications();
  const { mutate: deleteNotification } = useDeleteNotification();

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const alertCount = notifications.filter((n) => n.type === 'alert').length;
  const billCount = notifications.filter((n) => n.type === 'bill').length;
  const budgetCount = notifications.filter((n) => n.type === 'budget').length;

  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || markingAll) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await markAllAsRead();
      showToast('All notifications marked as read', 'success');
    } catch {
      refetch();
    }
  };

  const handleClearAll = () => {
    if (notifications.length === 0 || clearingAll) return;
    showAlert(
      'Clear All Notifications',
      'Are you sure you want to remove all notifications? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            setNotifications([]);
            try {
              await clearAll();
              showToast('All notifications cleared', 'success');
            } catch {
              refetch();
            }
          },
        },
      ]
    );
  };

  const handleDeleteOne = (id: string, e: any) => {
    e.stopPropagation?.();
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    deleteNotification(id, {
      onError: () => refetch(),
    });
  };

  const handlePressNotification = (id: string, isRead: boolean, url?: string) => {
    if (!isRead) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      markAsRead(id);
    }
    if (url) {
      router.navigate(url as any);
    }
  };

  const filteredNotifications = useMemo(() => {
    switch (activeTab) {
      case 'unread':
        return notifications.filter((n) => !n.isRead);
      case 'alert':
        return notifications.filter((n) => n.type === 'alert');
      case 'bill':
        return notifications.filter((n) => n.type === 'bill');
      case 'budget':
        return notifications.filter((n) => n.type === 'budget');
      default:
        return notifications;
    }
  }, [notifications, activeTab]);

  const getNotificationVisuals = (type: NotificationType, isRead: boolean) => {
    switch (type) {
      case 'alert':
        return {
          iconName: 'warning' as const,
          iconColor: isRead ? colors.onSurfaceVariant : colors.onErrorContainer,
          iconBg: isRead ? colors.surfaceContainerHighest : colors.errorContainer,
          indicatorColor: colors.error,
        };
      case 'bill':
        return {
          iconName: 'receipt-long' as const,
          iconColor: isRead ? colors.onSurfaceVariant : colors.onPrimaryContainer,
          iconBg: isRead ? colors.surfaceContainerHighest : colors.primaryContainer,
          indicatorColor: colors.primary,
        };
      case 'budget':
        return {
          iconName: 'pie-chart' as const,
          iconColor: isRead ? colors.onSurfaceVariant : colors.onSecondaryContainer,
          iconBg: isRead ? colors.surfaceContainerHighest : colors.secondaryContainer,
          indicatorColor: colors.secondary,
        };
      case 'milestone':
        return {
          iconName: 'emoji-events' as const,
          iconColor: isRead ? colors.onSurfaceVariant : colors.onPrimaryContainer,
          iconBg: isRead ? colors.surfaceContainerHighest : colors.primaryContainer,
          indicatorColor: colors.primary,
        };
      case 'account':
        return {
          iconName: 'account-balance' as const,
          iconColor: isRead ? colors.onSurfaceVariant : colors.onTertiaryContainer,
          iconBg: isRead ? colors.surfaceContainerHighest : colors.tertiaryContainer,
          indicatorColor: colors.tertiary,
        };
      case 'system':
        return {
          iconName: 'info-outline' as const,
          iconColor: isRead ? colors.onSurfaceVariant : colors.onSurface,
          iconBg: colors.surfaceContainerHighest,
          indicatorColor: colors.outline,
        };
      default:
        return {
          iconName: 'notifications' as const,
          iconColor: isRead ? colors.onSurfaceVariant : colors.onPrimaryContainer,
          iconBg: isRead ? colors.surfaceContainerHighest : colors.primaryContainer,
          indicatorColor: colors.primary,
        };
    }
  };

  const renderNotificationCard = (n: Notification) => {
    const visuals = getNotificationVisuals(n.type, n.isRead);

    return (
      <Pressable
        key={n.id}
        style={[styles.notificationCard, n.isRead && styles.notificationCardRead]}
        onPress={() => handlePressNotification(n.id, n.isRead, n.actionUrl)}
      >
        {!n.isRead && (
          <View
            style={[
              styles.unreadIndicator,
              { backgroundColor: visuals.indicatorColor },
            ]}
          />
        )}
        <View style={[styles.iconBox, { backgroundColor: visuals.iconBg }]}>
          <MaterialIcons name={visuals.iconName} size={20} color={visuals.iconColor} />
        </View>
        <View style={styles.cardContent}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {n.title}
            </Text>
            <View style={styles.cardHeaderActions}>
              <Text style={styles.cardTime}>{formatNotificationTime(n.createdAt)}</Text>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={(e) => handleDeleteOne(n.id, e)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={16} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>
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

  const tabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: notifications.length },
    { key: 'unread', label: 'Unread', count: unreadCount },
    { key: 'alert', label: 'Alerts', count: alertCount },
    { key: 'bill', label: 'Bills', count: billCount },
    { key: 'budget', label: 'Budgets', count: budgetCount },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Header
        showBack
        title="Notifications"
        rightNode={
          <View style={styles.headerRightActions}>
            <TouchableOpacity
              style={styles.headerIconBtn}
              onPress={() => router.navigate('/(app)/reminders')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="alarm" size={20} color={colors.primary} />
            </TouchableOpacity>
            {notifications.length > 0 && unreadCount > 0 && (
              <TouchableOpacity
                style={styles.headerIconBtn}
                onPress={handleMarkAllRead}
                disabled={markingAll}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="done-all" size={20} color={colors.primary} />
              </TouchableOpacity>
            )}
            {notifications.length > 0 && (
              <TouchableOpacity
                style={styles.headerIconBtn}
                onPress={handleClearAll}
                disabled={clearingAll}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="delete-outline" size={20} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            )}
          </View>
        }
      />

      {/* Filter Tabs */}
      <View style={styles.tabBarContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContent}
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.tabPill,
                  isActive && styles.tabPillActive,
                ]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tabPillText,
                    isActive && styles.tabPillTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
                {tab.count !== undefined && tab.count > 0 && (
                  <View
                    style={[
                      styles.tabCountBadge,
                      isActive && styles.tabCountBadgeActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabCountText,
                        isActive && styles.tabCountTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {tab.count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <ListSkeleton />
        ) : (
          <>
            {filteredNotifications.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialIcons
                  name="notifications-none"
                  size={64}
                  color={colors.onSurfaceVariant}
                />
                <Text style={styles.emptyTitle}>
                  {activeTab === 'all'
                    ? 'All Caught Up!'
                    : `No ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Notifications`}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {activeTab === 'all'
                    ? "You don't have any notifications at this time."
                    : `There are no ${activeTab} notifications to display right now.`}
                </Text>
              </View>
            ) : (
              <View style={styles.listContainer}>
                {filteredNotifications.map(renderNotificationCard)}
              </View>
            )}
          </>
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
    scrollView: {
      flex: 1,
    },
    headerRightActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    headerIconBtn: {
      padding: 6,
    },
    headerPlaceholder: {
      width: 44,
    },
    tabBarContainer: {
      backgroundColor: colors.surfaceContainerLow,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineVariant,
      paddingVertical: 10,
    },
    tabBarContent: {
      paddingHorizontal: 20,
      gap: 8,
    },
    tabPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: colors.surfaceContainerHighest,
    },
    tabPillActive: {
      backgroundColor: colors.primary,
    },
    tabPillText: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      fontFamily: 'Manrope_600SemiBold',
    },
    tabPillTextActive: {
      color: colors.onPrimary,
      fontFamily: 'Manrope_700Bold',
    },
    tabCountBadge: {
      backgroundColor: colors.surfaceContainerLowest,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 10,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabCountBadgeActive: {
      backgroundColor: colors.primaryContainer,
    },
    tabCountText: {
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
      lineHeight: 14,
      textAlignVertical: 'center',
      color: colors.onSurfaceVariant,
    },
    tabCountTextActive: {
      color: colors.onPrimaryContainer,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    emptyContainer: {
      padding: 40,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 40,
    },
    emptyTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
      marginTop: 16,
    },
    emptySubtitle: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
      marginTop: 8,
      maxWidth: 280,
    },
    listContainer: {
      gap: 12,
    },
    notificationCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: 16,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
      overflow: 'hidden',
      position: 'relative',
    },
    notificationCardRead: {
      opacity: 0.75,
    },
    unreadIndicator: {
      position: 'absolute',
      left: 0,
      top: '50%',
      width: 4,
      height: 32,
      borderTopRightRadius: 4,
      borderBottomRightRadius: 4,
      transform: [{ translateY: -16 }],
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
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    cardTitle: {
      ...typography.bodyLg,
      fontWeight: '600',
      color: colors.onSurface,
      flex: 1,
    },
    cardHeaderActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    cardTime: {
      ...typography.bodyMd,
      fontSize: 12,
      lineHeight: 16,
      color: colors.onSurfaceVariant,
      flexShrink: 0,
    },
    deleteBtn: {
      padding: 2,
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
      fontWeight: '700',
    },
  });
  return styles;
};

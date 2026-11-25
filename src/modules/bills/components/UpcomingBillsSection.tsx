import React, { useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text, SkeletonBox, SkeletonCircle, SkeletonText, useToast, useAlert } from '@/components/ui';
import { useTheme, typography, fontFamilies } from '@/theme';
import { useAppStore } from '@/store/use-app-store';
import { formatCurrencyPrivacy, formatDate } from '@/utils/format';
import { getLocalTodayYmd, shiftYmdDays } from '@/utils/date';
import { getBillerBranding } from '@/utils/icons';
import { BillStatusBadge } from './BillStatusBadge';
import { useBills } from '../hooks/useBills';
import { BillAlertEngine } from '@/services/notifications/bill-alert-engine';
import type { Bill } from '../types/bill.types';

interface UpcomingBillsSectionProps {
  daysAhead?: number;
}

export function UpcomingBillsSection({ daysAhead = 30 }: UpcomingBillsSectionProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const { hideBalances } = useAppStore();
  const { upcomingBills: allUpcomingBills, isLoading, markBillPaid } = useBills();
  const { showToast } = useToast();
  const { showAlert } = useAlert();

  const upcomingBills = useMemo(() => {
    const maxDueDate = shiftYmdDays(getLocalTodayYmd(), daysAhead);
    return allUpcomingBills.filter(
      (bill) => bill.status === 'overdue' || bill.dueDate <= maxDueDate
    );
  }, [allUpcomingBills, daysAhead]);

  const handleMarkPaid = async (bill: Bill) => {
    try {
      await markBillPaid(bill.id);
      showToast(`${bill.title} marked as paid`, 'success');
    } catch {
      showToast('Failed to mark bill as paid', 'error');
    }
  };

  const handleSnooze = (bill: Bill) => {
    showAlert('Snooze Bill Reminder', `Snooze notifications for ${bill.title}?`, [
      {
        text: 'Snooze 3 Hours',
        onPress: async () => {
          const snoozedUntil = await BillAlertEngine.snoozeNativeBillReminder(
            {
              id: bill.id,
              billerName: bill.provider || bill.title,
              amountDue: bill.amount,
              dueDate: bill.dueDate,
            },
            3
          );
          if (snoozedUntil) {
            showToast('Reminder snoozed for 3 hours', 'info');
          } else {
            showToast('Could not snooze reminder', 'error');
          }
        },
      },
      {
        text: 'Snooze 1 Day',
        onPress: async () => {
          const snoozedUntil = await BillAlertEngine.snoozeNativeBillReminder(
            {
              id: bill.id,
              billerName: bill.provider || bill.title,
              amountDue: bill.amount,
              dueDate: bill.dueDate,
            },
            24
          );
          if (snoozedUntil) {
            showToast('Reminder snoozed for 1 day', 'info');
          } else {
            showToast('Could not snooze reminder', 'error');
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handlePay = async (bill: Bill) => {
    if (bill.paymentUrl) {
      try {
        await Linking.openURL(bill.paymentUrl);
      } catch {
        showToast('Could not open payment URL', 'error');
      }
    }
  };

  if (isLoading && upcomingBills.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.onSurface }]}>Bills & Utilities</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {[1, 2].map((i) => (
            <View
              key={i}
              style={[
                styles.billCard,
                {
                  backgroundColor: colors.surfaceContainerLowest,
                  borderColor: colors.surfaceVariant,
                },
              ]}
            >
              <View style={styles.cardTopRow}>
                <SkeletonCircle size={34} />
                <SkeletonBox width={64} height={20} borderRadius={6} />
              </View>

              <View style={{ marginTop: 10, gap: 6 }}>
                <SkeletonText width={100} height={14} />
                <SkeletonText width={70} height={11} />
                <SkeletonText width={80} height={16} style={{ marginTop: 2 }} />
              </View>

              <View style={{ marginTop: 12 }}>
                <SkeletonBox width="100%" height={32} borderRadius={8} />
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={[styles.title, { color: colors.onSurface }]}>Bills & Utilities</Text>
          {upcomingBills.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: colors.primaryContainer }]}>
              <Text style={[styles.countBadgeText, { color: colors.onPrimaryContainer }]} numberOfLines={1}>
                {upcomingBills.length}
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={() => router.navigate('/(app)/bills')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.viewAllButton}
        >
          <Text style={[styles.viewAllText, { color: colors.primary }]}>VIEW ALL</Text>
        </TouchableOpacity>
      </View>

      {upcomingBills.length === 0 ? (
        <TouchableOpacity
          style={[
            styles.emptyContainer,
            {
              backgroundColor: colors.surfaceContainerLowest,
              borderColor: colors.surfaceVariant,
            },
          ]}
          onPress={() => router.navigate('/(app)/add-bill')}
          activeOpacity={0.8}
        >
          <View style={[styles.emptyIconBox, { backgroundColor: colors.surfaceContainerLow }]}>
            <MaterialIcons name="check-circle" size={24} color={colors.primary} />
          </View>
          <View style={styles.emptyTextContainer}>
            <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>All Caught Up!</Text>
            <Text style={[styles.emptySubtitle, { color: colors.onSurfaceVariant }]}>
              No pending bills due in the next {daysAhead} days. Tap to add one.
            </Text>
          </View>
          <MaterialIcons name="add" size={20} color={colors.primary} />
        </TouchableOpacity>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {upcomingBills.map((bill) => {
            const branding = getBillerBranding(bill.provider || bill.title, bill.category);

            return (
              <TouchableOpacity
                key={bill.id}
                style={[
                  styles.billCard,
                  {
                    backgroundColor: colors.surfaceContainerLowest,
                    borderColor: colors.surfaceVariant,
                  },
                ]}
                onPress={() =>
                  router.navigate({ pathname: '/(app)/bill-details', params: { billId: bill.id } })
                }
                activeOpacity={0.9}
              >
                <View style={styles.cardTopRow}>
                  <View style={[styles.iconCircle, { backgroundColor: branding.backgroundColor }]}>
                    <MaterialIcons name={branding.icon} size={18} color={branding.color} />
                  </View>
                  <BillStatusBadge
                    status={bill.status}
                    dueDate={bill.dueDate}
                    lastPaidDate={bill.lastPaidDate}
                    size="sm"
                  />
                </View>

                <View style={styles.cardInfoBox}>
                  <Text style={[styles.billerName, { color: colors.onSurface }]} numberOfLines={1}>
                    {bill.title}
                  </Text>
                  <Text style={[styles.accountRef, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
                    {bill.accountReference || `Due ${formatDate(bill.dueDate, 'month-day')}`}
                  </Text>
                  <Text style={[styles.amount, { color: colors.onSurface }]}>
                    {formatCurrencyPrivacy(bill.amount, hideBalances)}
                  </Text>
                </View>

                <View style={styles.cardActions}>
                  {bill.paymentUrl ? (
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        {
                          backgroundColor: colors.surfaceContainerLowest,
                          borderColor: colors.outlineVariant,
                        },
                      ]}
                      onPress={() => handlePay(bill)}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="open-in-new" size={13} color={colors.onSurface} />
                      <Text style={[styles.actionBtnText, { color: colors.onSurface }]}>Pay</Text>
                    </TouchableOpacity>
                  ) : null}

                  {bill.paymentUrl ? (
                    <TouchableOpacity
                      style={[
                        styles.iconActionBtn,
                        {
                          backgroundColor: colors.surfaceContainerLowest,
                          borderColor: colors.outlineVariant,
                        },
                      ]}
                      onPress={() => handleSnooze(bill)}
                      activeOpacity={0.8}
                      accessibilityLabel="Snooze reminder"
                    >
                      <MaterialIcons name="snooze" size={16} color={colors.onSurfaceVariant} />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        {
                          backgroundColor: colors.surfaceContainerLowest,
                          borderColor: colors.outlineVariant,
                        },
                      ]}
                      onPress={() => handleSnooze(bill)}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons name="snooze" size={13} color={colors.onSurfaceVariant} />
                      <Text style={[styles.actionBtnText, { color: colors.onSurfaceVariant }]}>
                        Snooze
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.actionBtnPrimary,
                      {
                        backgroundColor: colors.primaryContainer,
                        borderColor: colors.primaryContainer,
                        ...(bill.paymentUrl ? {} : { flex: 1.2 }),
                      },
                    ]}
                    onPress={() => handleMarkPaid(bill)}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="check" size={13} color={colors.onPrimaryContainer} />
                    <Text style={[styles.actionBtnText, { color: colors.onPrimaryContainer }]}>Paid</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    ...typography.headlineSm,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    flexShrink: 0,
  },
  countBadgeText: {
    ...typography.labelMd,
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    lineHeight: 16,
  },
  viewAllButton: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    flexShrink: 0,
  },
  viewAllText: {
    ...typography.labelMd,
    fontFamily: fontFamilies.bold,
    fontSize: 12,
    ...(Platform.OS === 'ios' ? { letterSpacing: 0.5 } : {}),
  },
  emptyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  emptyIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTextContainer: {
    flex: 1,
  },
  emptyTitle: {
    ...typography.bodyLg,
    fontFamily: fontFamilies.bold,
    fontSize: 14,
  },
  emptySubtitle: {
    ...typography.bodyMd,
    fontSize: 12,
    marginTop: 2,
  },
  scrollContent: {
    gap: 12,
    paddingVertical: 2,
  },
  billCard: {
    width: 205,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'space-between',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfoBox: {
    marginTop: 10,
  },
  billerName: {
    ...typography.bodyMd,
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
    lineHeight: 18,
    marginBottom: 2,
  },
  accountRef: {
    ...typography.labelSm,
    fontFamily: fontFamilies.regular,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 8,
  },
  amount: {
    ...typography.bodyLg,
    fontFamily: fontFamilies.bold,
    fontSize: 15,
    lineHeight: 20,
  },
  cardActions: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    flex: 1,
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 4,
  },
  iconActionBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 8,
  },
  actionBtnPrimary: {
    flex: 1,
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 4,
  },
  actionBtnText: {
    ...typography.labelSm,
    fontFamily: fontFamilies.semiBold,
    fontSize: 11,
    lineHeight: 14,
  },
});

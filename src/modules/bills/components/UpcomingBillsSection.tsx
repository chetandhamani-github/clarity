import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui';
import { useTheme, typography, radius, spacing } from '@/theme';
import { useAppStore } from '@/store/use-app-store';
import { formatCurrencyPrivacy } from '@/utils/format';
import { getBillerBranding } from '@/utils/icons';
import { BillStatusBadge } from './BillStatusBadge';
import { useBills } from '../hooks/useBills';
import type { Bill } from '../types/bill.types';

interface UpcomingBillsSectionProps {
  daysAhead?: number;
}

export function UpcomingBillsSection({ daysAhead = 30 }: UpcomingBillsSectionProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const { hideBalances } = useAppStore();
  const { upcomingBills, isLoading, markBillPaid } = useBills();

  const handlePay = async (bill: Bill) => {
    if (bill.paymentUrl) {
      try {
        await Linking.openURL(bill.paymentUrl);
      } catch {
        router.push('/(app)/bills');
      }
    } else {
      router.push('/(app)/bills');
    }
  };

  const handleMarkPaid = async (bill: Bill) => {
    await markBillPaid(bill.id);
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.onSurface }]}>Bills & Utilities</Text>
        </View>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
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
              <Text style={[styles.countBadgeText, { color: colors.onPrimaryContainer }]}>
                {upcomingBills.length}
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={() => router.push('/(app)/bills')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.viewAllText, { color: colors.primary }]}>VIEW ALL</Text>
        </TouchableOpacity>
      </View>

      {upcomingBills.length === 0 ? (
        <TouchableOpacity
          style={[
            styles.emptyContainer,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            },
          ]}
          onPress={() => router.push('/(app)/add-bill')}
          activeOpacity={0.8}
        >
          <View style={styles.emptyIconBox}>
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
                    backgroundColor: colors.surfaceContainerLow,
                    borderColor: colors.outlineVariant,
                  },
                ]}
                onPress={() =>
                  router.push({ pathname: '/(app)/bill-details', params: { billId: bill.id } })
                }
                activeOpacity={0.9}
              >
                <View style={styles.cardTopRow}>
                  <View style={[styles.iconCircle, { backgroundColor: branding.backgroundColor }]}>
                    <MaterialIcons name={branding.icon as any} size={18} color={branding.color} />
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
                    {bill.accountReference || bill.dueDate}
                  </Text>
                  <Text style={[styles.amount, { color: colors.onSurface }]}>
                    {formatCurrencyPrivacy(bill.amount, hideBalances)}
                  </Text>
                </View>

                <View style={styles.cardActions}>
                  {bill.paymentUrl ? (
                    <TouchableOpacity
                      style={[styles.payBtn, { backgroundColor: colors.primary }]}
                      onPress={() => handlePay(bill)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.payBtnText}>PAY</Text>
                      <MaterialIcons name="open-in-new" size={12} color="#ffffff" />
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={[
                      styles.markPaidBtn,
                      {
                        backgroundColor: colors.surfaceContainerLowest,
                        borderColor: colors.outlineVariant,
                      },
                      bill.paymentUrl ? styles.markPaidBtnFlex : styles.markPaidBtnFull,
                    ]}
                    onPress={() => handleMarkPaid(bill)}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="check" size={14} color={colors.primary} />
                    <Text style={[styles.markPaidBtnText, { color: colors.primary }]}>PAID</Text>
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
    marginTop: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 20,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    ...typography.headlineSm,
    fontSize: 16,
    fontWeight: '700',
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countBadgeText: {
    ...typography.labelMd,
    fontWeight: '700',
    fontSize: 10,
  },
  viewAllText: {
    ...typography.labelMd,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  loadingBox: {
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  emptyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginHorizontal: 20,
    gap: 12,
  },
  emptyIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(120, 86, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTextContainer: {
    flex: 1,
  },
  emptyTitle: {
    ...typography.bodyLg,
    fontWeight: '700',
    fontSize: 14,
  },
  emptySubtitle: {
    ...typography.bodyMd,
    fontSize: 12,
    marginTop: 2,
  },
  scrollContent: {
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 2,
  },
  billCard: {
    width: 175,
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
    ...typography.bodyLg,
    fontWeight: '700',
    fontSize: 14,
  },
  accountRef: {
    ...typography.bodyMd,
    fontSize: 11,
    marginTop: 2,
  },
  amount: {
    ...typography.headlineSm,
    fontWeight: '800',
    fontSize: 16,
    marginTop: 6,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  payBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderRadius: 8,
  },
  payBtnText: {
    ...typography.labelMd,
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 11,
  },
  markPaidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    paddingVertical: 6,
    borderRadius: 8,
  },
  markPaidBtnFlex: {
    flex: 1,
  },
  markPaidBtnFull: {
    width: '100%',
  },
  markPaidBtnText: {
    ...typography.labelMd,
    fontWeight: '700',
    fontSize: 11,
  },
});

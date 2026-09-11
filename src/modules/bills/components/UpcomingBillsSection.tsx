import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text, SkeletonBox, SkeletonCircle, SkeletonText } from '@/components/ui';
import { useTheme, typography } from '@/theme';
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

  const handleMarkPaid = async (bill: Bill) => {
    await markBillPaid(bill.id);
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
              <Text style={[styles.countBadgeText, { color: colors.onPrimaryContainer }]}>
                {upcomingBills.length}
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={() => router.push('/(app)/bills')}
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
                    backgroundColor: colors.surfaceContainerLowest,
                    borderColor: colors.surfaceVariant,
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
                  <TouchableOpacity
                    style={[
                      styles.markPaidBtn,
                      {
                        backgroundColor: colors.surfaceContainerLowest,
                        borderColor: colors.outlineVariant,
                      },
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
    marginBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
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
  },
  countBadgeText: {
    ...typography.labelMd,
    fontWeight: '700',
    fontSize: 11,
  },
  viewAllButton: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  viewAllText: {
    ...typography.labelMd,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.5,
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
    ...typography.bodyMd,
    fontWeight: '600',
    fontSize: 13,
    marginBottom: 2,
  },
  accountRef: {
    ...typography.labelMd,
    fontSize: 11,
    marginBottom: 8,
  },
  amount: {
    ...typography.bodyLg,
    fontWeight: '700',
    fontSize: 14,
  },
  cardActions: {
    marginTop: 12,
  },
  markPaidBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    paddingVertical: 7,
    borderRadius: 8,
    width: '100%',
  },
  markPaidBtnText: {
    ...typography.labelMd,
    fontWeight: '700',
    fontSize: 11,
  },
});

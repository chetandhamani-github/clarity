import React from 'react';
import { View, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text, useToast } from '@/components/ui';
import { useTheme, typography, radius } from '@/theme';
import { useAppStore } from '@/store/use-app-store';
import { formatCurrencyPrivacy } from '@/utils/format';
import { getBillerBranding } from '@/utils/icons';
import { BillStatusBadge } from './BillStatusBadge';
import { useBills } from '../hooks/useBills';
import type { Bill } from '../types/bill.types';

interface BillCardProps {
  bill: Bill;
  onPress?: () => void;
}

export function BillCard({ bill, onPress }: BillCardProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const { hideBalances } = useAppStore();
  const { showToast } = useToast();
  const { markBillPaid, deleteBill } = useBills();

  const branding = getBillerBranding(bill.provider || bill.title, bill.category);
  const isPaid = bill.status === 'paid';

  const handlePay = async () => {
    if (bill.paymentUrl) {
      try {
        await Linking.openURL(bill.paymentUrl);
      } catch {
        showToast('Could not open payment link', 'error');
      }
    }
  };

  const handleMarkPaid = async () => {
    try {
      await markBillPaid(bill.id);
      showToast(`${bill.title} marked as paid`, 'success');
    } catch {
      showToast('Failed to mark bill as paid', 'error');
    }
  };

  const handleMoreOptions = () => {
    Alert.alert('Bill Options', bill.title, [
      {
        text: 'View Details',
        onPress: () => router.push({ pathname: '/(app)/bill-details', params: { billId: bill.id } }),
      },
      {
        text: 'Edit',
        onPress: () => router.push({ pathname: '/(app)/add-bill', params: { billId: bill.id } }),
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Confirm Delete', `Remove reminder for ${bill.title}?`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                await deleteBill(bill.id);
                showToast('Bill deleted', 'success');
              },
            },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleCardPress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push({ pathname: '/(app)/bill-details', params: { billId: bill.id } });
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceContainerLow,
          borderColor: colors.outlineVariant,
        },
      ]}
      onPress={handleCardPress}
      activeOpacity={0.88}
    >
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconCircle, { backgroundColor: branding.backgroundColor }]}>
            <MaterialIcons name={branding.icon as any} size={22} color={branding.color} />
          </View>
          <View style={styles.titleContainer}>
            <Text style={[styles.title, { color: colors.onSurface }]} numberOfLines={1}>
              {bill.title}
            </Text>
            <Text style={[styles.providerSubtitle, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
              {bill.provider && bill.provider !== bill.title ? `${bill.provider} • ` : ''}
              {bill.accountReference || bill.dueDate}
            </Text>
          </View>
        </View>

        <View style={styles.amountContainer}>
          <Text style={[styles.amount, { color: colors.onSurface }]}>
            {formatCurrencyPrivacy(bill.amount, hideBalances)}
          </Text>
          {bill.minAmount ? (
            <Text style={[styles.minDueText, { color: colors.onSurfaceVariant }]}>
              Min: {formatCurrencyPrivacy(bill.minAmount, hideBalances)}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Meta Row: Badges, Frequency, Source */}
      <View style={styles.metaRow}>
        <BillStatusBadge
          status={bill.status}
          dueDate={bill.dueDate}
          lastPaidDate={bill.lastPaidDate}
          size="sm"
        />

        {bill.isRecurring && bill.frequency && bill.frequency !== 'one_time' && (
          <View style={[styles.pillBadge, { backgroundColor: colors.surfaceContainerHighest }]}>
            <MaterialIcons name="repeat" size={12} color={colors.onSurfaceVariant} />
            <Text style={[styles.pillBadgeText, { color: colors.onSurfaceVariant }]}>
              {bill.frequency.charAt(0).toUpperCase() + bill.frequency.slice(1)}
            </Text>
          </View>
        )}

        <View style={[styles.sourcePill, { backgroundColor: colors.surfaceContainerHighest }]}>
          <Text style={[styles.sourcePillText, { color: colors.onSurfaceVariant }]}>
            {bill.source.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Action Buttons for Unpaid Bills */}
      {!isPaid && (
        <View style={[styles.actionRow, { borderTopColor: colors.outlineVariant }]}>
          {bill.paymentUrl ? (
            <TouchableOpacity
              style={[styles.payOnlineButton, { backgroundColor: colors.primary }]}
              onPress={handlePay}
              activeOpacity={0.8}
            >
              <MaterialIcons name="open-in-new" size={14} color="#ffffff" />
              <Text style={styles.payOnlineButtonText}>PAY ONLINE</Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[
              styles.markPaidButton,
              {
                backgroundColor: colors.surfaceContainerLowest,
                borderColor: colors.outlineVariant,
              },
              !bill.paymentUrl && { flex: 1 },
            ]}
            onPress={handleMarkPaid}
            activeOpacity={0.8}
          >
            <MaterialIcons name="check-circle-outline" size={15} color={colors.primary} />
            <Text style={[styles.markPaidButtonText, { color: colors.primary }]}>MARK PAID</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.moreButton,
              {
                backgroundColor: colors.surfaceContainerLowest,
                borderColor: colors.outlineVariant,
              },
            ]}
            onPress={handleMoreOptions}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="more-vert" size={18} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    ...typography.bodyLg,
    fontWeight: '700',
    fontSize: 15,
  },
  providerSubtitle: {
    ...typography.bodyMd,
    fontSize: 12,
    marginTop: 2,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amount: {
    ...typography.headlineSm,
    fontWeight: '800',
    fontSize: 16,
  },
  minDueText: {
    ...typography.labelMd,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  pillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pillBadgeText: {
    ...typography.labelMd,
    fontSize: 10,
    fontWeight: '600',
  },
  sourcePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  sourcePillText: {
    ...typography.labelMd,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  payOnlineButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    borderRadius: 8,
  },
  payOnlineButtonText: {
    ...typography.labelMd,
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.3,
  },
  markPaidButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  markPaidButtonText: {
    ...typography.labelMd,
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.3,
  },
  moreButton: {
    padding: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
});

import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Text, Header, useToast } from '@/components/ui';
import { typography, useTheme, ThemeColors, radius } from '@/theme';
import { useAppStore } from '@/store/use-app-store';
import { formatCurrencyPrivacy } from '@/utils/format';
import { getBillerBranding } from '@/utils/icons';
import { useBills } from '../hooks/useBills';
import { BillStatusBadge } from '../components/BillStatusBadge';

export function BillDetailsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { hideBalances } = useAppStore();
  const { showToast } = useToast();

  const { billId } = useLocalSearchParams<{ billId: string }>();
  const { allBills, markBillPaid, deleteBill, updateBill } = useBills();

  const bill = allBills.find((b) => b.id === billId);

  if (!bill) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
        <Header title="Bill Details" showBack />
        <View style={styles.notFoundContainer}>
          <MaterialIcons name="receipt-long" size={48} color={colors.onSurfaceVariant} />
          <Text style={[styles.notFoundText, { color: colors.onSurface }]}>Bill Not Found</Text>
          <TouchableOpacity style={[styles.backButton, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
            <Text style={[styles.backButtonText, { color: colors.onPrimary }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const branding = getBillerBranding(bill.provider || bill.title, bill.category);
  const isPaid = bill.status === 'paid';

  const handlePayOnline = async () => {
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
      router.back();
    } catch {
      showToast('Failed to mark bill as paid', 'error');
    }
  };

  const handleMarkUnpaid = async () => {
    try {
      await updateBill(bill.id, {
        status: 'upcoming',
        lastPaidDate: undefined,
        paidTransactionId: undefined,
      });
      showToast('Marked as upcoming', 'info');
    } catch {
      showToast('Failed to update status', 'error');
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Bill', `Are you sure you want to delete ${bill.title}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteBill(bill.id);
          showToast('Bill deleted', 'success');
          router.back();
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <Header
        title="Bill Details"
        showBack
        rightNode={
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={() => router.push({ pathname: '/(app)/add-bill', params: { billId: bill.id } })}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="edit" size={20} color={colors.onSurface} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={handleDelete}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="delete-outline" size={20} color={colors.error} />
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 90 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Hero Banner */}
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          <View style={[styles.heroIconBox, { backgroundColor: branding.backgroundColor }]}>
            <MaterialIcons name={branding.icon as any} size={30} color={branding.color} />
          </View>

          <Text style={[styles.heroTitle, { color: colors.onSurface }]}>{bill.title}</Text>
          {bill.provider && bill.provider !== bill.title ? (
            <Text style={[styles.heroProvider, { color: colors.onSurfaceVariant }]}>{bill.provider}</Text>
          ) : null}

          <Text style={[styles.heroAmount, { color: colors.onSurface }]}>
            {formatCurrencyPrivacy(bill.amount, hideBalances)}
          </Text>

          <View style={styles.heroBadgeRow}>
            <BillStatusBadge
              status={bill.status}
              dueDate={bill.dueDate}
              lastPaidDate={bill.lastPaidDate}
              size="md"
            />
            {bill.isRecurring && (
              <View style={[styles.recurringPill, { backgroundColor: colors.surfaceContainerHighest }]}>
                <MaterialIcons name="repeat" size={13} color={colors.onSurfaceVariant} />
                <Text style={[styles.recurringPillText, { color: colors.onSurfaceVariant }]}>
                  {bill.frequency.charAt(0).toUpperCase() + bill.frequency.slice(1)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Information Table */}
        <View
          style={[
            styles.sectionCard,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.onSurfaceVariant }]}>BILL DETAILS</Text>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.onSurfaceVariant }]}>Category</Text>
            <Text style={[styles.infoValue, { color: colors.onSurface }]}>
              {bill.category.replace('_', ' ').toUpperCase()}
            </Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.onSurfaceVariant }]}>Due Date</Text>
            <Text style={[styles.infoValue, { color: colors.onSurface }]}>{bill.dueDate}</Text>
          </View>

          <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.onSurfaceVariant }]}>Alert Reminder</Text>
            <Text style={[styles.infoValue, { color: colors.onSurface }]}>
              {bill.reminderDays === 0
                ? 'On Due Date'
                : `${bill.reminderDays} Day${bill.reminderDays > 1 ? 's' : ''} Before`}
            </Text>
          </View>

          {bill.accountReference ? (
            <>
              <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.onSurfaceVariant }]}>Account Reference</Text>
                <Text style={[styles.infoValue, { color: colors.onSurface }]}>{bill.accountReference}</Text>
              </View>
            </>
          ) : null}

          {bill.minAmount ? (
            <>
              <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.onSurfaceVariant }]}>Minimum Amount Due</Text>
                <Text style={[styles.infoValue, { color: colors.onSurface }]}>
                  {formatCurrencyPrivacy(bill.minAmount, hideBalances)}
                </Text>
              </View>
            </>
          ) : null}

          <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, { color: colors.onSurfaceVariant }]}>Source</Text>
            <Text style={[styles.infoValue, { color: colors.onSurface }]}>{bill.source.toUpperCase()}</Text>
          </View>

          {bill.lastPaidDate ? (
            <>
              <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.onSurfaceVariant }]}>Last Paid Date</Text>
                <Text style={[styles.infoValue, { color: '#10b981' }]}>
                  {bill.lastPaidDate}
                </Text>
              </View>
            </>
          ) : null}
        </View>

        {/* Payment Link Box */}
        {bill.paymentUrl ? (
          <View
            style={[
              styles.sectionCard,
              {
                backgroundColor: colors.surfaceContainerLow,
                borderColor: colors.outlineVariant,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.onSurfaceVariant }]}>PAYMENT LINK</Text>
            <TouchableOpacity
              style={[
                styles.urlRow,
                {
                  backgroundColor: colors.surfaceContainerLowest,
                  borderColor: colors.outlineVariant,
                },
              ]}
              onPress={handlePayOnline}
              activeOpacity={0.8}
            >
              <MaterialIcons name="link" size={20} color={colors.primary} />
              <Text style={[styles.urlText, { color: colors.primary }]} numberOfLines={1}>
                {bill.paymentUrl}
              </Text>
              <MaterialIcons name="open-in-new" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Notes */}
        {bill.notes ? (
          <View
            style={[
              styles.sectionCard,
              {
                backgroundColor: colors.surfaceContainerLow,
                borderColor: colors.outlineVariant,
              },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: colors.onSurfaceVariant }]}>NOTES</Text>
            <Text style={[styles.notesText, { color: colors.onSurface }]}>{bill.notes}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Bottom Sticky Action Bar */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: colors.surfaceContainerLow,
            borderTopColor: colors.outlineVariant,
            paddingBottom: Math.max(16, insets.bottom),
          },
        ]}
      >
        {bill.paymentUrl && !isPaid ? (
          <TouchableOpacity
            style={[
              styles.payOnlineBtn,
              {
                backgroundColor: colors.surfaceContainerHighest,
                borderColor: colors.outlineVariant,
              },
            ]}
            onPress={handlePayOnline}
            activeOpacity={0.85}
          >
            <MaterialIcons name="open-in-new" size={18} color="#ffffff" />
            <Text style={[styles.payOnlineBtnText, { color: colors.onSurface }]}>PAY ONLINE</Text>
          </TouchableOpacity>
        ) : null}

        {!isPaid ? (
          <TouchableOpacity
            style={[
              styles.primaryActionBtn,
              { backgroundColor: colors.primary },
              bill.paymentUrl && { flex: 1.2 },
            ]}
            onPress={handleMarkPaid}
            activeOpacity={0.85}
          >
            <MaterialIcons name="check" size={20} color={colors.onPrimary} />
            <Text style={[styles.primaryActionBtnText, { color: colors.onPrimary }]}>MARK AS PAID</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.unpaidBtn,
              {
                backgroundColor: colors.surfaceContainerLowest,
                borderColor: colors.outlineVariant,
              },
            ]}
            onPress={handleMarkUnpaid}
            activeOpacity={0.85}
          >
            <MaterialIcons name="undo" size={18} color={colors.onSurface} />
            <Text style={[styles.unpaidBtnText, { color: colors.onSurface }]}>Mark as Upcoming</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerIconButton: {
    padding: 6,
    borderRadius: 8,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 16,
  },
  heroCard: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  heroIconBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: {
    ...typography.headlineSm,
    fontWeight: '800',
    fontSize: 20,
    textAlign: 'center',
  },
  heroProvider: {
    ...typography.bodyMd,
    fontSize: 13,
    marginTop: 2,
  },
  heroAmount: {
    ...typography.displayLg,
    fontWeight: '800',
    fontSize: 32,
    marginVertical: 10,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  recurringPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  recurringPillText: {
    ...typography.labelMd,
    fontSize: 11,
    fontWeight: '600',
  },
  sectionCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: 16,
  },
  sectionTitle: {
    ...typography.labelMd,
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  infoLabel: {
    ...typography.bodyMd,
    fontSize: 13,
  },
  infoValue: {
    ...typography.bodyMd,
    fontWeight: '700',
    fontSize: 13,
  },
  divider: {
    height: 1,
    marginVertical: 10,
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
  },
  urlText: {
    flex: 1,
    ...typography.bodyMd,
    fontSize: 12,
  },
  notesText: {
    ...typography.bodyMd,
    fontSize: 13,
    lineHeight: 19,
  },
  notFoundContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  notFoundText: {
    ...typography.headlineSm,
    marginTop: 12,
    marginBottom: 20,
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  backButtonText: {
    fontWeight: '700',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  payOnlineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 12,
  },
  payOnlineBtnText: {
    ...typography.labelMd,
    fontWeight: '700',
    fontSize: 13,
  },
  primaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryActionBtnText: {
    ...typography.labelMd,
    fontWeight: '700',
    fontSize: 13,
  },
  unpaidBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 12,
  },
  unpaidBtnText: {
    ...typography.labelMd,
    fontWeight: '700',
    fontSize: 13,
  },
});


import React from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Text, useToast } from '@/components/ui';
import { useTheme, fontFamilies, ThemeColors, radius } from '@/theme';
import { formatCurrency, formatDate } from '@/utils/format';
import { getBillerBranding } from '@/utils/icons';
import { useNotificationStore } from '@/store/useNotificationStore';
import { BillService } from '@/modules/bills/services/BillService';
import { BillAlertEngine } from '@/services/notifications/bill-alert-engine';
import type { BillCategory } from '@/modules/bills/types/bill.types';

function mapToBillCategory(billerCategory: string): BillCategory {
  switch (billerCategory) {
    case 'electricity':
      return 'electricity';
    case 'water':
      return 'water';
    case 'piped_gas':
    case 'lpg_cylinder':
      return 'other';
    case 'broadband':
    case 'landline':
      return 'internet';
    case 'mobile_postpaid':
      return 'mobile';
    case 'credit_card':
      return 'credit_card';
    case 'loan_emi':
      return 'emi';
    case 'insurance':
      return 'insurance';
    case 'rent':
    case 'housing_society':
      return 'rent';
    case 'subscription':
    case 'dth':
    case 'cable_tv':
      return 'subscription';
    case 'tuition':
      return 'education';
    default:
      return 'other';
  }
}

export function BillDetectedPromptModal() {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const visible = useNotificationStore((state) => state.detectedBillModalVisible);
  const bill = useNotificationStore((state) => state.activeDetectedBill);
  const closeDetectedBillModal = useNotificationStore((state) => state.closeDetectedBillModal);

  if (!bill) return null;

  const branding = getBillerBranding(bill.billerName, bill.billerCategory);

  const handleConfirmAdd = async () => {
    try {
      const category = mapToBillCategory(bill.billerCategory);
      const { bill: inserted } = await BillService.mergeOrInsertExternalBill({
        title: bill.billerName,
        provider: bill.billerName,
        category,
        amount: bill.amountDue,
        minAmount: bill.minAmountDue,
        dueDate: bill.dueDate,
        accountReference: bill.accountReference,
        paymentUrl: bill.paymentUrl,
        source: 'sms',
        notes: 'Confirmed from notification prompt',
      });

      if (inserted) {
        await BillAlertEngine.scheduleNativeBillReminder({
          id: inserted.id,
          billerName: inserted.title,
          amountDue: inserted.amount,
          dueDate: inserted.dueDate,
          status: inserted.status,
          reminderDaysBefore: inserted.reminderDays ?? 3,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['bills'] });
      showToast(`Added reminder for ${bill.billerName}`, 'success');
      closeDetectedBillModal();
    } catch {
      showToast('Could not save bill reminder', 'error');
    }
  };

  const handlePayNow = async () => {
    if (bill.paymentUrl) {
      try {
        await Linking.openURL(bill.paymentUrl);
      } catch {
        showToast('Could not open payment link', 'error');
      }
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={closeDetectedBillModal}
    >
      <TouchableWithoutFeedback onPress={closeDetectedBillModal}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.modalContainer, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}>
              {/* Header Icon & Title */}
              <View style={styles.headerRow}>
                <View style={[styles.headerIconBox, { backgroundColor: colors.primaryContainer }]}>
                  <MaterialIcons name="notifications-active" size={24} color={colors.primary} />
                </View>
                <View style={styles.headerTextContainer}>
                  <Text style={[styles.modalTitle, { color: colors.onSurface }]}>
                    New Bill Detected
                  </Text>
                  <Text style={[styles.modalSubtitle, { color: colors.onSurfaceVariant }]}>
                    Auto-detected from your notifications
                  </Text>
                </View>
              </View>

              {/* Bill Details Card */}
              <View style={[styles.billCard, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.outlineVariant }]}>
                <View style={styles.billTopRow}>
                  <View style={[styles.billerIconCircle, { backgroundColor: branding.backgroundColor }]}>
                    <MaterialIcons name={branding.icon} size={20} color={branding.color} />
                  </View>
                  <View style={styles.billerMeta}>
                    <Text style={[styles.billerName, { color: colors.onSurface }]} numberOfLines={1}>
                      {bill.billerName}
                    </Text>
                    <Text style={[styles.categoryLabel, { color: colors.onSurfaceVariant }]}>
                      {bill.billerCategory.replace(/_/g, ' ').toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={[styles.divider, { backgroundColor: colors.outlineVariant }]} />

                <View style={styles.amountDueDateRow}>
                  <View>
                    <Text style={[styles.sectionLabel, { color: colors.onSurfaceVariant }]}>
                      AMOUNT DUE
                    </Text>
                    <Text style={[styles.amountValue, { color: colors.onSurface }]}>
                      {formatCurrency(bill.amountDue)}
                    </Text>
                    {bill.minAmountDue ? (
                      <Text style={[styles.minAmountText, { color: colors.onSurfaceVariant }]}>
                        Min: {formatCurrency(bill.minAmountDue)}
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.dueDateContainer}>
                    <Text style={[styles.sectionLabel, { color: colors.onSurfaceVariant }]}>
                      DUE DATE
                    </Text>
                    <View style={styles.dueDateBadge}>
                      <MaterialIcons name="event" size={14} color={colors.primary} />
                      <Text style={[styles.dueDateText, { color: colors.onSurface }]}>
                        {formatDate(bill.dueDate)}
                      </Text>
                    </View>
                  </View>
                </View>

                {bill.accountReference ? (
                  <View style={[styles.refRow, { borderTopColor: colors.outlineVariant }]}>
                    <Text style={[styles.refLabel, { color: colors.onSurfaceVariant }]}>
                      Account Ref:
                    </Text>
                    <Text style={[styles.refValue, { color: colors.onSurface }]}>
                      {bill.accountReference}
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Action Buttons */}
              <View style={styles.actionsContainer}>
                {bill.paymentUrl ? (
                  <TouchableOpacity
                    style={[styles.payButton, { borderColor: colors.outlineVariant }]}
                    onPress={handlePayNow}
                    activeOpacity={0.8}
                  >
                    <MaterialIcons name="open-in-new" size={16} color={colors.onSurface} />
                    <Text style={[styles.payButtonText, { color: colors.onSurface }]}>
                      Pay Bill Now
                    </Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  style={[styles.confirmButton, { backgroundColor: colors.primary }]}
                  onPress={handleConfirmAdd}
                  activeOpacity={0.85}
                >
                  <MaterialIcons name="check" size={18} color={colors.onPrimary} />
                  <Text style={[styles.confirmButtonText, { color: colors.onPrimary }]}>
                    Track & Set Reminder
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dismissButton}
                  onPress={closeDetectedBillModal}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.dismissButtonText, { color: colors.onSurfaceVariant }]}>
                    Dismiss
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    borderRadius: radius.xl,
    padding: 24,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerIconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  headerTextContainer: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: fontFamilies.semiBold,
  },
  modalSubtitle: {
    fontSize: 13,
    fontFamily: fontFamilies.regular,
    marginTop: 2,
  },
  billCard: {
    borderRadius: radius.md,
    padding: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  billTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  billerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  billerMeta: {
    flex: 1,
  },
  billerName: {
    fontSize: 15,
    fontFamily: fontFamilies.semiBold,
  },
  categoryLabel: {
    fontSize: 11,
    fontFamily: fontFamilies.medium,
    letterSpacing: 0.5,
    marginTop: 1,
  },
  divider: {
    height: 1,
    marginVertical: 14,
  },
  amountDueDateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: fontFamilies.medium,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 20,
    fontFamily: fontFamilies.bold,
  },
  minAmountText: {
    fontSize: 11,
    fontFamily: fontFamilies.regular,
    marginTop: 2,
  },
  dueDateContainer: {
    alignItems: 'flex-end',
  },
  dueDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  dueDateText: {
    fontSize: 14,
    fontFamily: fontFamilies.medium,
  },
  refRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  refLabel: {
    fontSize: 12,
    fontFamily: fontFamilies.regular,
  },
  refValue: {
    fontSize: 12,
    fontFamily: fontFamilies.medium,
  },
  actionsContainer: {
    gap: 10,
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  payButtonText: {
    fontSize: 14,
    fontFamily: fontFamilies.semiBold,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: radius.md,
  },
  confirmButtonText: {
    fontSize: 14,
    fontFamily: fontFamilies.semiBold,
  },
  dismissButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  dismissButtonText: {
    fontSize: 13,
    fontFamily: fontFamilies.medium,
  },
});


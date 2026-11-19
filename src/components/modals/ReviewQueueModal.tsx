import { Text, useToast } from '@/components/ui';
import { ReviewQueueService } from '@/modules/sms/reviewQueue/reviewQueueService';
import type { ExtractedTransaction, ReviewQueueItem } from '@/modules/sms/types';
import { useSmsStore } from '@/store/useSmsStore';
import { radius } from '@/theme/radius';
import { spacing } from '@/theme/spacing';
import { ThemeColors, useTheme } from '@/theme/useTheme';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { MaterialIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

interface ReviewQueueModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ReviewQueueModal({ visible, onClose }: ReviewQueueModalProps) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeInsets();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const refreshReviewQueueCount = useSmsStore((state) => state.refreshReviewQueueCount);

  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeItemIndex, setActiveItemIndex] = useState(0);

  // Editable fields for the active review item
  const [amountStr, setAmountStr] = useState('');
  const [merchant, setMerchant] = useState('');
  const [direction, setDirection] = useState<'DEBIT' | 'CREDIT'>('DEBIT');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const pending = await ReviewQueueService.getPendingItems(50, 0);
      setItems(pending);
      setActiveItemIndex(0);
      if (pending.length > 0) {
        initFields(pending[0]);
      }
    } catch {
      showToast('Failed to load pending review items', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  const initFields = (item: ReviewQueueItem) => {
    setAmountStr(item.extractedData?.amount ? item.extractedData.amount.toString() : '');
    setMerchant(item.extractedData?.merchant || '');
    setDirection(item.extractedData?.type || 'DEBIT');
  };

  useEffect(() => {
    if (visible) {
      loadItems();
    }
  }, [visible, loadItems]);

  const currentItem: ReviewQueueItem | undefined = items[activeItemIndex];

  const handleNext = () => {
    if (activeItemIndex < items.length - 1) {
      const nextIndex = activeItemIndex + 1;
      setActiveItemIndex(nextIndex);
      initFields(items[nextIndex]);
    } else {
      onClose();
    }
  };

  const handleApprove = async () => {
    if (!currentItem) return;
    const parsedAmount = parseFloat(amountStr);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      showToast('Please enter a valid transaction amount', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const verifiedData: ExtractedTransaction = {
        amount: parsedAmount,
        type: direction,
        merchant: merchant.trim() || 'Reviewed Transaction',
        bank: currentItem.extractedData?.bank || 'Bank / UPI',
        accountMask: currentItem.extractedData?.accountMask || 'XXXX',
        referenceNumber: currentItem.extractedData?.referenceNumber,
        availableBalance: currentItem.extractedData?.availableBalance,
        timestamp: currentItem.extractedData?.timestamp || Date.now(),
      };

      await ReviewQueueService.resolveItem(currentItem, verifiedData);
      await refreshReviewQueueCount();
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      await queryClient.invalidateQueries({ queryKey: ['totals'] });

      showToast('Transaction approved and added to ledger!', 'success');

      const nextList = items.filter((_, idx) => idx !== activeItemIndex);
      setItems(nextList);
      if (nextList.length === 0) {
        onClose();
      } else {
        const nextIndex = Math.min(activeItemIndex, nextList.length - 1);
        setActiveItemIndex(nextIndex);
        initFields(nextList[nextIndex]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to approve transaction';
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDismiss = async () => {
    if (!currentItem) return;
    setIsSubmitting(true);
    try {
      await ReviewQueueService.dismissItem(currentItem.id);
      await refreshReviewQueueCount();
      showToast('SMS dismissed as non-financial', 'info');

      const nextList = items.filter((_, idx) => idx !== activeItemIndex);
      setItems(nextList);
      if (nextList.length === 0) {
        onClose();
      } else {
        const nextIndex = Math.min(activeItemIndex, nextList.length - 1);
        setActiveItemIndex(nextIndex);
        initFields(nextList[nextIndex]);
      }
    } catch {
      showToast('Failed to dismiss item', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatReason = (reason: string): string => {
    switch (reason) {
      case 'MISSING_AMOUNT':
        return 'Could not detect amount';
      case 'SUSPICIOUS_AMOUNT':
        return 'Unusual amount detected';
      case 'UNRECOGNIZED_FORMAT':
      default:
        return 'Unrecognized bank format';
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        style={styles.modalOverlay}
      >
        <View style={[styles.modalContainer, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleCol}>
              <Text variant="headlineSm" style={styles.headerTitle}>
                Review SMS Transactions
              </Text>
              {items.length > 0 && (
                <Text variant="bodyMd" style={styles.headerSubtitle}>
                  Item {activeItemIndex + 1} of {items.length}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <MaterialIcons name="close" size={24} color={colors.onSurface} />
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text variant="bodyMd" style={styles.loadingText}>
                Loading transactions needing review...
              </Text>
            </View>
          ) : !currentItem ? (
            <View style={styles.emptyBox}>
              <MaterialIcons name="check-circle" size={48} color={colors.primary} />
              <Text variant="headlineSm" style={styles.emptyTitle}>
                All Caught Up!
              </Text>
              <Text variant="bodyMd" style={styles.emptySubtitle}>
                No unparsed or ambiguous SMS messages pending your review.
              </Text>
              <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.8}>
                <Text style={styles.doneBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              style={styles.scrollContent}
              contentContainerStyle={{ paddingBottom: spacing.xl }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Reason Badge */}
              <View style={styles.reasonBadge}>
                <MaterialIcons name="info-outline" size={16} color={colors.primary} />
                <Text style={styles.reasonBadgeText} numberOfLines={1}>
                  {formatReason(currentItem.reason)}
                </Text>
              </View>

              {/* Raw SMS Card */}
              <View style={styles.rawSmsCard}>
                <Text style={styles.rawSmsSender}>
                  From: {currentItem.sender || 'Unknown Bank'}
                </Text>
                <Text style={styles.rawSmsBody}>{currentItem.body}</Text>
              </View>

              {/* Editable Fields Form */}
              <View style={styles.formContainer}>
                {/* Direction Switcher */}
                <Text style={styles.fieldLabel}>Transaction Type</Text>
                <View style={styles.typeSwitcher}>
                  <TouchableOpacity
                    style={[
                      styles.typeOption,
                      direction === 'DEBIT' && { backgroundColor: colors.errorContainer },
                    ]}
                    onPress={() => setDirection('DEBIT')}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons
                      name="arrow-downward"
                      size={16}
                      color={direction === 'DEBIT' ? colors.onErrorContainer : colors.onSurfaceVariant}
                    />
                    <Text
                      style={[
                        styles.typeText,
                        direction === 'DEBIT' && { color: colors.onErrorContainer, fontWeight: '700' },
                      ]}
                    >
                      Expense (Debit)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.typeOption,
                      direction === 'CREDIT' && { backgroundColor: colors.successContainer },
                    ]}
                    onPress={() => setDirection('CREDIT')}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons
                      name="arrow-upward"
                      size={16}
                      color={direction === 'CREDIT' ? colors.onSuccessContainer : colors.onSurfaceVariant}
                    />
                    <Text
                      style={[
                        styles.typeText,
                        direction === 'CREDIT' && { color: colors.onSuccessContainer, fontWeight: '700' },
                      ]}
                    >
                      Income (Credit)
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Amount Input */}
                <Text style={styles.fieldLabel}>Amount (₹)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0.00"
                  placeholderTextColor={colors.onSurfaceVariant}
                  value={amountStr}
                  onChangeText={setAmountStr}
                  keyboardType="decimal-pad"
                />

                {/* Merchant Input */}
                <Text style={styles.fieldLabel}>Merchant / Description</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Swiggy, Amazon, Metro"
                  placeholderTextColor={colors.onSurfaceVariant}
                  value={merchant}
                  onChangeText={setMerchant}
                />
              </View>

              {/* Action Buttons */}
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.dismissBtn}
                  onPress={handleDismiss}
                  disabled={isSubmitting}
                  activeOpacity={0.7}
                >
                  <Text style={styles.dismissBtnText}>Not a Transaction</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.approveBtn}
                  onPress={handleApprove}
                  disabled={isSubmitting}
                  activeOpacity={0.8}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <View style={styles.btnContent}>
                      <MaterialIcons name="check" size={18} color={colors.onPrimary} />
                      <Text style={styles.approveBtnText}>Approve & Save</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      justifyContent: 'flex-end',
    },
    modalContainer: {
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      maxHeight: '85%',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    headerTitleCol: {
      flex: 1,
    },
    headerTitle: {
      fontFamily: 'Manrope_700Bold',
      fontSize: 20,
      color: colors.onBackground,
    },
    headerSubtitle: {
      fontFamily: 'Manrope_500Medium',
      fontSize: 13,
      color: colors.onSurfaceVariant,
      marginTop: 2,
    },
    closeBtn: {
      padding: spacing.xs,
    },
    loadingBox: {
      paddingVertical: spacing.xxl,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
    },
    loadingText: {
      fontFamily: 'Manrope_500Medium',
      color: colors.onSurfaceVariant,
    },
    emptyBox: {
      paddingVertical: spacing.xxl,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    emptyTitle: {
      fontFamily: 'Manrope_700Bold',
      color: colors.onBackground,
      marginTop: spacing.sm,
    },
    emptySubtitle: {
      fontFamily: 'Manrope_400Regular',
      color: colors.onSurfaceVariant,
      textAlign: 'center',
      maxWidth: 280,
    },
    doneBtn: {
      marginTop: spacing.lg,
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.md - 2,
      borderRadius: radius.lg,
    },
    doneBtnText: {
      fontFamily: 'Manrope_600SemiBold',
      color: colors.onPrimary,
      fontSize: 15,
    },
    scrollContent: {
      flexGrow: 1,
    },
    reasonBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.surfaceContainerHigh,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: radius.md,
      alignSelf: 'flex-start',
      marginBottom: spacing.md,
      flexShrink: 0,
    },
    reasonBadgeText: {
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 12,
      color: colors.onSurface,
    },
    rawSmsCard: {
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      marginBottom: spacing.lg,
    },
    rawSmsSender: {
      fontFamily: 'Manrope_700Bold',
      fontSize: 12,
      color: colors.primary,
      marginBottom: spacing.xs,
      textTransform: 'uppercase',
    },
    rawSmsBody: {
      fontFamily: 'Manrope_400Regular',
      fontSize: 13,
      lineHeight: 18,
      color: colors.onSurface,
    },
    formContainer: {
      gap: spacing.xs + 2,
      marginBottom: spacing.lg,
    },
    fieldLabel: {
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 13,
      color: colors.onSurfaceVariant,
      marginTop: spacing.xs,
    },
    typeSwitcher: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    typeOption: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceContainerHigh,
    },
    typeText: {
      fontFamily: 'Manrope_500Medium',
      fontSize: 13,
      color: colors.onSurfaceVariant,
    },
    input: {
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      fontFamily: 'Manrope_500Medium',
      fontSize: 15,
      color: colors.onSurface,
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginTop: spacing.sm,
    },
    dismissBtn: {
      flex: 1,
      paddingVertical: spacing.md - 2,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.outline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dismissBtnText: {
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 14,
      color: colors.onSurfaceVariant,
    },
    approveBtn: {
      flex: 1.4,
      backgroundColor: colors.primary,
      paddingVertical: spacing.md - 2,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    approveBtnText: {
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 14,
      color: colors.onPrimary,
    },
  });
  return styles;
};

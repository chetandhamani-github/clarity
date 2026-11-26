import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  TouchableWithoutFeedback,
  FlatList,
} from 'react-native';
import { Text, useToast } from '@/components/ui';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme, typography, ThemeColors } from '@/theme';
import { useSmsStore } from '@/store/useSmsStore';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateAnalyticsAndHealthQueries } from '@/hooks/use-financial-health';
import { formatCurrency, formatDate } from '@/utils/format';
import { getCategoryIcon } from '@/utils/icons';
import { hasMeaningfulMerchant } from '@/utils/transaction-display';
import type { ParsedTransaction } from '@/modules/sms/types';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export function SmsTransactionPromptModal({ visible, onDismiss }: Props) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const pendingTransactions = useSmsStore((state) => state.pendingTransactions);
  const importPendingTransactions = useSmsStore((state) => state.importPendingTransactions);
  const dismissPendingTransactions = useSmsStore((state) => state.dismissPendingTransactions);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);

  // Initialize selectedIds with all pending transactions whenever pendingTransactions changes
  useEffect(() => {
    if (pendingTransactions && pendingTransactions.length > 0) {
      setSelectedIds(new Set(pendingTransactions.map((tx) => tx.id)));
    } else {
      setSelectedIds(new Set());
    }
  }, [pendingTransactions]);

  const toggleSelectAll = () => {
    if (selectedIds.size === pendingTransactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingTransactions.map((tx) => tx.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const selectedCount = selectedIds.size;
  const totalCount = pendingTransactions.length;

  const totalSelectedAmount = useMemo(() => {
    return pendingTransactions
      .filter((tx) => selectedIds.has(tx.id))
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [pendingTransactions, selectedIds]);

  const handleFetch = async () => {
    if (selectedCount === 0) {
      showToast('Please select at least one transaction to fetch.', 'info');
      return;
    }

    setIsProcessing(true);
    try {
      const importedCount = await importPendingTransactions(Array.from(selectedIds));
      if (importedCount === 0) {
        showToast('Could not import selected transactions. Please try again.', 'error');
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      await queryClient.invalidateQueries({ queryKey: ['categorySpending'] });
      await queryClient.invalidateQueries({ queryKey: ['budgetPlan'] });
      await queryClient.invalidateQueries({ queryKey: ['goals'] });
      invalidateAnalyticsAndHealthQueries(queryClient);

      showToast(
        `${importedCount} transaction${importedCount === 1 ? '' : 's'} fetched successfully!`,
        'success'
      );
      onDismiss();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to import transactions';
      showToast(msg, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeny = async () => {
    setIsProcessing(true);
    try {
      await dismissPendingTransactions();
      showToast('Transactions skipped. None were fetched.', 'info');
      onDismiss();
    } catch {
      onDismiss();
    } finally {
      setIsProcessing(false);
    }
  };

  if (!visible || pendingTransactions.length === 0) return null;

  const isAllSelected = selectedCount === totalCount && totalCount > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <TouchableWithoutFeedback onPress={onDismiss}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              {/* Header Icon */}
              <View style={styles.iconContainer}>
                <View style={[styles.iconCircle, { backgroundColor: colors.primaryContainer }]}>
                  <MaterialIcons name="receipt-long" size={36} color={colors.onPrimaryContainer} />
                </View>
              </View>

              {/* Title & Subtitle */}
              <Text style={styles.title}>New Transactions Found</Text>
              <Text style={styles.subtitle}>
                Clarity detected {totalCount} new banking transaction{totalCount === 1 ? '' : 's'}.
                Select the transactions you want to fetch into your ledger.
              </Text>

              {/* Summary Bar */}
              <View style={styles.summaryBar}>
                <View style={styles.summaryInfo}>
                  <Text style={styles.summaryLabel} numberOfLines={1}>
                    Selected ({selectedCount}/{totalCount})
                  </Text>
                  <Text style={styles.summaryAmount}>
                    {formatCurrency(totalSelectedAmount)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.selectAllButton}
                  onPress={toggleSelectAll}
                  activeOpacity={0.7}
                >
                  <MaterialIcons
                    name={isAllSelected ? 'check-box' : selectedCount > 0 ? 'indeterminate-check-box' : 'check-box-outline-blank'}
                    size={18}
                    color={colors.primary}
                  />
                  <Text style={[styles.selectAllText, { color: colors.primary }]}>
                    {isAllSelected ? 'Deselect All' : 'Select All'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Scrollable Transaction List */}
              <View style={styles.listContainer}>
                <FlatList
                  data={pendingTransactions}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={true}
                  style={styles.flatList}
                  contentContainerStyle={styles.listContent}
                  initialNumToRender={8}
                  maxToRenderPerBatch={8}
                  windowSize={5}
                  extraData={selectedIds}
                  renderItem={({ item }: { item: ParsedTransaction }) => {
                    const isSelected = selectedIds.has(item.id);
                    const isCredit = item.type === 'CREDIT';
                    const iconName = getCategoryIcon(item.category);
                    const displayName =
                      item.merchant && hasMeaningfulMerchant({ merchant: item.merchant, category: item.category })
                        ? item.merchant.trim()
                        : item.category;

                    const bankLabel = item.accountMask
                      ? `${item.bank || 'Bank'} (..${item.accountMask})`
                      : item.bank || 'Bank / UPI';

                    const dateLabel = item.timestamp
                      ? formatDate(new Date(item.timestamp).toISOString(), 'short')
                      : '';

                    return (
                      <TouchableOpacity
                        style={[
                          styles.transactionItem,
                          isSelected && { borderColor: colors.primary, backgroundColor: colors.surfaceContainer },
                        ]}
                        onPress={() => toggleSelectOne(item.id)}
                        activeOpacity={0.7}
                      >
                        {/* Checkbox */}
                        <MaterialIcons
                          name={isSelected ? 'check-circle' : 'radio-button-unchecked'}
                          size={22}
                          color={isSelected ? colors.primary : colors.outline}
                          style={styles.itemCheckbox}
                        />

                        {/* Category Icon */}
                        <View
                          style={[
                            styles.itemIconCircle,
                            {
                              backgroundColor: isCredit
                                ? colors.primaryContainer
                                : colors.surfaceContainerHigh,
                            },
                          ]}
                        >
                          <MaterialIcons
                            name={iconName}
                            size={18}
                            color={isCredit ? colors.onPrimaryContainer : colors.primary}
                          />
                        </View>

                        {/* Details */}
                        <View style={styles.itemDetails}>
                          <Text style={styles.itemName} numberOfLines={1}>
                            {displayName}
                          </Text>
                          <Text style={styles.itemMeta} numberOfLines={1}>
                            {bankLabel} {dateLabel ? `• ${dateLabel}` : ''}
                          </Text>
                        </View>

                        {/* Amount & Type Badge */}
                        <View style={styles.itemAmountContainer}>
                          <Text
                            style={[
                              styles.itemAmount,
                              isCredit ? { color: colors.primary } : { color: colors.onSurface },
                            ]}
                            numberOfLines={1}
                          >
                            {isCredit ? '+' : '-'}{formatCurrency(item.amount)}
                          </Text>
                          <View
                            style={[
                              styles.itemBadge,
                              {
                                backgroundColor: isCredit
                                  ? colors.primaryContainer
                                  : colors.surfaceContainerHighest,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.itemBadgeText,
                                {
                                  color: isCredit
                                    ? colors.onPrimaryContainer
                                    : colors.onSurfaceVariant,
                                },
                              ]}
                            >
                              {isCredit ? 'Credit' : 'Debit'}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>

              {/* Action Buttons */}
              <View style={styles.actionsContainer}>
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    {
                      backgroundColor: selectedCount === 0 ? colors.surfaceContainerHighest : colors.primary,
                      opacity: isProcessing ? 0.7 : 1,
                    },
                  ]}
                  onPress={handleFetch}
                  disabled={isProcessing || selectedCount === 0}
                  activeOpacity={0.85}
                >
                  {isProcessing ? (
                    <ActivityIndicator color={colors.onPrimary} size="small" />
                  ) : (
                    <>
                      <MaterialIcons name="done-all" size={20} color={selectedCount === 0 ? colors.outline : colors.onPrimary} />
                      <Text
                        style={[
                          styles.primaryButtonText,
                          { color: selectedCount === 0 ? colors.outline : colors.onPrimary },
                        ]}
                      >
                        {selectedCount === totalCount
                          ? `Fetch All (${selectedCount})`
                          : `Fetch Selected (${selectedCount})`}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.denyButton}
                  onPress={handleDeny}
                  disabled={isProcessing}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.denyButtonText, { color: colors.onSurfaceVariant }]}>
                    Don't Fetch (Deny All)
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

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 24,
      width: '100%',
      maxWidth: 440,
      maxHeight: '90%',
      padding: 20,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.3,
      shadowRadius: 20,
      elevation: 14,
    },
    iconContainer: {
      alignItems: 'center',
      marginBottom: 12,
    },
    iconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      ...typography.headlineSm,
      color: colors.onSurface,
      textAlign: 'center',
      fontWeight: '700',
      marginBottom: 6,
    },
    subtitle: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
      lineHeight: 18,
      fontSize: 13,
      marginBottom: 16,
    },
    summaryBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    summaryInfo: {
      flexDirection: 'column',
    },
    summaryLabel: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      fontWeight: '500',
    },
    summaryAmount: {
      ...typography.headlineSm,
      color: colors.onSurface,
      fontWeight: '700',
      fontSize: 15,
    },
    selectAllButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    selectAllText: {
      ...typography.bodyMd,
      fontSize: 12,
      fontWeight: '600',
    },
    listContainer: {
      maxHeight: 260,
      marginBottom: 16,
    },
    flatList: {
      flexGrow: 0,
    },
    listContent: {
      gap: 8,
    },
    transactionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 14,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      gap: 10,
    },
    itemCheckbox: {
      marginRight: -2,
    },
    itemIconCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      justifyContent: 'center',
      alignItems: 'center',
    },
    itemDetails: {
      flex: 1,
      justifyContent: 'center',
    },
    itemName: {
      ...typography.bodyMd,
      color: colors.onSurface,
      fontWeight: '600',
      fontSize: 13,
    },
    itemMeta: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      fontSize: 11,
      marginTop: 2,
    },
    itemAmountContainer: {
      alignItems: 'flex-end',
      justifyContent: 'center',
      gap: 2,
    },
    itemAmount: {
      ...typography.bodyMd,
      fontWeight: '700',
      fontSize: 13,
    },
    itemBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    itemBadgeText: {
      ...typography.bodyMd,
      fontSize: 10,
      fontWeight: '500',
    },
    actionsContainer: {
      gap: 8,
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 13,
      borderRadius: 14,
    },
    primaryButtonText: {
      ...typography.bodyMd,
      fontWeight: '600',
      fontSize: 14,
    },
    denyButton: {
      alignItems: 'center',
      paddingVertical: 8,
    },
    denyButtonText: {
      ...typography.bodyMd,
      fontWeight: '500',
      fontSize: 13,
    },
  });
  return styles;
};

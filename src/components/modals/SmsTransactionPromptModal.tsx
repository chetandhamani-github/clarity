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
import { useAccounts } from '@/hooks/use-accounts';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateAnalyticsAndHealthQueries } from '@/hooks/use-financial-health';
import { normalizeNotificationMask } from '@/modules/notifications/services/notificationLedgerService';
import { resolveTargetAccountPreview } from '@/modules/notifications/services/notificationLedgerService';
import { getAccountTypeShortLabel } from '@/utils/account-metrics';
import { formatCurrency, formatDate } from '@/utils/format';
import { getAccountTypeIcon, getCategoryIcon } from '@/utils/icons';
import { hasMeaningfulMerchant } from '@/utils/transaction-display';
import type { ParsedTransaction } from '@/modules/sms/types';
import type { Account } from '@/types';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

export function SmsTransactionPromptModal({ visible, onDismiss }: Props) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { accounts } = useAccounts();
  const pendingTransactions = useSmsStore((state) => state.pendingTransactions);
  const importPendingTransactions = useSmsStore((state) => state.importPendingTransactions);
  const dismissPendingTransactions = useSmsStore((state) => state.dismissPendingTransactions);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [accountOverrides, setAccountOverrides] = useState<Record<string, string>>({});
  const [pickingAccountForTxId, setPickingAccountForTxId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Initialize selectedIds and prune stale overrides whenever pendingTransactions changes
  useEffect(() => {
    if (pendingTransactions && pendingTransactions.length > 0) {
      const validIds = new Set(pendingTransactions.map((tx) => tx.id));
      setSelectedIds(validIds);
      setAccountOverrides((prev) => {
        const next: Record<string, string> = {};
        for (const [txId, accId] of Object.entries(prev)) {
          if (validIds.has(txId)) {
            next[txId] = accId;
          }
        }
        return next;
      });
      setPickingAccountForTxId((prev) => (prev && validIds.has(prev) ? prev : null));
    } else {
      setSelectedIds(new Set());
      setAccountOverrides({});
      setPickingAccountForTxId(null);
    }
  }, [pendingTransactions]);

  useEffect(() => {
    if (!visible) {
      setPickingAccountForTxId(null);
    }
  }, [visible]);

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

  const pickingTx = useMemo(
    () => pendingTransactions.find((tx) => tx.id === pickingAccountForTxId) || null,
    [pendingTransactions, pickingAccountForTxId]
  );

  const pickingAutoResolution = useMemo(
    () => (pickingTx ? resolveTargetAccountPreview(pickingTx, accounts) : null),
    [pickingTx, accounts]
  );

  const handleSelectAccountForTx = (txId: string, accountId: string | null) => {
    setAccountOverrides((prev) => {
      const next = { ...prev };
      if (accountId) {
        next[txId] = accountId;
      } else {
        delete next[txId];
      }
      return next;
    });
    setPickingAccountForTxId(null);
  };

  const handleFetch = async () => {
    if (selectedCount === 0) {
      showToast('Please select at least one transaction to fetch.', 'info');
      return;
    }

    setIsProcessing(true);
    try {
      const importedCount = await importPendingTransactions(
        Array.from(selectedIds),
        accountOverrides
      );
      if (importedCount === 0) {
        showToast('Could not import selected transactions. Please try again.', 'error');
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      await queryClient.invalidateQueries({ queryKey: ['totals'] });
      await queryClient.invalidateQueries({ queryKey: ['cashflow'] });
      await queryClient.invalidateQueries({ queryKey: ['safeToSpend'] });
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
              {pickingTx ? (
                <>
                  <View style={styles.pickerHeader}>
                    <TouchableOpacity
                      style={styles.pickerBackBtn}
                      onPress={() => setPickingAccountForTxId(null)}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons name="arrow-back" size={22} color={colors.onSurface} />
                    </TouchableOpacity>
                    <View style={styles.pickerTitleWrap}>
                      <Text style={styles.pickerTitle} numberOfLines={1}>
                        Select Account
                      </Text>
                      <Text style={styles.pickerSubtitle} numberOfLines={1}>
                        {pickingTx.merchant &&
                        hasMeaningfulMerchant({
                          merchant: pickingTx.merchant,
                          category: pickingTx.category,
                        })
                          ? pickingTx.merchant.trim()
                          : pickingTx.category}{' '}
                        • {formatCurrency(pickingTx.amount)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.listContainer}>
                    <FlatList
                      data={accounts}
                      keyExtractor={(item: Account) => item.id}
                      showsVerticalScrollIndicator={true}
                      style={styles.flatList}
                      contentContainerStyle={styles.listContent}
                      ListHeaderComponent={
                        pickingAutoResolution?.reason === 'will_create' &&
                        pickingAutoResolution.willCreateAccountName ? (
                          <TouchableOpacity
                            style={[
                              styles.accountOptionRow,
                              !accountOverrides[pickingTx.id] && {
                                borderColor: colors.primary,
                                backgroundColor: colors.surfaceContainer,
                              },
                            ]}
                            onPress={() => handleSelectAccountForTx(pickingTx.id, null)}
                            activeOpacity={0.7}
                          >
                            <View
                              style={[
                                styles.itemIconCircle,
                                { backgroundColor: colors.primaryContainer },
                              ]}
                            >
                              <MaterialIcons
                                name="add-circle-outline"
                                size={18}
                                color={colors.onPrimaryContainer}
                              />
                            </View>
                            <View style={styles.itemDetails}>
                              <Text style={styles.itemName} numberOfLines={1}>
                                Auto-create {pickingAutoResolution.willCreateAccountName}
                              </Text>
                              <Text style={styles.itemMeta} numberOfLines={1}>
                                New{' '}
                                {getAccountTypeShortLabel(
                                  pickingAutoResolution.willCreateAccountType || 'savings'
                                )}
                              </Text>
                            </View>
                            {!accountOverrides[pickingTx.id] && (
                              <MaterialIcons name="check-circle" size={20} color={colors.primary} />
                            )}
                          </TouchableOpacity>
                        ) : null
                      }
                      renderItem={({ item: acc }: { item: Account }) => {
                        const effectiveSelectedId =
                          accountOverrides[pickingTx.id] || pickingAutoResolution?.account?.id;
                        const isChosen = effectiveSelectedId === acc.id;
                        const showLastFour = Boolean(
                          acc.lastFour && !acc.name.includes(acc.lastFour)
                        );
                        return (
                          <TouchableOpacity
                            style={[
                              styles.accountOptionRow,
                              isChosen && {
                                borderColor: colors.primary,
                                backgroundColor: colors.surfaceContainer,
                              },
                            ]}
                            onPress={() => handleSelectAccountForTx(pickingTx.id, acc.id)}
                            activeOpacity={0.7}
                          >
                            <View
                              style={[
                                styles.itemIconCircle,
                                { backgroundColor: colors.surfaceContainerHigh },
                              ]}
                            >
                              <MaterialIcons
                                name={getAccountTypeIcon(acc.type)}
                                size={18}
                                color={colors.primary}
                              />
                            </View>
                            <View style={styles.itemDetails}>
                              <Text style={styles.itemName} numberOfLines={1}>
                                {acc.name}
                                {showLastFour ? ` ••${acc.lastFour}` : ''}
                              </Text>
                              <Text style={styles.itemMeta} numberOfLines={1}>
                                {getAccountTypeShortLabel(acc.type)} • {formatCurrency(acc.balance)}
                              </Text>
                            </View>
                            {isChosen && (
                              <MaterialIcons name="check-circle" size={20} color={colors.primary} />
                            )}
                          </TouchableOpacity>
                        );
                      }}
                    />
                  </View>

                  <TouchableOpacity
                    style={styles.denyButton}
                    onPress={() => setPickingAccountForTxId(null)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.denyButtonText, { color: colors.primary }]}>Back</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  {/* Header Icon */}
                  <View style={styles.iconContainer}>
                    <View style={[styles.iconCircle, { backgroundColor: colors.primaryContainer }]}>
                      <MaterialIcons
                        name="receipt-long"
                        size={36}
                        color={colors.onPrimaryContainer}
                      />
                    </View>
                  </View>

                  {/* Title & Subtitle */}
                  <Text style={styles.title}>New Transactions Found</Text>
                  <Text style={styles.subtitle}>
                    Clarity detected {totalCount} new banking transaction
                    {totalCount === 1 ? '' : 's'}. Verify the account and select transactions to
                    import.
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
                        name={
                          isAllSelected
                            ? 'check-box'
                            : selectedCount > 0
                              ? 'indeterminate-check-box'
                              : 'check-box-outline-blank'
                        }
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
                      extraData={{ selectedIds, accountOverrides, accounts }}
                      renderItem={({ item }: { item: ParsedTransaction }) => {
                        const isSelected = selectedIds.has(item.id);
                        const isCredit = item.type === 'CREDIT';
                        const iconName = getCategoryIcon(item.category);
                        const displayName =
                          item.merchant &&
                          hasMeaningfulMerchant({
                            merchant: item.merchant,
                            category: item.category,
                          })
                            ? item.merchant.trim()
                            : item.category;

                        const cleanMask = normalizeNotificationMask(item.accountMask);
                        const bankLabel = cleanMask
                          ? `${item.bank || 'Bank'} (..${cleanMask})`
                          : item.bank || 'Bank / UPI';

                        const dateLabel = item.timestamp
                          ? formatDate(new Date(item.timestamp).toISOString(), 'short')
                          : '';

                        const resolution = resolveTargetAccountPreview(
                          item,
                          accounts,
                          accountOverrides[item.id]
                        );
                        const resolvedAcc = resolution.account;
                        const accountPillLabel = resolvedAcc
                          ? `${resolvedAcc.name}${
                              resolvedAcc.lastFour && !resolvedAcc.name.includes(resolvedAcc.lastFour)
                                ? ` (..${resolvedAcc.lastFour})`
                                : ''
                            }${
                              resolution.reason === 'primary_fallback' ||
                              resolution.reason === 'default_fallback'
                                ? ' • Auto'
                                : ''
                            }`
                          : `New: ${resolution.willCreateAccountName || bankLabel}`;

                        return (
                          <View
                            style={[
                              styles.transactionItem,
                              isSelected && {
                                borderColor: colors.primary,
                                backgroundColor: colors.surfaceContainer,
                              },
                            ]}
                          >
                            <TouchableOpacity
                              style={styles.transactionRowMain}
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
                                    isCredit
                                      ? { color: colors.primary }
                                      : { color: colors.onSurface },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {isCredit ? '+' : '-'}
                                  {formatCurrency(item.amount)}
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

                            {accounts.length > 0 && (
                              <TouchableOpacity
                                style={styles.accountPillButton}
                                onPress={() => setPickingAccountForTxId(item.id)}
                                activeOpacity={0.7}
                              >
                                <MaterialIcons
                                  name={
                                    resolvedAcc
                                      ? getAccountTypeIcon(resolvedAcc.type)
                                      : 'add-circle-outline'
                                  }
                                  size={14}
                                  color={colors.primary}
                                />
                                <Text style={styles.accountPillText} numberOfLines={1}>
                                  {accountPillLabel}
                                </Text>
                                <MaterialIcons
                                  name="expand-more"
                                  size={16}
                                  color={colors.onSurfaceVariant}
                                />
                              </TouchableOpacity>
                            )}
                          </View>
                        );
                      }}
                    />
                  </View>

                  {/* Action Buttons */}
                  <View style={styles.actionsContainer}>
                    <TouchableOpacity
                      style={[
                        styles.primaryButton,
                        selectedCount === 0
                          ? styles.primaryButtonEmpty
                          : styles.primaryButtonActive,
                        isProcessing && styles.primaryButtonProcessing,
                      ]}
                      onPress={handleFetch}
                      disabled={isProcessing || selectedCount === 0}
                      activeOpacity={0.85}
                    >
                      {isProcessing ? (
                        <ActivityIndicator color={colors.onPrimary} size="small" />
                      ) : (
                        <>
                          <MaterialIcons
                            name="done-all"
                            size={20}
                            color={selectedCount === 0 ? colors.outline : colors.onPrimary}
                          />
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
                        Don&apos;t Fetch (Deny All)
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
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
    pickerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 14,
    },
    pickerBackBtn: {
      padding: 4,
    },
    pickerTitleWrap: {
      flex: 1,
    },
    pickerTitle: {
      ...typography.headlineSm,
      fontSize: 17,
      fontWeight: '700',
      color: colors.onSurface,
    },
    pickerSubtitle: {
      ...typography.bodyMd,
      fontSize: 12,
      color: colors.onSurfaceVariant,
      marginTop: 2,
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
      maxHeight: 280,
      marginBottom: 16,
    },
    flatList: {
      flexGrow: 0,
    },
    listContent: {
      gap: 8,
    },
    transactionItem: {
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 14,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      gap: 8,
    },
    transactionRowMain: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    accountOptionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 14,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      gap: 10,
    },
    accountPillButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      marginLeft: 30,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
      backgroundColor: colors.surfaceContainerHighest,
    },
    accountPillText: {
      ...typography.bodyMd,
      fontSize: 11,
      fontWeight: '600',
      color: colors.onSurface,
      maxWidth: 230,
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
    primaryButtonActive: {
      backgroundColor: colors.primary,
    },
    primaryButtonEmpty: {
      backgroundColor: colors.surfaceContainerHighest,
    },
    primaryButtonProcessing: {
      opacity: 0.7,
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

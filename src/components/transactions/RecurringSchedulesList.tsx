import React, { useCallback, useMemo } from 'react';
import {
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Text, ListSkeleton } from '@/components/ui';
import { radius, ThemeColors, typography, useTheme } from '@/theme';
import { formatCurrencyPrivacy, formatDate } from '@/utils/format';
import { getCategoryIcon } from '@/utils/icons';
import { isLiabilityAccountType } from '@/utils/account-metrics';
import { getTransactionDisplayName } from '@/utils/transaction-display';
import type { Account, RecurringTransactionWithAccount, TransactionType } from '@/types';

interface RecurringSchedulesListProps {
  schedules: RecurringTransactionWithAccount[];
  accounts: Account[];
  isLoading: boolean;
  hideBalances: boolean;
  lockedAccountId?: string;
  bottomInset: number;
  ListHeaderComponent: React.ReactElement | null;
  onAddRecurring: (opts?: {
    type?: TransactionType;
    accountId?: string;
    toAccountId?: string;
  }) => void;
  onToggleActive: (id: string, isActive: boolean) => void;
  onDeleteSchedule: (schedule: RecurringTransactionWithAccount) => void;
  onPayNow: (schedule: RecurringTransactionWithAccount) => void;
}

function toMonthlyEquivalent(amount: number, frequency: RecurringTransactionWithAccount['frequency']): number {
  switch (frequency) {
    case 'daily':
      return amount * 30;
    case 'weekly':
      return amount * 4.33;
    case 'yearly':
      return amount / 12;
    case 'monthly':
    default:
      return amount;
  }
}

interface ScheduleCardProps {
  item: RecurringTransactionWithAccount;
  accountById: Map<string, Account>;
  hideBalances: boolean;
  lockedAccountId?: string;
  colors: ThemeColors;
  styles: ReturnType<typeof getStyles>;
  onToggleActive: (id: string, isActive: boolean) => void;
  onDeleteSchedule: (schedule: RecurringTransactionWithAccount) => void;
  onPayNow: (schedule: RecurringTransactionWithAccount) => void;
}

const RecurringScheduleCard = React.memo(function RecurringScheduleCard({
  item,
  accountById,
  hideBalances,
  lockedAccountId,
  colors,
  styles,
  onToggleActive,
  onDeleteSchedule,
  onPayNow,
}: ScheduleCardProps) {
  const toAccount = item.toAccountId ? accountById.get(item.toAccountId) : undefined;
  const isDebtPaydown = Boolean(
    item.type === 'transfer' && toAccount && isLiabilityAccountType(toAccount.type)
  );
  const isIncomingToLocked = Boolean(
    lockedAccountId && item.type === 'transfer' && item.toAccountId === lockedAccountId
  );
  const isCredit = item.type === 'income' || isIncomingToLocked;

  const remainingDebt =
    isDebtPaydown && toAccount && toAccount.balance < 0
      ? Math.round(Math.abs(toAccount.balance) * 100) / 100
      : 0;
  const isSettled = isDebtPaydown && Boolean(toAccount) && remainingDebt <= 0;

  const displayTitle =
    item.type === 'transfer' && getTransactionDisplayName(item) === 'Transfer'
      ? isDebtPaydown && toAccount
        ? `Pay ${toAccount.name}`
        : 'Account Transfer'
      : getTransactionDisplayName(item);

  const flowLabel =
    item.type === 'transfer'
      ? `From ${item.accountName}  →  To ${item.toAccountName || 'Unknown'}`
      : `${item.accountName} • ${item.category}`;

  const freqLabel = item.frequency.charAt(0).toUpperCase() + item.frequency.slice(1);
  const iconName =
    item.type === 'transfer'
      ? isDebtPaydown
        ? 'account-balance'
        : 'swap-horiz'
      : item.type === 'income'
      ? 'payments'
      : getCategoryIcon(item.category);

  const amountPrefix = isCredit ? '+' : '-';

  return (
    <View style={[styles.scheduleCard, !item.isActive && styles.scheduleCardPaused]}>
      <View style={styles.cardTopRow}>
        <View
          style={[
            styles.iconCircle,
            {
              backgroundColor: isDebtPaydown
                ? colors.primaryContainer
                : item.type === 'income'
                ? 'rgba(16, 185, 129, 0.14)'
                : colors.surfaceContainerHigh,
            },
          ]}
        >
          <MaterialIcons
            name={iconName}
            size={20}
            color={
              isDebtPaydown
                ? colors.onPrimaryContainer
                : item.type === 'income'
                ? '#10B981'
                : colors.onSurfaceVariant
            }
          />
        </View>

        <View style={styles.cardMainCol}>
          <View style={styles.titleRow}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {displayTitle}
            </Text>
            {isDebtPaydown && (
              <View style={[styles.badgePill, { backgroundColor: colors.primaryContainer }]}>
                <Text style={[styles.badgePillText, { color: colors.onPrimaryContainer }]} numberOfLines={1}>
                  Debt Paydown
                </Text>
              </View>
            )}
            {!item.isActive ? (
              <View style={[styles.badgePill, { backgroundColor: colors.surfaceContainerHigh }]}>
                <Text style={[styles.badgePillText, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
                  Paused
                </Text>
              </View>
            ) : isSettled ? (
              <View style={[styles.badgePill, { backgroundColor: 'rgba(16, 185, 129, 0.16)' }]}>
                <Text style={[styles.badgePillText, { color: '#10B981' }]} numberOfLines={1}>
                  Paid Off
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.flowText} numberOfLines={1}>
            {flowLabel}
          </Text>

          <View style={styles.metaRow}>
            <MaterialIcons name="event-repeat" size={13} color={colors.onSurfaceVariant} />
            <Text style={styles.metaText} numberOfLines={1}>
              {freqLabel}
              {item.nextProcessDate ? ` • Next: ${formatDate(item.nextProcessDate, 'short')}` : ''}
            </Text>
          </View>

          {isDebtPaydown && toAccount && (
            <Text style={styles.debtHintText} numberOfLines={1}>
              {remainingDebt > 0
                ? `Reduces ${toAccount.name} debt (${formatCurrencyPrivacy(remainingDebt, false, hideBalances)} remaining)`
                : `${toAccount.name} balance is settled`}
            </Text>
          )}
        </View>

        <View style={styles.amountCol}>
          <Text
            style={[
              styles.amountText,
              {
                color: !item.isActive
                  ? colors.onSurfaceVariant
                  : isCredit
                  ? colors.primary
                  : colors.onSurface,
              },
            ]}
            numberOfLines={1}
          >
            {`${amountPrefix}${formatCurrencyPrivacy(item.amount, false, hideBalances)}`}
          </Text>
          <Text style={styles.perCycleText}>/{item.frequency === 'daily' ? 'day' : item.frequency === 'weekly' ? 'wk' : item.frequency === 'yearly' ? 'yr' : 'mo'}</Text>
        </View>
      </View>

      <View style={styles.cardFooterRow}>
        <View style={styles.switchRow}>
          <Switch
            value={item.isActive}
            onValueChange={(next) => onToggleActive(item.id, next)}
            trackColor={{ false: colors.surfaceVariant, true: colors.primary }}
          />
          <Text style={[styles.switchLabel, { color: item.isActive ? colors.onSurface : colors.onSurfaceVariant }]}>
            {item.isActive ? 'Auto-active' : 'Paused'}
          </Text>
        </View>

        <View style={styles.cardActionBtns}>
          <TouchableOpacity
            style={styles.payNowBtn}
            onPress={() => onPayNow(item)}
            activeOpacity={0.75}
          >
            <MaterialIcons name="bolt" size={15} color={colors.primary} />
            <Text style={styles.payNowText}>Record Now</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => onDeleteSchedule(item)}
            accessibilityLabel={`Cancel ${displayTitle} schedule`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="delete-outline" size={19} color={colors.error} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

export function RecurringSchedulesList({
  schedules,
  accounts,
  isLoading,
  hideBalances,
  lockedAccountId,
  bottomInset,
  ListHeaderComponent,
  onAddRecurring,
  onToggleActive,
  onDeleteSchedule,
  onPayNow,
}: RecurringSchedulesListProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const accountById = useMemo(
    () => new Map(accounts.map((acc) => [acc.id, acc])),
    [accounts]
  );

  const visibleSchedules = useMemo(() => {
    if (!lockedAccountId) return schedules;
    return schedules.filter(
      (s) => s.accountId === lockedAccountId || s.toAccountId === lockedAccountId
    );
  }, [schedules, lockedAccountId]);

  const summary = useMemo(() => {
    let activeCount = 0;
    let monthlyOutflow = 0;
    const coveredDebtAccountIds = new Set<string>();

    for (const rt of visibleSchedules) {
      if (!rt.isActive) continue;
      activeCount++;
      const toAcc = rt.toAccountId ? accountById.get(rt.toAccountId) : undefined;
      const isDebtTransfer = Boolean(
        rt.type === 'transfer' && toAcc && isLiabilityAccountType(toAcc.type)
      );
      if (isDebtTransfer && rt.toAccountId) {
        coveredDebtAccountIds.add(rt.toAccountId);
      }
      if (rt.type === 'expense' || isDebtTransfer) {
        monthlyOutflow += toMonthlyEquivalent(rt.amount, rt.frequency);
      }
    }

    const uncoveredDebts = accounts.filter((acc) => {
      if (!isLiabilityAccountType(acc.type) || acc.balance >= 0) return false;
      if (lockedAccountId && acc.id !== lockedAccountId) return false;
      return !coveredDebtAccountIds.has(acc.id);
    });

    return {
      activeCount,
      monthlyOutflow: Math.round(monthlyOutflow),
      uncoveredDebts,
    };
  }, [visibleSchedules, accounts, accountById, lockedAccountId]);

  const combinedHeader = useMemo(
    () => (
      <View>
        {ListHeaderComponent}
        <View style={styles.summaryWrapper}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryTopRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryEyebrow}>RECURRING SCHEDULES</Text>
                <Text style={styles.summaryHeadline} numberOfLines={1} adjustsFontSizeToFit>
                  {formatCurrencyPrivacy(summary.monthlyOutflow, false, hideBalances)}
                  <Text style={styles.summaryHeadlineSub}> / mo committed</Text>
                </Text>
                <Text style={styles.summaryCaption}>
                  {summary.activeCount} active {summary.activeCount === 1 ? 'schedule' : 'schedules'} • Expenses & Debt Paydowns
                </Text>
              </View>

              <TouchableOpacity
                style={styles.addScheduleBtn}
                onPress={() => {
                  const lockedAcc = lockedAccountId ? accountById.get(lockedAccountId) : undefined;
                  if (lockedAcc && isLiabilityAccountType(lockedAcc.type)) {
                    onAddRecurring({ type: 'transfer', toAccountId: lockedAcc.id });
                  } else if (lockedAcc) {
                    onAddRecurring({ accountId: lockedAcc.id });
                  } else {
                    onAddRecurring();
                  }
                }}
                activeOpacity={0.8}
              >
                <MaterialIcons name="add" size={18} color={colors.onPrimary} />
                <Text style={styles.addScheduleBtnText}>Schedule</Text>
              </TouchableOpacity>
            </View>

            {summary.uncoveredDebts.length > 0 && (
              <View style={styles.debtPromptBox}>
                <View style={styles.debtPromptHeader}>
                  <MaterialIcons name="account-balance" size={15} color={colors.primary} />
                  <Text style={styles.debtPromptTitle}>
                    Set up auto-pay from your bank to reduce debt balances:
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingTop: 8 }}
                >
                  {summary.uncoveredDebts.slice(0, 4).map((debtAcc) => (
                    <TouchableOpacity
                      key={debtAcc.id}
                      style={styles.debtQuickChip}
                      onPress={() =>
                        onAddRecurring({ type: 'transfer', toAccountId: debtAcc.id })
                      }
                      activeOpacity={0.75}
                    >
                      <Text style={styles.debtQuickChipText} numberOfLines={1}>
                        Pay {debtAcc.name} ({formatCurrencyPrivacy(Math.abs(debtAcc.balance), false, hideBalances)})
                      </Text>
                      <MaterialIcons name="arrow-forward" size={14} color={colors.primary} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </View>
    ),
    [
      ListHeaderComponent,
      styles,
      summary,
      hideBalances,
      colors,
      lockedAccountId,
      accountById,
      onAddRecurring,
    ]
  );

  const renderItem = useCallback(
    ({ item }: { item: RecurringTransactionWithAccount }) => (
      <RecurringScheduleCard
        item={item}
        accountById={accountById}
        hideBalances={hideBalances}
        lockedAccountId={lockedAccountId}
        colors={colors}
        styles={styles}
        onToggleActive={onToggleActive}
        onDeleteSchedule={onDeleteSchedule}
        onPayNow={onPayNow}
      />
    ),
    [
      accountById,
      hideBalances,
      lockedAccountId,
      colors,
      styles,
      onToggleActive,
      onDeleteSchedule,
      onPayNow,
    ]
  );

  const renderEmpty = useCallback(() => {
    if (isLoading) {
      return (
        <View style={{ paddingHorizontal: 20 }}>
          <ListSkeleton count={4} />
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <MaterialIcons name="autorenew" size={38} color={colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>No Recurring Schedules Yet</Text>
        <Text style={styles.emptyDescription}>
          Automate recurring bills, subscriptions, salaries, or monthly Bank → Loan payments that reduce your debt balance automatically.
        </Text>
        <TouchableOpacity
          style={styles.emptyActionBtn}
          onPress={() => onAddRecurring()}
          activeOpacity={0.8}
        >
          <MaterialIcons name="add" size={18} color={colors.onPrimary} />
          <Text style={styles.emptyActionBtnText}>Schedule Recurring Payment</Text>
        </TouchableOpacity>
      </View>
    );
  }, [isLoading, styles, colors, onAddRecurring]);

  return (
    <FlatList
      data={visibleSchedules}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListHeaderComponent={combinedHeader}
      ListEmptyComponent={renderEmpty}
      contentContainerStyle={{ paddingBottom: bottomInset + 100 }}
      showsVerticalScrollIndicator={false}
      removeClippedSubviews={Platform.OS === 'android'}
      initialNumToRender={10}
      maxToRenderPerBatch={6}
      windowSize={5}
    />
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    summaryWrapper: {
      paddingHorizontal: 20,
      marginBottom: 14,
    },
    summaryCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: 16,
      gap: 12,
    },
    summaryTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    summaryEyebrow: {
      ...typography.labelMd,
      fontSize: 10,
      color: colors.onSurfaceVariant,
      letterSpacing: 0.6,
    },
    summaryHeadline: {
      ...typography.headlineSm,
      color: colors.onSurface,
      fontFamily: 'Manrope_700Bold',
      marginTop: 2,
    },
    summaryHeadlineSub: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      fontFamily: 'Manrope_500Medium',
    },
    summaryCaption: {
      ...typography.bodyMd,
      fontSize: 12,
      color: colors.onSurfaceVariant,
      marginTop: 2,
    },
    addScheduleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: radius.full,
      flexShrink: 0,
    },
    addScheduleBtnText: {
      ...typography.labelMd,
      color: colors.onPrimary,
      fontFamily: 'Manrope_700Bold',
    },
    debtPromptBox: {
      borderTopWidth: 1,
      borderTopColor: colors.surfaceContainerHigh,
      paddingTop: 10,
    },
    debtPromptHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    debtPromptTitle: {
      ...typography.labelMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      flex: 1,
    },
    debtQuickChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primaryContainer + '55',
      borderWidth: 1,
      borderColor: colors.primary + '40',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: radius.full,
    },
    debtQuickChipText: {
      ...typography.labelMd,
      fontSize: 12,
      color: colors.primary,
      fontFamily: 'Manrope_600SemiBold',
    },
    scheduleCard: {
      marginHorizontal: 20,
      marginBottom: 12,
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 14,
      gap: 12,
    },
    scheduleCardPaused: {
      opacity: 0.72,
    },
    cardTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    iconCircle: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    cardMainCol: {
      flex: 1,
      gap: 3,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
    },
    cardTitle: {
      ...typography.bodyLg,
      fontFamily: 'Manrope_700Bold',
      color: colors.onSurface,
      flexShrink: 1,
    },
    badgePill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    badgePillText: {
      ...typography.labelMd,
      fontSize: 10,
      fontFamily: 'Manrope_700Bold',
    },
    flowText: {
      ...typography.bodyMd,
      fontSize: 12,
      color: colors.onSurfaceVariant,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 1,
    },
    metaText: {
      ...typography.labelMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
    },
    debtHintText: {
      ...typography.labelMd,
      fontSize: 11,
      color: colors.primary,
      marginTop: 2,
    },
    amountCol: {
      alignItems: 'flex-end',
      flexShrink: 0,
    },
    amountText: {
      ...typography.bodyLg,
      fontFamily: 'Manrope_700Bold',
    },
    perCycleText: {
      ...typography.labelMd,
      fontSize: 10,
      color: colors.onSurfaceVariant,
    },
    cardFooterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: colors.surfaceContainer,
      paddingTop: 10,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    switchLabel: {
      ...typography.labelMd,
      fontSize: 12,
    },
    cardActionBtns: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    payNowBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radius.full,
    },
    payNowText: {
      ...typography.labelMd,
      fontSize: 12,
      color: colors.primary,
      fontFamily: 'Manrope_700Bold',
    },
    deleteBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.error + '14',
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyContainer: {
      alignItems: 'center',
      paddingHorizontal: 32,
      paddingTop: 32,
      gap: 12,
    },
    emptyIconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.primaryContainer + '50',
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
      textAlign: 'center',
    },
    emptyDescription: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
      lineHeight: 20,
    },
    emptyActionBtn: {
      marginTop: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primary,
      paddingHorizontal: 18,
      paddingVertical: 11,
      borderRadius: radius.full,
    },
    emptyActionBtnText: {
      ...typography.labelMd,
      color: colors.onPrimary,
      fontFamily: 'Manrope_700Bold',
    },
  });


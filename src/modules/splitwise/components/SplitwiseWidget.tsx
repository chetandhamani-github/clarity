import React, { useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, DeviceEventEmitter, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui';
import { typography, useTheme, radius } from '@/theme';
import { useAppStore } from '@/store/use-app-store';
import { formatCurrencyPrivacy } from '@/utils/format';
import { useSplitwiseStore } from '../store/splitwise.store';
import { BalanceCalculator } from '../services/BalanceCalculator';

export function SplitwiseWidget() {
  const { colors } = useTheme();
  const router = useRouter();
  const { hideBalances } = useAppStore();

  const { people, debts, settlements, expenses, loadAllData } = useSplitwiseStore();

  const handleRefresh = useCallback(() => {
    loadAllData();
  }, [loadAllData]);

  useEffect(() => {
    handleRefresh();
    const sub = DeviceEventEmitter.addListener('splitwiseUpdated', () => {
      handleRefresh();
    });
    return () => {
      sub.remove();
    };
  }, [handleRefresh]);

  const summary = useMemo(() => {
    return BalanceCalculator.calculateOverallSummary(people, debts, settlements);
  }, [people, debts, settlements]);

  const peopleBalances = useMemo(() => {
    return BalanceCalculator.calculatePeopleBalances(people, debts, settlements, expenses);
  }, [people, debts, settlements, expenses]);

  const peopleWhoOweMeCount = useMemo(() => {
    return peopleBalances.filter((pb) => pb.status === 'OWED_TO_ME').length;
  }, [peopleBalances]);

  const peopleIOweCount = useMemo(() => {
    return peopleBalances.filter((pb) => pb.status === 'YOU_OWE').length;
  }, [peopleBalances]);

  const netBalance = summary.netBalance;
  const isOwed = netBalance > 0;
  const isOwe = netBalance < 0;

  const handlePress = () => {
    router.navigate('/(app)/splitwise');
  };

  const handleRecordSettlement = () => {
    router.navigate('/(app)/add-splitwise-settlement');
  };

  const handleAddExpense = () => {
    router.navigate('/(app)/add-splitwise-expense');
  };

  return (
    <View style={styles.container}>
      {/* Widget Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={[styles.title, { color: colors.onSurface }]}>Receivables & Payables</Text>
          {summary.activePeopleCount > 0 && (
            <View style={[styles.countBadge, { backgroundColor: colors.primaryContainer }]}>
              <Text style={[styles.countBadgeText, { color: colors.onPrimaryContainer }]} numberOfLines={1}>
                {summary.activePeopleCount} active
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={handlePress}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.viewAllButton}
        >
          <Text style={[styles.viewAllText, { color: colors.primary }]}>VIEW ALL</Text>
        </TouchableOpacity>
      </View>

      {/* Main Container Card */}
      <TouchableOpacity
        style={[
          styles.mainCard,
          {
            backgroundColor: colors.surfaceContainerLowest,
            borderColor: colors.surfaceVariant,
          },
        ]}
        onPress={handlePress}
        activeOpacity={0.9}
      >
        {/* Net Standing Header Banner */}
        <View style={[styles.netStandingBanner, { backgroundColor: colors.surfaceContainerLow }]}>
          <View style={styles.netStandingLeft}>
            <View
              style={[
                styles.netIconDot,
                isOwed ? styles.netIconOwed : isOwe ? styles.netIconOwe : styles.netIconSettled,
              ]}
            >
              <MaterialIcons
                name={isOwed ? 'trending-up' : isOwe ? 'trending-down' : 'done-all'}
                size={16}
                color={isOwed ? '#10b981' : isOwe ? '#ef4444' : '#06b6d4'}
              />
            </View>
            <View>
              <Text style={[styles.netStandingLabel, { color: colors.onSurfaceVariant }]}>
                NET BALANCE
              </Text>
              <Text
                style={[
                  styles.netStandingValue,
                  { color: colors.onSurface },
                  isOwed && styles.textOwed,
                  isOwe && styles.textOwe,
                ]}
              >
                {netBalance === 0
                  ? 'All Settled Up (₹0)'
                  : `${isOwed ? '+' : '-'}${formatCurrencyPrivacy(Math.abs(netBalance), hideBalances)}`}
              </Text>
            </View>
          </View>

          <View style={styles.chevronWrapper}>
            <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
          </View>
        </View>

        {/* Dual Split Cards: Receivables vs Payables */}
        {people.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View
              style={[
                styles.emptyIconCircle,
                { backgroundColor: colors.surfaceContainerHigh },
              ]}
            >
              <MaterialIcons name="groups" size={26} color={colors.primary} />
            </View>
            <View style={styles.emptyContent}>
              <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>
                Shared Expenses & Group Bills
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.onSurfaceVariant }]}>
                Split dining, trips, or flatmate bills with friends and auto-reconcile settlements.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.emptyAddBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.navigate('/(app)/add-splitwise-expense')}
              activeOpacity={0.8}
            >
              <MaterialIcons name="add" size={16} color={colors.onPrimary} />
              <Text style={[styles.emptyAddBtnText, { color: colors.onPrimary }]}>
                Add Expense
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.metricsRow}>
              {/* Receivables Card */}
              <View style={[styles.metricCard, styles.receivableCard]}>
                <View style={styles.metricHeaderRow}>
                  <View style={[styles.metricIconCircle, styles.receivableIconCircle]}>
                    <MaterialIcons name="call-received" size={14} color="#10b981" />
                  </View>
                  <Text style={[styles.metricLabel, styles.receivableLabel]}>RECEIVABLES</Text>
                </View>

                <Text style={[styles.metricAmount, styles.textOwed]} numberOfLines={1} adjustsFontSizeToFit>
                  +{formatCurrencyPrivacy(summary.remainingReceivable, hideBalances)}
                </Text>

                <Text style={[styles.metricSubtext, { color: colors.onSurfaceVariant }]}>
                  {peopleWhoOweMeCount > 0
                    ? `${peopleWhoOweMeCount} ${peopleWhoOweMeCount === 1 ? 'friend owes' : 'friends owe'} you`
                    : 'None pending'}
                </Text>
              </View>

              {/* Payables Card */}
              <View style={[styles.metricCard, styles.payableCard]}>
                <View style={styles.metricHeaderRow}>
                  <View style={[styles.metricIconCircle, styles.payableIconCircle]}>
                    <MaterialIcons name="call-made" size={14} color="#ef4444" />
                  </View>
                  <Text style={[styles.metricLabel, styles.payableLabel]}>PAYABLES</Text>
                </View>

                <Text style={[styles.metricAmount, styles.textOwe]} numberOfLines={1} adjustsFontSizeToFit>
                  -{formatCurrencyPrivacy(summary.remainingPayable, hideBalances)}
                </Text>

                <Text style={[styles.metricSubtext, { color: colors.onSurfaceVariant }]}>
                  {peopleIOweCount > 0
                    ? `You owe ${peopleIOweCount} ${peopleIOweCount === 1 ? 'friend' : 'friends'}`
                    : 'None pending'}
                </Text>
              </View>
            </View>

            {/* Quick Action Buttons Bar */}
            <View style={[styles.actionsRow, { borderTopColor: colors.outlineVariant }]}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.surfaceContainerHigh }]}
                onPress={handleRecordSettlement}
                activeOpacity={0.8}
              >
                <MaterialIcons name="handshake" size={16} color={colors.primary} />
                <Text style={[styles.actionBtnText, { color: colors.primary }]}>
                  Record Settlement
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.surfaceContainerHigh }]}
                onPress={handleAddExpense}
                activeOpacity={0.8}
              >
                <MaterialIcons name="group-add" size={16} color={colors.primary} />
                <Text style={[styles.actionBtnText, { color: colors.primary }]}>
                  Split Expense
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </TouchableOpacity>
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
    borderRadius: radius.full,
    flexShrink: 0,
  },
  countBadgeText: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    lineHeight: 15,
  },
  viewAllButton: {
    paddingVertical: 4,
    paddingHorizontal: 4,
    flexShrink: 0,
  },
  viewAllText: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
    ...(Platform.OS === 'ios' ? { letterSpacing: 0.5 } : {}),
  },
  mainCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  netStandingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  netStandingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  netIconDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  netStandingLabel: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    ...(Platform.OS === 'ios' ? { letterSpacing: 0.8 } : {}),
  },
  netStandingValue: {
    ...typography.headlineSm,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    lineHeight: 22,
  },
  chevronWrapper: {
    padding: 2,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    paddingBottom: 12,
  },
  metricCard: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 12,
  },
  metricHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  metricIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 10,
    ...(Platform.OS === 'ios' ? { letterSpacing: 0.5 } : {}),
  },
  metricAmount: {
    ...typography.headlineSm,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 2,
  },
  metricSubtext: {
    ...typography.bodyMd,
    fontSize: 11,
    lineHeight: 15,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  actionBtnText: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
    lineHeight: 16,
  },
  emptyContainer: {
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyContent: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  emptyTitle: {
    ...typography.bodyMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...typography.bodyMd,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 2,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    marginTop: 6,
  },
  emptyAddBtnText: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
    lineHeight: 16,
  },
  netIconOwed: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  netIconOwe: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  netIconSettled: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
  },
  textOwed: {
    color: '#10b981',
  },
  textOwe: {
    color: '#ef4444',
  },
  receivableCard: {
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  receivableIconCircle: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  receivableLabel: {
    color: '#059669',
  },
  payableCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  payableIconCircle: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  payableLabel: {
    color: '#dc2626',
  },
});

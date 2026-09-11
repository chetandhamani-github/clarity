import React, { useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, DeviceEventEmitter } from 'react-native';
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

  const { people, debts, settlements, loadAllData } = useSplitwiseStore();

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

  const netBalance = summary.netBalance;
  const isOwed = netBalance > 0;
  const isOwe = netBalance < 0;
  const isSettled = netBalance === 0;

  const statusLabel = isOwed
    ? 'You Are Owed'
    : isOwe
      ? 'You Owe'
      : 'All Settled Up';

  const statusColor = isOwed ? '#10b981' : isOwe ? '#ef4444' : '#06b6d4';
  const statusBg = isOwed
    ? 'rgba(16, 185, 129, 0.12)'
    : isOwe
      ? 'rgba(239, 68, 68, 0.12)'
      : 'rgba(6, 182, 212, 0.12)';

  const handlePress = () => {
    router.push('/(app)/splitwise');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={[styles.title, { color: colors.onSurface }]}>Splitwise</Text>
          {summary.activePeopleCount > 0 && (
            <View style={[styles.countBadge, { backgroundColor: colors.primaryContainer }]}>
              <Text style={[styles.countBadgeText, { color: colors.onPrimaryContainer }]}>
                {summary.activePeopleCount} {summary.activePeopleCount === 1 ? 'friend' : 'friends'}
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

      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceContainerLowest,
            borderColor: colors.surfaceVariant,
          },
        ]}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        <View style={styles.cardLeft}>
          <View style={[styles.iconCircle, { backgroundColor: statusBg }]}>
            <MaterialIcons
              name={isOwed ? 'call-received' : isOwe ? 'call-made' : 'group'}
              size={22}
              color={statusColor}
            />
          </View>

          <View style={styles.infoCol}>
            <Text style={[styles.statusLabel, { color: colors.onSurfaceVariant }]}>
              {statusLabel}
            </Text>
            <Text style={[styles.netBalanceText, { color: statusColor }]}>
              {formatCurrencyPrivacy(Math.abs(netBalance), hideBalances)}
            </Text>

            {people.length > 0 && (
              <View style={styles.metaRow}>
                <Text style={[styles.metaText, { color: colors.onSurfaceVariant }]}>
                  {summary.totalReceivable > 0 && (
                    <Text style={{ color: '#10b981', fontWeight: '600' }}>
                      +₹{summary.totalReceivable}
                    </Text>
                  )}
                  {summary.totalReceivable > 0 && summary.totalPayable > 0 && '  •  '}
                  {summary.totalPayable > 0 && (
                    <Text style={{ color: '#ef4444', fontWeight: '600' }}>
                      -₹{summary.totalPayable}
                    </Text>
                  )}
                  {summary.totalReceivable === 0 && summary.totalPayable === 0 && 'No pending debts'}
                </Text>
              </View>
            )}

            {people.length === 0 && (
              <Text style={[styles.metaText, { color: colors.onSurfaceVariant }]}>
                Track split bills & debts with friends
              </Text>
            )}
          </View>
        </View>

        <View style={styles.cardRight}>
          <View
            style={[
              styles.arrowCircle,
              { backgroundColor: colors.surfaceContainerHigh },
            ]}
          >
            <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
          </View>
        </View>
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCol: {
    flex: 1,
  },
  statusLabel: {
    ...typography.labelMd,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  netBalanceText: {
    ...typography.headlineSm,
    fontSize: 22,
    fontWeight: '800',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  metaText: {
    ...typography.bodyMd,
    fontSize: 12,
    marginTop: 2,
  },
  cardRight: {
    marginLeft: 8,
  },
  arrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

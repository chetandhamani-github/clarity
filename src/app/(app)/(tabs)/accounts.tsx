import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Text, Header, AccountsSkeleton } from '@/components/ui';
import { spacing, typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { LineChart } from 'react-native-gifted-charts';
import { useAccounts } from '@/hooks/use-accounts';
import { useAccountHistory } from '@/hooks/use-transactions';
import {
  formatCurrency,
  formatCurrencyWhole,
  formatCurrencyPrivacy,
  formatCurrencyWholePrivacy,
} from '@/utils/format';
import { getAccountTypeIcon } from '@/utils/icons';
import type { Account } from '@/types';
import { useAppStore } from '@/store/use-app-store';

export default function AccountsScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accounts, isLoading, refetch } = useAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const { hideBalances, toggleHideBalances } = useAppStore();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? accounts[0] ?? null;
  const isLiabilityType = (type: string) => ['credit', 'loan', 'borrowed'].includes(type);

  const assetAccounts = accounts.filter((a) => !isLiabilityType(a.type));
  const liabilityAccounts = accounts.filter((a) => isLiabilityType(a.type));

  const totalAssets = assetAccounts.reduce((sum, a) => sum + Math.max(0, a.balance), 0);
  const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + Math.abs(a.balance), 0);
  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

  const renderAccountRow = (account: Account) => {
    const isSelected = selectedAccount?.id === account.id;
    const isDebt = isLiabilityType(account.type) && account.balance < 0;

    return (
      <TouchableOpacity
        key={account.id}
        style={isSelected ? styles.accountItemActive : styles.accountItemInactive}
        onPress={() => setSelectedAccountId(account.id)}
      >
        <View style={styles.accountItemLeft}>
          <View
            style={[
              styles.accountIconContainer,
              {
                backgroundColor: isSelected
                  ? colors.primaryContainer
                  : colors.surfaceVariant,
              },
            ]}
          >
            <MaterialIcons
              name={getAccountTypeIcon(account.type)}
              size={24}
              color={isSelected ? colors.onPrimaryContainer : colors.secondary}
            />
          </View>
          <View>
            <Text style={styles.accountName}>{account.name}</Text>
            <Text style={styles.accountType}>
              {account.type.charAt(0).toUpperCase() + account.type.slice(1)}
              {account.lastFour ? ` • ${account.lastFour}` : ''}
            </Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.accountBalanceActive, isDebt && { color: colors.error }]}>
            {formatCurrencyWholePrivacy(account.balance, hideBalances)}
          </Text>
          {isDebt && <Text style={[styles.owedBadge, { color: colors.error }]}>Due</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header
        isMainTab
        title="Accounts"
        leftNode={
          <TouchableOpacity style={styles.avatarButton} onPress={() => router.push('/settings')}>
            <View style={[styles.avatarFallback, { backgroundColor: colors.primaryContainer }]}>
              <MaterialIcons name="person" size={20} color={colors.onPrimaryContainer} />
            </View>
          </TouchableOpacity>
        }
        rightNode={
          <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/add-account')}>
            <MaterialIcons name="add" size={24} color={colors.onSurface} />
          </TouchableOpacity>
        }
      />

      {accounts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconCircle, { backgroundColor: colors.surfaceContainerLow }]}>
            <MaterialIcons name="account-balance" size={48} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>No accounts yet</Text>
          <Text style={styles.emptyDescription}>
            Add your first account to start tracking your finances.
          </Text>
          <TouchableOpacity
            style={[styles.emptyButton, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/add-account')}
          >
            <MaterialIcons name="add" size={20} color={colors.onPrimary} />
            <Text style={[styles.emptyButtonText, { color: colors.onPrimary }]}>Add Account</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <AccountsSkeleton />
          ) : (
            <>
              <View style={{ gap: 24 }}>
                {/* Total Balance / Net Worth Card */}
                <View style={styles.contentPadding}>
                  <View style={styles.totalCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.totalLabel}>TOTAL NET WORTH</Text>
                      <TouchableOpacity
                        onPress={toggleHideBalances}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={{ padding: 2 }}
                      >
                        <MaterialIcons
                          name={hideBalances ? 'visibility-off' : 'visibility'}
                          size={16}
                          color={colors.onPrimary}
                          style={{ opacity: 0.8 }}
                        />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.totalBalance}>
                      {formatCurrencyPrivacy(totalBalance, false, hideBalances)}
                    </Text>
                    <View style={styles.summaryPillRow}>
                      <View
                        style={[styles.summaryPill, { backgroundColor: colors.surfaceContainerLow }]}
                      >
                        <Text style={[styles.summaryPillLabel, { color: colors.primary }]}>
                          Assets: {formatCurrencyWholePrivacy(totalAssets, hideBalances)}
                        </Text>
                      </View>
                      {totalLiabilities > 0 && (
                        <View
                          style={[
                            styles.summaryPill,
                            { backgroundColor: colors.errorContainer + '33' },
                          ]}
                        >
                          <Text style={[styles.summaryPillLabel, { color: colors.error }]}>
                            Liabilities: -{formatCurrencyWholePrivacy(totalLiabilities, hideBalances)}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Assets Section */}
                  {assetAccounts.length > 0 && (
                    <View style={styles.sectionCard}>
                      <View style={styles.sectionHeaderRow}>
                        <Text style={styles.sectionHeaderLabel}>ASSETS</Text>
                        <Text style={styles.sectionSubtotal}>
                          {formatCurrencyWholePrivacy(totalAssets, hideBalances)}
                        </Text>
                      </View>
                      <View style={styles.accountList}>
                        {assetAccounts.map(renderAccountRow)}
                      </View>
                    </View>
                  )}

                  {/* Liabilities & Debt Section */}
                  {liabilityAccounts.length > 0 && (
                    <View style={[styles.sectionCard, { marginTop: assetAccounts.length > 0 ? 16 : 0 }]}>
                      <View style={styles.sectionHeaderRow}>
                        <Text style={[styles.sectionHeaderLabel, { color: colors.error }]}>
                          LIABILITIES & DEBT
                        </Text>
                        <Text style={[styles.sectionSubtotal, { color: colors.error }]}>
                          -{formatCurrencyWholePrivacy(totalLiabilities, hideBalances)}
                        </Text>
                      </View>
                      <View style={styles.accountList}>
                        {liabilityAccounts.map(renderAccountRow)}
                      </View>
                    </View>
                  )}

                  {/* Selected Account Details */}
                  {selectedAccount && (
                    <AccountDetailCard
                      account={selectedAccount}
                      colors={colors}
                      styles={styles}
                      onViewDetails={() =>
                        router.push({
                          pathname: '/account-details',
                          params: { accountId: selectedAccount.id },
                        })
                      }
                      onSettleDebt={() =>
                        router.push({
                          pathname: '/(app)/add-transaction',
                          params: {
                            type: 'transfer',
                            toAccountId: selectedAccount.id,
                            amount: Math.abs(selectedAccount.balance).toString(),
                          },
                        })
                      }
                    />
                  )}
                </View>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function AccountDetailCard({
  account,
  colors,
  styles,
  onViewDetails,
  onSettleDebt,
}: {
  account: Account;
  colors: ThemeColors;
  styles: ReturnType<typeof getStyles>;
  onViewDetails: () => void;
  onSettleDebt?: () => void;
}) {
  const router = useRouter();
  const { hideBalances } = useAppStore();
  const isLiability = ['credit', 'loan', 'borrowed'].includes(account.type);
  const hasOutstandingDebt = isLiability && account.balance < 0;
  const { history, isLoading } = useAccountHistory(account.id, 30);

  const chartData = React.useMemo(() => {
    let data = history;
    if (!data || data.length === 0) {
      data = [
        { date: new Date().toISOString().split('T')[0], value: account.balance },
        { date: new Date().toISOString().split('T')[0], value: account.balance },
      ];
    } else if (data.length === 1) {
      data = [data[0], data[0]];
    }

    return data.map((point) => ({
      value: point.value,
      dataPointText: formatCurrency(point.value),
    }));
  }, [history, account.balance]);

  const chartConfig = React.useMemo(() => {
    const vals = chartData.map((d) => d.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min;

    if (range === 0) {
      return {
        yAxisOffset: 0,
        maxValue: max === 0 ? 100 : Math.abs(max) * 1.3,
      };
    }

    const padding = range * 0.15;
    return {
      yAxisOffset: Math.max(0, min - padding),
      maxValue: max + padding,
    };
  }, [chartData]);

  const screenWidth = Dimensions.get('window').width;
  // screen padding 20x2 = 40, card padding 20x2 = 40 -> total 80
  const chartWidth = screenWidth - 80;

  return (
    <View style={styles.sectionCard}>
      <View style={styles.detailsHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.detailsLabel}>{account.name.toUpperCase()}</Text>
          <Text style={styles.detailsBalance}>
            {formatCurrencyPrivacy(account.balance, false, hideBalances)}
          </Text>
          {account.institution ? (
            <Text style={styles.institutionText}>{account.institution}</Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TouchableOpacity
            style={styles.moreButton}
            onPress={() =>
              router.push({
                pathname: '/add-account',
                params: { id: account.id },
              })
            }
          >
            <MaterialIcons name="edit" size={18} color={colors.onSurface} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.moreButton} onPress={onViewDetails}>
            <MaterialIcons name="more-horiz" size={20} color={colors.onSurface} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.chartArea}>
        <View style={styles.chartBg} />
        {isLoading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              overflow: 'hidden',
              justifyContent: 'flex-end',
            }}
          >
            <LineChart
              data={chartData}
              width={chartWidth}
              height={140}
              spacing={
                chartData.length > 1 ? chartWidth / (chartData.length - 1) : chartWidth
              }
              adjustToWidth={true}
              yAxisOffset={chartConfig.yAxisOffset}
              maxValue={chartConfig.maxValue}
              hideDataPoints
              hideRules
              hideYAxisText
              hideAxesAndRules
              color={colors.primary}
              thickness={2.5}
              initialSpacing={0}
              endSpacing={0}
              areaChart
              startFillColor={colors.primary}
              startOpacity={0.25}
              endFillColor={colors.primary}
              endOpacity={0.02}
              curved
              pointerConfig={{
                pointerStripHeight: 140,
                pointerStripColor: colors.outline,
                pointerStripWidth: 2,
                pointerColor: colors.primary,
                radius: 4,
                activatePointersOnLongPress: true,
                autoAdjustPointerLabelPosition: true,
                pointerLabelComponent: (items: any) => {
                  return (
                    <View
                      style={{
                        height: 30,
                        width: 90,
                        justifyContent: 'center',
                        backgroundColor: colors.surfaceContainerHighest,
                        borderRadius: 8,
                        padding: 4,
                      }}
                    >
                      <Text
                        style={{
                          color: colors.onSurface,
                          fontSize: 11,
                          fontWeight: 'bold',
                          textAlign: 'center',
                        }}
                      >
                        {items[0].dataPointText}
                      </Text>
                    </View>
                  );
                },
              }}
            />
          </View>
        )}
        <Text style={styles.chartTimeframe}>30 Days</Text>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Type</Text>
          <Text style={styles.statValue}>
            {account.type.charAt(0).toUpperCase() + account.type.slice(1)}
          </Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Account</Text>
          <Text style={styles.statValue}>
            {account.lastFour ? `•••• ${account.lastFour}` : '—'}
          </Text>
        </View>
      </View>

      {hasOutstandingDebt && onSettleDebt && (
        <TouchableOpacity style={styles.payBillButton} onPress={onSettleDebt}>
          <MaterialIcons name="payment" size={18} color={colors.onPrimary} />
          <Text style={styles.payBillButtonText}>Pay Bill / Settle Debt</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surfaceContainerLow,
    },

    avatarButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    avatarFallback: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconButton: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    emptyIconCircle: {
      width: 120,
      height: 120,
      borderRadius: 60,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    emptyTitle: {
      ...typography.headlineMd,
      color: colors.onSurface,
      marginBottom: 8,
    },
    emptyDescription: {
      ...typography.bodyLg,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
      marginBottom: 24,
    },
    emptyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 12,
    },
    emptyButtonText: {
      ...typography.labelMd,
    },
    scrollContent: {},
    contentPadding: {
      paddingHorizontal: 20,
      gap: 24,
    },
    totalCard: {
      backgroundColor: colors.primary,
      borderRadius: 16,
      padding: 20,
      alignItems: 'center',
      gap: 4,
    },
    totalLabel: {
      ...typography.labelMd,
      color: colors.onPrimary,
      opacity: 0.8,
      letterSpacing: 1,
    },
    totalBalance: {
      ...typography.dataLg,
      color: colors.onPrimary,
      fontSize: 32,
    },
    summaryPillRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 8,
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
    summaryPill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
    },
    summaryPillLabel: {
      ...typography.labelMd,
      fontWeight: '600',
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
      paddingHorizontal: 8,
    },
    sectionSubtotal: {
      ...typography.bodyMd,
      fontWeight: '600',
      color: colors.onSurface,
    },
    owedBadge: {
      ...typography.labelMd,
      fontWeight: '700',
      textTransform: 'uppercase',
      marginTop: 2,
    },
    payBillButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 12,
      marginTop: 16,
    },
    payBillButtonText: {
      ...typography.labelMd,
      color: colors.onPrimary,
      fontWeight: '600',
    },
    sectionCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      borderRadius: 16,
      padding: 16,
      shadowColor: colors.onSurface,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.02,
      shadowRadius: 24,
      elevation: 2,
    },
    sectionHeaderLabel: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    accountList: {
      gap: 8,
    },
    accountItemActive: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
    },
    accountItemInactive: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
    },
    accountItemLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    accountIconContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    accountName: {
      ...typography.bodyLg,
      fontWeight: '500',
      color: colors.onSurface,
    },
    accountType: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
    },
    accountBalanceActive: {
      ...typography.bodyLg,
      fontWeight: '600',
      color: colors.onSurface,
    },
    detailsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 24,
    },
    detailsLabel: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 4,
    },
    detailsBalance: {
      ...typography.dataLg,
      color: colors.onSurface,
    },
    institutionText: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      marginTop: 4,
    },
    moreButton: {
      padding: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    chartArea: {
      width: '100%',
      height: 192,
      marginBottom: 24,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      overflow: 'hidden',
      position: 'relative',
      justifyContent: 'flex-end',
    },
    chartBg: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.primaryContainer,
      opacity: 0.05,
    },
    chartTimeframe: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      marginLeft: 16,
      marginBottom: 8,
    },
    statsGrid: {
      flexDirection: 'row',
      gap: 16,
    },
    statBox: {
      flex: 1,
      padding: 16,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
    },
    statLabel: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      marginBottom: 4,
    },
    statValue: {
      ...typography.bodyLg,
      fontWeight: '600',
      color: colors.onSurface,
    },
  });
  return styles;
};

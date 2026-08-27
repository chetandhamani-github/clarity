import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Dimensions } from 'react-native';
import { Text, Header, Loader } from '@/components/ui';
import { spacing, typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { LineChart } from 'react-native-gifted-charts';
import { useAccounts } from '@/hooks/use-accounts';
import { useAccountHistory } from '@/hooks/use-transactions';
import { formatCurrency, formatCurrencyWhole } from '@/utils/format';
import { getAccountTypeIcon } from '@/utils/icons';
import type { Account } from '@/types';

export default function AccountsScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accounts, isLoading, refetch } = useAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? accounts[0] ?? null;
  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);

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
            <Text style={[styles.emptyButtonText, { color: colors.onPrimary }]}>
              Add Account
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}
        >
        { isLoading ? <Loader /> : (<>
          <View style={{ gap: 24 }}>
          {/* Total Balance Card */}
          <View style={styles.contentPadding}>
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>TOTAL BALANCE</Text>
              <Text style={styles.totalBalance}>{formatCurrency(totalBalance)}</Text>
              <Text style={styles.totalAccountCount}>
                {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
              </Text>
            </View>

            {/* Active Accounts List */}
            <View style={styles.sectionCard}>
              <Text style={styles.sectionHeaderLabel}>ACTIVE ACCOUNTS</Text>
              <View style={styles.accountList}>
                {accounts.map((account) => {
                  const isSelected = selectedAccount?.id === account.id;
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
                      <Text style={styles.accountBalanceActive}>
                        {formatCurrencyWhole(account.balance)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Selected Account Details */}
            {selectedAccount && (
              <AccountDetailCard
                account={selectedAccount}
                colors={colors}
                styles={styles}
                onViewDetails={() => router.push({ pathname: '/account-details', params: { accountId: selectedAccount.id } })}
              />
            )}
          </View>
          </View>
        </>)}
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
}: {
  account: Account;
  colors: ThemeColors;
  styles: ReturnType<typeof getStyles>;
  onViewDetails: () => void;
}) {
  const { history, isLoading } = useAccountHistory(account.id, 30);
  
  const chartData = React.useMemo(() => {
    let data = history;
    if (data.length === 0) data = [{ date: new Date().toISOString().split('T')[0], value: 0 }, { date: new Date().toISOString().split('T')[0], value: 0 }];
    else if (data.length === 1) data = [data[0], data[0]];
    
    return data.map((point) => ({ 
      value: point.value,
      dataPointText: formatCurrency(point.value) 
    }));
  }, [history]);

  const chartConfig = React.useMemo(() => {
    const vals = chartData.map(d => d.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min;
    
    if (range === 0) {
      return { yAxisOffset: min - 10, maxValue: 20 };
    }
    
    return {
      yAxisOffset: min - (range * 0.2),
      maxValue: range * 1.4,
    };
  }, [chartData]);

  const screenWidth = Dimensions.get('window').width;
  // screen padding 20x2 = 40, card padding 20x2 = 40 -> total 80
  const chartWidth = screenWidth - 80;

  return (
    <View style={styles.sectionCard}>
      <View style={styles.detailsHeader}>
        <View>
          <Text style={styles.detailsLabel}>{account.name.toUpperCase()}</Text>
          <Text style={styles.detailsBalance}>{formatCurrency(account.balance)}</Text>
          {account.institution ? (
            <Text style={styles.institutionText}>{account.institution}</Text>
          ) : null}
        </View>
        <TouchableOpacity style={styles.moreButton} onPress={onViewDetails}>
          <MaterialIcons name="more-horiz" size={20} color={colors.onSurface} />
        </TouchableOpacity>
      </View>

      <View style={styles.chartArea}>
        <View style={styles.chartBg} />
        {isLoading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
            <LineChart
              data={chartData}
              width={chartWidth}
              height={60}
              yAxisOffset={chartConfig.yAxisOffset}
              maxValue={chartConfig.maxValue}
              hideDataPoints
              hideRules
              hideYAxisText
              hideAxesAndRules
              color={colors.primary}
              thickness={2}
              initialSpacing={0}
              endSpacing={0}
              areaChart
              startFillColor={colors.primary}
              startOpacity={0.15}
              endFillColor={colors.primary}
              endOpacity={0}
              curved
              pointerConfig={{
                pointerStripHeight: 60,
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
                        width: 80,
                        justifyContent: 'center',
                        backgroundColor: colors.surfaceContainerHighest,
                        borderRadius: 4,
                        padding: 4,
                      }}>
                      <Text style={{ color: colors.onSurface, fontSize: 10, fontWeight: 'bold', textAlign: 'center' }}>
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
    loaderContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
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
    totalAccountCount: {
      ...typography.bodyMd,
      color: colors.onPrimary,
      opacity: 0.7,
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
      paddingHorizontal: 8,
      marginBottom: 8,
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

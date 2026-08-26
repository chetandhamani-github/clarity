import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { Text } from '@/components/ui';
import { spacing, typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAccounts } from '@/hooks/use-accounts';
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
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.avatarButton} onPress={() => router.push('/settings')}>
            <View style={[styles.avatarFallback, { backgroundColor: colors.primaryContainer }]}>
              <MaterialIcons name="person" size={20} color={colors.onPrimaryContainer} />
            </View>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Accounts</Text>
        </View>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.push('/add-account')}>
          <MaterialIcons name="add" size={24} color={colors.onSurface} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : accounts.length === 0 ? (
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
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}
        >
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
                onViewDetails={() => router.push(`/account-details?accountId=${selectedAccount.id}`)}
              />
            )}
          </View>
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

      {/* Chart Placeholder */}
      <View style={styles.chartArea}>
        <View style={styles.chartBg} />
        <View style={styles.chartLineMockup} />
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
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      backgroundColor: colors.surfaceContainerLow,
      zIndex: 40,
    },
    headerTitle: {
      ...typography.displayLg,
      color: colors.onSurface,
      letterSpacing: -0.64,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
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
      borderRadius: 20,
      backgroundColor: colors.surfaceContainerLowest,
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
    chartLineMockup: {
      position: 'absolute',
      top: '50%',
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: colors.primary,
      opacity: 0.5,
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

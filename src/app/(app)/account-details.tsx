import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { Text, Header, DetailSkeleton } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAccount, useDeleteAccount } from '@/hooks/use-accounts';
import { useTransactions, useAccountHistory } from '@/hooks/use-transactions';
import { useToast, useAlert } from '@/components/ui';
import { LineChart } from 'react-native-gifted-charts';
import { formatCurrency, formatDate, getTransactionSign } from '@/utils/format';
import { getCategoryIcon, getAccountTypeIcon } from '@/utils/icons';
import { getTransactionDisplayName, hasMeaningfulMerchant } from '@/utils/transaction-display';

export default function AccountDetailsScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accountId } = useLocalSearchParams<{ accountId: string }>();

  const { account, isLoading } = useAccount(accountId);
  const { transactions, isLoading: isTxLoading } = useTransactions({ accountId });
  const { history, isLoading: isHistoryLoading } = useAccountHistory(accountId, 30);
  const { mutate: deleteAccount, isPending: isDeleting } = useDeleteAccount();
  const [showMenu, setShowMenu] = useState(false);
  const { showToast } = useToast();
  const { showAlert } = useAlert();

  const handleDelete = () => {
    setShowMenu(false);
    showAlert(
      'Delete Account',
      'Are you sure you want to delete this account? All associated transactions will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (accountId) {
              deleteAccount(accountId, {
                onSuccess: () => {
                  showToast('Account deleted', 'success');
                  router.back();
                },
              });
            }
          },
        },
      ]
    );
  };

  const handleEdit = () => {
    setShowMenu(false);
    router.push(`/(app)/add-account?id=${accountId}`);
  };

  // Format history for LineChart
  const chartData = useMemo(() => {
    let data = history;
    if (!data || data.length === 0)
      data = [
        { date: new Date().toISOString().split('T')[0], value: account?.balance || 0 },
        { date: new Date().toISOString().split('T')[0], value: account?.balance || 0 },
      ];
    else if (data.length === 1) data = [data[0], data[0]];

    return data.map((point, index) => {
      const isStart = index === 0;
      const isEnd = index === data.length - 1;
      const isMid = index === Math.floor(data.length / 2);

      const dateParts = point.date.split('-');
      const label = isStart || isEnd || isMid ? `${dateParts[1]}/${dateParts[2]}` : '';

      return {
        value: point.value,
        label,
        dataPointText: formatCurrency(point.value),
      };
    });
  }, [history, account]);

  const chartConfig = useMemo(() => {
    const vals = chartData.map((d) => d.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min;

    if (range <= 0) {
      return {
        yAxisOffset: min < 0 ? min * 1.2 : 0,
        maxValue: max <= 0 ? (max === 0 ? 100 : 0) : max * 1.25,
        hasVariance: false,
      };
    }

    const padding = range * 0.15;
    return {
      yAxisOffset: Math.max(0, min - padding),
      maxValue: max + padding,
      hasVariance: true,
    };
  }, [chartData]);

  // Calculate Account change percentage
  const balanceChangePercent = useMemo(() => {
    if (!history || history.length < 2) return 0;
    const start = history[0].value;
    const end = history[history.length - 1].value;
    if (start === 0) return end > 0 ? 100 : end < 0 ? -100 : 0;
    return ((end - start) / Math.abs(start)) * 100;
  }, [history]);

  const isPositiveTrend = balanceChangePercent >= 0;

  const screenWidth = Dimensions.get('window').width;
  const chartWidth = screenWidth - 88;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header
        showBack
        title="Account Details"
        rightNode={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleEdit}
              disabled={!account}
            >
              <MaterialIcons name="edit" size={22} color={colors.onSurface} />
            </TouchableOpacity>

            <View style={{ position: 'relative' }}>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => setShowMenu(!showMenu)}
                disabled={!account}
              >
                <MaterialIcons name="more-vert" size={24} color={colors.onSurfaceVariant} />
              </TouchableOpacity>

              {showMenu && (
                <View style={styles.menuPopup}>
                  <TouchableOpacity style={styles.menuItem} onPress={handleEdit}>
                    <MaterialIcons name="edit" size={20} color={colors.onSurface} />
                    <Text style={styles.menuItemText}>Edit Account</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.menuItem} onPress={handleDelete}>
                    <MaterialIcons name="delete" size={20} color={colors.error} />
                    <Text style={[styles.menuItemText, { color: colors.error }]}>Delete Account</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        }
      />

      {isLoading || !account ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}
        >
          <DetailSkeleton />
        </ScrollView>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ gap: 24 }}>
            {/* Account Overview Card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accountLabel}>{account.name.toUpperCase()}</Text>
                  <Text style={styles.balanceText}>{formatCurrency(account.balance)}</Text>
                  {account.institution && (
                    <Text style={styles.institutionText}>{account.institution}</Text>
                  )}
                </View>
                <View style={styles.accountIconBox}>
                  <MaterialIcons
                    name={getAccountTypeIcon(account.type)}
                    size={24}
                    color={colors.primary}
                  />
                </View>
              </View>

              {/* Stats Grid */}
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Type</Text>
                  <Text style={styles.statValue}>
                    {account.type.charAt(0).toUpperCase() + account.type.slice(1)}
                  </Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Last 4</Text>
                  <Text style={styles.statValue}>{account.lastFour || '—'}</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Added</Text>
                  <Text style={styles.statValue}>
                    {formatDate(account.createdAt, 'month-year')}
                  </Text>
                </View>
              </View>

              {['credit', 'loan', 'borrowed'].includes(account.type) && account.balance < 0 && (
                <TouchableOpacity
                  style={styles.payBillBtn}
                  onPress={() =>
                    router.push({
                      pathname: '/(app)/add-transaction',
                      params: {
                        type: 'transfer',
                        toAccountId: account.id,
                        amount: Math.abs(account.balance).toString(),
                      },
                    })
                  }
                >
                  <MaterialIcons name="payment" size={20} color={colors.onPrimary} />
                  <Text style={styles.payBillBtnText}>Pay Bill / Settle Debt</Text>
                </TouchableOpacity>
              )}

              {/* Balance Trend LineChart */}
              <View
                style={{
                  marginTop: 12,
                  height: 135,
                  overflow: 'hidden',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <LineChart
                  data={chartData}
                  width={chartWidth}
                  height={130}
                  spacing={
                    chartData.length > 1 ? chartWidth / (chartData.length - 1) : chartWidth
                  }
                  adjustToWidth={true}
                  yAxisOffset={chartConfig.yAxisOffset}
                  maxValue={chartConfig.maxValue}
                  hideDataPoints
                  color={isPositiveTrend ? colors.primary : colors.error}
                  thickness={3}
                  initialSpacing={0}
                  endSpacing={0}
                  areaChart
                  startFillColor={isPositiveTrend ? colors.primary : colors.error}
                  startOpacity={0.3}
                  endFillColor={isPositiveTrend ? colors.primary : colors.error}
                  endOpacity={0.05}
                  curved={chartConfig.hasVariance && chartData.length > 2}
                  hideRules
                  hideYAxisText
                  hideAxesAndRules
                  pointerConfig={{
                    pointerStripHeight: 140,
                    pointerStripColor: colors.outline,
                    pointerStripWidth: 2,
                    pointerColor: colors.primary,
                    radius: 6,
                    pointerLabelWidth: 80,
                    pointerLabelHeight: 30,
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
                            borderRadius: 8,
                            padding: 4,
                          }}
                        >
                          <Text
                            style={{
                              color: colors.onSurface,
                              fontSize: 12,
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
            </View>
                  {/* Recent Activity */}
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Recent Activity</Text>

                    {isTxLoading ? (
                      <View style={styles.emptyActivityBox}>
                        <ActivityIndicator size="small" color={colors.primary} />
                      </View>
                    ) : transactions.length === 0 ? (
                      <View style={styles.emptyActivityBox}>
                        <MaterialIcons name="receipt-long" size={32} color={colors.outline} />
                        <Text style={styles.emptyActivityText}>
                          No transactions found for this account.
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.transactionsList}>
                        {transactions.slice(0, 5).map((tx, index) => {
                          const isLast = index === Math.min(transactions.length, 5) - 1;
                          const sign = getTransactionSign(tx.type);

                          return (
                            <TouchableOpacity
                              key={tx.id}
                              style={[styles.transactionItem, isLast && { borderBottomWidth: 0 }]}
                            >
                              <View style={styles.txLeft}>
                                <View
                                  style={[
                                    styles.txIconBox,
                                    tx.type === 'income'
                                      ? { backgroundColor: colors.primaryContainer }
                                      : undefined,
                                  ]}
                                >
                                  <MaterialIcons
                                    name={getCategoryIcon(tx.category)}
                                    size={20}
                                    color={
                                      tx.type === 'income'
                                        ? colors.onPrimaryContainer
                                        : colors.primary
                                    }
                                  />
                                </View>
                                <View style={{ flex: 1, justifyContent: 'center' }}>
                                  <Text style={styles.txTitle} numberOfLines={1}>
                                    {tx.type === 'transfer'
                                      ? tx.accountId === account?.id
                                        ? `Transfer to ${tx.toAccountName || 'Unknown'}`
                                        : `Transfer from ${tx.accountName}`
                                      : getTransactionDisplayName(tx)}
                                  </Text>
                                  <Text style={styles.txSubtitle} numberOfLines={1}>
                                    {formatDate(tx.date)}
                                    {hasMeaningfulMerchant(tx)
                                      ? ` • ${tx.category}`
                                      : ''}
                                  </Text>
                                </View>
                              </View>
                              <View style={styles.txRight}>
                                <Text
                                  style={[
                                    styles.txAmount,
                                    tx.type === 'income' ? { color: colors.primary } : undefined,
                                  ]}
                                >
                                  {sign}
                                  {formatCurrency(tx.amount)}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                        {transactions.length > 5 && (
                          <TouchableOpacity
                            style={styles.viewAllBtn}
                            onPress={() => router.push('/(app)/(tabs)/transactions')}
                          >
                            <Text style={{ color: colors.primary, fontWeight: '500' }}>
                              View All
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                </View>
              </ScrollView>
            )}
          </View>
        );
      }

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },

    iconButton: {
      padding: 8,
    },
    menuPopup: {
      position: 'absolute',
      top: 48,
      right: 8,
      backgroundColor: colors.surfaceContainerHigh,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 4,
      minWidth: 160,
      zIndex: 20,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      gap: 12,
    },
    menuItemText: {
      ...typography.bodyLg,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
      gap: 24,
    },
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      borderRadius: 16,
      padding: 20,
      gap: 24,
      shadowColor: colors.onSurface,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.02,
      shadowRadius: 12,
      elevation: 2,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    accountLabel: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 4,
    },
    balanceText: {
      ...typography.displayLg,
      fontSize: 32,
      color: colors.onSurface,
    },
    institutionText: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      marginTop: 4,
    },
    accountIconBox: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statsGrid: {
      flexDirection: 'row',
      gap: 12,
    },
    statBox: {
      flex: 1,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      borderRadius: 12,
      padding: 12,
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
    section: {
      gap: 16,
    },
    sectionTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
    },
    emptyActivityBox: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      borderStyle: 'dashed',
      padding: 32,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    emptyActivityText: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
    },
    transactionsList: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      overflow: 'hidden',
    },
    transactionItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineVariant,
    },
    txLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      paddingRight: 12,
    },
    txIconBox: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    txTitle: {
      ...typography.bodyLg,
      fontWeight: '500',
      color: colors.onSurface,
    },
    txSubtitle: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
    },
    txRight: {
      alignItems: 'flex-end',
    },
    txAmount: {
      ...typography.dataLg,
      fontSize: 20,
      lineHeight: 28,
      color: colors.onSurface,
      fontWeight: '500',
    },
    viewAllBtn: {
      padding: 16,
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: colors.surfaceContainer,
    },
    payBillBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      marginTop: 16,
    },
    payBillBtnText: {
      ...typography.labelMd,
      color: colors.onPrimary,
      fontWeight: '600',
    },
  });
  return styles;
};

import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Text } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAccount, useDeleteAccount } from '@/hooks/use-accounts';
import { useTransactions } from '@/hooks/use-transactions';
import { useToast, useAlert } from '@/components/ui';
import { formatCurrency, formatDate, getTransactionSign } from '@/utils/format';
import { getCategoryIcon, getAccountTypeIcon } from '@/utils/icons';

export default function AccountDetailsScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { accountId } = useLocalSearchParams<{ accountId: string }>();

  const { account, isLoading } = useAccount(accountId);
  const { transactions, isLoading: isTxLoading } = useTransactions({ accountId });
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
                }
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Account Details
        </Text>
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
                <MaterialIcons name="delete-outline" size={20} color={colors.error} />
                <Text style={[styles.menuItemText, { color: colors.error }]}>Delete Account</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {isLoading || isDeleting ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !account ? (
        <View style={styles.loaderContainer}>
          <Text style={{ color: colors.onSurfaceVariant }}>Account not found.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 60 }]} showsVerticalScrollIndicator={false}>
          {/* Main Details Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.accountLabel}>{account.name.toUpperCase()}</Text>
                <Text style={styles.balanceText}>{formatCurrency(account.balance)}</Text>
                {account.institution && (
                  <Text style={styles.institutionText}>{account.institution}</Text>
                )}
              </View>
              <View style={styles.accountIconBox}>
                <MaterialIcons name={getAccountTypeIcon(account.type)} size={24} color={colors.primary} />
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
                <Text style={styles.statValue}>{formatDate(account.createdAt, 'month-year')}</Text>
              </View>
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
                        <View style={[
                          styles.txIconBox,
                          tx.type === 'income' ? { backgroundColor: colors.primaryContainer } : undefined
                        ]}>
                          <MaterialIcons 
                            name={getCategoryIcon(tx.category)} 
                            size={20} 
                            color={tx.type === 'income' ? colors.onPrimaryContainer : colors.primary} 
                          />
                        </View>
                        <View>
                          <Text style={styles.txTitle}>{tx.merchant}</Text>
                          <Text style={styles.txSubtitle}>{formatDate(tx.date)}</Text>
                        </View>
                      </View>
                      <View style={styles.txRight}>
                        <Text style={[
                          styles.txAmount,
                          tx.type === 'income' ? { color: colors.primary } : undefined
                        ]}>
                          {sign}{formatCurrency(tx.amount)}
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
                    <Text style={{ color: colors.primary, fontWeight: '500' }}>View All</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      height: 64,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.surfaceVariant,
      zIndex: 10,
    },
    headerTitle: {
      ...typography.headlineMd,
      color: colors.onSurface,
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
    loaderContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
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
    }
  });
  return styles;
};

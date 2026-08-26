import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput, Switch, ActivityIndicator, ScrollView } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Text } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCreateTransaction, useUpdateTransaction, useTransaction, useDeleteTransaction } from '@/hooks/use-transactions';
import { useAccounts } from '@/hooks/use-accounts';
import { useToast, useAlert } from '@/components/ui';
import type { TransactionType } from '@/types';
import { getAccountTypeIcon } from '@/utils/icons';

const CATEGORIES = [
  'Groceries', 'Dining', 'Rent', 'Utilities', 'Transport',
  'Health', 'Shopping', 'Entertainment', 'Subscriptions',
  'Travel', 'Salary', 'Transfer', 'Personal', 'Other'
];

export default function AddTransactionScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;
  const { transaction, isLoading: isTxLoading } = useTransaction(id);
  const { showToast } = useToast();
  const { showAlert } = useAlert();
  
  const { accounts, isLoading: isLoadingAccounts } = useAccounts();
  const { mutate: createTransaction, isPending: isCreating } = useCreateTransaction();
  const { mutate: updateTransaction, isPending: isUpdating } = useUpdateTransaction();
  const { mutate: deleteTransaction, isPending: isDeleting } = useDeleteTransaction();

  const isPending = isCreating || isUpdating || isDeleting;

  const [type, setType] = useState<TransactionType>('expense');
  const [amountStr, setAmountStr] = useState('');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);

  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Pre-populate if editing
  React.useEffect(() => {
    if (isEditing && transaction && !initialized) {
      setType(transaction.type);
      setAmountStr(transaction.amount.toString());
      setMerchant(transaction.merchant);
      setCategory(transaction.category);
      setDate(transaction.date);
      setAccountId(transaction.accountId);
      setIsRecurring(transaction.isRecurring);
      setInitialized(true);
    }
  }, [isEditing, transaction, initialized]);

  // Set default account once accounts load
  React.useEffect(() => {
    if (accounts.length > 0 && !accountId && !isEditing) {
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId, isEditing]);

  const handleSave = () => {
    if (!accountId) {
      showAlert('Validation Error', 'Please select an account.');
      return;
    }
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      showAlert('Validation Error', 'Please enter a valid amount greater than 0.');
      return;
    }
    if (!merchant.trim()) {
      showAlert('Validation Error', 'Please enter a merchant or description.');
      return;
    }
    // Basic date validation
    if (!date.trim() || date.length !== 10) {
      showAlert('Validation Error', 'Please enter date in YYYY-MM-DD format.');
      return;
    }

    const txData = {
      accountId,
      amount,
      type,
      merchant: merchant.trim(),
      category,
      date,
      isRecurring,
      note: '', // Could add note field later
    };

    if (isEditing && id) {
      updateTransaction(id, txData, {
        onSuccess: () => {
          showToast('Transaction updated successfully', 'success');
          router.back();
        }
      });
    } else {
      createTransaction(txData, {
        onSuccess: () => {
          showToast('Transaction added successfully', 'success');
          router.back();
        },
      });
    }
  };

  const handleDelete = () => {
    if (isEditing && id) {
      showAlert(
        'Delete Transaction',
        'Are you sure you want to delete this transaction?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              deleteTransaction(id, {
                onSuccess: () => {
                  showToast('Transaction deleted', 'success');
                  router.back();
                }
              });
            },
          },
        ]
      );
    }
  };

  const selectedAccount = accounts.find(a => a.id === accountId);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEditing ? 'Edit Transaction' : 'Add Transaction'}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 60 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
      >
        <View style={styles.card}>
          {/* Type Switcher */}
          <View style={styles.typeSwitcher}>
            {(['expense', 'income', 'transfer'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.typeButton, type === t && styles.typeButtonActive]}
                onPress={() => setType(t)}
              >
                <Text
                  style={[
                    styles.typeButtonText,
                    type === t && styles.typeButtonTextActive,
                  ]}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Amount Input */}
          <View style={styles.amountContainer}>
            <Text style={styles.amountLabel}>Amount</Text>
            <View style={styles.amountInputRow}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                keyboardType="decimal-pad"
                placeholderTextColor={colors.outline}
                value={amountStr}
                onChangeText={setAmountStr}
              />
            </View>
          </View>

          {/* Form Fields */}
          <View style={styles.formGroup}>
            {/* Merchant */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Merchant / Description</Text>
              <View style={styles.textInputWrapper}>
                <MaterialIcons
                  name="storefront"
                  size={24}
                  color={colors.onSurfaceVariant}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Whole Foods Market"
                  placeholderTextColor={colors.outline}
                  value={merchant}
                  onChangeText={setMerchant}
                />
              </View>
            </View>

            {/* Category and Date Row */}
            <View style={styles.row}>
              <View style={[styles.inputContainer, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Category</Text>
                <TouchableOpacity 
                  style={[styles.textInputWrapper, { zIndex: 10 }]} 
                  onPress={() => setShowCategoryMenu(!showCategoryMenu)}
                >
                  <MaterialIcons
                    name="category"
                    size={24}
                    color={colors.primary}
                    style={styles.inputIcon}
                  />
                  <View style={[styles.textInput, { justifyContent: 'center' }]}>
                    <Text style={{ color: colors.onSurface }}>{category}</Text>
                  </View>
                  <MaterialIcons
                    name={showCategoryMenu ? "expand-less" : "expand-more"}
                    size={24}
                    color={colors.onSurfaceVariant}
                    style={styles.inputRightIcon}
                  />
                </TouchableOpacity>
                
                {showCategoryMenu && (
                  <View style={styles.dropdownMenu}>
                    <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                      {CATEGORIES.map(cat => (
                        <TouchableOpacity 
                          key={cat} 
                          style={styles.dropdownItem}
                          onPress={() => {
                            setCategory(cat);
                            setShowCategoryMenu(false);
                          }}
                        >
                          <Text style={{ color: cat === category ? colors.primary : colors.onSurface }}>{cat}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              <View style={[styles.inputContainer, { flex: 1, zIndex: 1 }]}>
                <Text style={styles.inputLabel}>Date</Text>
                <View style={styles.textInputWrapper}>
                  <TextInput
                    style={[styles.textInput, { paddingLeft: 16 }]} 
                    value={date}
                    onChangeText={setDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.outline}
                  />
                </View>
              </View>
            </View>

            {/* Account Selector */}
            <View style={[styles.inputContainer, { zIndex: 5 }]}>
              <Text style={styles.inputLabel}>Account</Text>
              
              {isLoadingAccounts ? (
                <View style={styles.accountSelector}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : accounts.length === 0 ? (
                <View style={styles.accountSelector}>
                  <Text style={{ color: colors.error }}>No accounts available. Please add one first.</Text>
                </View>
              ) : (
                <>
                  <TouchableOpacity 
                    style={styles.accountSelector}
                    onPress={() => setShowAccountMenu(!showAccountMenu)}
                  >
                    {selectedAccount ? (
                      <View style={styles.accountSelectorLeft}>
                        <View style={styles.accountIconBox}>
                          <MaterialIcons
                            name={getAccountTypeIcon(selectedAccount.type)}
                            size={16}
                            color={colors.onPrimaryContainer}
                          />
                        </View>
                        <View>
                          <Text style={styles.accountSelectorName}>{selectedAccount.name}</Text>
                          {selectedAccount.lastFour && (
                            <Text style={styles.accountSelectorNumber}>...{selectedAccount.lastFour}</Text>
                          )}
                        </View>
                      </View>
                    ) : (
                      <Text style={{ color: colors.onSurfaceVariant }}>Select an account</Text>
                    )}
                    <MaterialIcons name={showAccountMenu ? "expand-less" : "expand-more"} size={24} color={colors.onSurfaceVariant} />
                  </TouchableOpacity>
                  
                  {showAccountMenu && (
                    <View style={styles.dropdownMenu}>
                      {accounts.map(acc => (
                        <TouchableOpacity 
                          key={acc.id} 
                          style={styles.dropdownItem}
                          onPress={() => {
                            setAccountId(acc.id);
                            setShowAccountMenu(false);
                          }}
                        >
                          <Text style={{ color: acc.id === accountId ? colors.primary : colors.onSurface }}>
                            {acc.name} {acc.lastFour ? `(...${acc.lastFour})` : ''}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}
            </View>

            {/* Recurring Toggle */}
            <View style={styles.recurringContainer}>
              <View>
                <Text style={styles.recurringLabel}>Recurring Transaction</Text>
                <Text style={styles.recurringSubtext}>Mark if this happens regularly</Text>
              </View>
              <Switch
                value={isRecurring}
                onValueChange={setIsRecurring}
                trackColor={{ false: colors.surfaceVariant, true: colors.primary }}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.submitButton, (isPending || isLoadingAccounts || accounts.length === 0) && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={isPending || isLoadingAccounts || accounts.length === 0}
          >
            <Text style={styles.submitButtonText}>
              {isPending ? 'Saving...' : isEditing ? 'Save Changes' : 'Save Transaction'}
            </Text>
          </TouchableOpacity>

          {isEditing && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
              disabled={isPending}
            >
              <Text style={styles.deleteButtonText}>Delete Transaction</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAwareScrollView>
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
      paddingHorizontal: 16,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceContainer,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    headerTitle: {
      ...typography.headlineMd,
      color: colors.onSurface,
    },
    iconButton: {
      padding: 8,
      borderRadius: 20,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.surfaceContainer,
      borderRadius: 16,
      padding: 24,
      shadowColor: colors.onSurface,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.04,
      shadowRadius: 24,
      elevation: 2,
    },
    typeSwitcher: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceContainer,
      padding: 4,
      borderRadius: 8,
      marginBottom: 32,
    },
    typeButton: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: 6,
    },
    typeButtonActive: {
      backgroundColor: colors.surfaceContainerLowest,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 1,
    },
    typeButtonText: {
      ...typography.labelMd,
      color: colors.secondary,
    },
    typeButtonTextActive: {
      color: colors.onSurface,
    },
    amountContainer: {
      alignItems: 'center',
      marginBottom: 32,
    },
    amountLabel: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      marginBottom: 8,
    },
    amountInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    currencySymbol: {
      ...typography.dataLg,
      color: colors.onSurface,
      marginRight: 4,
    },
    amountInput: {
      ...typography.displayLg,
      color: colors.onSurface,
      minWidth: 120,
      textAlign: 'center',
    },
    formGroup: {
      gap: 16,
    },
    inputContainer: {
      gap: 4,
      position: 'relative',
    },
    inputLabel: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      marginLeft: 4,
    },
    textInputWrapper: {
      position: 'relative',
      justifyContent: 'center',
    },
    inputIcon: {
      position: 'absolute',
      left: 16,
      zIndex: 10,
    },
    inputRightIcon: {
      position: 'absolute',
      right: 16,
      zIndex: 10,
    },
    textInput: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: 8,
      height: 48,
      paddingLeft: 48,
      paddingRight: 16,
      ...typography.bodyLg,
      color: colors.onSurface,
    },
    row: {
      flexDirection: 'row',
      gap: 12,
    },
    accountSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceContainer,
      borderRadius: 8,
      height: 48,
      paddingHorizontal: 12,
    },
    accountSelectorLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    accountIconBox: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    accountSelectorName: {
      ...typography.bodyMd,
      color: colors.onSurface,
      lineHeight: 16,
    },
    accountSelectorNumber: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      fontSize: 10,
      lineHeight: 12,
    },
    dropdownMenu: {
      position: 'absolute',
      top: 76,
      left: 0,
      right: 0,
      backgroundColor: colors.surfaceContainerHigh,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      zIndex: 20,
    },
    dropdownItem: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.surfaceVariant,
    },
    recurringContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: colors.surfaceContainer,
      marginTop: 8,
    },
    recurringLabel: {
      ...typography.bodyMd,
      color: colors.onSurface,
    },
    recurringSubtext: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      fontSize: 10,
    },
    submitButton: {
      marginTop: 32,
      height: 48,
      backgroundColor: colors.primary,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitButtonText: {
      ...typography.labelMd,
      color: colors.onPrimary,
    },
    deleteButton: {
      marginTop: 16,
      height: 48,
      backgroundColor: colors.surfaceContainer,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.error + '40',
    },
    deleteButtonText: {
      ...typography.labelMd,
      color: colors.error,
    }
  });
  return styles;
};

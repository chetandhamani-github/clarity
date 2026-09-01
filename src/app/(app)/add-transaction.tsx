import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  ScrollView,
  Platform,
  Modal,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Text, Header } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useCreateTransaction,
  useUpdateTransaction,
  useTransaction,
  useDeleteTransaction,
  useCreateRecurringTransaction,
} from '@/hooks/use-transactions';
import { useAccounts } from '@/hooks/use-accounts';
import { useCategories } from '@/hooks/use-budget';
import { useToast, useAlert } from '@/components/ui';
import type { TransactionType, RecurringFrequency } from '@/types';
import { getAccountTypeIcon, getCategoryIcon } from '@/utils/icons';
import { getCurrencySymbol } from '@/utils/format';
import { evaluateTransactionBudgetAlerts } from '@/services/notifications/alert-engine';

const CATEGORIES = [
  'Groceries',
  'Dining',
  'Rent',
  'Utilities',
  'Transport',
  'Health',
  'Shopping',
  'Entertainment',
  'Subscriptions',
  'Travel',
  'Salary',
  'Transfer',
  'Personal',
  'Other',
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
  const { categories: dbCategories } = useCategories();
  const { mutate: createTransaction, isPending: isCreating } = useCreateTransaction();
  const { mutate: updateTransaction, isPending: isUpdating } = useUpdateTransaction();
  const { mutate: deleteTransaction, isPending: isDeleting } = useDeleteTransaction();
  const { mutate: createRecurring, isPending: isCreatingRecurring } =
    useCreateRecurringTransaction();

  const allCategories = useMemo(() => {
    const names = new Set(CATEGORIES);
    if (dbCategories) {
      dbCategories.forEach((c) => names.add(c.name));
    }
    return Array.from(names);
  }, [dbCategories]);

  const isPending = isCreating || isUpdating || isDeleting || isCreatingRecurring;

  const [type, setType] = useState<TransactionType>('expense');
  const [amountStr, setAmountStr] = useState('');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFreq, setRecurringFreq] = useState<RecurringFrequency>('monthly');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showToAccountMenu, setShowToAccountMenu] = useState(false);
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
      if ('toAccountId' in transaction) {
        setToAccountId(transaction.toAccountId || null);
      }
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
    if (type === 'transfer' && !toAccountId) {
      showAlert('Validation Error', 'Please select a destination account.');
      return;
    }
    if (type === 'transfer' && accountId === toAccountId) {
      showAlert('Validation Error', 'Source and destination accounts must be different.');
      return;
    }
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      showAlert('Validation Error', 'Please enter a valid amount greater than 0.');
      return;
    }
    // Merchant description is optional
    // Basic date validation
    if (!date.trim() || date.length !== 10) {
      showAlert('Validation Error', 'Please enter date in YYYY-MM-DD format.');
      return;
    }

    if (isRecurring && !isEditing) {
      const recData = {
        accountId,
        toAccountId: type === 'transfer' ? toAccountId || undefined : undefined,
        amount,
        type,
        merchant: type === 'transfer' ? 'Transfer' : merchant.trim(),
        category: type === 'transfer' ? 'Transfer' : category,
        frequency: recurringFreq,
        nextProcessDate: date,
      };
      createRecurring(recData, {
        onSuccess: () => {
          showToast('Recurring transaction created', 'success');
          router.back();
        },
      });
      return;
    }

    const txData = {
      accountId,
      toAccountId: type === 'transfer' ? toAccountId || undefined : undefined,
      amount,
      type,
      merchant: type === 'transfer' ? 'Transfer' : merchant.trim(),
      category: type === 'transfer' ? 'Transfer' : category,
      date,
      isRecurring,
      note: '', // Could add note field later
    };

    if (isEditing && id) {
      updateTransaction(id, txData, {
        onSuccess: () => {
          evaluateTransactionBudgetAlerts(txData);
          showToast('Transaction updated successfully', 'success');
          router.back();
        },
      });
    } else {
      createTransaction(txData, {
        onSuccess: () => {
          evaluateTransactionBudgetAlerts(txData);
          showToast('Transaction added successfully', 'success');
          router.back();
        },
      });
    }
  };

  const handleDelete = () => {
    if (isEditing && id) {
      showAlert('Delete Transaction', 'Are you sure you want to delete this transaction?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteTransaction(id, {
              onSuccess: () => {
                showToast('Transaction deleted', 'success');
                router.back();
              },
            });
          },
        },
      ]);
    }
  };

  const selectedAccount = accounts.find((a) => a.id === accountId);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header showBack title={isEditing ? 'Edit Transaction' : 'Add Transaction'} />

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
                <Text style={[styles.typeButtonText, type === t && styles.typeButtonTextActive]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Amount Input */}
          <View style={styles.amountContainer}>
            <Text style={styles.amountLabel}>Amount</Text>
            <View style={styles.amountInputRow}>
              <Text style={styles.currencySymbol}>{getCurrencySymbol()}</Text>
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
            {type === 'transfer' ? (
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>To Account</Text>

                {isLoadingAccounts ? (
                  <View style={styles.accountSelector}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : accounts.length === 0 ? (
                  <View style={styles.accountSelector}>
                    <Text style={{ color: colors.error }}>No accounts available.</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.accountSelector}
                    onPress={() => setShowToAccountMenu(true)}
                    activeOpacity={0.7}
                  >
                    {toAccountId && accounts.find((a) => a.id === toAccountId) ? (
                      <View style={styles.accountSelectorLeft}>
                        <View style={styles.accountIconBox}>
                          <MaterialIcons
                            name={getAccountTypeIcon(
                              accounts.find((a) => a.id === toAccountId)!.type
                            )}
                            size={16}
                            color={colors.onPrimaryContainer}
                          />
                        </View>
                        <View>
                          <Text style={styles.accountSelectorName}>
                            {accounts.find((a) => a.id === toAccountId)!.name}
                          </Text>
                          {accounts.find((a) => a.id === toAccountId)!.lastFour && (
                            <Text style={styles.accountSelectorNumber}>
                              ...{accounts.find((a) => a.id === toAccountId)!.lastFour}
                            </Text>
                          )}
                        </View>
                      </View>
                    ) : (
                      <Text style={{ color: colors.onSurfaceVariant }}>
                        Select destination account
                      </Text>
                    )}
                    <MaterialIcons name="expand-more" size={24} color={colors.onSurfaceVariant} />
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <>
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

                {/* Category */}
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Category</Text>
                  <TouchableOpacity
                    style={styles.textInputWrapper}
                    onPress={() => setShowCategoryMenu(true)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons
                      name={getCategoryIcon(category)}
                      size={24}
                      color={colors.primary}
                      style={styles.inputIcon}
                    />
                    <View style={[styles.textInput, { justifyContent: 'center' }]}>
                      <Text style={{ color: colors.onSurface }}>{category}</Text>
                    </View>
                    <MaterialIcons
                      name="expand-more"
                      size={24}
                      color={colors.onSurfaceVariant}
                      style={styles.inputRightIcon}
                    />
                  </TouchableOpacity>
                </View>
              </>
            )}

            <View style={[styles.inputContainer, { zIndex: 1 }]}>
              <Text style={styles.inputLabel}>Date</Text>
              <TouchableOpacity
                style={styles.textInputWrapper}
                onPress={() => setShowDatePicker(true)}
              >
                <View style={[styles.textInput, { paddingLeft: 16, justifyContent: 'center' }]}>
                  <Text style={{ color: date ? colors.onSurface : colors.outline }}>
                    {date || 'YYYY-MM-DD'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={new Date(date || new Date())}
                mode="date"
                display="default"
                onChange={(event, selectedDate) => {
                  setShowDatePicker(false);
                  if (event.type === 'set' && selectedDate) {
                    setDate(selectedDate.toISOString().split('T')[0]);
                  }
                }}
              />
            )}

            {/* Account Selector */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Account</Text>

              {isLoadingAccounts ? (
                <View style={styles.accountSelector}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : accounts.length === 0 ? (
                <View style={styles.accountSelector}>
                  <Text style={{ color: colors.error }}>
                    No accounts available. Please add one first.
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.accountSelector}
                  onPress={() => setShowAccountMenu(true)}
                  activeOpacity={0.7}
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
                          <Text style={styles.accountSelectorNumber}>
                            ...{selectedAccount.lastFour}
                          </Text>
                        )}
                      </View>
                    </View>
                  ) : (
                    <Text style={{ color: colors.onSurfaceVariant }}>Select an account</Text>
                  )}
                  <MaterialIcons name="expand-more" size={24} color={colors.onSurfaceVariant} />
                </TouchableOpacity>
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
                disabled={isEditing}
              />
            </View>

            {isRecurring && !isEditing && (
              <View style={styles.frequencySection}>
                <Text style={styles.inputLabel}>Repeat Frequency</Text>
                <View style={styles.freqPillRow}>
                  {(['daily', 'weekly', 'monthly', 'yearly'] as RecurringFrequency[]).map(
                    (freq) => {
                      const isSelected = recurringFreq === freq;
                      return (
                        <TouchableOpacity
                          key={freq}
                          style={[styles.freqPill, isSelected && styles.freqPillActive]}
                          onPress={() => setRecurringFreq(freq)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[styles.freqPillText, isSelected && styles.freqPillTextActive]}
                          >
                            {freq.charAt(0).toUpperCase() + freq.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      );
                    }
                  )}
                </View>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.submitButton,
              (isPending || isLoadingAccounts || accounts.length === 0) && { opacity: 0.5 },
            ]}
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

      {/* Category Selection Bottom Sheet Modal */}
      <Modal
        visible={showCategoryMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCategoryMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowCategoryMenu(false)}
        >
          <View
            style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <View style={styles.categoryIconBoxHeader}>
                  <MaterialIcons name="category" size={20} color={colors.primary} />
                </View>
                <Text style={styles.modalTitle}>Select Category</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowCategoryMenu(false)}
              >
                <MaterialIcons name="close" size={24} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
            >
              {allCategories.map((cat) => {
                const isSelected = cat === category;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryOption, isSelected && styles.categoryOptionSelected]}
                    onPress={() => {
                      setCategory(cat);
                      setShowCategoryMenu(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.categoryOptionLeft}>
                      <View
                        style={[
                          styles.categoryIconBox,
                          isSelected && { backgroundColor: colors.primary },
                        ]}
                      >
                        <MaterialIcons
                          name={getCategoryIcon(cat)}
                          size={20}
                          color={isSelected ? colors.onPrimary : colors.primary}
                        />
                      </View>
                      <Text
                        style={[
                          styles.categoryOptionText,
                          isSelected && { color: colors.primary, fontWeight: '700' },
                        ]}
                      >
                        {cat}
                      </Text>
                    </View>
                    {isSelected && <MaterialIcons name="check" size={20} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
      {/* Account Selection Bottom Sheet Modal */}
      <Modal
        visible={showAccountMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAccountMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowAccountMenu(false)}
        >
          <View
            style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <View style={styles.categoryIconBoxHeader}>
                  <MaterialIcons name="account-balance" size={20} color={colors.primary} />
                </View>
                <Text style={styles.modalTitle}>Select Account</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowAccountMenu(false)}
              >
                <MaterialIcons name="close" size={24} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
            >
              {accounts.map((acc) => {
                const isSelected = acc.id === accountId;
                return (
                  <TouchableOpacity
                    key={acc.id}
                    style={[styles.categoryOption, isSelected && styles.categoryOptionSelected]}
                    onPress={() => {
                      setAccountId(acc.id);
                      setShowAccountMenu(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.categoryOptionLeft}>
                      <View
                        style={[
                          styles.categoryIconBox,
                          isSelected && { backgroundColor: colors.primary },
                        ]}
                      >
                        <MaterialIcons
                          name={getAccountTypeIcon(acc.type)}
                          size={20}
                          color={isSelected ? colors.onPrimary : colors.primary}
                        />
                      </View>
                      <View>
                        <Text
                          style={[
                            styles.categoryOptionText,
                            isSelected && { color: colors.primary, fontWeight: '700' },
                          ]}
                        >
                          {acc.name}
                        </Text>
                        {acc.lastFour && (
                          <Text
                            style={{
                              ...typography.labelMd,
                              color: colors.onSurfaceVariant,
                              fontSize: 11,
                            }}
                          >
                            Account ending in ...{acc.lastFour}
                          </Text>
                        )}
                      </View>
                    </View>
                    {isSelected && <MaterialIcons name="check" size={20} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Destination Account Selection Bottom Sheet Modal */}
      <Modal
        visible={showToAccountMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowToAccountMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowToAccountMenu(false)}
        >
          <View
            style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <View style={styles.categoryIconBoxHeader}>
                  <MaterialIcons name="account-balance" size={20} color={colors.primary} />
                </View>
                <Text style={styles.modalTitle}>Select Destination Account</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowToAccountMenu(false)}
              >
                <MaterialIcons name="close" size={24} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
            >
              {accounts.map((acc) => {
                const isSelected = acc.id === toAccountId;
                return (
                  <TouchableOpacity
                    key={acc.id}
                    style={[styles.categoryOption, isSelected && styles.categoryOptionSelected]}
                    onPress={() => {
                      setToAccountId(acc.id);
                      setShowToAccountMenu(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.categoryOptionLeft}>
                      <View
                        style={[
                          styles.categoryIconBox,
                          isSelected && { backgroundColor: colors.primary },
                        ]}
                      >
                        <MaterialIcons
                          name={getAccountTypeIcon(acc.type)}
                          size={20}
                          color={isSelected ? colors.onPrimary : colors.primary}
                        />
                      </View>
                      <View>
                        <Text
                          style={[
                            styles.categoryOptionText,
                            isSelected && { color: colors.primary, fontWeight: '700' },
                          ]}
                        >
                          {acc.name}
                        </Text>
                        {acc.lastFour && (
                          <Text
                            style={{
                              ...typography.labelMd,
                              color: colors.onSurfaceVariant,
                              fontSize: 11,
                            }}
                          >
                            Account ending in ...{acc.lastFour}
                          </Text>
                        )}
                      </View>
                    </View>
                    {isSelected && <MaterialIcons name="check" size={20} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surfaceContainerLow,
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
    frequencySection: {
      gap: 8,
      marginTop: 8,
    },
    freqPillRow: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceContainer,
      borderRadius: 12,
      padding: 4,
      gap: 4,
    },
    freqPill: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    freqPillActive: {
      backgroundColor: colors.primary,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    freqPillText: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      fontSize: 12,
    },
    freqPillTextActive: {
      color: colors.onPrimary,
      fontWeight: '700',
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
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: colors.surfaceContainerLowest,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '75%',
      paddingTop: 20,
      paddingHorizontal: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.1,
      shadowRadius: 16,
      elevation: 8,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceVariant,
    },
    modalHeaderTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    categoryIconBoxHeader: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
    },
    modalCloseBtn: {
      padding: 4,
    },
    modalScroll: {
      maxHeight: 380,
    },
    modalScrollContent: {
      paddingVertical: 12,
      gap: 4,
    },
    categoryOption: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
    },
    categoryOptionSelected: {
      backgroundColor: colors.surfaceContainer,
    },
    categoryOptionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    categoryIconBox: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryOptionText: {
      ...typography.bodyLg,
      color: colors.onSurface,
    },
  });
  return styles;
};

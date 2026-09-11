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
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Text, Header, DatePickerModal, useToast, useAlert } from '@/components/ui';
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
import type { TransactionType, RecurringFrequency } from '@/types';
import { getAccountTypeIcon, getCategoryIcon } from '@/utils/icons';
import { getCurrencySymbol } from '@/utils/format';
import { evaluateTransactionBudgetAlerts } from '@/services/notifications/alert-engine';
import { calculateNextDate } from '@/services/database/recurring-dao';

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

  const params = useLocalSearchParams<{
    id?: string;
    type?: TransactionType;
    toAccountId?: string;
    accountId?: string;
    amount?: string;
  }>();
  const id = params.id;
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

  const [type, setType] = useState<TransactionType>(params.type || 'expense');
  const [amountStr, setAmountStr] = useState(params.amount || '');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [accountId, setAccountId] = useState<string | null>(params.accountId || null);
  const [toAccountId, setToAccountId] = useState<string | null>(params.toAccountId || null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFreq, setRecurringFreq] = useState<RecurringFrequency>('monthly');
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Split Category states
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [splitItems, setSplitItems] = useState<{ category: string; amount: string }[]>([
    { category: CATEGORIES[0], amount: '' },
    { category: CATEGORIES[1], amount: '' },
  ]);
  const [activeSplitCategoryIndex, setActiveSplitCategoryIndex] = useState<number | null>(null);

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
      if (transaction.splits && transaction.splits.length > 0) {
        setIsSplitMode(true);
        setSplitItems(
          transaction.splits.map((s) => ({
            category: s.category,
            amount: s.amount.toString(),
          }))
        );
      }
      setInitialized(true);
    }
  }, [isEditing, transaction, initialized]);

  // Set default account once accounts load
  React.useEffect(() => {
    if (accounts.length > 0 && !accountId && !isEditing) {
      setAccountId(params.accountId || accounts[0].id);
    }
  }, [accounts, accountId, isEditing, params.accountId]);

  const handleSave = () => {
    if (!accountId) {
      showToast('Please select an account', 'error');
      return;
    }
    if (type === 'transfer' && !toAccountId) {
      showToast('Please select a destination account', 'error');
      return;
    }
    if (type === 'transfer' && accountId === toAccountId) {
      showToast('Source and destination accounts must be different', 'error');
      return;
    }
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid amount greater than 0', 'error');
      return;
    }
    // Merchant description is optional
    // Basic date validation
    if (!date.trim() || date.length !== 10) {
      showToast('Please enter date in YYYY-MM-DD format', 'error');
      return;
    }

    let splitsToSave: { category: string; amount: number }[] | undefined = undefined;
    if (type === 'expense' && isSplitMode) {
      const validSplits = splitItems.filter((s) => parseFloat(s.amount) > 0);
      if (validSplits.length < 2) {
        showToast('Please add at least 2 categories with amounts for split', 'error');
        return;
      }
      const splitSum = validSplits.reduce((acc, s) => acc + (parseFloat(s.amount) || 0), 0);
      if (Math.abs(splitSum - amount) > 0.01) {
        showToast(
          `Sum of split amounts (${splitSum}) must equal total amount (${amount})`,
          'error'
        );
        return;
      }
      splitsToSave = validSplits.map((s) => ({
        category: s.category,
        amount: parseFloat(s.amount),
      }));
    }

    const txData = {
      accountId,
      toAccountId: type === 'transfer' ? toAccountId || undefined : undefined,
      amount,
      type,
      merchant: type === 'transfer' ? 'Transfer' : (merchant.trim() || category),
      category: type === 'transfer' ? 'Transfer' : category,
      date,
      isRecurring,
      splits: splitsToSave,
      note: '',
    };

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    if (isEditing && id) {
      updateTransaction(id, txData, {
        onSuccess: () => {
          evaluateTransactionBudgetAlerts(txData);
          showToast('Transaction updated successfully', 'success');
          router.back();
        },
      });
      return;
    }

    // New transaction with future recurring date
    if (isRecurring && date > today) {
      const recData = {
        accountId,
        toAccountId: type === 'transfer' ? toAccountId || undefined : undefined,
        amount,
        type,
        merchant: txData.merchant,
        category: txData.category,
        frequency: recurringFreq,
        nextProcessDate: date,
        splits: splitsToSave,
      };
      createRecurring(recData, {
        onSuccess: () => {
          showToast(`Recurring schedule created (First on ${date})`, 'success');
          router.back();
        },
      });
      return;
    }

    // New transaction occurring today (or past): record transaction now & schedule next cycle
    createTransaction(txData, {
      onSuccess: () => {
        evaluateTransactionBudgetAlerts(txData);

        if (isRecurring) {
          const nextDate = calculateNextDate(date, recurringFreq);
          const recData = {
            accountId,
            toAccountId: type === 'transfer' ? toAccountId || undefined : undefined,
            amount,
            type,
            merchant: txData.merchant,
            category: txData.category,
            frequency: recurringFreq,
            nextProcessDate: nextDate,
            lastProcessedDate: date,
            splits: splitsToSave,
          };
          createRecurring(recData, {
            onSuccess: () => {
              showToast(`Transaction added & scheduled ${recurringFreq}`, 'success');
              router.back();
            },
          });
        } else {
          showToast('Transaction added successfully', 'success');
          router.back();
        }
      },
    });
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
                if (transaction) {
                  evaluateTransactionBudgetAlerts(transaction);
                }
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

            {/* Quick Amount Chips */}
            <View style={styles.quickChipsRow}>
              {[100, 500, 1000, 2000].map((delta) => (
                <TouchableOpacity
                  key={delta}
                  style={styles.quickChip}
                  onPress={() => {
                    const curr = parseFloat(amountStr) || 0;
                    setAmountStr((curr + delta).toString());
                  }}
                >
                  <Text style={styles.quickChipText}>+{delta}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.quickChip, { borderColor: colors.error + '44' }]}
                onPress={() => setAmountStr('')}
              >
                <Text style={[styles.quickChipText, { color: colors.error }]}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Form Fields */}
          <View style={styles.formGroup}>
            {type === 'transfer' ? (
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>To Account</Text>

                {isLoadingAccounts ? (
                  <View style={[styles.textInput, { justifyContent: 'center' }]}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : accounts.length === 0 ? (
                  <View style={[styles.textInput, { justifyContent: 'center' }]}>
                    <Text style={{ color: colors.error }}>No accounts available.</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.textInputWrapper}
                    onPress={() => setShowToAccountMenu(true)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons
                      name={
                        toAccountId && accounts.find((a) => a.id === toAccountId)
                          ? getAccountTypeIcon(accounts.find((a) => a.id === toAccountId)!.type)
                          : 'account-balance'
                      }
                      size={24}
                      color={colors.primary}
                      style={styles.inputIcon}
                    />
                    <View style={[styles.textInput, { justifyContent: 'center' }]}>
                      <Text
                        style={{
                          color:
                            toAccountId && accounts.find((a) => a.id === toAccountId)
                              ? colors.onSurface
                              : colors.outline,
                        }}
                      >
                        {toAccountId && accounts.find((a) => a.id === toAccountId)
                          ? `${accounts.find((a) => a.id === toAccountId)!.name}${
                              accounts.find((a) => a.id === toAccountId)!.lastFour
                                ? ` (...${accounts.find((a) => a.id === toAccountId)!.lastFour})`
                                : ''
                            }`
                          : 'Select destination account'}
                      </Text>
                    </View>
                    <MaterialIcons
                      name="expand-more"
                      size={24}
                      color={colors.onSurfaceVariant}
                      style={styles.inputRightIcon}
                    />
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <>
                {/* Merchant */}
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>
                    Merchant / Description{' '}
                    <Text style={{ color: colors.outline, fontWeight: '400' }}>(Optional)</Text>
                  </Text>
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

                {/* Category or Split Categories */}
                {type === 'expense' && (
                  <View style={styles.splitToggleContainer}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>Split across categories</Text>
                      <Text style={styles.splitToggleSubtitle}>
                        Divide expense into multiple budget buckets
                      </Text>
                    </View>
                    <Switch
                      value={isSplitMode}
                      onValueChange={setIsSplitMode}
                      trackColor={{ false: colors.surfaceVariant, true: colors.primary }}
                    />
                  </View>
                )}

                {!isSplitMode || type !== 'expense' ? (
                  <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>Category</Text>
                    <TouchableOpacity
                      style={styles.textInputWrapper}
                      onPress={() => {
                        setActiveSplitCategoryIndex(null);
                        setShowCategoryMenu(true);
                      }}
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
                ) : (
                  <View style={styles.splitsCard}>
                    <View style={styles.splitHeaderRow}>
                      <Text style={styles.splitHeaderTitle}>Category Splits</Text>
                      <Text
                        style={[
                          styles.splitSumText,
                          {
                            color:
                              Math.abs(
                                splitItems.reduce(
                                  (sum, s) => sum + (parseFloat(s.amount) || 0),
                                  0
                                ) - (parseFloat(amountStr) || 0)
                              ) < 0.01 && (parseFloat(amountStr) || 0) > 0
                                ? colors.primary
                                : colors.error,
                          },
                        ]}
                      >
                        Allocated:{' '}
                        {getCurrencySymbol() +
                          splitItems
                            .reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0)
                            .toFixed(2)}{' '}
                        / {getCurrencySymbol() + (parseFloat(amountStr) || 0).toFixed(2)}
                      </Text>
                    </View>

                    {splitItems.map((item, idx) => (
                      <View key={idx} style={styles.splitRow}>
                        <TouchableOpacity
                          style={styles.splitCategoryBtn}
                          onPress={() => {
                            setActiveSplitCategoryIndex(idx);
                            setShowCategoryMenu(true);
                          }}
                        >
                          <MaterialIcons
                            name={getCategoryIcon(item.category)}
                            size={18}
                            color={colors.primary}
                          />
                          <Text style={styles.splitCategoryText} numberOfLines={1}>
                            {item.category}
                          </Text>
                          <MaterialIcons
                            name="arrow-drop-down"
                            size={18}
                            color={colors.onSurfaceVariant}
                          />
                        </TouchableOpacity>

                        <View style={styles.splitAmountInputWrapper}>
                          <Text style={styles.splitCurrency}>{getCurrencySymbol()}</Text>
                          <TextInput
                            style={styles.splitAmountInput}
                            placeholder="0.00"
                            placeholderTextColor={colors.outline}
                            keyboardType="decimal-pad"
                            value={item.amount}
                            onChangeText={(val) => {
                              setSplitItems((prev) => {
                                const updated = [...prev];
                                updated[idx] = { ...updated[idx], amount: val };
                                return updated;
                              });
                            }}
                          />
                        </View>

                        {splitItems.length > 2 && (
                          <TouchableOpacity
                            style={styles.splitDeleteBtn}
                            onPress={() => {
                              setSplitItems((prev) => prev.filter((_, i) => i !== idx));
                            }}
                          >
                            <MaterialIcons name="close" size={18} color={colors.error} />
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}

                    <TouchableOpacity
                      style={styles.addSplitBtn}
                      onPress={() => {
                        const unusedCat =
                          allCategories.find((c) => !splitItems.some((s) => s.category === c)) ||
                          allCategories[0];
                        setSplitItems((prev) => [...prev, { category: unusedCat, amount: '' }]);
                      }}
                    >
                      <MaterialIcons name="add" size={18} color={colors.primary} />
                      <Text style={[styles.addSplitBtnText, { color: colors.primary }]}>
                        Add Category Split
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            <View style={[styles.inputContainer, { zIndex: 1 }]}>
              <Text style={styles.inputLabel}>Date</Text>
              <TouchableOpacity
                style={styles.textInputWrapper}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}
              >
                <MaterialIcons
                  name="event"
                  size={24}
                  color={colors.primary}
                  style={styles.inputIcon}
                />
                <View style={[styles.textInput, { justifyContent: 'center' }]}>
                  <Text style={{ color: date ? colors.onSurface : colors.outline }}>
                    {date || 'Select Date'}
                  </Text>
                </View>
                <MaterialIcons
                  name="expand-more"
                  size={24}
                  color={colors.onSurfaceVariant}
                  style={styles.inputRightIcon}
                />
              </TouchableOpacity>
            </View>

            <DatePickerModal
              visible={showDatePicker}
              value={date}
              onChange={(newDate) => setDate(newDate)}
              onClose={() => setShowDatePicker(false)}
            />

            {/* Account Selector */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Account</Text>

              {isLoadingAccounts ? (
                <View style={[styles.textInput, { justifyContent: 'center' }]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : accounts.length === 0 ? (
                <View style={[styles.textInput, { justifyContent: 'center' }]}>
                  <Text style={{ color: colors.error }}>
                    No accounts available. Please add one first.
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.textInputWrapper}
                  onPress={() => setShowAccountMenu(true)}
                  activeOpacity={0.7}
                >
                  <MaterialIcons
                    name={
                      selectedAccount
                        ? getAccountTypeIcon(selectedAccount.type)
                        : 'account-balance'
                    }
                    size={24}
                    color={colors.primary}
                    style={styles.inputIcon}
                  />
                  <View style={[styles.textInput, { justifyContent: 'center' }]}>
                    <Text style={{ color: selectedAccount ? colors.onSurface : colors.outline }}>
                      {selectedAccount
                        ? `${selectedAccount.name}${
                            selectedAccount.lastFour ? ` (...${selectedAccount.lastFour})` : ''
                          }`
                        : 'Select an account'}
                    </Text>
                  </View>
                  <MaterialIcons
                    name="expand-more"
                    size={24}
                    color={colors.onSurfaceVariant}
                    style={styles.inputRightIcon}
                  />
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
                const isSelected =
                  activeSplitCategoryIndex !== null
                    ? splitItems[activeSplitCategoryIndex]?.category === cat
                    : cat === category;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryOption, isSelected && styles.categoryOptionSelected]}
                    onPress={() => {
                      if (activeSplitCategoryIndex !== null) {
                        setSplitItems((prev) => {
                          const updated = [...prev];
                          updated[activeSplitCategoryIndex] = {
                            ...updated[activeSplitCategoryIndex],
                            category: cat,
                          };
                          return updated;
                        });
                        setActiveSplitCategoryIndex(null);
                      } else {
                        setCategory(cat);
                      }
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

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 14,
                  marginTop: 8,
                  marginBottom: 16,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.primary + '50',
                  backgroundColor: colors.primaryContainer + '25',
                }}
                onPress={() => {
                  setShowCategoryMenu(false);
                  router.push('/manage-categories');
                }}
              >
                <MaterialIcons name="add-circle-outline" size={20} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>
                  Manage / Add Custom Categories
                </Text>
              </TouchableOpacity>
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
      justifyContent: 'center',
    },
    currencySymbol: {
      ...typography.dataLg,
      color: colors.onSurface,
      marginRight: 6,
    },
    amountInput: {
      ...typography.displayLg,
      color: colors.onSurface,
      textAlign: 'left',
      padding: 0,
      paddingVertical: 0,
      paddingHorizontal: 0,
      margin: 0,
      includeFontPadding: false,
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
    quickChipsRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
      justifyContent: 'center',
      flexWrap: 'wrap',
    },
    quickChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
    },
    quickChipText: {
      ...typography.labelMd,
      color: colors.onSurface,
      fontWeight: '600',
    },
    splitToggleContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.surfaceVariant,
    },
    splitToggleSubtitle: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      fontSize: 11,
      marginTop: 2,
    },
    splitsCard: {
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 12,
      padding: 12,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
    },
    splitHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    splitHeaderTitle: {
      ...typography.labelMd,
      fontWeight: '600',
      color: colors.onSurface,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    splitSumText: {
      ...typography.labelMd,
      fontWeight: '600',
      fontSize: 11,
    },
    splitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    splitCategoryBtn: {
      flex: 1.2,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surfaceContainer,
      borderRadius: 8,
      paddingHorizontal: 10,
      height: 42,
    },
    splitCategoryText: {
      ...typography.bodyMd,
      color: colors.onSurface,
      flex: 1,
      fontSize: 13,
    },
    splitAmountInputWrapper: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainer,
      borderRadius: 8,
      paddingHorizontal: 8,
      height: 42,
    },
    splitCurrency: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      marginRight: 4,
    },
    splitAmountInput: {
      flex: 1,
      ...typography.bodyMd,
      color: colors.onSurface,
      padding: 0,
    },
    splitDeleteBtn: {
      padding: 6,
      borderRadius: 16,
      backgroundColor: colors.errorContainer + '33',
    },
    addSplitBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.primary + '44',
      borderStyle: 'dashed',
    },
    addSplitBtnText: {
      ...typography.labelMd,
      fontWeight: '600',
    },
  });
  return styles;
};

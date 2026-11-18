import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput, ScrollView, Platform } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Text, Header } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCreateAccount, useUpdateAccount, useAccount } from '@/hooks/use-accounts';
import { useToast, useAlert } from '@/components/ui';
import { ACCOUNT_TYPES, type AccountType } from '@/types';
import { getCurrencySymbol } from '@/utils/format';

export default function AddAccountScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeInsets();
  const router = useRouter();

  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;
  const { account, isLoading: isFetching } = useAccount(id);
  const { showToast } = useToast();
  const { showAlert } = useAlert();

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('savings');
  const [balanceStr, setBalanceStr] = useState('');
  const [institution, setInstitution] = useState('');
  const [lastFour, setLastFour] = useState('');
  const [billingCycleDayStr, setBillingCycleDayStr] = useState('');
  const [dueDayStr, setDueDayStr] = useState('');
  const [creditLimitStr, setCreditLimitStr] = useState('');
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const isLiability = ['credit', 'loan', 'borrowed'].includes(type);

  // Pre-populate if editing
  React.useEffect(() => {
    if (isEditing && account && !initialized) {
      setName(account.name);
      setType(account.type);
      const isAccLiability = ['credit', 'loan', 'borrowed'].includes(account.type);
      setBalanceStr(
        isAccLiability ? Math.abs(account.balance).toString() : account.balance.toString()
      );
      setInstitution(account.institution || '');
      setLastFour(account.lastFour || '');
      setBillingCycleDayStr(account.billingCycleDay ? account.billingCycleDay.toString() : '');
      setDueDayStr(account.dueDay ? account.dueDay.toString() : '');
      setCreditLimitStr(account.creditLimit ? account.creditLimit.toString() : '');
      setInitialized(true);
    }
  }, [isEditing, account, initialized]);

  const { mutate: createAccount, isPending: isCreating } = useCreateAccount();
  const { mutate: updateAccount, isPending: isUpdating } = useUpdateAccount();

  const isPending = isCreating || isUpdating;

  const handleSave = () => {
    if (!name.trim()) {
      showToast('Account name is required', 'error');
      return;
    }
    const rawBalance = parseFloat(balanceStr);
    if (isNaN(rawBalance)) {
      showToast('Please enter a valid balance', 'error');
      return;
    }

    // Auto-negate if account is a liability (handling both positive or negative user input)
    const balance = isLiability
      ? (rawBalance === 0 ? 0 : -Math.abs(rawBalance))
      : rawBalance;

    const cycleDay = parseInt(billingCycleDayStr, 10);
    const validCycleDay = !isNaN(cycleDay) && cycleDay >= 1 && cycleDay <= 31 ? cycleDay : undefined;

    const paymentDay = parseInt(dueDayStr, 10);
    const validDueDay = !isNaN(paymentDay) && paymentDay >= 1 && paymentDay <= 31 ? paymentDay : undefined;

    const creditLimitVal = parseFloat(creditLimitStr);
    const validCreditLimit = !isNaN(creditLimitVal) && creditLimitVal > 0 ? creditLimitVal : undefined;

    const accountData = {
      name: name.trim(),
      type,
      balance,
      institution: institution.trim(),
      lastFour: lastFour.trim().slice(0, 4),
      billingCycleDay: validCycleDay,
      dueDay: validDueDay,
      creditLimit: validCreditLimit,
    };

    if (isEditing && id) {
      updateAccount(id, accountData, {
        onSuccess: () => {
          showToast('Account updated successfully', 'success');
          router.back();
        },
      });
    } else {
      createAccount(accountData, {
        onSuccess: () => {
          showToast('Account added successfully', 'success');
          router.back();
        },
      });
    }
  };

  const selectedTypeLabel =
    ACCOUNT_TYPES.find((t) => t.value === type)?.label ?? 'Savings Account';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header showBack title={isEditing ? 'Edit Account' : 'Add Account'} />

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        enableResetScrollToCoords={false}
        extraScrollHeight={Platform.OS === 'ios' ? 140 : 160}
        extraHeight={Platform.OS === 'ios' ? 75 : 140}
        keyboardOpeningTime={0}
      >
        <View style={styles.formCard}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Account Name*</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. HDFC Salary, SBI, or Cash Wallet"
              placeholderTextColor={colors.outline}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Account Type*</Text>
            <TouchableOpacity
              style={styles.selectInputContainer}
              onPress={() => setShowTypeSelector(!showTypeSelector)}
            >
              <Text style={styles.selectInputValue}>{selectedTypeLabel}</Text>
              <MaterialIcons
                name={showTypeSelector ? 'expand-less' : 'expand-more'}
                size={24}
                color={colors.onSurfaceVariant}
              />
            </TouchableOpacity>
            {showTypeSelector && (
              <View style={styles.typeSelectorPopup}>
                {ACCOUNT_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t.value}
                    style={styles.typeOption}
                    onPress={() => {
                      setType(t.value);
                      setShowTypeSelector(false);
                    }}
                  >
                    <Text
                      style={
                        type === t.value ? styles.typeOptionTextSelected : styles.typeOptionText
                      }
                    >
                      {t.label}
                    </Text>
                    {type === t.value && (
                      <MaterialIcons name="check" size={20} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              {isLiability
                ? 'Outstanding Due / Amount Owed*'
                : type === 'lent'
                  ? 'Amount Lent / Given*'
                  : 'Current Balance*'}
            </Text>
            <View style={styles.currencyInputContainer}>
              <Text style={styles.currencySymbol}>{getCurrencySymbol()}</Text>
              <TextInput
                style={styles.currencyInput}
                placeholder="0.00"
                placeholderTextColor={colors.outline}
                keyboardType="decimal-pad"
                value={balanceStr}
                onChangeText={setBalanceStr}
              />
            </View>
            {isLiability ? (
              <Text style={styles.helperText}>
                Enter the amount you currently owe (leave 0 if all dues are cleared).
              </Text>
            ) : type === 'lent' ? (
              <Text style={styles.helperText}>
                Enter the amount you gave (money others owe you).
              </Text>
            ) : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Institution (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. HDFC Bank, ICICI, SBI, Paytm"
              placeholderTextColor={colors.outline}
              value={institution}
              onChangeText={setInstitution}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Last 4 Digits (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 1234"
              placeholderTextColor={colors.outline}
              keyboardType="number-pad"
              maxLength={4}
              value={lastFour}
              onChangeText={setLastFour}
            />
          </View>

          {type === 'credit' && (
            <View style={{ gap: 16, paddingTop: 4 }}>
              <View
                style={{
                  backgroundColor: colors.surfaceContainer,
                  padding: 12,
                  borderRadius: 12,
                  gap: 4,
                }}
              >
                <Text style={{ ...typography.labelMd, color: colors.primary, fontWeight: '700' }}>
                  Billing Cycle & Due Dates (Optional)
                </Text>
                <Text style={{ ...typography.bodyMd, fontSize: 12, lineHeight: 16, color: colors.onSurfaceVariant }}>
                  Enter the day of the month your statement generates and when payment is due to track billing cycles.
                </Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Total Credit Limit (Optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 100000"
                  placeholderTextColor={colors.outline}
                  keyboardType="decimal-pad"
                  value={creditLimitStr}
                  onChangeText={setCreditLimitStr}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Statement Day</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 15"
                    placeholderTextColor={colors.outline}
                    keyboardType="number-pad"
                    maxLength={2}
                    value={billingCycleDayStr}
                    onChangeText={setBillingCycleDayStr}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Payment Due Day</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 5"
                    placeholderTextColor={colors.outline}
                    keyboardType="number-pad"
                    maxLength={2}
                    value={dueDayStr}
                    onChangeText={setDueDayStr}
                  />
                </View>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, isPending && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={isPending}
          >
            <Text style={styles.submitBtnText}>
              {isPending ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Account'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    formCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      borderRadius: 16,
      padding: 24,
      gap: 20,
    },
    inputGroup: {
      gap: 8,
      position: 'relative',
    },
    label: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
    },
    input: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      ...typography.bodyLg,
      color: colors.onSurface,
    },
    selectInputContainer: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    selectInputValue: {
      ...typography.bodyLg,
      color: colors.onSurface,
    },
    typeSelectorPopup: {
      backgroundColor: colors.surfaceContainerHigh,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      marginTop: 4,
      overflow: 'hidden',
    },
    typeOption: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.surfaceVariant,
    },
    typeOptionText: {
      ...typography.bodyLg,
      color: colors.onSurface,
    },
    typeOptionTextSelected: {
      ...typography.bodyLg,
      color: colors.primary,
      fontWeight: '600',
    },
    currencyInputContainer: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    currencySymbol: {
      ...typography.bodyLg,
      color: colors.onSurfaceVariant,
      marginRight: 8,
    },
    currencyInput: {
      flex: 1,
      paddingVertical: 12,
      ...typography.bodyLg,
      color: colors.onSurface,
    },
    submitBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    submitBtnText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 15,
      lineHeight: 20,
      color: colors.onPrimary,
    },
    helperText: {
      ...typography.bodyMd,
      color: colors.outline,
      marginTop: 4,
    },
  });
  return styles;
};

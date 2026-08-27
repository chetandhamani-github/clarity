import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Text, Header } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCreateAccount, useUpdateAccount, useAccount } from '@/hooks/use-accounts';
import { useToast, useAlert } from '@/components/ui';
import { ACCOUNT_TYPES, type AccountType } from '@/types';
import { getCurrencySymbol } from '@/utils/format';

export default function AddAccountScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;
  const { account, isLoading: isFetching } = useAccount(id);
  const { showToast } = useToast();
  const { showAlert } = useAlert();

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [balanceStr, setBalanceStr] = useState('');
  const [institution, setInstitution] = useState('');
  const [lastFour, setLastFour] = useState('');
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Pre-populate if editing
  React.useEffect(() => {
    if (isEditing && account && !initialized) {
      setName(account.name);
      setType(account.type);
      setBalanceStr(account.balance.toString());
      setInstitution(account.institution || '');
      setLastFour(account.lastFour || '');
      setInitialized(true);
    }
  }, [isEditing, account, initialized]);

  const { mutate: createAccount, isPending: isCreating } = useCreateAccount();
  const { mutate: updateAccount, isPending: isUpdating } = useUpdateAccount();
  
  const isPending = isCreating || isUpdating;

  const handleSave = () => {
    if (!name.trim()) {
      showAlert('Validation Error', 'Account name is required.');
      return;
    }
    const balance = parseFloat(balanceStr);
    if (isNaN(balance)) {
      showAlert('Validation Error', 'Please enter a valid balance.');
      return;
    }

    const accountData = {
      name: name.trim(),
      type,
      balance,
      institution: institution.trim(),
      lastFour: lastFour.trim().slice(0, 4),
    };

    if (isEditing && id) {
      updateAccount(id, accountData, {
        onSuccess: () => {
          showToast('Account updated successfully', 'success');
          router.back();
        }
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

  const selectedTypeLabel = ACCOUNT_TYPES.find((t) => t.value === type)?.label ?? 'Checking';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header
        showBack
        title={isEditing ? 'Edit Account' : 'Add Account'}
      />

      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 60 }]}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
      >
        <View style={styles.formCard}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Account Name*</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Chase Checking"
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
                    <Text style={type === t.value ? styles.typeOptionTextSelected : styles.typeOptionText}>
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
            <Text style={styles.label}>Current Balance*</Text>
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
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Institution (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. JPMorgan Chase"
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

    iconButton: {
      padding: 8,
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
      color: colors.onPrimary,
    },
  });
  return styles;
};

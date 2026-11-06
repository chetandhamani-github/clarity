import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Modal,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { Text, Header, DatePickerModal } from '@/components/ui';
import { typography, useTheme, radius } from '@/theme';
import { formatCurrencyPrivacy } from '@/utils/format';
import { useAppStore } from '@/store/use-app-store';
import { useSplitwiseStore } from '../store/splitwise.store';
import { BalanceCalculator } from '../services/BalanceCalculator';
import type { SettlementType } from '../types/splitwise.types';

export interface SettlementFormData {
  personId: string;
  amount: string;
  type: SettlementType;
  description: string;
  date: string; // YYYY-MM-DD
}

interface PaymentMethodOption {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  value: string;
}

const PAYMENT_METHODS: PaymentMethodOption[] = [
  { label: 'UPI / GPay', icon: 'qr-code-scanner', value: 'UPI / GPay' },
  { label: 'Cash', icon: 'payments', value: 'Cash' },
  { label: 'Bank Transfer', icon: 'account-balance', value: 'Bank Transfer' },
  { label: 'PhonePe / Paytm', icon: 'phone-android', value: 'PhonePe / Paytm' },
  { label: 'Full Settlement', icon: 'handshake', value: 'Full Settlement' },
  { label: 'Bill Adjustment', icon: 'receipt-long', value: 'Bill Adjustment' },
];

const QUICK_AMOUNTS = [100, 500, 1000, 2000];

export function SettlementScreen() {
  const { colors } = useTheme();
  const insets = useSafeInsets();
  const router = useRouter();
  const { hideBalances } = useAppStore();

  const params = useLocalSearchParams<{
    personId?: string;
    type?: SettlementType;
    amount?: string;
    description?: string;
  }>();

  const {
    people,
    debts,
    settlements,
    addSettlement,
    loadAllData,
    isLoading,
  } = useSplitwiseStore();

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, []);

  const initialPersonId = useMemo(() => {
    if (params.personId && people.some((p) => p.id === params.personId)) {
      return params.personId;
    }
    return people.length > 0 ? people[0].id : '';
  }, [params.personId, people]);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPersonPicker, setShowPersonPicker] = useState(false);
  const [friendSearch, setFriendSearch] = useState('');

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SettlementFormData>({
    defaultValues: {
      personId: initialPersonId,
      amount: params.amount || '',
      type: params.type || 'THEY_PAID',
      description: params.description || '',
      date: todayStr,
    },
    mode: 'onTouched',
  });

  const selectedPersonId = watch('personId');
  const selectedType = watch('type');
  const selectedDate = watch('date');
  const currentAmount = watch('amount');
  const currentDescription = watch('description');

  useEffect(() => {
    if (people.length === 0) {
      loadAllData();
    }
  }, [people.length, loadAllData]);

  useEffect(() => {
    if (initialPersonId && !selectedPersonId) {
      setValue('personId', initialPersonId);
    }
  }, [initialPersonId, selectedPersonId, setValue]);

  const selectedPerson = useMemo(
    () => people.find((p) => p.id === selectedPersonId),
    [people, selectedPersonId]
  );

  const personBalance = useMemo(() => {
    if (!selectedPerson) return null;
    return BalanceCalculator.calculatePersonBalance(
      selectedPerson.id,
      debts,
      settlements,
      selectedPerson
    );
  }, [selectedPerson, debts, settlements]);

  // Auto-detect direction and prefill amount from current balance if not user-specified
  useEffect(() => {
    if (personBalance && !params.type) {
      if (personBalance.status === 'YOU_OWE' && selectedType !== 'YOU_PAID' && !params.amount) {
        setValue('type', 'YOU_PAID');
        if ((personBalance.remainingPayable ?? 0) > 0 && !currentAmount) {
          setValue('amount', (personBalance.remainingPayable ?? Math.abs(personBalance.netBalance)).toString());
        }
      } else if (personBalance.status === 'OWED_TO_ME' && selectedType !== 'THEY_PAID' && !params.amount) {
        setValue('type', 'THEY_PAID');
        if (personBalance.remainingReceivable > 0 && !currentAmount) {
          setValue('amount', personBalance.remainingReceivable.toString());
        }
      }
    }
  }, [personBalance, selectedType, currentAmount, params.amount, params.type, setValue]);

  const filteredPeople = useMemo(() => {
    if (!friendSearch.trim()) return people;
    const q = friendSearch.toLowerCase().trim();
    return people.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.phone && p.phone.toLowerCase().includes(q))
    );
  }, [people, friendSearch]);

  const parsedAmount = parseFloat(currentAmount) || 0;

  // Calculate projected balance after this settlement
  const projectedBalance = useMemo(() => {
    if (!personBalance) return 0;
    const delta = selectedType === 'YOU_PAID' ? parsedAmount : -parsedAmount;
    return BalanceCalculator.roundCurrency(personBalance.netBalance + delta);
  }, [personBalance, parsedAmount, selectedType]);

  const onSubmit = async (data: SettlementFormData) => {
    if (!data.personId) {
      Alert.alert('Required', 'Please select a friend for this settlement');
      return;
    }

    const amt = parseFloat(data.amount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid settlement amount greater than 0');
      return;
    }

    try {
      let createdAtIso: string;
      if (data.date === todayStr) {
        createdAtIso = new Date().toISOString();
      } else {
        const dateObj = new Date(`${data.date}T12:00:00.000Z`);
        createdAtIso = !isNaN(dateObj.getTime()) ? dateObj.toISOString() : new Date().toISOString();
      }

      await addSettlement({
        personId: data.personId,
        amount: amt,
        settlementType: data.type,
        description: data.description.trim() || undefined,
        createdAt: createdAtIso,
      });

      router.back();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to record settlement';
      Alert.alert('Error', msg);
    }
  };

  const personFirstName = selectedPerson ? selectedPerson.name.split(' ')[0] : 'Friend';
  const isTheyPaid = selectedType === 'THEY_PAID';
  const themeColor = isTheyPaid ? '#10b981' : '#ef4444';

  const addQuickAmount = (delta: number) => {
    const current = parseFloat(currentAmount) || 0;
    const nextVal = (current + delta).toString();
    setValue('amount', nextVal, { shouldValidate: true });
  };

  const fullSettlementAmount = useMemo(() => {
    if (!personBalance) return 0;
    if (selectedType === 'YOU_PAID') {
      return personBalance.remainingPayable ?? Math.abs(personBalance.netBalance);
    }
    return personBalance.remainingReceivable;
  }, [personBalance, selectedType]);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
          paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 20 : 16),
        },
      ]}
    >
      <Header
        title="Record Settlement"
        showBack
        rightNode={
          <TouchableOpacity
            onPress={handleSubmit(onSubmit)}
            disabled={isSubmitting || isLoading}
            style={[styles.headerSaveBtn, { backgroundColor: colors.primary }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {isSubmitting || isLoading ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <Text style={[styles.headerSaveText, { color: colors.onPrimary }]}>Save</Text>
            )}
          </TouchableOpacity>
        }
      />

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 16) + 140 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        enableResetScrollToCoords={false}
        extraScrollHeight={Platform.OS === 'ios' ? 140 : 160}
        extraHeight={Platform.OS === 'ios' ? 75 : 140}
        keyboardOpeningTime={0}
      >
        {/* CARD 1: FRIEND / CONTACT SELECTOR */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <View style={styles.labelWithIcon}>
              <MaterialIcons name="person" size={18} color={colors.primary} />
              <Text style={[styles.cardSectionTitle, { color: colors.onSurface }]}>Friend / Contact</Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowPersonPicker(true)}
              style={[styles.changeFriendBtn, { backgroundColor: colors.surfaceContainerHigh }]}
            >
              <Text style={[styles.changeFriendText, { color: colors.primary }]}>
                {selectedPerson ? 'Change' : 'Select'}
              </Text>
              <MaterialIcons name="expand-more" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {selectedPerson ? (
            <TouchableOpacity
              style={[
                styles.selectedFriendBox,
                {
                  backgroundColor: colors.surfaceContainerLowest,
                  borderColor: colors.surfaceVariant,
                },
              ]}
              onPress={() => setShowPersonPicker(true)}
              activeOpacity={0.8}
            >
              <View style={[styles.avatarCircle, { backgroundColor: colors.primaryContainer }]}>
                <Text style={[styles.avatarText, { color: colors.onPrimaryContainer }]}>
                  {selectedPerson.name
                    .split(' ')
                    .filter(Boolean)
                    .map((n) => n[0])
                    .join('')
                    .substring(0, 2)
                    .toUpperCase()}
                </Text>
              </View>
              <View style={styles.selectedFriendInfo}>
                <Text style={[styles.selectedFriendName, { color: colors.onSurface }]}>
                  {selectedPerson.name}
                </Text>
                {personBalance && (
                  <Text
                    style={[
                      styles.selectedFriendBalance,
                      {
                        color:
                          personBalance.status === 'OWED_TO_ME'
                            ? '#10b981'
                            : personBalance.status === 'YOU_OWE'
                              ? '#ef4444'
                              : colors.onSurfaceVariant,
                      },
                    ]}
                  >
                    {personBalance.statusLabel}: {formatCurrencyPrivacy(Math.abs(personBalance.netBalance), hideBalances)}
                  </Text>
                )}
              </View>
              <MaterialIcons name="check-circle" size={20} color={colors.primary} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.selectPromptBox,
                {
                  backgroundColor: colors.surfaceContainerLowest,
                  borderColor: colors.outlineVariant,
                },
              ]}
              onPress={() => setShowPersonPicker(true)}
            >
              <MaterialIcons name="person-add" size={22} color={colors.primary} />
              <Text style={[styles.selectPromptText, { color: colors.onSurfaceVariant }]}>
                Tap to select a friend
              </Text>
            </TouchableOpacity>
          )}

          {errors.personId && (
            <View style={styles.errorRow}>
              <MaterialIcons name="error-outline" size={14} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>{errors.personId.message}</Text>
            </View>
          )}
        </View>

        {/* CARD 2: DIRECTION SELECTOR ("Rahul paid me" vs "I paid Rahul") */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          <Text style={[styles.cardSectionTitle, { color: colors.onSurface }]}>
            Who made the payment?
          </Text>

          <View style={[styles.directionToggleContainer, { backgroundColor: colors.surfaceContainerHigh }]}>
            <TouchableOpacity
              style={[
                styles.directionToggleBtn,
                isTheyPaid && {
                  backgroundColor: colors.surfaceContainerLowest,
                  borderColor: '#10b981',
                  borderWidth: 1.5,
                },
              ]}
              onPress={() => {
                setValue('type', 'THEY_PAID');
                if (personBalance && personBalance.remainingReceivable > 0) {
                  setValue('amount', personBalance.remainingReceivable.toString(), {
                    shouldValidate: true,
                  });
                }
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name="call-received"
                size={18}
                color={isTheyPaid ? '#10b981' : colors.onSurfaceVariant}
              />
              <Text
                style={[
                  styles.directionToggleText,
                  {
                    color: isTheyPaid ? colors.onSurface : colors.onSurfaceVariant,
                    fontFamily: isTheyPaid ? 'Manrope_700Bold' : 'Manrope_600SemiBold',
                  },
                ]}
              >
                {personFirstName} paid me
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.directionToggleBtn,
                !isTheyPaid && {
                  backgroundColor: colors.surfaceContainerLowest,
                  borderColor: '#ef4444',
                  borderWidth: 1.5,
                },
              ]}
              onPress={() => {
                setValue('type', 'YOU_PAID');
                if (personBalance && (personBalance.remainingPayable ?? 0) > 0) {
                  setValue(
                    'amount',
                    (personBalance.remainingPayable ?? Math.abs(personBalance.netBalance)).toString(),
                    { shouldValidate: true }
                  );
                }
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name="call-made"
                size={18}
                color={!isTheyPaid ? '#ef4444' : colors.onSurfaceVariant}
              />
              <Text
                style={[
                  styles.directionToggleText,
                  {
                    color: !isTheyPaid ? colors.onSurface : colors.onSurfaceVariant,
                    fontFamily: !isTheyPaid ? 'Manrope_700Bold' : 'Manrope_600SemiBold',
                  },
                ]}
              >
                I paid {personFirstName}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.directionSubtitle, { color: colors.onSurfaceVariant }]}>
            {isTheyPaid
              ? `${personFirstName} is paying you to clear what they owe you.`
              : `You are paying ${personFirstName} to clear what you owe them.`}
          </Text>
        </View>

        {/* CARD 3: AMOUNT HERO CARD */}
        <View
          style={[
            styles.amountCard,
            {
              backgroundColor: colors.surfaceContainerLowest,
              borderColor: errors.amount ? colors.error : colors.surfaceVariant,
            },
          ]}
        >
          <Text style={[styles.amountLabel, { color: colors.onSurfaceVariant }]}>
            SETTLEMENT AMOUNT <Text style={{ color: colors.error }}>*</Text>
          </Text>

          <Controller
            control={control}
            name="amount"
            rules={{
              required: 'Settlement amount is required',
              validate: (val) => {
                const num = parseFloat(val);
                return (!isNaN(num) && num > 0) || 'Enter a valid amount greater than 0';
              },
            }}
            render={({ field: { onChange, onBlur, value } }) => (
              <View style={styles.amountInputRow}>
                <Text style={[styles.amountCurrency, { color: themeColor }]}>
                  {isTheyPaid ? '+' : '-'}₹
                </Text>
                <TextInput
                  style={[styles.amountInput, { color: colors.onSurface }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.outline}
                  keyboardType="decimal-pad"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  autoFocus={!params.amount}
                />
              </View>
            )}
          />

          {errors.amount && (
            <View style={styles.errorRow}>
              <MaterialIcons name="error-outline" size={14} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>{errors.amount.message}</Text>
            </View>
          )}

          {/* Smart Balance Settle Shortcuts */}
          {fullSettlementAmount > 0 && (
            <View style={styles.smartShortcutsRow}>
              <TouchableOpacity
                style={[
                  styles.fullSettleChip,
                  {
                    backgroundColor: colors.primaryContainer + '25',
                    borderColor: colors.primary,
                  },
                ]}
                onPress={() => {
                  setValue('amount', fullSettlementAmount.toString(), {
                    shouldValidate: true,
                  });
                }}
              >
                <MaterialIcons name="done-all" size={16} color={colors.primary} />
                <Text style={[styles.fullSettleChipText, { color: colors.primary }]}>
                  Settle Full Balance: ₹{fullSettlementAmount}
                </Text>
              </TouchableOpacity>

              {fullSettlementAmount > 200 && (
                <TouchableOpacity
                  style={[
                    styles.halfSettleChip,
                    {
                      backgroundColor: colors.surfaceContainerHigh,
                      borderColor: colors.outlineVariant,
                    },
                  ]}
                  onPress={() => {
                    setValue('amount', Math.round(fullSettlementAmount / 2).toString(), {
                      shouldValidate: true,
                    });
                  }}
                >
                  <Text style={[styles.halfSettleChipText, { color: colors.onSurface }]}>
                    50% (₹{Math.round(fullSettlementAmount / 2)})
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Quick Increment Chips */}
          <View style={styles.quickChipsRow}>
            {QUICK_AMOUNTS.map((amt) => (
              <TouchableOpacity
                key={amt}
                style={[
                  styles.quickChip,
                  {
                    backgroundColor: colors.surfaceContainerLow,
                    borderColor: colors.outlineVariant,
                  },
                ]}
                onPress={() => addQuickAmount(amt)}
              >
                <Text style={[styles.quickChipText, { color: colors.onSurface }]}>+{amt}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[
                styles.quickChip,
                {
                  backgroundColor: colors.surfaceContainerLow,
                  borderColor: colors.error + '44',
                },
              ]}
              onPress={() => setValue('amount', '', { shouldValidate: true })}
            >
              <Text style={[styles.quickChipText, { color: colors.error }]}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* CARD 4: BALANCE PROJECTION PREVIEW */}
        {personBalance && parsedAmount > 0 && (
          <View
            style={[
              styles.previewCard,
              {
                backgroundColor: colors.surfaceContainerLow,
                borderColor: colors.outlineVariant,
              },
            ]}
          >
            <View style={styles.previewHeaderRow}>
              <MaterialIcons name="insights" size={16} color={colors.primary} />
              <Text style={[styles.previewTitle, { color: colors.onSurface }]}>
                Balance Projection
              </Text>
            </View>

            <View style={styles.previewGrid}>
              <View style={styles.previewCol}>
                <Text style={[styles.previewLabel, { color: colors.onSurfaceVariant }]}>
                  Current
                </Text>
                <Text style={[styles.previewValue, { color: colors.onSurface }]}>
                  {formatCurrencyPrivacy(personBalance.netBalance, hideBalances)}
                </Text>
              </View>

              <MaterialIcons name="arrow-forward" size={16} color={colors.onSurfaceVariant} />

              <View style={styles.previewCol}>
                <Text style={[styles.previewLabel, { color: colors.onSurfaceVariant }]}>
                  Payment
                </Text>
                <Text style={[styles.previewValue, { color: themeColor }]}>
                  {selectedType === 'YOU_PAID' ? `+₹${parsedAmount}` : `-₹${parsedAmount}`}
                </Text>
              </View>

              <MaterialIcons name="arrow-forward" size={16} color={colors.onSurfaceVariant} />

              <View style={styles.previewCol}>
                <Text style={[styles.previewLabel, { color: colors.onSurfaceVariant }]}>
                  After
                </Text>
                <Text
                  style={[
                    styles.previewValue,
                    {
                      color:
                        projectedBalance > 0
                          ? '#10b981'
                          : projectedBalance < 0
                            ? '#ef4444'
                            : colors.primary,
                      fontFamily: 'Manrope_700Bold',
                    },
                  ]}
                >
                  {projectedBalance === 0
                    ? 'Settled (₹0)'
                    : formatCurrencyPrivacy(projectedBalance, hideBalances)}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* CARD 5: PAYMENT METHOD & NOTE */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          <View style={styles.labelWithIcon}>
            <MaterialIcons name="payment" size={18} color={colors.primary} />
            <Text style={[styles.cardSectionTitle, { color: colors.onSurface }]}>
              Payment Method / Note
            </Text>
          </View>

          <Controller
            control={control}
            name="description"
            render={({ field: { onChange, onBlur, value } }) => (
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: colors.surfaceContainerLowest,
                    borderColor: colors.surfaceVariant,
                  },
                ]}
              >
                <TextInput
                  style={[styles.textInput, { color: colors.onSurface }]}
                  placeholder="e.g. GPay, Cash, Bank Transfer"
                  placeholderTextColor={colors.outline}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              </View>
            )}
          />

          {/* Quick Payment Method Tags */}
          <View style={styles.quickTagsContainer}>
            {PAYMENT_METHODS.map((method) => {
              const isSelected = currentDescription === method.value;
              return (
                <TouchableOpacity
                  key={method.value}
                  style={[
                    styles.quickTagPill,
                    {
                      backgroundColor: isSelected
                        ? colors.primaryContainer + '30'
                        : colors.surfaceContainerHigh,
                      borderColor: isSelected ? colors.primary : colors.outlineVariant,
                      borderWidth: isSelected ? 1 : 0,
                    },
                  ]}
                  onPress={() => setValue('description', method.value, { shouldValidate: true })}
                  activeOpacity={0.75}
                >
                  <MaterialIcons
                    name={method.icon}
                    size={15}
                    color={isSelected ? colors.primary : colors.onSurfaceVariant}
                  />
                  <Text
                    style={[
                      styles.quickTagText,
                      {
                        color: isSelected ? colors.primary : colors.onSurfaceVariant,
                        fontFamily: isSelected ? 'Manrope_700Bold' : 'Manrope_600SemiBold',
                      },
                    ]}
                  >
                    {method.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* CARD 6: DATE SELECTOR CARD */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <View style={styles.labelWithIcon}>
              <MaterialIcons name="event" size={18} color={colors.primary} />
              <Text style={[styles.cardSectionTitle, { color: colors.onSurface }]}>Date</Text>
            </View>

            <View style={styles.quickDatesRow}>
              <TouchableOpacity
                style={[
                  styles.quickDatePill,
                  selectedDate === todayStr && {
                    backgroundColor: colors.primary,
                  },
                  selectedDate !== todayStr && {
                    backgroundColor: colors.surfaceContainerHigh,
                  },
                ]}
                onPress={() => setValue('date', todayStr)}
              >
                <Text
                  style={[
                    styles.quickDateText,
                    {
                      color: selectedDate === todayStr ? colors.onPrimary : colors.onSurfaceVariant,
                      fontFamily: selectedDate === todayStr ? 'Manrope_700Bold' : 'Manrope_600SemiBold',
                    },
                  ]}
                >
                  Today
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.quickDatePill,
                  selectedDate === yesterdayStr && {
                    backgroundColor: colors.primary,
                  },
                  selectedDate !== yesterdayStr && {
                    backgroundColor: colors.surfaceContainerHigh,
                  },
                ]}
                onPress={() => setValue('date', yesterdayStr)}
              >
                <Text
                  style={[
                    styles.quickDateText,
                    {
                      color: selectedDate === yesterdayStr ? colors.onPrimary : colors.onSurfaceVariant,
                      fontFamily: selectedDate === yesterdayStr ? 'Manrope_700Bold' : 'Manrope_600SemiBold',
                    },
                  ]}
                >
                  Yesterday
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.datePickerBtn,
              {
                backgroundColor: colors.surfaceContainerLowest,
                borderColor: colors.surfaceVariant,
              },
            ]}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.8}
          >
            <View style={styles.datePickerLeft}>
              <MaterialIcons name="calendar-today" size={18} color={colors.primary} />
              <Text style={[styles.datePickerText, { color: colors.onSurface }]}>
                {formatReadableDate(selectedDate)}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
        </View>

        {/* CARD 7: SUBMIT BUTTON */}
        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: colors.primary }]}
          onPress={handleSubmit(onSubmit)}
          disabled={isSubmitting || isLoading}
          activeOpacity={0.85}
        >
          {isSubmitting || isLoading ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <>
              <MaterialIcons name="handshake" size={20} color={colors.onPrimary} />
              <Text style={[styles.submitButtonText, { color: colors.onPrimary }]}>
                {parsedAmount > 0
                  ? `Record ₹${parsedAmount} Settlement`
                  : 'Record Settlement'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </KeyboardAwareScrollView>

      {/* Date Picker Modal */}
      <DatePickerModal
        visible={showDatePicker}
        value={selectedDate}
        onChange={(newDate) => setValue('date', newDate)}
        onClose={() => setShowDatePicker(false)}
      />

      {/* Friend Picker Modal */}
      <Modal
        visible={showPersonPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPersonPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.surfaceContainerLowest,
                borderColor: colors.outlineVariant,
                paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 40 : 24),
              },
            ]}
          >
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Select Friend</Text>
              <TouchableOpacity
                onPress={() => setShowPersonPicker(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={22} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            {/* Search Input */}
            <View
              style={[
                styles.searchBox,
                {
                  backgroundColor: colors.surfaceContainerLow,
                  borderColor: colors.outlineVariant,
                },
              ]}
            >
              <MaterialIcons name="search" size={20} color={colors.onSurfaceVariant} />
              <TextInput
                style={[styles.searchInput, { color: colors.onSurface }]}
                placeholder="Search friends by name..."
                placeholderTextColor={colors.onSurfaceVariant}
                value={friendSearch}
                onChangeText={setFriendSearch}
              />
              {friendSearch.length > 0 && (
                <TouchableOpacity onPress={() => setFriendSearch('')}>
                  <MaterialIcons name="clear" size={18} color={colors.onSurfaceVariant} />
                </TouchableOpacity>
              )}
            </View>

            {/* Friends List */}
            <ScrollView
              style={styles.friendsListScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {filteredPeople.map((p) => {
                const isSelected = p.id === selectedPersonId;
                const initials = p.name
                  .split(' ')
                  .filter(Boolean)
                  .map((n) => n[0])
                  .join('')
                  .substring(0, 2)
                  .toUpperCase();

                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      styles.friendItem,
                      {
                        backgroundColor: isSelected
                          ? colors.primaryContainer + '20'
                          : colors.surfaceContainerLow,
                        borderColor: isSelected ? colors.primary : colors.outlineVariant,
                      },
                    ]}
                    onPress={() => {
                      setValue('personId', p.id, { shouldValidate: true });
                      setShowPersonPicker(false);
                    }}
                  >
                    <View
                      style={[
                        styles.friendItemAvatar,
                        {
                          backgroundColor: isSelected
                            ? colors.primary
                            : colors.surfaceContainerHigh,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.friendItemAvatarText,
                          {
                            color: isSelected ? colors.onPrimary : colors.onSurface,
                          },
                        ]}
                      >
                        {initials}
                      </Text>
                    </View>
                    <View style={styles.friendItemInfo}>
                      <Text style={[styles.friendItemName, { color: colors.onSurface }]}>
                        {p.name}
                      </Text>
                      {p.phone && (
                        <Text
                          style={[
                            styles.friendItemPhone,
                            { color: colors.onSurfaceVariant },
                          ]}
                        >
                          {p.phone}
                        </Text>
                      )}
                    </View>
                    {isSelected && (
                      <MaterialIcons name="check" size={20} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}

              {filteredPeople.length === 0 && (
                <View style={styles.emptySearchBox}>
                  <Text style={[styles.emptySearchText, { color: colors.onSurfaceVariant }]}>
                    No friends found matching "{friendSearch}"
                  </Text>
                  <TouchableOpacity
                    style={[styles.addFriendPromptBtn, { backgroundColor: colors.primary }]}
                    onPress={() => {
                      setShowPersonPicker(false);
                      router.push('/(app)/add-splitwise-person');
                    }}
                  >
                    <MaterialIcons name="person-add" size={16} color={colors.onPrimary} />
                    <Text style={[styles.addFriendPromptText, { color: colors.onPrimary }]}>
                      Add New Friend
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function formatReadableDate(dateStr: string): string {
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return d.toLocaleDateString('en-IN', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSaveText: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
    lineHeight: 18,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  labelWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  cardSectionTitle: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
    lineHeight: 18,
  },
  changeFriendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    gap: 2,
  },
  changeFriendText: {
    ...typography.labelMd,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Manrope_700Bold',
  },
  selectedFriendBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 12,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.headlineSm,
    fontFamily: 'Manrope_700Bold',
    fontSize: 16,
    lineHeight: 22,
  },
  selectedFriendInfo: {
    flex: 1,
  },
  selectedFriendName: {
    ...typography.bodyMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
    lineHeight: 20,
  },
  selectedFriendBalance: {
    ...typography.bodyMd,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  selectPromptBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 8,
  },
  selectPromptText: {
    ...typography.bodyMd,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
  },
  directionToggleContainer: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    marginTop: 10,
    gap: 6,
  },
  directionToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    gap: 6,
  },
  directionToggleText: {
    ...typography.labelMd,
    fontSize: 13,
    lineHeight: 18,
  },
  directionSubtitle: {
    ...typography.bodyMd,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 8,
  },
  amountCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 20,
    marginBottom: 14,
    alignItems: 'center',
  },
  amountLabel: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountCurrency: {
    ...typography.displayLg,
    fontFamily: 'Manrope_700Bold',
    fontSize: 32,
    lineHeight: 40,
    marginRight: 4,
  },
  amountInput: {
    ...typography.displayLg,
    fontFamily: 'Manrope_700Bold',
    fontSize: 32,
    lineHeight: 40,
    minWidth: 120,
    textAlign: 'left',
    padding: 0,
  },
  smartShortcutsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    flexWrap: 'wrap',
  },
  fullSettleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    gap: 6,
  },
  fullSettleChipText: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
  halfSettleChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  halfSettleChipText: {
    ...typography.labelMd,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
  },
  quickChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  quickChipText: {
    ...typography.labelMd,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 12,
    lineHeight: 16,
  },
  previewCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  previewTitle: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
    lineHeight: 16,
  },
  previewGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  previewCol: {
    alignItems: 'center',
  },
  previewLabel: {
    ...typography.labelMd,
    fontSize: 11,
    lineHeight: 14,
    marginBottom: 2,
  },
  previewValue: {
    ...typography.headlineSm,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Manrope_600SemiBold',
  },
  inputWrapper: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 2,
    marginBottom: 10,
  },
  textInput: {
    ...typography.bodyMd,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: 10,
  },
  quickTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    gap: 6,
  },
  quickTagText: {
    ...typography.bodyMd,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Manrope_600SemiBold',
  },
  quickDatesRow: {
    flexDirection: 'row',
    gap: 6,
  },
  quickDatePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  quickDateText: {
    ...typography.labelMd,
    fontSize: 11,
    lineHeight: 15,
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  datePickerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  datePickerText: {
    ...typography.bodyMd,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: radius.xl,
    gap: 8,
    marginTop: 8,
    marginBottom: 24,
  },
  submitButtonText: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 15,
    lineHeight: 20,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    marginBottom: 6,
  },
  errorText: {
    ...typography.bodyMd,
    fontSize: 11,
    lineHeight: 15,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    padding: 20,
    maxHeight: '80%',
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    ...typography.headlineSm,
    fontFamily: 'Manrope_700Bold',
    fontSize: 18,
    lineHeight: 24,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    ...typography.bodyMd,
    fontSize: 13,
    padding: 0,
  },
  friendsListScroll: {
    maxHeight: 320,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  friendItemAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendItemAvatarText: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    lineHeight: 18,
  },
  friendItemInfo: {
    flex: 1,
  },
  friendItemName: {
    ...typography.bodyMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
    lineHeight: 18,
  },
  friendItemPhone: {
    ...typography.bodyMd,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  emptySearchBox: {
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  emptySearchText: {
    ...typography.bodyMd,
    fontSize: 13,
    textAlign: 'center',
  },
  addFriendPromptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    gap: 6,
  },
  addFriendPromptText: {
    ...typography.labelMd,
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
  },
});

import { DatePickerModal, Header, Text, useAlert, useToast } from '@/components/ui';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useAppStore } from '@/store/use-app-store';
import { radius, useTheme } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { BalanceCalculator } from '../services/BalanceCalculator';
import { useSplitwiseStore } from '../store/splitwise.store';
import type { ExpenseSplit } from '../types/splitwise.types';
import { SplitType, CURRENT_USER_ID, CURRENT_USER_PERSON } from '../types/splitwise.types';

const EXPENSE_CATEGORIES = [
  { label: 'Dinner / Food', icon: 'restaurant' as const },
  { label: 'Groceries', icon: 'shopping-cart' as const },
  { label: 'Travel / Cab', icon: 'local-taxi' as const },
  { label: 'Movie & Fun', icon: 'movie' as const },
  { label: 'Rent & Bills', icon: 'receipt' as const },
  { label: 'Shopping', icon: 'shopping-bag' as const },
  { label: 'General', icon: 'receipt-long' as const },
];

const SPLIT_MODES = [
  { id: SplitType.EQUAL, label: 'Equally', icon: 'drag-handle' as const },
  { id: SplitType.EXACT, label: 'Exact', icon: 'pin' as const },
  { id: SplitType.PERCENTAGE, label: 'Percentage', icon: 'percent' as const },
  { id: SplitType.SHARES, label: 'Shares', icon: 'pie-chart' as const },
];

export function AddExpenseScreen() {
  const { colors } = useTheme();
  const insets = useSafeInsets();
  const router = useRouter();
  const { hideBalances } = useAppStore();
  const { showAlert } = useAlert();
  const { showToast } = useToast();

  const params = useLocalSearchParams<{
    groupId?: string;
  }>();

  const {
    people,
    groups,
    loadAllData,
    createExpense,
    isLoading,
  } = useSplitwiseStore();

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [date, setDate] = useState(todayStr);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Dinner / Food');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(params.groupId || null);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) || null,
    [groups, selectedGroupId]
  );

  // Available participants: always includes "You" (CURRENT_USER_PERSON) plus group members or all people
  const availableParticipants = useMemo(() => {
    const list = selectedGroup
      ? people.filter((p) => selectedGroup.memberIds.includes(p.id))
      : people;
    return [CURRENT_USER_PERSON, ...list.filter((p) => p.id !== CURRENT_USER_ID)];
  }, [people, selectedGroup]);

  // Selected participant IDs for splitting
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [payerId, setPayerId] = useState<string>(CURRENT_USER_ID);

  // Split strategy
  const [splitType, setSplitType] = useState<SplitType>(SplitType.EQUAL);

  // Split values per person (personId -> string input)
  const [exactInputs, setExactInputs] = useState<Record<string, string>>({});
  const [percentInputs, setPercentInputs] = useState<Record<string, string>>({});
  const [shareInputs, setShareInputs] = useState<Record<string, string>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (people.length === 0 || groups.length === 0) {
      loadAllData();
    }
  }, [people.length, groups.length, loadAllData]);

  // When group or available participants change, initialize participants
  useEffect(() => {
    if (availableParticipants.length > 0) {
      const ids = availableParticipants.map((p) => p.id);
      setParticipantIds(ids);
      if (!payerId || !ids.includes(payerId)) {
        setPayerId(CURRENT_USER_ID);
      }
    }
  }, [availableParticipants]);

  const parsedTotalAmount = useMemo(() => {
    const val = parseFloat(amount);
    return isNaN(val) || val <= 0 ? 0 : val;
  }, [amount]);

  // Compute calculated shares based on active split strategy
  const splitResult = useMemo(() => {
    if (parsedTotalAmount <= 0 || participantIds.length === 0) {
      return null;
    }

    if (splitType === SplitType.EQUAL) {
      return BalanceCalculator.calculateEqualSplits({
        totalAmount: parsedTotalAmount,
        payerId,
        participantIds,
      });
    }

    if (splitType === SplitType.EXACT) {
      const splits = participantIds.map((id) => ({
        personId: id,
        amount: parseFloat(exactInputs[id] || '0') || 0,
      }));
      return BalanceCalculator.calculateExactSplits({
        totalAmount: parsedTotalAmount,
        payerId,
        splits,
      });
    }

    if (splitType === SplitType.PERCENTAGE) {
      const splits = participantIds.map((id) => ({
        personId: id,
        percentage: parseFloat(percentInputs[id] || '0') || 0,
      }));
      return BalanceCalculator.calculatePercentageSplits({
        totalAmount: parsedTotalAmount,
        payerId,
        splits,
      });
    }

    if (splitType === SplitType.SHARES) {
      const splits = participantIds.map((id) => ({
        personId: id,
        shares: parseFloat(shareInputs[id] || '1') || 1,
      }));
      return BalanceCalculator.calculateSharesSplits({
        totalAmount: parsedTotalAmount,
        payerId,
        splits,
      });
    }

    return null;
  }, [
    parsedTotalAmount,
    splitType,
    payerId,
    participantIds,
    exactInputs,
    percentInputs,
    shareInputs,
  ]);

  const toggleParticipant = (personId: string) => {
    setParticipantIds((prev) => {
      if (prev.includes(personId)) {
        if (prev.length <= 1) {
          showAlert('Required', 'At least 1 participant must be selected for the split.');
          return prev;
        }
        return prev.filter((id) => id !== personId);
      }
      return [...prev, personId];
    });
  };

  const onSubmit = async () => {
    if (!description.trim()) {
      showAlert('Required', 'Please enter an expense description');
      return;
    }

    if (parsedTotalAmount <= 0) {
      showAlert('Invalid Amount', 'Please enter a valid amount greater than 0');
      return;
    }

    if (!payerId) {
      showAlert('Required', 'Please select who paid for this expense');
      return;
    }

    if (participantIds.length === 0) {
      showAlert('Required', 'Please select at least 1 person to split with');
      return;
    }

    if (!splitResult || !splitResult.isValid) {
      showAlert(
        'Split Discrepancy',
        splitResult?.errorMessage || 'The splits do not add up to the total amount.'
      );
      return;
    }

    const splitsToSave: ExpenseSplit[] = splitResult.shares.map((s) => ({
      personId: s.personId,
      paidAmount: s.paidAmount,
      owedAmount: s.owedAmount,
      percentage: s.percentage,
      shares: s.shares,
      isPaid: s.paidAmount >= s.owedAmount,
    }));

    try {
      setIsSubmitting(true);
      await createExpense({
        description: description.trim(),
        amount: parsedTotalAmount,
        category: selectedCategory,
        date,
        payerId,
        groupId: selectedGroupId || undefined,
        splitType,
        splits: splitsToSave,
      });

      showToast('Expense added successfully', 'success');
      router.back();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to record expense';
      showAlert('Error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
        },
      ]}
    >
      <Header
        title="Add Expense"
        showBack
        rightNode={
          <TouchableOpacity
            onPress={onSubmit}
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
          { paddingBottom: insets.bottom + 48 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        extraScrollHeight={Platform.OS === 'ios' ? 140 : 160}
      >
        {/* CARD 1: AMOUNT & DESCRIPTION */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          <Text style={[styles.fieldLabel, { color: colors.onSurfaceVariant }]}>
            TOTAL AMOUNT <Text style={{ color: colors.error }}>*</Text>
          </Text>

          <View style={styles.amountInputRow}>
            <Text style={[styles.currencySymbol, { color: colors.primary }]}>₹</Text>
            <TextInput
              style={[styles.amountInput, { color: colors.onSurface }]}
              placeholder="0.00"
              placeholderTextColor={colors.outline}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              autoFocus
            />
          </View>

          <Text style={[styles.fieldLabel, { color: colors.onSurfaceVariant, marginTop: 14 }]}>
            DESCRIPTION <Text style={{ color: colors.error }}>*</Text>
          </Text>
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
              placeholder="e.g. Flight tickets, Groceries, Dinner"
              placeholderTextColor={colors.outline}
              value={description}
              onChangeText={setDescription}
            />
          </View>

          {/* Quick Category Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryChipsScroll}
          >
            {EXPENSE_CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.label;
              return (
                <TouchableOpacity
                  key={cat.label}
                  style={[
                    styles.catChip,
                    {
                      backgroundColor: isSelected
                        ? colors.primaryContainer
                        : colors.surfaceContainerLowest,
                      borderColor: isSelected ? colors.primary : colors.surfaceVariant,
                    },
                  ]}
                  onPress={() => setSelectedCategory(cat.label)}
                >
                  <MaterialIcons
                    name={cat.icon}
                    size={14}
                    color={isSelected ? colors.onPrimaryContainer : colors.onSurfaceVariant}
                  />
                  <Text
                    style={[
                      styles.catChipText,
                      {
                        color: isSelected ? colors.onPrimaryContainer : colors.onSurface,
                        fontFamily: isSelected ? 'Manrope_700Bold' : 'Manrope_500Medium',
                      },
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* CARD 2: GROUP & PAYER SELECTOR */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          {/* Group Picker */}
          {groups.length > 0 && (
            <View style={styles.selectorSection}>
              <Text style={[styles.fieldLabel, { color: colors.onSurfaceVariant }]}>
                SPLIT IN GROUP (OPTIONAL)
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pillsScroll}
              >
                <TouchableOpacity
                  style={[
                    styles.groupPill,
                    {
                      backgroundColor: selectedGroupId === null
                        ? colors.primaryContainer
                        : colors.surfaceContainerLowest,
                      borderColor: selectedGroupId === null ? colors.primary : colors.surfaceVariant,
                    },
                  ]}
                  onPress={() => setSelectedGroupId(null)}
                >
                  <MaterialIcons
                    name="person"
                    size={14}
                    color={selectedGroupId === null ? colors.onPrimaryContainer : colors.onSurfaceVariant}
                  />
                  <Text
                    style={[
                      styles.groupPillText,
                      {
                        color: selectedGroupId === null ? colors.onPrimaryContainer : colors.onSurface,
                        fontFamily: selectedGroupId === null ? 'Manrope_700Bold' : 'Manrope_500Medium',
                      },
                    ]}
                  >
                    Non-group Split
                  </Text>
                </TouchableOpacity>

                {groups.map((g) => {
                  const isSelected = selectedGroupId === g.id;
                  return (
                    <TouchableOpacity
                      key={g.id}
                      style={[
                        styles.groupPill,
                        {
                          backgroundColor: isSelected
                            ? colors.primaryContainer
                            : colors.surfaceContainerLowest,
                          borderColor: isSelected ? colors.primary : colors.surfaceVariant,
                        },
                      ]}
                      onPress={() => setSelectedGroupId(g.id)}
                    >
                      <MaterialIcons
                        name={(g.icon as any) || 'group'}
                        size={14}
                        color={isSelected ? colors.onPrimaryContainer : colors.onSurfaceVariant}
                      />
                      <Text
                        style={[
                          styles.groupPillText,
                          {
                            color: isSelected ? colors.onPrimaryContainer : colors.onSurface,
                            fontFamily: isSelected ? 'Manrope_700Bold' : 'Manrope_500Medium',
                          },
                        ]}
                      >
                        {g.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Payer Picker */}
          <View style={[styles.selectorSection, { marginTop: groups.length > 0 ? 12 : 0 }]}>
            <Text style={[styles.fieldLabel, { color: colors.onSurfaceVariant }]}>
              PAID BY <Text style={{ color: colors.error }}>*</Text>
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillsScroll}
            >
              {availableParticipants.map((p) => {
                const isSelected = payerId === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[
                      styles.payerPill,
                      {
                        backgroundColor: isSelected
                          ? colors.primary
                          : colors.surfaceContainerLowest,
                        borderColor: isSelected ? colors.primary : colors.surfaceVariant,
                      },
                    ]}
                    onPress={() => setPayerId(p.id)}
                  >
                    <Text
                      style={[
                        styles.payerPillText,
                        {
                          color: isSelected ? colors.onPrimary : colors.onSurface,
                          fontFamily: isSelected ? 'Manrope_700Bold' : 'Manrope_500Medium',
                        },
                      ]}
                    >
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>

        {/* CARD 3: SPLIT STRATEGY SELECTOR */}
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
              <MaterialIcons name="call-split" size={18} color={colors.primary} />
              <Text style={[styles.cardSectionTitle, { color: colors.onSurface }]}>
                Split Strategy
              </Text>
            </View>
          </View>

          {/* Mode Switcher */}
          <View
            style={[
              styles.modeSwitcher,
              {
                backgroundColor: colors.surfaceContainerHigh,
                borderColor: colors.outlineVariant,
              },
            ]}
          >
            {SPLIT_MODES.map((mode) => {
              const isActive = splitType === mode.id;
              return (
                <TouchableOpacity
                  key={mode.id}
                  style={[
                    styles.modeBtn,
                    isActive && [
                      styles.activeModeBtn,
                      { backgroundColor: colors.surfaceContainerLowest },
                    ],
                  ]}
                  onPress={() => setSplitType(mode.id)}
                >
                  <MaterialIcons
                    name={mode.icon}
                    size={16}
                    color={isActive ? colors.primary : colors.onSurfaceVariant}
                  />
                  <Text
                    style={[
                      styles.modeBtnText,
                      {
                        color: isActive ? colors.onSurface : colors.onSurfaceVariant,
                        fontFamily: isActive ? 'Manrope_700Bold' : 'Manrope_500Medium',
                      },
                    ]}
                  >
                    {mode.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Participants Breakdown List */}
          <View style={styles.breakdownList}>
            {availableParticipants.map((person) => {
              const isIncluded = participantIds.includes(person.id);
              const share = splitResult?.shares.find((s) => s.personId === person.id);

              return (
                <View
                  key={person.id}
                  style={[
                    styles.breakdownRow,
                    {
                      backgroundColor: colors.surfaceContainerLowest,
                      borderColor: colors.surfaceVariant,
                    },
                  ]}
                >
                  {/* Checkbox & Name */}
                  <TouchableOpacity
                    style={styles.participantNameCol}
                    onPress={() => toggleParticipant(person.id)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons
                      name={isIncluded ? 'check-box' : 'check-box-outline-blank'}
                      size={20}
                      color={isIncluded ? colors.primary : colors.outline}
                    />
                    <Text
                      style={[
                        styles.participantName,
                        {
                          color: isIncluded ? colors.onSurface : colors.onSurfaceVariant,
                          textDecorationLine: isIncluded ? 'none' : 'line-through',
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {person.id === CURRENT_USER_ID ? 'You (Me)' : person.name}
                    </Text>
                  </TouchableOpacity>

                  {/* Input or Calculated Share */}
                  {isIncluded && (
                    <View style={styles.splitInputCol}>
                      {splitType === SplitType.EQUAL && (
                        <Text style={[styles.shareCalculatedVal, { color: colors.primary }]}>
                          ₹{share ? share.owedAmount.toFixed(2) : '0.00'}
                        </Text>
                      )}

                      {splitType === SplitType.EXACT && (
                        <View style={styles.customInputWrapper}>
                          <Text style={[styles.prefixSign, { color: colors.onSurfaceVariant }]}>
                            ₹
                          </Text>
                          <TextInput
                            style={[styles.customInput, { color: colors.onSurface }]}
                            placeholder="0"
                            placeholderTextColor={colors.outline}
                            keyboardType="decimal-pad"
                            value={exactInputs[person.id] || ''}
                            onChangeText={(txt) =>
                              setExactInputs((prev) => ({ ...prev, [person.id]: txt }))
                            }
                          />
                        </View>
                      )}

                      {splitType === SplitType.PERCENTAGE && (
                        <View style={styles.customInputWrapper}>
                          <TextInput
                            style={[styles.customInput, { color: colors.onSurface }]}
                            placeholder="0"
                            placeholderTextColor={colors.outline}
                            keyboardType="decimal-pad"
                            value={percentInputs[person.id] || ''}
                            onChangeText={(txt) =>
                              setPercentInputs((prev) => ({ ...prev, [person.id]: txt }))
                            }
                          />
                          <Text style={[styles.suffixSign, { color: colors.onSurfaceVariant }]}>
                            %
                          </Text>
                        </View>
                      )}

                      {splitType === SplitType.SHARES && (
                        <View style={styles.customInputWrapper}>
                          <TextInput
                            style={[styles.customInput, { color: colors.onSurface }]}
                            placeholder="1"
                            placeholderTextColor={colors.outline}
                            keyboardType="number-pad"
                            value={shareInputs[person.id] !== undefined ? shareInputs[person.id] : '1'}
                            onChangeText={(txt) =>
                              setShareInputs((prev) => ({ ...prev, [person.id]: txt }))
                            }
                          />
                          <Text style={[styles.suffixSign, { color: colors.onSurfaceVariant }]}>
                            {share ? `(₹${share.owedAmount.toFixed(2)})` : ''}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* Validation Banner */}
          {splitResult && !splitResult.isValid && (
            <View style={[styles.validationBanner, { backgroundColor: colors.error + '15' }]}>
              <MaterialIcons name="error-outline" size={16} color={colors.error} />
              <Text style={[styles.validationBannerText, { color: colors.error }]}>
                {splitResult.errorMessage}
              </Text>
            </View>
          )}
        </View>

        {/* SUBMIT BUTTON */}
        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: colors.primary }]}
          onPress={onSubmit}
          disabled={isSubmitting || isLoading}
          activeOpacity={0.85}
        >
          {isSubmitting || isLoading ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <>
              <MaterialIcons name="check" size={20} color={colors.onPrimary} />
              <Text style={[styles.submitButtonText, { color: colors.onPrimary }]}>
                Save Expense (₹{amount || '0'})
              </Text>
            </>
          )}
        </TouchableOpacity>
      </KeyboardAwareScrollView>

      {/* Date Picker Modal */}
      <DatePickerModal
        visible={showDatePicker}
        value={date}
        onChange={(d) => setDate(d)}
        onClose={() => setShowDatePicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerSaveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  headerSaveText: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 14,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  card: {
    borderRadius: radius.xl,
    padding: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  currencySymbol: {
    fontSize: 32,
    fontFamily: 'Manrope_800ExtraBold',
    marginRight: 6,
  },
  amountInput: {
    fontSize: 32,
    fontFamily: 'Manrope_800ExtraBold',
    flex: 1,
    paddingVertical: 0,
    textAlignVertical: 'center',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  inputWrapper: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    height: 48,
    justifyContent: 'center',
  },
  textInput: {
    fontSize: 15,
    fontFamily: 'Manrope_500Medium',
    paddingVertical: 0,
    textAlignVertical: 'center',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  categoryChipsScroll: {
    gap: 8,
    paddingTop: 12,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  catChipText: {
    fontSize: 12,
  },
  selectorSection: {
    marginBottom: 4,
  },
  pillsScroll: {
    gap: 8,
    paddingVertical: 4,
  },
  groupPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  groupPillText: {
    fontSize: 13,
  },
  payerPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  payerPillText: {
    fontSize: 13,
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
  },
  cardSectionTitle: {
    fontSize: 15,
    fontFamily: 'Manrope_700Bold',
  },
  modeSwitcher: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    padding: 3,
    borderWidth: 1,
    marginBottom: 14,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderRadius: radius.md,
  },
  activeModeBtn: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  modeBtnText: {
    fontSize: 11,
  },
  breakdownList: {
    gap: 8,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  participantNameCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  participantName: {
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
  },
  splitInputCol: {
    alignItems: 'flex-end',
  },
  shareCalculatedVal: {
    fontSize: 15,
    fontFamily: 'Manrope_700Bold',
    textAlignVertical: 'center',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  customInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    borderRadius: radius.md,
    paddingHorizontal: 8,
    height: 36,
    overflow: 'hidden',
  },
  prefixSign: {
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
    marginRight: 4,
    textAlignVertical: 'center',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  suffixSign: {
    fontSize: 12,
    fontFamily: 'Manrope_500Medium',
    marginLeft: 4,
    textAlignVertical: 'center',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  customInput: {
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
    minWidth: 50,
    textAlign: 'right',
    paddingVertical: 0,
    paddingHorizontal: 0,
    height: '100%',
    textAlignVertical: 'center',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  validationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: radius.md,
    marginTop: 12,
  },
  validationBannerText: {
    fontSize: 12,
    fontFamily: 'Manrope_600SemiBold',
    flex: 1,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: radius.xl,
    marginTop: 8,
  },
  submitButtonText: {
    fontSize: 16,
    fontFamily: 'Manrope_700Bold',
  },
});


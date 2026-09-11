import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Text, Header, DatePickerModal, useToast } from '@/components/ui';
import { typography, useTheme, ThemeColors, radius } from '@/theme';
import { getCurrencySymbol } from '@/utils/format';
import { useBills } from '../hooks/useBills';
import { BILL_CATEGORIES, BillCategory, BillFrequency, SubscriptionCycle } from '../types/bill.types';

export function AddBillScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showToast } = useToast();

  const { billId, subId, type: initialType } = useLocalSearchParams<{
    billId?: string;
    subId?: string;
    type?: 'bill' | 'subscription';
  }>();

  const isEditingBill = Boolean(billId);
  const isEditingSub = Boolean(subId);
  const isEditing = isEditingBill || isEditingSub;

  const {
    allBills,
    allSubscriptions,
    createBill,
    updateBill,
    createSubscription,
    updateSubscription,
  } = useBills();

  const existingBill = allBills.find((b) => b.id === billId);
  const existingSub = allSubscriptions.find((s) => s.id === subId);

  // Segment type: 'bill' | 'subscription'
  const [entryType, setEntryType] = useState<'bill' | 'subscription'>(
    initialType === 'subscription' || isEditingSub ? 'subscription' : 'bill'
  );

  // Form State
  const [title, setTitle] = useState('');
  const [provider, setProvider] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [minAmountStr, setMinAmountStr] = useState('');
  const [category, setCategory] = useState<BillCategory>('electricity');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const [frequency, setFrequency] = useState<BillFrequency>('monthly');
  const [subCycle, setSubCycle] = useState<SubscriptionCycle>('monthly');
  const [reminderDays, setReminderDays] = useState<number>(3);
  const [accountReference, setAccountReference] = useState('');
  const [paymentUrl, setPaymentUrl] = useState('');
  const [notes, setNotes] = useState('');

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (isEditingBill && existingBill && !initialized) {
      setTitle(existingBill.title);
      setProvider(existingBill.provider || '');
      setAmountStr(existingBill.amount.toString());
      setMinAmountStr(existingBill.minAmount ? existingBill.minAmount.toString() : '');
      setCategory(existingBill.category);
      setDueDate(existingBill.dueDate);
      setFrequency(existingBill.frequency || 'one_time');
      setReminderDays(existingBill.reminderDays || 3);
      setAccountReference(existingBill.accountReference || '');
      setPaymentUrl(existingBill.paymentUrl || '');
      setNotes(existingBill.notes || '');
      setEntryType('bill');
      setInitialized(true);
    } else if (isEditingSub && existingSub && !initialized) {
      setTitle(existingSub.name);
      setProvider(existingSub.provider || '');
      setAmountStr(existingSub.amount.toString());
      setCategory(existingSub.category || 'subscription');
      setDueDate(existingSub.nextRenewalDate);
      setSubCycle(existingSub.billingCycle);
      setAccountReference(existingSub.accountReference || '');
      setPaymentUrl(existingSub.paymentUrl || '');
      setNotes(existingSub.notes || '');
      setEntryType('subscription');
      setInitialized(true);
    }
  }, [isEditingBill, isEditingSub, existingBill, existingSub, initialized]);

  const selectedCategoryObj =
    BILL_CATEGORIES.find((c) => c.value === category) || BILL_CATEGORIES[0];

  const handleSave = async () => {
    if (!title.trim()) {
      showToast('Please enter a name or provider', 'error');
      return;
    }

    const parsedAmount = parseFloat(amountStr);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    const parsedMinAmount = minAmountStr.trim() ? parseFloat(minAmountStr) : undefined;
    if (parsedMinAmount !== undefined && (isNaN(parsedMinAmount) || parsedMinAmount < 0)) {
      showToast('Please enter a valid minimum amount', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      if (entryType === 'subscription') {
        if (isEditingSub && subId) {
          await updateSubscription(subId, {
            name: title.trim(),
            provider: provider.trim() || title.trim(),
            amount: parsedAmount,
            billingCycle: subCycle,
            nextRenewalDate: dueDate,
            category,
            paymentUrl: paymentUrl.trim() || undefined,
            accountReference: accountReference.trim() || undefined,
            notes: notes.trim() || undefined,
          });
          showToast('Subscription updated', 'success');
        } else {
          await createSubscription({
            name: title.trim(),
            provider: provider.trim() || title.trim(),
            amount: parsedAmount,
            billingCycle: subCycle,
            nextRenewalDate: dueDate,
            category: 'subscription',
            status: 'active',
            paymentUrl: paymentUrl.trim() || undefined,
            accountReference: accountReference.trim() || undefined,
            notes: notes.trim() || undefined,
          });
          showToast('Subscription created', 'success');
        }
      } else {
        if (isEditingBill && billId) {
          await updateBill(billId, {
            title: title.trim(),
            provider: provider.trim() || title.trim(),
            category,
            amount: parsedAmount,
            minAmount: parsedMinAmount,
            dueDate,
            frequency,
            isRecurring: frequency !== 'one_time',
            reminderDays,
            accountReference: accountReference.trim() || undefined,
            paymentUrl: paymentUrl.trim() || undefined,
            notes: notes.trim() || undefined,
          });
          showToast('Bill reminder updated', 'success');
        } else {
          await createBill({
            title: title.trim(),
            provider: provider.trim() || title.trim(),
            category,
            amount: parsedAmount,
            minAmount: parsedMinAmount,
            dueDate,
            frequency,
            isRecurring: frequency !== 'one_time',
            reminderDays,
            accountReference: accountReference.trim() || undefined,
            paymentUrl: paymentUrl.trim() || undefined,
            notes: notes.trim() || undefined,
            source: 'manual',
            status: 'upcoming',
          });
          showToast('Bill reminder created', 'success');
        }
      }
      router.back();
    } catch (e) {
      console.warn('Failed to save bill/subscription:', e);
      showToast('Failed to save', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <Header
        title={
          isEditing
            ? entryType === 'subscription'
              ? 'Edit Subscription'
              : 'Edit Bill'
            : 'Add Bill & Utility'
        }
        showBack
      />

      <KeyboardAwareScrollView
        style={styles.keyboardView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 140 }]}
        enableOnAndroid
        extraScrollHeight={Platform.OS === 'ios' ? 40 : 80}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top Type Selector Toggle */}
        {!isEditing && (
          <View
            style={[
              styles.segmentContainer,
              {
                backgroundColor: colors.surfaceContainerLow,
                borderColor: colors.outlineVariant,
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.segmentButton,
                entryType === 'bill' && { backgroundColor: colors.primary },
              ]}
              onPress={() => {
                setEntryType('bill');
                setCategory('electricity');
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name="receipt-long"
                size={16}
                color={entryType === 'bill' ? colors.onPrimary : colors.onSurfaceVariant}
              />
              <Text
                style={[
                  styles.segmentButtonText,
                  { color: entryType === 'bill' ? colors.onPrimary : colors.onSurfaceVariant },
                  entryType === 'bill' && styles.segmentButtonTextActive,
                ]}
              >
                Utility / Bill
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.segmentButton,
                entryType === 'subscription' && { backgroundColor: colors.primary },
              ]}
              onPress={() => {
                setEntryType('subscription');
                setCategory('subscription');
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name="subscriptions"
                size={16}
                color={entryType === 'subscription' ? colors.onPrimary : colors.onSurfaceVariant}
              />
              <Text
                style={[
                  styles.segmentButtonText,
                  { color: entryType === 'subscription' ? colors.onPrimary : colors.onSurfaceVariant },
                  entryType === 'subscription' && styles.segmentButtonTextActive,
                ]}
              >
                Subscription (OTT/SaaS)
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Amount Input */}
        <View
          style={[
            styles.amountContainer,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          <Text style={[styles.amountLabel, { color: colors.onSurfaceVariant }]}>
            {entryType === 'subscription' ? 'SUBSCRIPTION COST' : 'AMOUNT DUE'}
          </Text>
          <View style={styles.amountRow}>
            <Text style={[styles.currencySymbol, { color: colors.primary }]}>{getCurrencySymbol()}</Text>
            <TextInput
              style={[styles.amountInput, { color: colors.onSurface }]}
              value={amountStr}
              onChangeText={setAmountStr}
              placeholder="0"
              placeholderTextColor={colors.onSurfaceVariant}
              keyboardType="decimal-pad"
              autoFocus={!isEditing}
            />
          </View>
        </View>

        {/* Form Fields */}
        <View
          style={[
            styles.formCard,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          {/* Title / Name */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.onSurface }]}>
              {entryType === 'subscription' ? 'Subscription / Service Name *' : 'Bill Title / Biller *'}
            </Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: colors.surfaceContainerLowest,
                  borderColor: colors.outlineVariant,
                  color: colors.onSurface,
                },
              ]}
              value={title}
              onChangeText={setTitle}
              placeholder={
                entryType === 'subscription'
                  ? 'e.g. Netflix, Spotify, Prime, Gym'
                  : 'e.g. BESCOM Electricity, House Rent, HDFC Card'
              }
              placeholderTextColor={colors.onSurfaceVariant}
            />
          </View>

          {/* Provider (Optional) */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.onSurface }]}>Provider / Company (Optional)</Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: colors.surfaceContainerLowest,
                  borderColor: colors.outlineVariant,
                  color: colors.onSurface,
                },
              ]}
              value={provider}
              onChangeText={setProvider}
              placeholder="e.g. Airtel, Tata Power, SBI, Landlord"
              placeholderTextColor={colors.onSurfaceVariant}
            />
          </View>

          {/* Category Picker Trigger */}
          {entryType === 'bill' && (
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.onSurface }]}>Category</Text>
              <TouchableOpacity
                style={[
                  styles.selectorRow,
                  {
                    backgroundColor: colors.surfaceContainerLowest,
                    borderColor: colors.outlineVariant,
                  },
                ]}
                onPress={() => setShowCategoryPicker(!showCategoryPicker)}
                activeOpacity={0.7}
              >
                <View style={styles.selectorLeft}>
                  <View style={[styles.categoryIconCircle, { backgroundColor: selectedCategoryObj.bgColor }]}>
                    <MaterialIcons
                      name={selectedCategoryObj.icon as any}
                      size={18}
                      color={selectedCategoryObj.color}
                    />
                  </View>
                  <Text style={[styles.selectorValue, { color: colors.onSurface }]}>{selectedCategoryObj.label}</Text>
                </View>
                <MaterialIcons
                  name={showCategoryPicker ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                  size={22}
                  color={colors.onSurfaceVariant}
                />
              </TouchableOpacity>
            </View>
          )}

          {/* Category Picker Dropdown Grid */}
          {showCategoryPicker && entryType === 'bill' && (
            <View
              style={[
                styles.categoryGrid,
                {
                  backgroundColor: colors.surfaceContainerLowest,
                  borderColor: colors.outlineVariant,
                },
              ]}
            >
              {BILL_CATEGORIES.map((cat) => {
                const isSelected = category === cat.value;
                return (
                  <TouchableOpacity
                    key={cat.value}
                    style={[
                      styles.categoryGridItem,
                      { borderColor: isSelected ? colors.primary : colors.outlineVariant },
                      isSelected && { backgroundColor: colors.primaryContainer },
                    ]}
                    onPress={() => {
                      setCategory(cat.value);
                      setShowCategoryPicker(false);
                    }}
                  >
                    <MaterialIcons
                      name={cat.icon as any}
                      size={18}
                      color={isSelected ? colors.primary : colors.onSurfaceVariant}
                    />
                    <Text
                      style={[
                        styles.categoryGridItemText,
                        { color: isSelected ? colors.onPrimaryContainer : colors.onSurface },
                        isSelected && styles.categoryGridItemTextSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Due Date / Renewal Date */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.onSurface }]}>
              {entryType === 'subscription' ? 'Next Renewal Date *' : 'Due Date *'}
            </Text>
            <TouchableOpacity
              style={[
                styles.selectorRow,
                {
                  backgroundColor: colors.surfaceContainerLowest,
                  borderColor: colors.outlineVariant,
                },
              ]}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.7}
            >
              <View style={styles.selectorLeft}>
                <MaterialIcons name="event" size={20} color={colors.primary} />
                <Text style={[styles.selectorValue, { color: colors.onSurface }]}>{dueDate}</Text>
              </View>
              <MaterialIcons name="edit-calendar" size={18} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          {/* Recurrence Frequency */}
          {entryType === 'bill' ? (
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.onSurface }]}>Recurrence Frequency</Text>
              <View style={styles.chipRow}>
                {(['monthly', 'quarterly', 'yearly', 'one_time'] as BillFrequency[]).map(
                  (freq) => {
                    const isSelected = frequency === freq;
                    return (
                      <TouchableOpacity
                        key={freq}
                        style={[
                          styles.freqChip,
                          {
                            backgroundColor: isSelected
                              ? colors.primaryContainer
                              : colors.surfaceContainerLowest,
                            borderColor: isSelected ? colors.primary : colors.outlineVariant,
                          },
                        ]}
                        onPress={() => setFrequency(freq)}
                      >
                        <Text
                          style={[
                            styles.freqChipText,
                            {
                              color: isSelected
                                ? colors.onPrimaryContainer
                                : colors.onSurfaceVariant,
                            },
                            isSelected && styles.freqChipTextSelected,
                          ]}
                        >
                          {freq === 'one_time'
                            ? 'One Time'
                            : freq.charAt(0).toUpperCase() + freq.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    );
                  }
                )}
              </View>
            </View>
          ) : (
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.onSurface }]}>Billing Cycle</Text>
              <View style={styles.chipRow}>
                {(['monthly', 'quarterly', 'yearly', 'weekly'] as SubscriptionCycle[]).map(
                  (cycle) => {
                    const isSelected = subCycle === cycle;
                    return (
                      <TouchableOpacity
                        key={cycle}
                        style={[
                          styles.freqChip,
                          {
                            backgroundColor: isSelected
                              ? colors.primaryContainer
                              : colors.surfaceContainerLowest,
                            borderColor: isSelected ? colors.primary : colors.outlineVariant,
                          },
                        ]}
                        onPress={() => setSubCycle(cycle)}
                      >
                        <Text
                          style={[
                            styles.freqChipText,
                            {
                              color: isSelected
                                ? colors.onPrimaryContainer
                                : colors.onSurfaceVariant,
                            },
                            isSelected && styles.freqChipTextSelected,
                          ]}
                        >
                          {cycle.charAt(0).toUpperCase() + cycle.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    );
                  }
                )}
              </View>
            </View>
          )}

          {/* Reminder Timing */}
          {entryType === 'bill' && (
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.onSurface }]}>Alert Reminder</Text>
              <View style={styles.chipRow}>
                {[
                  { label: 'On Due Date', value: 0 },
                  { label: '1 Day Before', value: 1 },
                  { label: '3 Days Before', value: 3 },
                  { label: '7 Days Before', value: 7 },
                ].map((item) => {
                  const isSelected = reminderDays === item.value;
                  return (
                    <TouchableOpacity
                      key={item.value}
                      style={[
                        styles.freqChip,
                        {
                          backgroundColor: isSelected
                            ? colors.primaryContainer
                            : colors.surfaceContainerLowest,
                          borderColor: isSelected ? colors.primary : colors.outlineVariant,
                        },
                      ]}
                      onPress={() => setReminderDays(item.value)}
                    >
                      <Text
                        style={[
                          styles.freqChipText,
                          {
                            color: isSelected
                              ? colors.onPrimaryContainer
                              : colors.onSurfaceVariant,
                          },
                          isSelected && styles.freqChipTextSelected,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Account / Consumer Reference */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.onSurface }]}>Consumer ID / Account Reference (Optional)</Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: colors.surfaceContainerLowest,
                  borderColor: colors.outlineVariant,
                  color: colors.onSurface,
                },
              ]}
              value={accountReference}
              onChangeText={setAccountReference}
              placeholder="e.g. Consumer No, Card ending in 4821, Flat 402"
              placeholderTextColor={colors.onSurfaceVariant}
            />
          </View>

          {/* Minimum Amount Due (Credit Card only) */}
          {category === 'credit_card' && entryType === 'bill' && (
            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: colors.onSurface }]}>Minimum Amount Due (Optional)</Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.surfaceContainerLowest,
                    borderColor: colors.outlineVariant,
                    color: colors.onSurface,
                  },
                ]}
                value={minAmountStr}
                onChangeText={setMinAmountStr}
                placeholder="e.g. 500"
                placeholderTextColor={colors.onSurfaceVariant}
                keyboardType="decimal-pad"
              />
            </View>
          )}

          {/* Payment Link (Optional) */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.onSurface }]}>Payment URL / Link (Optional)</Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: colors.surfaceContainerLowest,
                  borderColor: colors.outlineVariant,
                  color: colors.onSurface,
                },
              ]}
              value={paymentUrl}
              onChangeText={setPaymentUrl}
              placeholder="e.g. https://provider.com/pay"
              placeholderTextColor={colors.onSurfaceVariant}
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>

          {/* Notes */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.onSurface }]}>Notes (Optional)</Text>
            <TextInput
              style={[
                styles.textInput,
                {
                  backgroundColor: colors.surfaceContainerLowest,
                  borderColor: colors.outlineVariant,
                  color: colors.onSurface,
                  height: 65,
                  textAlignVertical: 'top',
                },
              ]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add payment instructions, meter notes, or details..."
              placeholderTextColor={colors.onSurfaceVariant}
              multiline
            />
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: colors.primary }, isSubmitting && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSubmitting}
          activeOpacity={0.85}
        >
          <Text style={[styles.saveButtonText, { color: colors.onPrimary }]}>
            {isSubmitting
              ? 'Saving...'
              : isEditing
                ? 'Update Reminder'
                : entryType === 'subscription'
                  ? 'Save Subscription'
                  : 'Save Bill Reminder'}
          </Text>
        </TouchableOpacity>
      </KeyboardAwareScrollView>

      {/* Date Picker Modal */}
      <DatePickerModal
        visible={showDatePicker}
        value={dueDate}
        onChange={(newDate) => {
          setDueDate(newDate);
          setShowDatePicker(false);
        }}
        onClose={() => setShowDatePicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  segmentContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    marginBottom: 14,
    borderWidth: 1,
    gap: 6,
  },
  segmentButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 8,
  },
  segmentButtonText: {
    ...typography.labelMd,
    fontWeight: '600',
    fontSize: 12,
  },
  segmentButtonTextActive: {
    fontWeight: '700',
  },
  amountContainer: {
    alignItems: 'center',
    paddingVertical: 18,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: 16,
  },
  amountLabel: {
    ...typography.labelMd,
    fontWeight: '700',
    letterSpacing: 1,
    fontSize: 11,
    marginBottom: 6,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  currencySymbol: {
    ...typography.displayLg,
    fontWeight: '800',
    fontSize: 30,
    marginRight: 4,
  },
  amountInput: {
    ...typography.displayLg,
    fontWeight: '800',
    fontSize: 32,
    minWidth: 100,
    textAlign: 'center',
    padding: 0,
  },
  formCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 16,
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    ...typography.labelMd,
    fontWeight: '700',
    fontSize: 13,
  },
  textInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...typography.bodyMd,
  },
  selectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  selectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  categoryIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorValue: {
    ...typography.bodyMd,
    fontWeight: '600',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    marginTop: 4,
  },
  categoryGridItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    width: '48%',
  },
  categoryGridItemText: {
    ...typography.labelMd,
    fontSize: 11,
    flex: 1,
  },
  categoryGridItemTextSelected: {
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  freqChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  freqChipText: {
    ...typography.labelMd,
    fontWeight: '600',
    fontSize: 12,
  },
  freqChipTextSelected: {
    fontWeight: '700',
  },
  saveButton: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    ...typography.labelMd,
    fontWeight: '700',
    fontSize: 16,
  },
});

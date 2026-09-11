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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { Text, Header, DatePickerModal } from '@/components/ui';
import { typography, useTheme, radius } from '@/theme';
import { useSplitwiseStore } from '../store/splitwise.store';
import { DebtType } from '../types/splitwise.types';

export interface AddDebtFormData {
  personId: string;
  amount: string;
  type: DebtType;
  description: string;
  date: string; // YYYY-MM-DD
}

const QUICK_TAGS = [
  '🍽️ Dinner / Lunch',
  '🛒 Groceries',
  '🎬 Movie Tickets',
  '🚕 Cab / Travel',
  '🏠 Rent & Bills',
  '☕ Coffee & Snacks',
  '🛍️ Shopping',
  '🎉 Party / Drinks',
];

const QUICK_AMOUNTS = [100, 250, 500, 1000, 2000];

export function AddDebtScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const params = useLocalSearchParams<{
    personId?: string;
    type?: DebtType;
    amount?: string;
    description?: string;
  }>();

  const { people, addDebt, loadPeople, isLoading } = useSplitwiseStore();

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
  } = useForm<AddDebtFormData>({
    defaultValues: {
      personId: initialPersonId,
      amount: params.amount || '',
      type: (params.type as DebtType) || DebtType.OWE_ME,
      description: params.description || '',
      date: todayStr,
    },
    mode: 'onTouched',
  });

  const selectedPersonId = watch('personId');
  const selectedType = watch('type');
  const selectedDate = watch('date');
  const currentAmount = watch('amount');

  useEffect(() => {
    if (people.length === 0) {
      loadPeople();
    }
  }, [people.length, loadPeople]);

  useEffect(() => {
    if (initialPersonId && !selectedPersonId) {
      setValue('personId', initialPersonId);
    }
  }, [initialPersonId, selectedPersonId, setValue]);

  const selectedPerson = useMemo(
    () => people.find((p) => p.id === selectedPersonId),
    [people, selectedPersonId]
  );

  const filteredPeople = useMemo(() => {
    if (!friendSearch.trim()) return people;
    const q = friendSearch.toLowerCase().trim();
    return people.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.phone && p.phone.toLowerCase().includes(q))
    );
  }, [people, friendSearch]);

  const onSubmit = async (data: AddDebtFormData) => {
    if (!data.personId) {
      Alert.alert('Required', 'Please select a friend for this debt');
      return;
    }

    const parsedAmount = parseFloat(data.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than 0');
      return;
    }

    if (!data.description.trim()) {
      Alert.alert('Required', 'Please enter a description for this debt');
      return;
    }

    try {
      // Format date to ISO
      let createdAtIso: string;
      if (data.date === todayStr) {
        createdAtIso = new Date().toISOString();
      } else {
        const dateObj = new Date(`${data.date}T12:00:00.000Z`);
        createdAtIso = !isNaN(dateObj.getTime()) ? dateObj.toISOString() : new Date().toISOString();
      }

      await addDebt({
        personId: data.personId,
        amount: parsedAmount,
        type: data.type,
        description: data.description.trim(),
        createdAt: createdAtIso,
      });

      router.back();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to record debt';
      Alert.alert('Error', msg);
    }
  };

  const personFirstName = selectedPerson ? selectedPerson.name.split(' ')[0] : 'Friend';
  const oweMeLabel = selectedPerson ? `${personFirstName} owes me` : 'They owe me';
  const iOweLabel = selectedPerson ? `I owe ${personFirstName}` : 'I owe them';

  const isOweMe = selectedType === DebtType.OWE_ME;
  const themeColor = isOweMe ? '#10b981' : '#ef4444';

  const addQuickAmount = (delta: number) => {
    const current = parseFloat(currentAmount) || 0;
    const nextVal = (current + delta).toString();
    setValue('amount', nextVal, { shouldValidate: true });
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Header
        title="Add Debt"
        showBack
        rightNode={
          <TouchableOpacity
            onPress={handleSubmit(onSubmit)}
            disabled={isSubmitting || isLoading}
            style={[styles.headerSaveBtn, { backgroundColor: themeColor }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {isSubmitting || isLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.headerSaveText}>Save</Text>
            )}
          </TouchableOpacity>
        }
      />

      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraScrollHeight={Platform.OS === 'ios' ? 20 : 0}
      >
        {/* Person Selector Card */}
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
              <MaterialIcons name="person" size={18} color={themeColor} />
              <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Friend / Person</Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowPersonPicker(true)}
              style={[styles.changeFriendBtn, { backgroundColor: colors.surfaceContainerHigh }]}
            >
              <Text style={[styles.changeFriendText, { color: colors.primary }]}>
                {selectedPerson ? 'Change' : 'Select Friend'}
              </Text>
              <MaterialIcons name="expand-more" size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>

          {selectedPerson ? (
            <TouchableOpacity
              style={[
                styles.selectedPersonBox,
                {
                  backgroundColor: colors.surfaceContainerLowest,
                  borderColor: colors.outlineVariant,
                },
              ]}
              onPress={() => setShowPersonPicker(true)}
              activeOpacity={0.8}
            >
              <View style={[styles.avatarCircle, { backgroundColor: `${themeColor}20` }]}>
                <Text style={[styles.avatarText, { color: themeColor }]}>
                  {selectedPerson.name
                    .split(' ')
                    .filter(Boolean)
                    .map((n) => n[0])
                    .join('')
                    .substring(0, 2)
                    .toUpperCase()}
                </Text>
              </View>
              <View style={styles.selectedPersonInfo}>
                <Text style={[styles.selectedPersonName, { color: colors.onSurface }]}>
                  {selectedPerson.name}
                </Text>
                {selectedPerson.phone && (
                  <Text style={[styles.selectedPersonPhone, { color: colors.onSurfaceVariant }]}>
                    {selectedPerson.phone}
                  </Text>
                )}
              </View>
              <MaterialIcons name="check-circle" size={20} color={themeColor} />
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
              <MaterialIcons name="person-add" size={24} color={colors.primary} />
              <Text style={[styles.selectPromptText, { color: colors.onSurfaceVariant }]}>
                Tap to select or add a friend
              </Text>
            </TouchableOpacity>
          )}

          {errors.personId && (
            <View style={styles.errorRow}>
              <MaterialIcons name="error-outline" size={14} color="#ef4444" />
              <Text style={styles.errorText}>{errors.personId.message}</Text>
            </View>
          )}
        </View>

        {/* Debt Direction Selector ("Rahul owes me" vs "I owe Rahul") */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.onSurface, marginBottom: 12 }]}>
            Who owes whom?
          </Text>

          <View style={[styles.toggleContainer, { backgroundColor: colors.surfaceContainerHigh }]}>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                isOweMe && {
                  backgroundColor: '#10b981',
                },
              ]}
              onPress={() => setValue('type', DebtType.OWE_ME)}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name="call-received"
                size={18}
                color={isOweMe ? '#ffffff' : colors.onSurfaceVariant}
              />
              <Text
                style={[
                  styles.toggleText,
                  {
                    color: isOweMe ? '#ffffff' : colors.onSurfaceVariant,
                    fontWeight: isOweMe ? '700' : '600',
                  },
                ]}
              >
                {oweMeLabel}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.toggleBtn,
                !isOweMe && {
                  backgroundColor: '#ef4444',
                },
              ]}
              onPress={() => setValue('type', DebtType.I_OWE)}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name="call-made"
                size={18}
                color={!isOweMe ? '#ffffff' : colors.onSurfaceVariant}
              />
              <Text
                style={[
                  styles.toggleText,
                  {
                    color: !isOweMe ? '#ffffff' : colors.onSurfaceVariant,
                    fontWeight: !isOweMe ? '700' : '600',
                  },
                ]}
              >
                {iOweLabel}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.toggleSubtitle, { color: colors.onSurfaceVariant }]}>
            {isOweMe
              ? `You paid for ${personFirstName}. They will pay you back.`
              : `${personFirstName} paid for you. You need to pay them back.`}
          </Text>
        </View>

        {/* Amount Input Card */}
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
            <MaterialIcons name="currency-rupee" size={18} color={themeColor} />
            <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>
              Amount <Text style={{ color: '#ef4444' }}>*</Text>
            </Text>
          </View>

          <Controller
            control={control}
            name="amount"
            rules={{
              required: 'Amount is required',
              validate: (val) => {
                const num = parseFloat(val);
                return (!isNaN(num) && num > 0) || 'Enter a valid amount greater than 0';
              },
            }}
            render={({ field: { onChange, onBlur, value } }) => (
              <View
                style={[
                  styles.amountInputRow,
                  {
                    backgroundColor: colors.surfaceContainerLowest,
                    borderColor: errors.amount ? '#ef4444' : colors.outlineVariant,
                  },
                ]}
              >
                <Text style={[styles.amountSymbol, { color: themeColor }]}>₹</Text>
                <TextInput
                  style={[styles.amountInput, { color: colors.onSurface }]}
                  placeholder="0.00"
                  placeholderTextColor={colors.onSurfaceVariant}
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
              <MaterialIcons name="error-outline" size={14} color="#ef4444" />
              <Text style={styles.errorText}>{errors.amount.message}</Text>
            </View>
          )}

          {/* Quick Amount Add Pills */}
          <View style={styles.quickAmountsRow}>
            {QUICK_AMOUNTS.map((amt) => (
              <TouchableOpacity
                key={amt}
                style={[
                  styles.quickAmountPill,
                  {
                    backgroundColor: colors.surfaceContainerHigh,
                    borderColor: colors.outlineVariant,
                  },
                ]}
                onPress={() => addQuickAmount(amt)}
              >
                <Text style={[styles.quickAmountText, { color: colors.onSurface }]}>+₹{amt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Description & Category Tags Card */}
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
            <MaterialIcons name="description" size={18} color={themeColor} />
            <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>
              Description <Text style={{ color: '#ef4444' }}>*</Text>
            </Text>
          </View>

          <Controller
            control={control}
            name="description"
            rules={{
              required: 'Description is required',
              validate: (val) => val.trim().length > 0 || 'Description cannot be empty',
            }}
            render={({ field: { onChange, onBlur, value } }) => (
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.surfaceContainerLowest,
                    borderColor: errors.description ? '#ef4444' : colors.outlineVariant,
                    color: colors.onSurface,
                  },
                ]}
                placeholder="e.g. Dinner bill, Uber ride, Grocery store"
                placeholderTextColor={colors.onSurfaceVariant}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
              />
            )}
          />

          {errors.description && (
            <View style={styles.errorRow}>
              <MaterialIcons name="error-outline" size={14} color="#ef4444" />
              <Text style={styles.errorText}>{errors.description.message}</Text>
            </View>
          )}

          {/* Quick Category Tags */}
          <View style={styles.quickTagsContainer}>
            {QUICK_TAGS.map((tag) => (
              <TouchableOpacity
                key={tag}
                style={[
                  styles.quickTagPill,
                  {
                    backgroundColor: colors.surfaceContainerHigh,
                  },
                ]}
                onPress={() => setValue('description', tag, { shouldValidate: true })}
              >
                <Text style={[styles.quickTagText, { color: colors.onSurfaceVariant }]}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Date Selector Card */}
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
              <MaterialIcons name="event" size={18} color={themeColor} />
              <Text style={[styles.sectionTitle, { color: colors.onSurface }]}>Date</Text>
            </View>

            {/* Quick date pills */}
            <View style={styles.quickDatesRow}>
              <TouchableOpacity
                style={[
                  styles.quickDatePill,
                  selectedDate === todayStr && {
                    backgroundColor: themeColor,
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
                      color: selectedDate === todayStr ? '#ffffff' : colors.onSurfaceVariant,
                      fontWeight: selectedDate === todayStr ? '700' : '500',
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
                    backgroundColor: themeColor,
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
                      color: selectedDate === yesterdayStr ? '#ffffff' : colors.onSurfaceVariant,
                      fontWeight: selectedDate === yesterdayStr ? '700' : '500',
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
                borderColor: colors.outlineVariant,
              },
            ]}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.8}
          >
            <View style={styles.datePickerLeft}>
              <MaterialIcons name="calendar-today" size={18} color={themeColor} />
              <Text style={[styles.datePickerText, { color: colors.onSurface }]}>
                {formatReadableDate(selectedDate)}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            {
              backgroundColor: themeColor,
            },
          ]}
          onPress={handleSubmit(onSubmit)}
          disabled={isSubmitting || isLoading}
          activeOpacity={0.85}
        >
          {isSubmitting || isLoading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <MaterialIcons name="check" size={20} color="#ffffff" />
              <Text style={styles.submitButtonText}>
                {isOweMe ? 'Record Receivable Debt' : 'Record Payable Debt'}
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
                backgroundColor: colors.surface,
                borderColor: colors.outlineVariant,
              },
            ]}
          >
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.onSurface }]}>Select Friend</Text>
              <TouchableOpacity
                onPress={() => setShowPersonPicker(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={24} color={colors.onSurfaceVariant} />
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
                          ? colors.primaryContainer
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
                      <Text
                        style={[
                          styles.friendItemName,
                          {
                            color: isSelected ? colors.onPrimaryContainer : colors.onSurface,
                            fontWeight: isSelected ? '700' : '600',
                          },
                        ]}
                      >
                        {p.name}
                      </Text>
                      {p.phone && (
                        <Text
                          style={[
                            styles.friendItemPhone,
                            {
                              color: isSelected
                                ? colors.onPrimaryContainer
                                : colors.onSurfaceVariant,
                            },
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
                <View style={styles.emptyFriendsBox}>
                  <Text style={[styles.emptyFriendsText, { color: colors.onSurfaceVariant }]}>
                    No friends found matching "{friendSearch}"
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Add New Friend Button */}
            <TouchableOpacity
              style={[styles.addNewFriendBtn, { backgroundColor: colors.surfaceContainerHigh }]}
              onPress={() => {
                setShowPersonPicker(false);
                router.push('/add-splitwise-person');
              }}
            >
              <MaterialIcons name="person-add" size={18} color={colors.primary} />
              <Text style={[styles.addNewFriendText, { color: colors.primary }]}>
                + Add New Friend
              </Text>
            </TouchableOpacity>
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
    paddingVertical: 6,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  headerSaveText: {
    ...typography.labelMd,
    fontWeight: '700',
    fontSize: 13,
    color: '#ffffff',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
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
    gap: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    ...typography.headlineSm,
    fontSize: 14,
    fontWeight: '700',
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
    fontWeight: '700',
  },
  selectedPersonBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 12,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.headlineSm,
    fontSize: 15,
    fontWeight: '800',
  },
  selectedPersonInfo: {
    flex: 1,
  },
  selectedPersonName: {
    ...typography.bodyMd,
    fontSize: 15,
    fontWeight: '700',
  },
  selectedPersonPhone: {
    ...typography.bodyMd,
    fontSize: 12,
    marginTop: 2,
  },
  selectPromptBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: 10,
  },
  selectPromptText: {
    ...typography.bodyMd,
    fontSize: 14,
    fontWeight: '600',
  },
  toggleContainer: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: 4,
    gap: 6,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radius.sm,
    gap: 6,
  },
  toggleText: {
    ...typography.labelMd,
    fontSize: 13,
  },
  toggleSubtitle: {
    ...typography.bodyMd,
    fontSize: 12,
    marginTop: 10,
    textAlign: 'center',
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 10,
  },
  amountSymbol: {
    ...typography.headlineSm,
    fontSize: 26,
    fontWeight: '800',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    ...typography.headlineSm,
    fontSize: 26,
    fontWeight: '800',
    paddingVertical: 8,
  },
  quickAmountsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  quickAmountPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  quickAmountText: {
    ...typography.labelMd,
    fontSize: 12,
    fontWeight: '600',
  },
  textInput: {
    ...typography.bodyMd,
    fontSize: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  quickTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  quickTagPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  quickTagText: {
    ...typography.bodyMd,
    fontSize: 11,
    fontWeight: '600',
  },
  quickDatesRow: {
    flexDirection: 'row',
    gap: 6,
  },
  quickDatePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  quickDateText: {
    ...typography.labelMd,
    fontSize: 11,
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  datePickerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  datePickerText: {
    ...typography.bodyMd,
    fontSize: 14,
    fontWeight: '600',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 4,
  },
  submitButtonText: {
    ...typography.labelMd,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    marginBottom: 4,
  },
  errorText: {
    ...typography.bodyMd,
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '500',
  },
  // Friend Picker Modal
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
    marginBottom: 16,
  },
  modalTitle: {
    ...typography.headlineSm,
    fontSize: 18,
    fontWeight: '800',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    ...typography.bodyMd,
    fontSize: 14,
    paddingVertical: 2,
  },
  friendsListScroll: {
    maxHeight: 280,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: radius.md,
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
    ...typography.headlineSm,
    fontSize: 14,
    fontWeight: '800',
  },
  friendItemInfo: {
    flex: 1,
  },
  friendItemName: {
    ...typography.bodyMd,
    fontSize: 14,
  },
  friendItemPhone: {
    ...typography.bodyMd,
    fontSize: 11,
    marginTop: 2,
  },
  emptyFriendsBox: {
    padding: 24,
    alignItems: 'center',
  },
  emptyFriendsText: {
    ...typography.bodyMd,
    fontSize: 13,
    textAlign: 'center',
  },
  addNewFriendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radius.md,
    marginTop: 12,
    gap: 6,
  },
  addNewFriendText: {
    ...typography.labelMd,
    fontSize: 13,
    fontWeight: '700',
  },
});

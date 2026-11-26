import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  ScrollView,
  Keyboard,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { Text, Header, useAlert } from '@/components/ui';
import { typography, useTheme, radius } from '@/theme';
import { useSplitwiseStore } from '../store/splitwise.store';
import { SplitwiseSyncService } from '../services/SplitwiseSyncService';

const GROUP_CATEGORIES = [
  { id: 'trip', label: 'Trip / Travel', icon: 'flight' as const },
  { id: 'home', label: 'Home / Flat', icon: 'home' as const },
  { id: 'couple', label: 'Couple / Partner', icon: 'favorite' as const },
  { id: 'food', label: 'Food / Outing', icon: 'restaurant' as const },
  { id: 'project', label: 'Project / Event', icon: 'event' as const },
  { id: 'other', label: 'Other', icon: 'group' as const },
];

export interface AddGroupFormData {
  name: string;
  description?: string;
}

export function AddGroupScreen() {
  const { colors } = useTheme();
  const insets = useSafeInsets();
  const router = useRouter();
  const { showAlert } = useAlert();

  const { people, loadPeople, createGroup, isLoading } = useSplitwiseStore();

  const [selectedCategory, setSelectedCategory] = useState('trip');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState('');

  useEffect(() => {
    if (people.length === 0) {
      loadPeople();
    }
  }, [people.length, loadPeople]);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AddGroupFormData>({
    defaultValues: {
      name: '',
      description: '',
    },
    mode: 'onTouched',
  });

  const filteredPeople = useMemo(() => {
    if (!memberSearch.trim()) return people;
    const q = memberSearch.toLowerCase().trim();
    return people.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.phone && p.phone.toLowerCase().includes(q)) ||
        (p.email && p.email.toLowerCase().includes(q))
    );
  }, [people, memberSearch]);

  const toggleMember = (personId: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(personId)
        ? prev.filter((id) => id !== personId)
        : [...prev, personId]
    );
  };

  const selectAll = () => {
    setSelectedMemberIds(people.map((p) => p.id));
  };

  const deselectAll = () => {
    setSelectedMemberIds([]);
  };

  const onSubmit = async (data: AddGroupFormData) => {
    if (!data.name.trim()) {
      showAlert('Required', 'Please enter a group name');
      return;
    }

    if (selectedMemberIds.length === 0) {
      showAlert(
        'Members Required',
        'Please select at least 1 friend to add to this group.'
      );
      return;
    }

    try {
      const catObj = GROUP_CATEGORIES.find((c) => c.id === selectedCategory);
      await createGroup({
        name: data.name.trim(),
        description: data.description?.trim() || undefined,
        category: selectedCategory,
        icon: catObj?.icon || 'group',
        currency: 'INR',
        memberIds: selectedMemberIds,
      });

      SplitwiseSyncService.getInstance().syncWithCloud().catch(() => {});
      router.back();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to create group';
      showAlert('Error', msg);
    }
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <Header
        title="Create Group"
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
        contentContainerStyle={StyleSheet.flatten([
          styles.scrollContent,
          { paddingBottom: 32 },
        ])}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        extraScrollHeight={Platform.OS === 'ios' ? 140 : 160}
      >
        {/* CARD 1: GROUP INFO */}
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
            <MaterialIcons name="group" size={18} color={colors.primary} />
            <Text style={[styles.cardSectionTitle, { color: colors.onSurface }]}>
              Group Details
            </Text>
          </View>

          {/* Group Name Input */}
          <Text style={[styles.fieldLabel, { color: colors.onSurfaceVariant }]}>
            GROUP NAME <Text style={{ color: colors.error }}>*</Text>
          </Text>
          <Controller
            control={control}
            name="name"
            rules={{
              required: 'Group name is required',
              validate: (v) => v.trim().length > 0 || 'Group name cannot be empty',
            }}
            render={({ field: { onChange, onBlur, value } }) => (
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: colors.surfaceContainerLowest,
                    borderColor: errors.name ? colors.error : colors.surfaceVariant,
                  },
                ]}
              >
                <TextInput
                  style={[styles.textInput, { color: colors.onSurface }]}
                  placeholder="e.g. Goa Trip, Flat 302, Office Lunch"
                  placeholderTextColor={colors.outline}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  autoFocus
                />
              </View>
            )}
          />
          {errors.name && (
            <View style={styles.errorRow}>
              <MaterialIcons name="error-outline" size={14} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>
                {errors.name.message}
              </Text>
            </View>
          )}

          {/* Description Input */}
          <Text style={[styles.fieldLabel, { color: colors.onSurfaceVariant, marginTop: 14 }]}>
            DESCRIPTION (OPTIONAL)
          </Text>
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
                  placeholder="e.g. Shared expenses for summer vacation"
                  placeholderTextColor={colors.outline}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                />
              </View>
            )}
          />
        </View>

        {/* CARD 2: CATEGORY / TYPE SELECTION */}
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
            <MaterialIcons name="category" size={18} color={colors.primary} />
            <Text style={[styles.cardSectionTitle, { color: colors.onSurface }]}>
              Category
            </Text>
          </View>

          <View style={styles.categoriesGrid}>
            {GROUP_CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: isSelected
                        ? colors.primaryContainer
                        : colors.surfaceContainerLowest,
                      borderColor: isSelected ? colors.primary : colors.surfaceVariant,
                    },
                  ]}
                  onPress={() => setSelectedCategory(cat.id)}
                  activeOpacity={0.7}
                >
                  <MaterialIcons
                    name={cat.icon}
                    size={20}
                    color={isSelected ? colors.onPrimaryContainer : colors.onSurfaceVariant}
                  />
                  <Text
                    style={[
                      styles.categoryChipText,
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
          </View>
        </View>

        {/* CARD 3: MEMBERS SELECTION */}
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
              <MaterialIcons name="person-add" size={18} color={colors.primary} />
              <Text style={[styles.cardSectionTitle, { color: colors.onSurface }]}>
                Group Members ({selectedMemberIds.length + 1})
              </Text>
            </View>

            <View style={styles.memberActionBtns}>
              <TouchableOpacity onPress={selectAll} style={styles.actionBtnText}>
                <Text style={[styles.actionBtnLabel, { color: colors.primary }]}>
                  All
                </Text>
              </TouchableOpacity>
              <Text style={{ color: colors.outlineVariant, marginHorizontal: 4 }}>|</Text>
              <TouchableOpacity onPress={deselectAll} style={styles.actionBtnText}>
                <Text style={[styles.actionBtnLabel, { color: colors.onSurfaceVariant }]}>
                  Clear
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={[styles.memberPhone, { color: colors.onSurfaceVariant, marginBottom: 10 }]}>
            Friends with a Google email automatically see this group &amp; its expenses.
          </Text>

          {/* Search Box */}
          <View
            style={[
              styles.searchBox,
              {
                backgroundColor: colors.surfaceContainerLowest,
                borderColor: colors.surfaceVariant,
              },
            ]}
          >
            <MaterialIcons name="search" size={18} color={colors.onSurfaceVariant} />
            <TextInput
              style={[styles.searchInput, { color: colors.onSurface }]}
              placeholder="Search friends..."
              placeholderTextColor={colors.outline}
              value={memberSearch}
              onChangeText={setMemberSearch}
            />
            {memberSearch.length > 0 && (
              <TouchableOpacity onPress={() => setMemberSearch('')}>
                <MaterialIcons name="close" size={16} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            )}
          </View>

          {/* People List */}
          {people.length === 0 ? (
            <View style={styles.emptyPeopleBox}>
              <Text style={[styles.emptyPeopleText, { color: colors.onSurfaceVariant }]}>
                No friends added yet.
              </Text>
              <TouchableOpacity
                style={[styles.addNewFriendBtn, { backgroundColor: colors.primaryContainer }]}
                onPress={() => router.navigate('/(app)/add-splitwise-person')}
              >
                <MaterialIcons name="person-add" size={16} color={colors.onPrimaryContainer} />
                <Text style={[styles.addNewFriendText, { color: colors.onPrimaryContainer }]}>
                  Add Friend First
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.membersList}>
              {/* You (Pinned as Creator) */}
              <View
                style={[
                  styles.memberRow,
                  {
                    backgroundColor: colors.primaryContainer + '25',
                    borderColor: colors.primary + '60',
                  },
                ]}
              >
                <View
                  style={[
                    styles.avatarCircle,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Text style={[styles.avatarText, { color: colors.onPrimary }]}>
                    YOU
                  </Text>
                </View>

                <View style={styles.memberInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.memberName, { color: colors.onSurface }]}>
                      You
                    </Text>
                    <View
                      style={{
                        backgroundColor: colors.primary,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 4,
                      }}
                    >
                      <Text
                        style={{
                          color: colors.onPrimary,
                          fontSize: 10,
                          fontFamily: 'Manrope_700Bold',
                        }}
                      >
                        ADMIN
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.memberPhone, { color: colors.onSurfaceVariant }]}>
                    Group creator (always included)
                  </Text>
                </View>

                <MaterialIcons name="check-box" size={22} color={colors.primary} />
              </View>

              {filteredPeople.map((person) => {
                const isChecked = selectedMemberIds.includes(person.id);
                return (
                  <TouchableOpacity
                    key={person.id}
                    style={[
                      styles.memberRow,
                      {
                        backgroundColor: isChecked
                          ? colors.primaryContainer + '20'
                          : colors.surfaceContainerLowest,
                        borderColor: isChecked ? colors.primary + '50' : colors.surfaceVariant,
                      },
                    ]}
                    onPress={() => toggleMember(person.id)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.avatarCircle,
                        {
                          backgroundColor: isChecked
                            ? colors.primary
                            : colors.surfaceContainerHigh,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.avatarText,
                          {
                            color: isChecked ? colors.onPrimary : colors.onSurfaceVariant,
                          },
                        ]}
                      >
                        {person.name
                          .split(' ')
                          .filter(Boolean)
                          .map((n) => n[0])
                          .join('')
                          .substring(0, 2)
                          .toUpperCase()}
                      </Text>
                    </View>

                    <View style={styles.memberInfo}>
                      <Text style={[styles.memberName, { color: colors.onSurface }]}>
                        {person.name}
                      </Text>
                      <Text style={[styles.memberPhone, { color: person.email ? colors.primary : colors.onSurfaceVariant }]}>
                        {person.email
                          ? `${person.email} • Syncs to friend`
                          : person.phone
                            ? `${person.phone} • No email (local only)`
                            : 'No email (local only)'}
                      </Text>
                    </View>

                    <MaterialIcons
                      name={isChecked ? 'check-box' : 'check-box-outline-blank'}
                      size={22}
                      color={isChecked ? colors.primary : colors.outline}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Quick link to add a new friend */}
          <TouchableOpacity
            style={styles.addExtraFriendRow}
            onPress={() => router.navigate('/(app)/add-splitwise-person')}
          >
            <MaterialIcons name="person-add" size={16} color={colors.primary} />
            <Text style={[styles.addExtraFriendText, { color: colors.primary }]}>
              Add another friend to contacts
            </Text>
          </TouchableOpacity>
        </View>

        {/* SUBMIT BUTTON */}
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
              <MaterialIcons name="group-add" size={20} color={colors.onPrimary} />
              <Text style={[styles.submitButtonText, { color: colors.onPrimary }]}>
                Create Group
              </Text>
            </>
          )}
        </TouchableOpacity>
      </KeyboardAwareScrollView>
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
    marginBottom: 12,
  },
  cardSectionTitle: {
    fontSize: 15,
    fontFamily: 'Manrope_700Bold',
  },
  fieldLabel: {
    fontSize: 11,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: Platform.OS === 'ios' ? 0.5 : 0,
    marginBottom: 6,
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
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  errorText: {
    fontSize: 12,
    fontFamily: 'Manrope_500Medium',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 13,
  },
  memberActionBtns: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtnText: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  actionBtnLabel: {
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
  },
  emptyPeopleBox: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  emptyPeopleText: {
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
  },
  addNewFriendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  addNewFriendText: {
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
  },
  membersList: {
    gap: 8,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  memberName: {
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
  },
  memberPhone: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  addExtraFriendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 8,
  },
  addExtraFriendText: {
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
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


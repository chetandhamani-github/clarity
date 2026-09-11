import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { Text, Header } from '@/components/ui';
import { typography, useTheme, radius } from '@/theme';
import { useSplitwiseStore } from '../store/splitwise.store';

export interface AddPersonFormData {
  name: string;
  phone?: string;
  notes?: string;
}

export function AddPersonScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addPerson, isLoading } = useSplitwiseStore();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AddPersonFormData>({
    defaultValues: {
      name: '',
      phone: '',
      notes: '',
    },
    mode: 'onTouched',
  });

  const onSubmit = async (data: AddPersonFormData) => {
    try {
      await addPerson({
        name: data.name.trim(),
        phone: data.phone?.trim() || undefined,
        notes: data.notes?.trim() || undefined,
      });
      router.back();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to add friend. Please try again.');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Header
        title="Add Friend"
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
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraScrollHeight={Platform.OS === 'ios' ? 20 : 0}
      >
        {/* Banner Card */}
        <View
          style={[
            styles.bannerCard,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          <View style={[styles.avatarCircle, { backgroundColor: 'rgba(99, 102, 241, 0.12)' }]}>
            <MaterialIcons name="person-add" size={32} color={colors.primary} />
          </View>
          <Text style={[styles.bannerTitle, { color: colors.onSurface }]}>
            Add a Friend or Contact
          </Text>
          <Text style={[styles.bannerSub, { color: colors.onSurfaceVariant }]}>
            Track split dining bills, shared rent, travel expenses, and settlements.
          </Text>
        </View>

        {/* Form Fields Card */}
        <View
          style={[
            styles.formCard,
            {
              backgroundColor: colors.surfaceContainerLow,
              borderColor: colors.outlineVariant,
            },
          ]}
        >
          {/* Field: Name */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <MaterialIcons name="badge" size={16} color={colors.primary} />
              <Text style={[styles.inputLabel, { color: colors.onSurface }]}>
                Friend's Name <Text style={{ color: '#ef4444' }}>*</Text>
              </Text>
            </View>

            <Controller
              control={control}
              name="name"
              rules={{
                required: "Friend's name is required",
                validate: (value) => value.trim().length > 0 || 'Name cannot be only spaces',
              }}
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      color: colors.onSurface,
                      backgroundColor: colors.surfaceContainerLowest,
                      borderColor: errors.name ? '#ef4444' : colors.outlineVariant,
                    },
                  ]}
                  placeholder="e.g. Rahul Sharma"
                  placeholderTextColor={colors.onSurfaceVariant}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  autoCapitalize="words"
                  autoFocus
                />
              )}
            />
            {errors.name && (
              <View style={styles.errorRow}>
                <MaterialIcons name="error-outline" size={14} color="#ef4444" />
                <Text style={styles.errorText}>{errors.name.message}</Text>
              </View>
            )}
          </View>

          <View style={[styles.fieldDivider, { backgroundColor: colors.outlineVariant }]} />

          {/* Field: Phone */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <MaterialIcons name="phone" size={16} color={colors.primary} />
              <Text style={[styles.inputLabel, { color: colors.onSurface }]}>
                Phone Number <Text style={[styles.optionalTag, { color: colors.onSurfaceVariant }]}>Optional</Text>
              </Text>
            </View>

            <Controller
              control={control}
              name="phone"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[
                    styles.textInput,
                    {
                      color: colors.onSurface,
                      backgroundColor: colors.surfaceContainerLowest,
                      borderColor: colors.outlineVariant,
                    },
                  ]}
                  placeholder="+91 98765 43210"
                  placeholderTextColor={colors.onSurfaceVariant}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  keyboardType="phone-pad"
                />
              )}
            />
          </View>

          <View style={[styles.fieldDivider, { backgroundColor: colors.outlineVariant }]} />

          {/* Field: Notes */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <MaterialIcons name="description" size={16} color={colors.primary} />
              <Text style={[styles.inputLabel, { color: colors.onSurface }]}>
                Notes & Category <Text style={[styles.optionalTag, { color: colors.onSurfaceVariant }]}>Optional</Text>
              </Text>
            </View>

            <Controller
              control={control}
              name="notes"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  style={[
                    styles.textInput,
                    styles.textArea,
                    {
                      color: colors.onSurface,
                      backgroundColor: colors.surfaceContainerLowest,
                      borderColor: colors.outlineVariant,
                    },
                  ]}
                  placeholder="e.g. Flatmate, Trip partner, Office lunch colleague"
                  placeholderTextColor={colors.onSurfaceVariant}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              )}
            />
          </View>
        </View>

        {/* Primary Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: colors.primary }]}
          onPress={handleSubmit(onSubmit)}
          disabled={isSubmitting || isLoading}
          activeOpacity={0.85}
        >
          {isSubmitting || isLoading ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <>
              <MaterialIcons name="check" size={20} color={colors.onPrimary} />
              <Text style={[styles.saveButtonText, { color: colors.onPrimary }]}>
                Add Friend
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
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  bannerCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  bannerTitle: {
    ...typography.headlineSm,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
    textAlign: 'center',
  },
  bannerSub: {
    ...typography.bodyMd,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 8,
  },
  formCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  inputGroup: {
    gap: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inputLabel: {
    ...typography.labelMd,
    fontSize: 13,
    fontWeight: '700',
  },
  optionalTag: {
    fontWeight: '400',
    fontSize: 11,
  },
  textInput: {
    ...typography.bodyMd,
    fontSize: 14,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textArea: {
    minHeight: 76,
    paddingTop: 12,
  },
  fieldDivider: {
    height: 1,
    marginVertical: 16,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  errorText: {
    ...typography.bodyMd,
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '500',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
  },
  saveButtonText: {
    ...typography.labelMd,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
});

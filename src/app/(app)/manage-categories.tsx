import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, Header, useToast, useAlert } from '@/components/ui';
import { spacing, typography, radius, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from '@/hooks/use-budget';
import { formatCurrency } from '@/utils/format';
import type { BudgetCategory, BucketType } from '@/types';

type MaterialIconName = keyof typeof MaterialIcons.glyphMap;

const ICON_PALETTE: MaterialIconName[] = [
  'shopping-cart',
  'restaurant',
  'directions-car',
  'home',
  'flash-on',
  'local-gas-station',
  'fitness-center',
  'movie',
  'local-mall',
  'pets',
  'flight',
  'school',
  'medical-services',
  'sports-esports',
  'subscriptions',
  'delivery-dining',
  'favorite',
  'card-giftcard',
  'work',
  'laptop',
  'savings',
  'trending-up',
  'build',
  'payments',
  'receipt',
  'security',
  'category',
];

const BUCKET_OPTIONS: { label: string; value: BucketType; color: string }[] = [
  { label: 'Needs (50%)', value: 'needs', color: '#3B82F6' },
  { label: 'Wants (30%)', value: 'wants', color: '#EC4899' },
  { label: 'Savings (20%)', value: 'savings', color: '#10B981' },
];

export default function ManageCategoriesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showToast } = useToast();
  const { showAlert } = useAlert();

  const { categories, isLoading } = useCategories();
  const createCategoryMutation = useCreateCategory();
  const updateCategoryMutation = useUpdateCategory();
  const deleteCategoryMutation = useDeleteCategory();

  const [activeFilter, setActiveFilter] = useState<'all' | BucketType>('all');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<BudgetCategory | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [bucketType, setBucketType] = useState<BucketType>('needs');
  const [limit, setLimit] = useState('');
  const [selectedIcon, setSelectedIcon] = useState<MaterialIconName>('category');

  const filteredCategories = categories.filter((cat) => {
    if (activeFilter === 'all') return true;
    return cat.bucketType === activeFilter;
  });

  const openCreateModal = () => {
    setEditingCategory(null);
    setName('');
    setBucketType('needs');
    setLimit('');
    setSelectedIcon('category');
    setModalVisible(true);
  };

  const openEditModal = (cat: BudgetCategory) => {
    setEditingCategory(cat);
    setName(cat.name);
    setBucketType(cat.bucketType);
    setLimit(cat.limit > 0 ? cat.limit.toString() : '');
    setSelectedIcon((cat.icon as MaterialIconName) || 'category');
    setModalVisible(true);
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast('Please enter a category name', 'error');
      return;
    }

    const numLimit = parseFloat(limit) || 0;

    if (editingCategory) {
      updateCategoryMutation.mutate(
        editingCategory.id,
        {
          name: trimmedName,
          bucketType,
          limit: numLimit,
          icon: selectedIcon,
        },
        {
          onSuccess: () => {
            showToast(`Updated "${trimmedName}"`, 'success');
            setModalVisible(false);
          },
        }
      );
    } else {
      createCategoryMutation.mutate(
        {
          name: trimmedName,
          bucketType,
          limit: numLimit,
          icon: selectedIcon,
          sortOrder: categories.length,
        },
        {
          onSuccess: () => {
            showToast(`Created "${trimmedName}"`, 'success');
            setModalVisible(false);
          },
        }
      );
    }
  };

  const handleDelete = (cat: BudgetCategory) => {
    showAlert('Delete Category', `Are you sure you want to delete "${cat.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteCategoryMutation.mutate(cat.id, {
            onSuccess: () => showToast(`Deleted "${cat.name}"`, 'info'),
          });
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <Header
        showBack
        title="Manage Categories"
        rightNode={
          <TouchableOpacity
            style={[styles.addIconButton, { backgroundColor: colors.primaryContainer }]}
            onPress={openCreateModal}
          >
            <MaterialIcons name="add" size={24} color={colors.primary} />
          </TouchableOpacity>
        }
      />

      {/* Filter Tabs */}
      <View style={[styles.tabBar, { borderBottomColor: colors.surfaceVariant }]}>
        {(['all', 'needs', 'wants', 'savings'] as const).map((tab) => {
          const isActive = activeFilter === tab;
          return (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tabItem,
                { backgroundColor: colors.surfaceContainerLow },
                isActive && { backgroundColor: colors.primary },
              ]}
              onPress={() => setActiveFilter(tab)}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: colors.onSurfaceVariant },
                  isActive && { color: colors.onPrimary },
                ]}
              >
                {tab.toUpperCase()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {filteredCategories.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="category" size={48} color={colors.onSurfaceVariant} />
            <Text style={[styles.emptyTitle, { color: colors.onSurface }]}>No categories found</Text>
            <Text style={[styles.emptySubtitle, { color: colors.onSurfaceVariant }]}>Tap + above to add a custom category.</Text>
          </View>
        ) : (
          <View style={styles.categoryList}>
            {filteredCategories.map((cat) => {
              const bucketColor =
                cat.bucketType === 'needs'
                  ? '#3B82F6'
                  : cat.bucketType === 'wants'
                    ? '#EC4899'
                    : '#10B981';

              return (
                <View
                  key={cat.id}
                  style={[
                    styles.categoryCard,
                    {
                      backgroundColor: colors.surfaceContainerLowest,
                      borderColor: colors.surfaceVariant,
                    },
                  ]}
                >
                  <View style={styles.cardLeft}>
                    <View
                      style={[
                        styles.iconCircle,
                        { backgroundColor: colors.surfaceContainerHighest },
                      ]}
                    >
                      <MaterialIcons
                        name={(cat.icon as MaterialIconName) || 'category'}
                        size={22}
                        color={colors.primary}
                      />
                    </View>
                    <View style={styles.cardDetails}>
                      <Text style={[styles.categoryName, { color: colors.onSurface }]}>{cat.name}</Text>
                      <View style={styles.badgeRow}>
                        <View
                          style={[
                            styles.bucketBadge,
                            { backgroundColor: bucketColor + '20', borderColor: bucketColor + '40' },
                          ]}
                        >
                          <Text style={[styles.bucketBadgeText, { color: bucketColor }]}>
                            {cat.bucketType.toUpperCase()}
                          </Text>
                        </View>
                        {cat.limit > 0 && (
                          <Text style={[styles.limitText, { color: colors.onSurfaceVariant }]}>
                            Limit: {formatCurrency(cat.limit)}/mo
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>

                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: colors.surfaceContainerHigh }]}
                      onPress={() => openEditModal(cat)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialIcons name="edit" size={18} color={colors.onSurfaceVariant} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: colors.surfaceContainerHigh }]}
                      onPress={() => handleDelete(cat)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <MaterialIcons name="delete-outline" size={18} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Create / Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <TouchableOpacity
            style={styles.backdropTouch}
            activeOpacity={1}
            onPress={() => setModalVisible(false)}
          />
          <View style={[styles.modalContent, { backgroundColor: colors.surfaceContainerLowest }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.onSurface }]}>
                {editingCategory ? 'Edit Category' : 'New Category'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialIcons name="close" size={24} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Category Name */}
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.onSurfaceVariant }]}>Category Name*</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.surfaceContainerLow,
                      borderColor: colors.surfaceVariant,
                      color: colors.onSurface,
                    },
                  ]}
                  placeholder="e.g. Pet Care, Gaming, Books"
                  placeholderTextColor={colors.onSurfaceVariant}
                  value={name}
                  onChangeText={setName}
                />
              </View>

              {/* Bucket Selection */}
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.onSurfaceVariant }]}>Budget Bucket*</Text>
                <View style={styles.bucketRow}>
                  {BUCKET_OPTIONS.map((opt) => {
                    const isSelected = bucketType === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.bucketChoice,
                          {
                            borderColor: colors.surfaceVariant,
                            backgroundColor: colors.surfaceContainerLow,
                          },
                          isSelected && {
                            borderColor: opt.color,
                            backgroundColor: opt.color + '15',
                          },
                        ]}
                        onPress={() => setBucketType(opt.value)}
                      >
                        <Text
                          style={[
                            styles.bucketChoiceText,
                            { color: colors.onSurfaceVariant },
                            isSelected && { color: opt.color, fontWeight: '700' },
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Monthly Limit */}
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.onSurfaceVariant }]}>Monthly Budget Limit (Optional)</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.surfaceContainerLow,
                      borderColor: colors.surfaceVariant,
                      color: colors.onSurface,
                    },
                  ]}
                  placeholder="₹ 0.00"
                  placeholderTextColor={colors.onSurfaceVariant}
                  keyboardType="numeric"
                  value={limit}
                  onChangeText={setLimit}
                />
              </View>

              {/* Icon Palette */}
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.onSurfaceVariant }]}>Choose Icon</Text>
                <View style={styles.iconGrid}>
                  {ICON_PALETTE.map((iconName) => {
                    const isSelected = selectedIcon === iconName;
                    return (
                      <TouchableOpacity
                        key={iconName}
                        style={[
                          styles.iconTile,
                          {
                            borderColor: colors.surfaceVariant,
                            backgroundColor: colors.surfaceContainerLow,
                          },
                          isSelected && {
                            backgroundColor: colors.primaryContainer,
                            borderColor: colors.primary,
                          },
                        ]}
                        onPress={() => setSelectedIcon(iconName)}
                      >
                        <MaterialIcons
                          name={iconName}
                          size={22}
                          color={isSelected ? colors.onPrimaryContainer : colors.onSurfaceVariant}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Save Button */}
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: colors.primary }]}
                onPress={handleSave}
                disabled={createCategoryMutation.isPending || updateCategoryMutation.isPending}
              >
                <Text style={[styles.saveButtonText, { color: colors.onPrimary }]}>
                  {editingCategory ? 'Update Category' : 'Create Category'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  addIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
  },
  tabItem: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  tabText: {
    ...typography.labelMd,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 20,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  emptyTitle: {
    ...typography.headlineSm,
    fontWeight: '600',
  },
  emptySubtitle: {
    ...typography.bodyMd,
  },
  categoryList: {
    gap: 12,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardDetails: {
    flex: 1,
    gap: 4,
  },
  categoryName: {
    ...typography.bodyLg,
    fontWeight: '600',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  bucketBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  bucketBadgeText: {
    ...typography.labelMd,
    fontSize: 10,
    fontWeight: '700',
  },
  limitText: {
    ...typography.labelMd,
    fontSize: 11,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    padding: 8,
    borderRadius: 8,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  backdropTouch: {
    flex: 1,
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    ...typography.headlineMd,
    fontWeight: '700',
  },
  formGroup: {
    marginBottom: 18,
  },
  formLabel: {
    ...typography.labelMd,
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    ...typography.bodyLg,
  },
  bucketRow: {
    flexDirection: 'row',
    gap: 8,
  },
  bucketChoice: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
  },
  bucketChoiceText: {
    ...typography.labelMd,
    fontSize: 11,
    fontWeight: '600',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  saveButton: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  saveButtonText: {
    ...typography.bodyLg,
    fontWeight: '700',
  },
});


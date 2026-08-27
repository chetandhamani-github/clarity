import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, TextInput } from 'react-native';
import { Text, Header } from '@/components/ui';
import { spacing, typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBudgetPlan, useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '@/hooks/use-budget';
import { useToast, useAlert } from '@/components/ui';
import { formatCurrency, getCurrencySymbol } from '@/utils/format';
import type { BudgetCategory, BucketType } from '@/types';

export default function ManageCategoriesScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { plan, isLoading: planLoading } = useBudgetPlan();
  const { categories, isLoading: catLoading } = useCategories();
  const { mutate: createCategory, isPending: isCreating } = useCreateCategory();
  const { mutate: updateCategory, isPending: isUpdating } = useUpdateCategory();
  const { mutate: deleteCategory, isPending: isDeleting } = useDeleteCategory();
  const { showToast } = useToast();
  const { showAlert } = useAlert();

  const isPending = isCreating || isUpdating || isDeleting;
  const isLoading = planLoading || catLoading;

  const [showAddForm, setShowAddForm] = useState(false);
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [newCatName, setNewCatName] = useState('');
  const [newCatLimit, setNewCatLimit] = useState('');
  const [newCatBucket, setNewCatBucket] = useState<BucketType>('needs');

  const resetForm = () => {
    setNewCatName('');
    setNewCatLimit('');
    setEditCatId(null);
    setShowAddForm(false);
  };

  const handleCategoryPress = (cat: BudgetCategory) => {
    setEditCatId(cat.id);
    setNewCatName(cat.name);
    setNewCatLimit(cat.limit.toString());
    setNewCatBucket(cat.bucketType);
    setShowAddForm(true);
  };

  const handleSaveCategory = () => {
    if (!newCatName.trim()) {
      showAlert('Validation Error', 'Please enter a category name.');
      return;
    }
    const limit = parseFloat(newCatLimit);
    if (isNaN(limit) || limit < 0) {
      showAlert('Validation Error', 'Please enter a valid budget limit.');
      return;
    }

    const catData = {
      name: newCatName.trim(),
      icon: 'category', // Default icon for now
      limit,
      bucketType: newCatBucket,
      sortOrder: categories.length,
    };

    if (editCatId) {
      updateCategory(editCatId, catData, {
        onSuccess: () => {
          showToast('Category updated successfully', 'success');
          resetForm();
        }
      });
    } else {
      createCategory(catData, {
        onSuccess: () => {
          showToast('Category added successfully', 'success');
          resetForm();
        }
      });
    }
  };

  const handleDeleteCategory = () => {
    if (editCatId) {
      showAlert(
        'Delete Category',
        'Are you sure you want to delete this category?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              deleteCategory(editCatId, {
                onSuccess: () => {
                  showToast('Category deleted', 'success');
                  resetForm();
                }
              });
            },
          },
        ]
      );
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Calculate bucket totals
  const needsCategories = categories.filter(c => c.bucketType === 'needs');
  const wantsCategories = categories.filter(c => c.bucketType === 'wants');
  const savingsCategories = categories.filter(c => c.bucketType === 'savings');

  const needsTotalLimit = needsCategories.reduce((sum, cat) => sum + cat.limit, 0);
  const wantsTotalLimit = wantsCategories.reduce((sum, cat) => sum + cat.limit, 0);
  const savingsTotalLimit = savingsCategories.reduce((sum, cat) => sum + cat.limit, 0);

  const needsMax = plan ? plan.monthlyIncome * (plan.needsPercent / 100) : 0;
  const wantsMax = plan ? plan.monthlyIncome * (plan.wantsPercent / 100) : 0;
  const savingsMax = plan ? plan.monthlyIncome * (plan.savingsPercent / 100) : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header
        showBack
        title="Category Management"
      />

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
        {/* Mobile Action Section */}
        <View style={styles.mobileActionSection}>
          <Text style={styles.subtitleText}>Organize your {plan?.needsPercent}/{plan?.wantsPercent}/{plan?.savingsPercent} budget hierarchy.</Text>
          <TouchableOpacity 
            style={styles.newCategoryBtn}
            onPress={() => {
              if (showAddForm) {
                resetForm();
              } else {
                setEditCatId(null);
                setNewCatName('');
                setNewCatLimit('');
                setShowAddForm(true);
              }
            }}
          >
            <MaterialIcons name={showAddForm ? "close" : "add"} size={18} color={colors.onPrimary} />
            <Text style={styles.newCategoryText}>{showAddForm ? 'Cancel' : 'New Category'}</Text>
          </TouchableOpacity>
        </View>

        {showAddForm && (
          <View style={styles.addFormCard}>
            <Text style={styles.addFormTitle}>{editCatId ? 'Edit Category' : 'Add New Category'}</Text>
            
            <View style={styles.bucketSelector}>
              {(['needs', 'wants', 'savings'] as BucketType[]).map(b => (
                <TouchableOpacity
                  key={b}
                  style={[styles.bucketOption, newCatBucket === b && { backgroundColor: colors.primary }]}
                  onPress={() => setNewCatBucket(b)}
                >
                  <Text style={[styles.bucketOptionText, newCatBucket === b && { color: colors.onPrimary }]}>
                    {b.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.input}
              placeholder="Category Name (e.g. Groceries)"
              placeholderTextColor={colors.outline}
              value={newCatName}
              onChangeText={setNewCatName}
            />

            <View style={styles.currencyInputRow}>
              <Text style={styles.currencySymbol}>{getCurrencySymbol()}</Text>
              <TextInput
                style={styles.input}
                placeholder="Monthly Limit"
                placeholderTextColor={colors.outline}
                keyboardType="decimal-pad"
                value={newCatLimit}
                onChangeText={setNewCatLimit}
              />
            </View>

            <TouchableOpacity 
              style={[styles.saveBtn, isPending && { opacity: 0.7 }]}
              onPress={handleSaveCategory}
              disabled={isPending}
            >
              {isPending ? (
                 <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Text style={styles.saveBtnText}>{editCatId ? 'Save Changes' : 'Save Category'}</Text>
              )}
            </TouchableOpacity>

            {editCatId && (
              <TouchableOpacity 
                style={styles.deleteBtn}
                onPress={handleDeleteCategory}
                disabled={isPending}
              >
                <Text style={styles.deleteBtnText}>Delete Category</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.categoriesGrid}>
          {/* Needs Column */}
          <View style={styles.columnCard}>
            <View style={styles.columnHeader}>
              <View style={styles.columnHeaderLeft}>
                <View style={[styles.columnIconBox, { backgroundColor: colors.primary + '1A' }]}>
                  <MaterialIcons name="home" size={20} color={colors.primary} />
                </View>
                <View>
                  <Text style={styles.columnTitle}>Needs ({plan?.needsPercent}%)</Text>
                  <Text style={styles.columnSubtitle}>Essentials & fixed costs</Text>
                </View>
              </View>
              <View style={styles.columnTotals}>
                <Text style={styles.totalValue}>{formatCurrency(needsTotalLimit)}</Text>
                <Text style={styles.totalMax}>/ {formatCurrency(needsMax)}</Text>
              </View>
            </View>

            <View style={styles.categoryList}>
              {needsCategories.length === 0 ? (
                <Text style={styles.emptyText}>No categories yet.</Text>
              ) : (
                needsCategories.map(cat => (
                  <TouchableOpacity 
                    key={cat.id} 
                    style={styles.categoryItem}
                    onPress={() => handleCategoryPress(cat)}
                  >
                    <View style={styles.itemIconBox}>
                      <MaterialIcons name={cat.icon as any} size={18} color={colors.onSurfaceVariant} />
                    </View>
                    <View style={styles.itemTextContent}>
                      <Text style={styles.itemName}>{cat.name}</Text>
                      <Text style={styles.itemLimit}>{formatCurrency(cat.limit)} limit</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </View>

          {/* Wants Column */}
          <View style={styles.columnCard}>
            <View style={styles.columnHeader}>
              <View style={styles.columnHeaderLeft}>
                <View style={[styles.columnIconBox, { backgroundColor: colors.tertiary + '1A' }]}>
                  <MaterialIcons name="local-cafe" size={20} color={colors.tertiary} />
                </View>
                <View>
                  <Text style={styles.columnTitle}>Wants ({plan?.wantsPercent}%)</Text>
                  <Text style={styles.columnSubtitle}>Lifestyle & discretionary</Text>
                </View>
              </View>
              <View style={styles.columnTotals}>
                <Text style={styles.totalValue}>{formatCurrency(wantsTotalLimit)}</Text>
                <Text style={styles.totalMax}>/ {formatCurrency(wantsMax)}</Text>
              </View>
            </View>

            <View style={styles.categoryList}>
              {wantsCategories.length === 0 ? (
                <Text style={styles.emptyText}>No categories yet.</Text>
              ) : (
                wantsCategories.map(cat => (
                  <TouchableOpacity 
                    key={cat.id} 
                    style={styles.categoryItem}
                    onPress={() => handleCategoryPress(cat)}
                  >
                    <View style={styles.itemIconBox}>
                      <MaterialIcons name={cat.icon as any} size={18} color={colors.onSurfaceVariant} />
                    </View>
                    <View style={styles.itemTextContent}>
                      <Text style={styles.itemName}>{cat.name}</Text>
                      <Text style={styles.itemLimit}>{formatCurrency(cat.limit)} limit</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </View>

          {/* Savings Column */}
          <View style={styles.columnCard}>
            <View style={styles.columnHeader}>
              <View style={styles.columnHeaderLeft}>
                <View style={[styles.columnIconBox, { backgroundColor: colors.secondary + '1A' }]}>
                  <MaterialIcons name="savings" size={20} color={colors.secondary} />
                </View>
                <View>
                  <Text style={styles.columnTitle}>Savings ({plan?.savingsPercent}%)</Text>
                  <Text style={styles.columnSubtitle}>Future & debt payoff</Text>
                </View>
              </View>
              <View style={styles.columnTotals}>
                <Text style={styles.totalValue}>{formatCurrency(savingsTotalLimit)}</Text>
                <Text style={styles.totalMax}>/ {formatCurrency(savingsMax)}</Text>
              </View>
            </View>

            <View style={styles.categoryList}>
              {savingsCategories.length === 0 ? (
                <Text style={styles.emptyText}>No categories yet.</Text>
              ) : (
                savingsCategories.map(cat => (
                  <TouchableOpacity 
                    key={cat.id} 
                    style={styles.categoryItem}
                    onPress={() => handleCategoryPress(cat)}
                  >
                    <View style={styles.itemIconBox}>
                      <MaterialIcons name={cat.icon as any} size={18} color={colors.onSurfaceVariant} />
                    </View>
                    <View style={styles.itemTextContent}>
                      <Text style={styles.itemName}>{cat.name}</Text>
                      <Text style={styles.itemLimit}>{formatCurrency(cat.limit)} goal</Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </View>
        </View>
      </ScrollView>
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
      gap: 24,
    },
    mobileActionSection: {
      gap: 16,
    },
    subtitleText: {
      ...typography.bodyLg,
      color: colors.secondary,
    },
    newCategoryBtn: {
      backgroundColor: colors.primary, 
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 24,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      shadowColor: colors.onSurface,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    newCategoryText: {
      ...typography.labelMd,
      color: colors.onPrimary,
    },
    addFormCard: {
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: 20,
      gap: 16,
    },
    addFormTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
    },
    bucketSelector: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceContainer,
      borderRadius: 8,
      padding: 4,
      gap: 4,
    },
    bucketOption: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: 4,
    },
    bucketOptionText: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
    },
    input: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      ...typography.bodyLg,
      color: colors.onSurface,
      flex: 1,
    },
    currencyInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    currencySymbol: {
      ...typography.dataLg,
      color: colors.onSurface,
    },
    saveBtn: {
      backgroundColor: colors.primary,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: 'center',
    },
    saveBtnText: {
      ...typography.labelMd,
      color: colors.onPrimary,
    },
    deleteBtn: {
      paddingVertical: 12,
      alignItems: 'center',
    },
    deleteBtnText: {
      ...typography.labelMd,
      color: colors.error,
    },
    categoriesGrid: {
      gap: 24,
    },
    columnCard: {
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: 24,
    },
    columnHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingBottom: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.outlineVariant,
      marginBottom: 16,
    },
    columnHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    columnIconBox: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    columnTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
    },
    columnSubtitle: {
      ...typography.labelMd,
      color: colors.secondary,
    },
    columnTotals: {
      alignItems: 'flex-end',
    },
    totalValue: {
      ...typography.dataLg,
      color: colors.onSurface,
    },
    totalMax: {
      ...typography.bodyMd,
      color: colors.secondary,
    },
    categoryList: {
      gap: 12,
    },
    categoryItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.outlineVariant + '4D', 
      gap: 12,
    },
    itemIconBox: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemTextContent: {
      flex: 1,
    },
    itemName: {
      ...typography.labelMd,
      color: colors.onSurface,
    },
    itemLimit: {
      ...typography.bodyMd,
      fontSize: 12,
      color: colors.secondary,
    },
    emptyText: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
      paddingVertical: 12,
    },
  });
  return styles;
};

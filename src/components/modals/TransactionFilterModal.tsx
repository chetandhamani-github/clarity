import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { Text } from '@/components/ui';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme, typography, ThemeColors } from '@/theme';
import { useAccounts } from '@/hooks/use-accounts';
import { useCategories } from '@/hooks/use-budget';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useTags } from '@/hooks/use-tags';

export type DatePreset = 'all' | 'this_month' | 'last_month' | 'last_90_days';

export interface ActiveFilters {
  accountId?: string;
  category?: string;
  tag?: string;
  datePreset: DatePreset;
  type?: 'all' | 'expense' | 'income' | 'transfer';
}

interface Props {
  visible: boolean;
  filters: ActiveFilters;
  lockedAccountId?: string;
  onClose: () => void;
  onApply: (filters: ActiveFilters) => void;
}

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'all', label: 'All Time' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'last_90_days', label: 'Last 90 Days' },
];

const TYPE_OPTIONS: { id: 'all' | 'expense' | 'income' | 'transfer'; label: string }[] = [
  { id: 'all', label: 'All Types' },
  { id: 'expense', label: 'Expenses' },
  { id: 'income', label: 'Income' },
  { id: 'transfer', label: 'Transfers' },
];

export function TransactionFilterModal({
  visible,
  filters,
  lockedAccountId,
  onClose,
  onApply,
}: Props) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeInsets();
  const { accounts } = useAccounts();
  const { categories } = useCategories();
  const { tags } = useTags();

  const [selectedType, setSelectedType] = useState<'all' | 'expense' | 'income' | 'transfer'>(
    filters.type || 'all'
  );
  const [selectedDatePreset, setSelectedDatePreset] = useState<DatePreset>(
    filters.datePreset || 'all'
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(
    lockedAccountId ?? filters.accountId
  );
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(
    filters.category
  );
  const [selectedTag, setSelectedTag] = useState<string | undefined>(
    filters.tag
  );

  useEffect(() => {
    if (visible) {
      setSelectedType(filters.type || 'all');
      setSelectedDatePreset(filters.datePreset || 'all');
      setSelectedAccountId(lockedAccountId ?? filters.accountId);
      setSelectedCategory(filters.category);
      setSelectedTag(filters.tag);
    }
  }, [visible, filters, lockedAccountId]);

  if (!visible) return null;

  const handleReset = () => {
    setSelectedType('all');
    setSelectedDatePreset('all');
    setSelectedAccountId(lockedAccountId);
    setSelectedCategory(undefined);
    setSelectedTag(undefined);
  };

  const handleApply = () => {
    onApply({
      type: selectedType,
      datePreset: selectedDatePreset,
      accountId: lockedAccountId ?? selectedAccountId,
      category: selectedCategory,
      tag: selectedTag,
    });
    onClose();
  };

  const activeCount =
    (selectedType !== 'all' ? 1 : 0) +
    (selectedDatePreset !== 'all' ? 1 : 0) +
    (!lockedAccountId && selectedAccountId ? 1 : 0) +
    (selectedCategory ? 1 : 0) +
    (selectedTag ? 1 : 0);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Filter Transactions</Text>
            {activeCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{activeCount}</Text>
              </View>
            )}
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={handleReset} style={styles.resetButton}>
              <Text style={styles.resetText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="close" size={24} color={colors.onSurface} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Filters Scroll */}
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Section: Type */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Transaction Type</Text>
            <View style={styles.chipRow}>
              {TYPE_OPTIONS.map((item) => {
                const isSelected = selectedType === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => setSelectedType(item.id)}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Section: Date Range */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Time Period</Text>
            <View style={styles.chipRow}>
              {DATE_PRESETS.map((item) => {
                const isSelected = selectedDatePreset === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => setSelectedDatePreset(item.id)}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Section: Account */}
          {!lockedAccountId && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Account</Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, !selectedAccountId && styles.chipSelected]}
                  onPress={() => setSelectedAccountId(undefined)}
                >
                  <Text style={[styles.chipText, !selectedAccountId && styles.chipTextSelected]}>
                    All Accounts
                  </Text>
                </TouchableOpacity>
                {accounts.map((acc) => {
                  const isSelected = selectedAccountId === acc.id;
                  return (
                    <TouchableOpacity
                      key={acc.id}
                      style={[styles.chip, isSelected && styles.chipSelected]}
                      onPress={() => setSelectedAccountId(isSelected ? undefined : acc.id)}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                        {acc.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Section: Category */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Category</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, !selectedCategory && styles.chipSelected]}
                onPress={() => setSelectedCategory(undefined)}
              >
                <Text style={[styles.chipText, !selectedCategory && styles.chipTextSelected]}>
                  All Categories
                </Text>
              </TouchableOpacity>
              {categories.map((cat) => {
                const isSelected = selectedCategory === cat.name;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => setSelectedCategory(isSelected ? undefined : cat.name)}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Section: Tags */}
          {tags.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Tags</Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  style={[styles.chip, !selectedTag && styles.chipSelected]}
                  onPress={() => setSelectedTag(undefined)}
                >
                  <Text style={[styles.chipText, !selectedTag && styles.chipTextSelected]}>
                    All Tags
                  </Text>
                </TouchableOpacity>
                {tags.map((t) => {
                  const isSelected = selectedTag === t.name;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.chip, isSelected && styles.chipSelected]}
                      onPress={() => setSelectedTag(isSelected ? undefined : t.name)}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                        #{t.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
        </ScrollView>

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 28) + 16 }]}>
          <TouchableOpacity style={styles.applyButton} onPress={handleApply}>
            <Text style={styles.applyButtonText}>
              Apply Filters {activeCount > 0 ? `(${activeCount})` : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineVariant,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    title: {
      ...typography.headlineSm,
      color: colors.onSurface,
      fontWeight: '700',
    },
    badge: {
      backgroundColor: colors.primary,
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: {
      ...typography.labelMd,
      color: colors.onPrimary,
      fontSize: 11,
      fontWeight: '700',
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    resetText: {
      ...typography.labelMd,
      color: colors.primary,
      fontWeight: '600',
    },
    resetButton: {
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: 20,
      gap: 24,
      paddingBottom: 40,
    },
    section: {
      gap: 12,
    },
    sectionTitle: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      fontFamily: 'Manrope_700Bold',
      textTransform: 'uppercase',
      letterSpacing: Platform.OS === 'ios' ? 0.5 : 0,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 20,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    chipSelected: {
      backgroundColor: colors.primaryContainer,
      borderColor: colors.primary,
    },
    chipText: {
      ...typography.bodyMd,
      fontSize: 13,
      color: colors.onSurfaceVariant,
      fontWeight: '500',
    },
    chipTextSelected: {
      color: colors.onPrimaryContainer,
      fontWeight: '700',
    },
    footer: {
      padding: 20,
      borderTopWidth: 1,
      borderTopColor: colors.outlineVariant,
      backgroundColor: colors.surface,
    },
    applyButton: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    applyButtonText: {
      ...typography.labelMd,
      color: colors.onPrimary,
      fontWeight: '700',
      fontSize: 15,
    },
  });
  return styles;
};


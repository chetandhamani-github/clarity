import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Text, Header, useToast, useAlert } from '@/components/ui';
import { typography, useTheme, radius, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  useSmartRule,
  useSaveSmartRule,
  useDeleteSmartRule,
} from '@/hooks/use-smart-rules';
import type {
  SmartRule,
  RuleCondition,
  RuleAction,
  RuleTrigger,
  RuleConditionField,
  RuleConditionOperator,
  RuleActionType,
} from '@/types';

const TRIGGER_SOURCES: { label: string; value: RuleTrigger; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { label: 'All Sources', value: 'any', icon: 'all-inclusive' },
  { label: 'SMS Only', value: 'sms', icon: 'sms' },
  { label: 'Statements', value: 'statement', icon: 'receipt' },
  { label: 'Manual Only', value: 'manual', icon: 'edit' },
];

const CONDITION_FIELDS: { label: string; value: RuleConditionField }[] = [
  { label: 'Merchant Name', value: 'merchant' },
  { label: 'Amount (₹)', value: 'amount' },
  { label: 'Category', value: 'category' },
  { label: 'Notes', value: 'note' },
];

const TEXT_OPERATORS: { label: string; value: RuleConditionOperator }[] = [
  { label: 'Contains', value: 'contains' },
  { label: 'Equals', value: 'equals' },
  { label: 'Starts with', value: 'starts_with' },
  { label: 'Regex', value: 'regex' },
];

const AMOUNT_OPERATORS: { label: string; value: RuleConditionOperator }[] = [
  { label: 'Greater than', value: 'greater_than' },
  { label: 'Less than', value: 'less_than' },
  { label: 'Equals', value: 'equals' },
  { label: 'Between', value: 'between' },
];

const ACTION_TYPES: { label: string; value: RuleActionType; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { label: 'Set Category', value: 'set_category', icon: 'category' },
  { label: 'Add Tag', value: 'add_tag', icon: 'label' },
  { label: 'Set Note', value: 'set_note', icon: 'notes' },
  { label: 'Append Note', value: 'append_note', icon: 'post-add' },
  { label: 'Mark Reviewed', value: 'mark_reviewed', icon: 'verified' },
];

const COMMON_CATEGORIES = [
  'Food & Dining',
  'Groceries',
  'Transport',
  'Shopping',
  'Entertainment',
  'Utilities',
  'Health',
  'Travel',
  'Personal',
  'Salary',
  'Other',
];

export default function AddRuleScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const ruleId = params.id;
  const isEditing = Boolean(ruleId);

  const { showToast } = useToast();
  const { showAlert } = useAlert();

  const { data: existingRule, isLoading: isLoadingRule } = useSmartRule(ruleId || '');
  const saveMutation = useSaveSmartRule();
  const deleteMutation = useDeleteSmartRule();

  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<RuleTrigger>('any');
  const [matchType, setMatchType] = useState<'ALL' | 'ANY'>('ALL');
  const [conditions, setConditions] = useState<RuleCondition[]>([
    { field: 'merchant', operator: 'contains', value: '' },
  ]);
  const [actions, setActions] = useState<RuleAction[]>([
    { type: 'set_category', value: 'Food & Dining' },
  ]);

  useEffect(() => {
    if (existingRule) {
      setName(existingRule.name);
      setTrigger(existingRule.trigger);
      setMatchType(existingRule.matchType);
      if (existingRule.conditions.length > 0) {
        setConditions(existingRule.conditions);
      }
      if (existingRule.actions.length > 0) {
        setActions(existingRule.actions);
      }
    }
  }, [existingRule]);

  // Condition Helpers
  const handleAddCondition = () => {
    setConditions((prev) => [
      ...prev,
      { field: 'merchant', operator: 'contains', value: '' },
    ]);
  };

  const handleUpdateCondition = (index: number, patch: Partial<RuleCondition>) => {
    setConditions((prev) => {
      const updated = [...prev];
      const target = { ...updated[index], ...patch };

      // Reset operator if field type changed
      if (patch.field && patch.field !== updated[index].field) {
        target.operator = patch.field === 'amount' ? 'greater_than' : 'contains';
        target.value = '';
      }

      updated[index] = target;
      return updated;
    });
  };

  const handleRemoveCondition = (index: number) => {
    if (conditions.length <= 1) return;
    setConditions((prev) => prev.filter((_, i) => i !== index));
  };

  // Action Helpers
  const handleAddAction = () => {
    setActions((prev) => [...prev, { type: 'add_tag', value: '' }]);
  };

  const handleUpdateAction = (index: number, patch: Partial<RuleAction>) => {
    setActions((prev) => {
      const updated = [...prev];
      const target = { ...updated[index], ...patch };
      if (patch.type && patch.type === 'set_category' && !target.value) {
        target.value = 'Food & Dining';
      }
      updated[index] = target;
      return updated;
    });
  };

  const handleRemoveAction = (index: number) => {
    if (actions.length <= 1) return;
    setActions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast('Please enter a name for this rule', 'error');
      return;
    }

    // Validate conditions
    for (let i = 0; i < conditions.length; i++) {
      const c = conditions[i];
      if (c.value === '' || c.value === undefined) {
        showToast(`Condition #${i + 1} has an empty value`, 'error');
        return;
      }
      if (c.operator === 'between' && (c.secondaryValue === undefined || isNaN(Number(c.secondaryValue)))) {
        showToast(`Condition #${i + 1} requires a valid upper amount`, 'error');
        return;
      }
    }

    // Validate actions
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      if (a.type !== 'mark_reviewed' && (!a.value || !a.value.trim())) {
        showToast(`Action #${i + 1} requires a value`, 'error');
        return;
      }
    }

    try {
      await saveMutation.mutateAsync({
        id: ruleId,
        name: trimmedName,
        isEnabled: existingRule ? existingRule.isEnabled : true,
        trigger,
        matchType,
        conditions,
        actions,
        priority: existingRule ? existingRule.priority : 0,
      });

      showToast(isEditing ? 'Rule updated successfully' : 'Rule created successfully', 'success');
      router.back();
    } catch {
      showToast('Failed to save rule', 'error');
    }
  };

  const handleDelete = () => {
    if (!ruleId) return;
    showAlert(
      'Delete Rule',
      'Are you sure you want to permanently delete this rule?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync(ruleId);
              showToast('Rule deleted', 'success');
              router.back();
            } catch {
              showToast('Failed to delete rule', 'error');
            }
          },
        },
      ]
    );
  };

  if (isEditing && isLoadingRule) {
    return (
      <View style={[styles.container, styles.loadingCenter]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header
        showBack
        title={isEditing ? 'Edit Smart Rule' : 'New Smart Rule'}
        rightNode={
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary }]}
            onPress={handleSave}
            disabled={saveMutation.isPending}
            activeOpacity={0.8}
          >
            {saveMutation.isPending ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <Text style={[styles.saveBtnText, { color: colors.onPrimary }]}>Save</Text>
            )}
          </TouchableOpacity>
        }
      />

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        enableOnAndroid
        extraScrollHeight={80}
      >
        {/* RULE NAME */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Rule Identity</Text>
          <Text style={styles.inputLabel}>RULE NAME</Text>
          <TextInput
            style={[styles.textInput, { color: colors.onSurface, borderColor: colors.surfaceVariant }]}
            placeholder="e.g. Auto-tag #business for Uber rides"
            placeholderTextColor={colors.onSurfaceVariant}
            value={name}
            onChangeText={setName}
          />

          {/* TRIGGER SOURCE SELECTOR */}
          <Text style={[styles.inputLabel, { marginTop: 14 }]}>TRIGGER SOURCE</Text>
          <View style={styles.pillRow}>
            {TRIGGER_SOURCES.map((ts) => {
              const active = trigger === ts.value;
              return (
                <TouchableOpacity
                  key={ts.value}
                  style={[
                    styles.triggerPill,
                    {
                      backgroundColor: active ? colors.primary : colors.surfaceContainerLow,
                      borderColor: active ? colors.primary : colors.surfaceVariant,
                    },
                  ]}
                  onPress={() => setTrigger(ts.value)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons
                    name={ts.icon}
                    size={14}
                    color={active ? colors.onPrimary : colors.onSurfaceVariant}
                  />
                  <Text
                    style={[
                      styles.triggerPillText,
                      { color: active ? colors.onPrimary : colors.onSurfaceVariant },
                    ]}
                  >
                    {ts.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* SECTION: IF CONDITIONS */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[styles.badgePill, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                <Text style={[styles.badgeText, { color: '#3B82F6' }]}>IF</Text>
              </View>
              <Text style={styles.sectionTitle}>When Condition Matches</Text>
            </View>

            {/* Match ALL vs ANY toggle */}
            <View style={[styles.matchToggle, { backgroundColor: colors.surfaceContainerLow }]}>
              <TouchableOpacity
                style={[styles.matchToggleBtn, matchType === 'ALL' && { backgroundColor: colors.primary }]}
                onPress={() => setMatchType('ALL')}
              >
                <Text
                  style={[
                    styles.matchToggleText,
                    { color: matchType === 'ALL' ? colors.onPrimary : colors.onSurfaceVariant },
                  ]}
                >
                  ALL (AND)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.matchToggleBtn, matchType === 'ANY' && { backgroundColor: colors.primary }]}
                onPress={() => setMatchType('ANY')}
              >
                <Text
                  style={[
                    styles.matchToggleText,
                    { color: matchType === 'ANY' ? colors.onPrimary : colors.onSurfaceVariant },
                  ]}
                >
                  ANY (OR)
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {conditions.map((cond, idx) => {
            const isAmount = cond.field === 'amount';
            const operators = isAmount ? AMOUNT_OPERATORS : TEXT_OPERATORS;

            return (
              <View key={idx} style={styles.conditionBox}>
                <View style={styles.conditionHeader}>
                  <Text style={styles.conditionIdx}>Condition #{idx + 1}</Text>
                  {conditions.length > 1 && (
                    <TouchableOpacity onPress={() => handleRemoveCondition(idx)}>
                      <MaterialIcons name="close" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Field Selector */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                  {CONDITION_FIELDS.map((f) => (
                    <TouchableOpacity
                      key={f.value}
                      style={[
                        styles.subPill,
                        cond.field === f.value && { backgroundColor: colors.primary, borderColor: colors.primary },
                      ]}
                      onPress={() => handleUpdateCondition(idx, { field: f.value })}
                    >
                      <Text
                        style={[
                          styles.subPillText,
                          { color: cond.field === f.value ? colors.onPrimary : colors.onSurfaceVariant },
                        ]}
                      >
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Operator Selector */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.horizontalScroll, { marginTop: 6 }]}>
                  {operators.map((op) => (
                    <TouchableOpacity
                      key={op.value}
                      style={[
                        styles.subPill,
                        cond.operator === op.value && { backgroundColor: colors.surfaceContainerHighest, borderColor: colors.primary },
                      ]}
                      onPress={() => handleUpdateCondition(idx, { operator: op.value })}
                    >
                      <Text
                        style={[
                          styles.subPillText,
                          { color: cond.operator === op.value ? colors.primary : colors.onSurfaceVariant },
                        ]}
                      >
                        {op.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Value Input */}
                <View style={{ marginTop: 8 }}>
                  <TextInput
                    style={[styles.textInput, { color: colors.onSurface, borderColor: colors.surfaceVariant }]}
                    placeholder={
                      isAmount
                        ? 'Amount (e.g. 5000)'
                        : cond.field === 'category'
                          ? 'Category name (e.g. Dining)'
                          : 'Value to match (e.g. Uber, Zomato)'
                    }
                    placeholderTextColor={colors.onSurfaceVariant}
                    value={String(cond.value || '')}
                    keyboardType={isAmount ? 'numeric' : 'default'}
                    onChangeText={(val) =>
                      handleUpdateCondition(idx, {
                        value: isAmount ? (val.trim() === '' ? '' : (parseFloat(val) || 0)) : val,
                      })
                    }
                  />

                  {cond.operator === 'between' && (
                    <TextInput
                      style={[styles.textInput, { color: colors.onSurface, borderColor: colors.surfaceVariant, marginTop: 6 }]}
                      placeholder="Upper Amount (e.g. 10000)"
                      placeholderTextColor={colors.onSurfaceVariant}
                      keyboardType="numeric"
                      value={cond.secondaryValue !== undefined ? String(cond.secondaryValue) : ''}
                      onChangeText={(val) =>
                        handleUpdateCondition(idx, {
                          secondaryValue: val.trim() === '' ? undefined : (parseFloat(val) || 0),
                        })
                      }
                    />
                  )}
                </View>
              </View>
            );
          })}

          <TouchableOpacity
            style={[styles.addDashedBtn, { borderColor: colors.outlineVariant }]}
            onPress={handleAddCondition}
            activeOpacity={0.8}
          >
            <MaterialIcons name="add" size={16} color={colors.primary} />
            <Text style={[styles.addDashedText, { color: colors.primary }]}>Add Another Condition</Text>
          </TouchableOpacity>
        </View>

        {/* SECTION: THEN ACTIONS */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[styles.badgePill, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <Text style={[styles.badgeText, { color: '#10B981' }]}>THEN</Text>
              </View>
              <Text style={styles.sectionTitle}>Execute Actions</Text>
            </View>
          </View>

          {actions.map((act, idx) => (
            <View key={idx} style={styles.conditionBox}>
              <View style={styles.conditionHeader}>
                <Text style={styles.conditionIdx}>Action #{idx + 1}</Text>
                {actions.length > 1 && (
                  <TouchableOpacity onPress={() => handleRemoveAction(idx)}>
                    <MaterialIcons name="close" size={18} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Action Type Selector */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                {ACTION_TYPES.map((at) => (
                  <TouchableOpacity
                    key={at.value}
                    style={[
                      styles.subPill,
                      act.type === at.value && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                    onPress={() => handleUpdateAction(idx, { type: at.value })}
                  >
                    <MaterialIcons
                      name={at.icon}
                      size={12}
                      color={act.type === at.value ? colors.onPrimary : colors.onSurfaceVariant}
                    />
                    <Text
                      style={[
                        styles.subPillText,
                        { color: act.type === at.value ? colors.onPrimary : colors.onSurfaceVariant },
                      ]}
                    >
                      {at.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Value Input / Selection */}
              {act.type === 'set_category' ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.subLabel}>Choose target category:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                    {COMMON_CATEGORIES.map((cat) => (
                      <TouchableOpacity
                        key={cat}
                        style={[
                          styles.subPill,
                          act.value === cat && { backgroundColor: '#10B981', borderColor: '#10B981' },
                        ]}
                        onPress={() => handleUpdateAction(idx, { value: cat })}
                      >
                        <Text
                          style={[
                            styles.subPillText,
                            { color: act.value === cat ? '#FFFFFF' : colors.onSurfaceVariant },
                          ]}
                        >
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : act.type === 'mark_reviewed' ? (
                <Text style={styles.noteTip}>Automatically marks transaction status as VERIFIED.</Text>
              ) : (
                <View style={{ marginTop: 8 }}>
                  <TextInput
                    style={[styles.textInput, { color: colors.onSurface, borderColor: colors.surfaceVariant }]}
                    placeholder={
                      act.type === 'add_tag'
                        ? 'Tag name (e.g. #business, #reimbursable)'
                        : 'Note text'
                    }
                    placeholderTextColor={colors.onSurfaceVariant}
                    value={act.value}
                    onChangeText={(val) => handleUpdateAction(idx, { value: val })}
                  />
                </View>
              )}
            </View>
          ))}

          <TouchableOpacity
            style={[styles.addDashedBtn, { borderColor: colors.outlineVariant }]}
            onPress={handleAddAction}
            activeOpacity={0.8}
          >
            <MaterialIcons name="add" size={16} color={colors.primary} />
            <Text style={[styles.addDashedText, { color: colors.primary }]}>Add Another Action</Text>
          </TouchableOpacity>
        </View>

        {/* DELETE BUTTON (IF EDITING) */}
        {isEditing && (
          <TouchableOpacity
            style={styles.deleteRuleBtn}
            onPress={handleDelete}
            activeOpacity={0.8}
          >
            <MaterialIcons name="delete-forever" size={18} color="#EF4444" />
            <Text style={styles.deleteRuleBtnText}>Delete This Rule</Text>
          </TouchableOpacity>
        )}
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
    loadingCenter: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveBtn: {
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderRadius: radius.full,
    },
    saveBtnText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 12,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 12,
      gap: 14,
    },
    sectionCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 14,
    },
    sectionTitle: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 14,
      color: colors.onSurface,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    badgePill: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.sm,
    },
    badgeText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 10,
    },
    inputLabel: {
      ...typography.labelMd,
      fontSize: 10,
      color: colors.onSurfaceVariant,
      fontFamily: 'Manrope_700Bold',
      marginBottom: 6,
    },
    textInput: {
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 13,
      fontFamily: 'Manrope_600SemiBold',
    },
    pillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    triggerPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radius.full,
      borderWidth: 1,
    },
    triggerPillText: {
      ...typography.labelMd,
      fontSize: 11,
      fontFamily: 'Manrope_600SemiBold',
    },
    matchToggle: {
      flexDirection: 'row',
      borderRadius: radius.full,
      padding: 2,
    },
    matchToggleBtn: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.full,
    },
    matchToggleText: {
      ...typography.labelMd,
      fontSize: 9,
      fontFamily: 'Manrope_700Bold',
    },
    conditionBox: {
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radius.lg,
      padding: 10,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
    },
    conditionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    conditionIdx: {
      ...typography.labelMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      fontFamily: 'Manrope_700Bold',
    },
    horizontalScroll: {
      marginBottom: 4,
    },
    subPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      backgroundColor: colors.surfaceContainerHighest,
      marginRight: 6,
    },
    subPillText: {
      ...typography.labelMd,
      fontSize: 10,
      fontFamily: 'Manrope_600SemiBold',
    },
    subLabel: {
      ...typography.bodyMd,
      fontSize: 10,
      color: colors.onSurfaceVariant,
      marginBottom: 4,
    },
    noteTip: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      marginTop: 6,
      fontStyle: 'italic',
    },
    addDashedBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderRadius: radius.md,
      paddingVertical: 10,
      marginTop: 4,
    },
    addDashedText: {
      ...typography.labelMd,
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
    },
    deleteRuleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: 'rgba(239, 68, 68, 0.08)',
      paddingVertical: 12,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: 'rgba(239, 68, 68, 0.25)',
      marginTop: 6,
    },
    deleteRuleBtnText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      color: '#EF4444',
    },
  });
  return styles;
};

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { Text, Header, useToast, useAlert } from '@/components/ui';
import { typography, useTheme, radius, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useRouter } from 'expo-router';
import {
  useSmartRules,
  useToggleSmartRule,
  useDeleteSmartRule,
  useApplyRuleToExisting,
  useSaveSmartRule,
} from '@/hooks/use-smart-rules';
import type { SmartRule } from '@/types';

export default function RulesScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeInsets();
  const router = useRouter();
  const { showToast } = useToast();
  const { showAlert } = useAlert();

  const { rules, isLoading, refetch } = useSmartRules();
  const toggleMutation = useToggleSmartRule();
  const deleteMutation = useDeleteSmartRule();
  const applyMutation = useApplyRuleToExisting();
  const saveMutation = useSaveSmartRule();

  const [runningRuleId, setRunningRuleId] = useState<string | null>(null);

  const handleToggle = async (rule: SmartRule) => {
    try {
      await toggleMutation.mutateAsync({
        id: rule.id,
        isEnabled: !rule.isEnabled,
      });
      showToast(
        !rule.isEnabled ? `Rule "${rule.name}" activated` : `Rule "${rule.name}" paused`,
        'success'
      );
    } catch {
      showToast('Failed to update rule status', 'error');
    }
  };

  const handleDelete = (rule: SmartRule) => {
    showAlert(
      'Delete Rule',
      `Are you sure you want to delete "${rule.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync(rule.id);
              showToast('Rule deleted', 'success');
            } catch {
              showToast('Failed to delete rule', 'error');
            }
          },
        },
      ]
    );
  };

  const handleApplyRetroactive = async (rule: SmartRule) => {
    setRunningRuleId(rule.id);
    try {
      const matchCount = await applyMutation.mutateAsync(rule);
      showToast(
        matchCount > 0
          ? `Applied "${rule.name}" to ${matchCount} past transaction${matchCount === 1 ? '' : 's'}!`
          : `Checked all past transactions; none matched "${rule.name}".`,
        'success'
      );
    } catch {
      showToast('Error applying rule to existing transactions', 'error');
    } finally {
      setRunningRuleId(null);
    }
  };

  const handleCreateStarter = async (preset: {
    name: string;
    merchant: string;
    tag?: string;
    category?: string;
  }) => {
    try {
      await saveMutation.mutateAsync({
        name: preset.name,
        isEnabled: true,
        trigger: 'any',
        matchType: 'ALL',
        conditions: [
          {
            field: 'merchant',
            operator: 'contains',
            value: preset.merchant,
          },
        ],
        actions: [
          ...(preset.category
            ? [{ type: 'set_category' as const, value: preset.category }]
            : []),
          ...(preset.tag ? [{ type: 'add_tag' as const, value: preset.tag }] : []),
        ],
        priority: rules.length,
      });
      showToast(`Starter rule "${preset.name}" created!`, 'success');
    } catch {
      showToast('Failed to create starter rule', 'error');
    }
  };

  const totalMatches = rules.reduce((acc, r) => acc + (r.matchCount || 0), 0);
  const activeCount = rules.filter((r) => r.isEnabled).length;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header
        showBack
        title="Smart Automation Rules"
        rightNode={
          <TouchableOpacity
            style={[styles.headerAddBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.navigate('/add-rule')}
            activeOpacity={0.8}
          >
            <MaterialIcons name="add" size={20} color={colors.onPrimary} />
            <Text style={[styles.headerAddText, { color: colors.onPrimary }]}>New Rule</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO STATS BANNER */}
        <View style={styles.statsCard}>
          <View style={styles.statsLeft}>
            <View style={[styles.statsIconCircle, { backgroundColor: `${colors.primary}18` }]}>
              <MaterialIcons name="auto-fix-high" size={24} color={colors.primary} />
            </View>
            <View>
              <Text style={styles.statsTitle}>IFTTT Automation Engine</Text>
              <Text style={styles.statsSubtitle}>
                {activeCount} of {rules.length} active • {totalMatches} auto-actions executed
              </Text>
            </View>
          </View>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : rules.length === 0 ? (
          /* EMPTY STATE & PRESETS */
          <View style={styles.emptyCard}>
            <View style={[styles.emptyIconCircle, { backgroundColor: `${colors.primary}15` }]}>
              <MaterialIcons name="bolt" size={36} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Automate Your Ledger</Text>
            <Text style={styles.emptyText}>
              Set up rules to automatically tag, categorize, and append notes to incoming SMS transactions, statement imports, or manual entries.
            </Text>

            <Text style={styles.presetsHeader}>Quick Starters</Text>
            <View style={styles.presetsList}>
              <TouchableOpacity
                style={styles.presetItem}
                onPress={() =>
                  handleCreateStarter({
                    name: 'Auto-tag #business for Rides',
                    merchant: 'Uber',
                    tag: '#business',
                    category: 'Transport',
                  })
                }
              >
                <View style={styles.presetLeft}>
                  <MaterialIcons name="local-taxi" size={18} color="#3B82F6" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.presetName}>Auto-tag #business for Rides</Text>
                    <Text style={styles.presetDesc}>When merchant contains "Uber" → Category: Transport, Tag: #business</Text>
                  </View>
                </View>
                <MaterialIcons name="add-circle-outline" size={20} color={colors.primary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.presetItem}
                onPress={() =>
                  handleCreateStarter({
                    name: 'Auto-categorize Food Delivery',
                    merchant: 'Swiggy',
                    category: 'Food & Dining',
                  })
                }
              >
                <View style={styles.presetLeft}>
                  <MaterialIcons name="restaurant" size={18} color="#F59E0B" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.presetName}>Auto-categorize Food Delivery</Text>
                    <Text style={styles.presetDesc}>When merchant contains "Swiggy" → Category: Food & Dining</Text>
                  </View>
                </View>
                <MaterialIcons name="add-circle-outline" size={20} color={colors.primary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.presetItem}
                onPress={() =>
                  handleCreateStarter({
                    name: 'Auto-tag #groceries for Blinkit',
                    merchant: 'Blinkit',
                    category: 'Groceries',
                    tag: '#groceries',
                  })
                }
              >
                <View style={styles.presetLeft}>
                  <MaterialIcons name="shopping-bag" size={18} color="#10B981" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.presetName}>Auto-tag #groceries for Blinkit</Text>
                    <Text style={styles.presetDesc}>When merchant contains "Blinkit" → Category: Groceries, Tag: #groceries</Text>
                  </View>
                </View>
                <MaterialIcons name="add-circle-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* RULES LIST */
          <View style={styles.rulesList}>
            {rules.map((rule) => {
              const isRunning = runningRuleId === rule.id;

              return (
                <View
                  key={rule.id}
                  style={[
                    styles.ruleCard,
                    !rule.isEnabled && { opacity: 0.65 },
                  ]}
                >
                  {/* Card Header */}
                  <View style={styles.ruleCardHeader}>
                    <View style={{ flex: 1, marginRight: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <Text style={styles.ruleName} numberOfLines={1}>
                          {rule.name}
                        </Text>
                        <View style={[styles.triggerBadge, { backgroundColor: colors.surfaceContainerHigh }]}>
                          <Text style={styles.triggerBadgeText}>
                            {rule.trigger.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.ruleMeta}>
                        Matched {rule.matchCount} time{rule.matchCount === 1 ? '' : 's'}
                        {rule.lastMatchedAt
                          ? ` • Last: ${new Date(rule.lastMatchedAt).toLocaleDateString()}`
                          : ''}
                      </Text>
                    </View>

                    <Switch
                      value={rule.isEnabled}
                      onValueChange={() => handleToggle(rule)}
                      thumbColor={rule.isEnabled ? colors.primary : colors.surfaceVariant}
                      trackColor={{
                        false: colors.surfaceContainerHighest,
                        true: `${colors.primary}60`,
                      }}
                    />
                  </View>

                  {/* IF Conditions block */}
                  <View style={styles.ruleLogicBox}>
                    <View style={styles.logicRow}>
                      <Text style={[styles.logicLabel, { color: '#3B82F6' }]}>IF</Text>
                      <View style={styles.logicContent}>
                        {rule.conditions.map((c, i) => (
                          <Text key={i} style={styles.logicText}>
                            {i > 0 ? (
                              <Text style={{ fontFamily: 'Manrope_700Bold', color: colors.primary }}>
                                {` ${rule.matchType} `}
                              </Text>
                            ) : null}
                            <Text style={{ fontFamily: 'Manrope_600SemiBold' }}>{c.field}</Text>{' '}
                            <Text style={{ color: colors.onSurfaceVariant }}>{c.operator}</Text>{' '}
                            <Text style={{ fontFamily: 'Manrope_700Bold', color: colors.onSurface }}>
                              "{c.value}"
                            </Text>
                          </Text>
                        ))}
                      </View>
                    </View>

                    {/* THEN Actions block */}
                    <View style={[styles.logicRow, { marginTop: 6 }]}>
                      <Text style={[styles.logicLabel, { color: '#10B981' }]}>THEN</Text>
                      <View style={styles.logicContent}>
                        {rule.actions.map((a, i) => (
                          <View key={i} style={styles.actionChip}>
                            <MaterialIcons
                              name={
                                a.type === 'set_category'
                                  ? 'category'
                                  : a.type === 'add_tag'
                                    ? 'label'
                                    : 'notes'
                              }
                              size={12}
                              color={colors.primary}
                            />
                            <Text style={styles.actionChipText}>
                              {a.type.replace('_', ' ')}: <Text style={{ fontFamily: 'Manrope_700Bold' }}>{a.value}</Text>
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>

                  {/* Card Actions Footer */}
                  <View style={styles.cardFooter}>
                    <TouchableOpacity
                      style={[styles.footerBtn, { backgroundColor: colors.surfaceContainerLow }]}
                      onPress={() => handleApplyRetroactive(rule)}
                      disabled={isRunning}
                    >
                      {isRunning ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <>
                          <MaterialIcons name="history" size={14} color={colors.primary} />
                          <Text style={[styles.footerBtnText, { color: colors.primary }]}>Run on Past</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.footerBtn, { backgroundColor: colors.surfaceContainerLow }]}
                      onPress={() =>
                        router.navigate({
                          pathname: '/add-rule',
                          params: { id: rule.id },
                        })
                      }
                    >
                      <MaterialIcons name="edit" size={14} color={colors.onSurfaceVariant} />
                      <Text style={[styles.footerBtnText, { color: colors.onSurfaceVariant }]}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.footerBtn, { backgroundColor: 'rgba(239, 68, 68, 0.08)' }]}
                      onPress={() => handleDelete(rule)}
                    >
                      <MaterialIcons name="delete-outline" size={14} color="#EF4444" />
                      <Text style={[styles.footerBtnText, { color: "#EF4444" }]}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
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
    headerAddBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radius.full,
    },
    headerAddText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 12,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    statsCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 14,
      marginBottom: 14,
    },
    statsLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    statsIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statsTitle: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 14,
      color: colors.onSurface,
    },
    statsSubtitle: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      marginTop: 2,
    },
    loadingContainer: {
      paddingVertical: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 20,
      alignItems: 'center',
    },
    emptyIconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    emptyTitle: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 16,
      color: colors.onSurface,
      marginBottom: 6,
    },
    emptyText: {
      ...typography.bodyMd,
      fontSize: 12,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
      lineHeight: 18,
      marginBottom: 20,
    },
    presetsHeader: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 12,
      color: colors.onSurface,
      alignSelf: 'flex-start',
      marginBottom: 8,
    },
    presetsList: {
      width: '100%',
      gap: 8,
    },
    presetItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radius.lg,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
    },
    presetLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      marginRight: 8,
    },
    presetName: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 12,
      color: colors.onSurface,
    },
    presetDesc: {
      ...typography.bodyMd,
      fontSize: 10,
      color: colors.onSurfaceVariant,
      marginTop: 2,
    },
    rulesList: {
      gap: 12,
    },
    ruleCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 14,
    },
    ruleCardHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    ruleName: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 14,
      color: colors.onSurface,
      flexShrink: 1,
    },
    triggerBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.sm,
    },
    triggerBadgeText: {
      ...typography.labelMd,
      fontSize: 9,
      fontFamily: 'Manrope_700Bold',
      color: colors.onSurfaceVariant,
    },
    ruleMeta: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
    },
    ruleLogicBox: {
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: radius.md,
      padding: 10,
      marginBottom: 12,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
    },
    logicRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    logicLabel: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 11,
      width: 40,
    },
    logicContent: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    logicText: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurface,
    },
    actionChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.surfaceContainerHighest,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.sm,
    },
    actionChipText: {
      ...typography.labelMd,
      fontSize: 10,
      color: colors.onSurface,
    },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 8,
      paddingTop: 4,
      borderTopWidth: 1,
      borderTopColor: colors.surfaceContainerHigh,
    },
    footerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radius.sm,
    },
    footerBtnText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 11,
    },
  });
  return styles;
};

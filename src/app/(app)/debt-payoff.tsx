import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
} from 'react-native';
import { Text, Header, useToast, DebtPayoffSkeleton } from '@/components/ui';
import { typography, useTheme, radius, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useRouter } from 'expo-router';
import { useDebtPayoff } from '@/hooks/use-debt-payoff';
import { formatCurrency, getCurrencySymbol } from '@/utils/format';
import type { DebtItem } from '@/services/debt/debt-payoff-service';

const EXTRA_PAYMENT_PRESETS = [0, 1000, 2500, 5000, 10000];

export default function DebtPayoffScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeInsets();
  const router = useRouter();
  const { showToast } = useToast();

  const [strategy, setStrategy] = useState<'avalanche' | 'snowball'>('avalanche');
  const {
    debts,
    comparison,
    extraPayment,
    setExtraPayment,
    updateDebtItem,
    isLoading,
  } = useDebtPayoff(2500);

  // Edit Debt Modal State
  const [editingDebt, setEditingDebt] = useState<DebtItem | null>(null);
  const [tempApr, setTempApr] = useState('');
  const [tempMin, setTempMin] = useState('');

  const handleOpenEdit = (debt: DebtItem) => {
    setEditingDebt(debt);
    setTempApr(debt.interestRate.toString());
    setTempMin(debt.minPayment.toString());
  };

  const handleSaveEdit = () => {
    if (!editingDebt) return;
    const apr = parseFloat(tempApr);
    const min = parseFloat(tempMin);

    if (isNaN(apr) || apr < 0) {
      showToast('Interest rate must be 0 or higher', 'error');
      return;
    }
    if (isNaN(min) || min < 0) {
      showToast('Minimum payment must be 0 or higher', 'error');
      return;
    }

    updateDebtItem(editingDebt.id, {
      interestRate: apr,
      minPayment: min,
    });
    setEditingDebt(null);
    showToast(`Updated terms for ${editingDebt.name}`, 'success');
  };

  const activeResult = strategy === 'avalanche' ? comparison?.avalanche : comparison?.snowball;
  const interestSaved =
    strategy === 'avalanche'
      ? comparison?.interestSavedWithAvalanche || 0
      : comparison?.interestSavedWithSnowball || 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header showBack title="Debt Freedom Strategist" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <DebtPayoffSkeleton />
        ) : !comparison || debts.length === 0 ? (
          /* DEBT FREE EMPTY STATE */
          <View style={styles.emptyCard}>
            <View style={[styles.emptyIconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
              <MaterialIcons name="verified" size={40} color="#10B981" />
            </View>
            <Text style={styles.emptyTitle}>You're Completely Debt-Free!</Text>
            <Text style={styles.emptyText}>
              You have no outstanding credit card balances, personal loans, or debt obligations logged in Clarity. You're in prime position to channel excess cash flow into wealth creation!
            </Text>
            <TouchableOpacity
              style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push('/(app)/investments')}
            >
              <MaterialIcons name="insights" size={18} color={colors.onPrimary} />
              <Text style={[styles.primaryActionText, { color: colors.onPrimary }]}>
                Explore Wealth Portfolio
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* STRATEGY TOGGLE */}
            <View style={[styles.strategyToggleCard, { backgroundColor: colors.surfaceContainerLow }]}>
              <TouchableOpacity
                style={[
                  styles.strategyBtn,
                  strategy === 'avalanche' && { backgroundColor: colors.primary },
                ]}
                onPress={() => setStrategy('avalanche')}
                activeOpacity={0.8}
              >
                <MaterialIcons
                  name="trending-down"
                  size={16}
                  color={strategy === 'avalanche' ? colors.onPrimary : colors.onSurfaceVariant}
                />
                <Text
                  style={[
                    styles.strategyBtnText,
                    { color: strategy === 'avalanche' ? colors.onPrimary : colors.onSurfaceVariant },
                  ]}
                >
                  Debt Avalanche
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.strategyBtn,
                  strategy === 'snowball' && { backgroundColor: colors.primary },
                ]}
                onPress={() => setStrategy('snowball')}
                activeOpacity={0.8}
              >
                <MaterialIcons
                  name="ac-unit"
                  size={16}
                  color={strategy === 'snowball' ? colors.onPrimary : colors.onSurfaceVariant}
                />
                <Text
                  style={[
                    styles.strategyBtnText,
                    { color: strategy === 'snowball' ? colors.onPrimary : colors.onSurfaceVariant },
                  ]}
                >
                  Debt Snowball
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.strategyExplainer}>
              {strategy === 'avalanche'
                ? 'Avalanche prioritizes highest interest rates (APR) first. Mathematically optimal — saves the maximum amount of money in interest.'
                : 'Snowball prioritizes lowest balances first. Delivers rapid psychological wins as accounts are permanently wiped out.'}
            </Text>

            {/* HERO OUTCOME CARD */}
            <View style={styles.heroCard}>
              <View style={styles.heroTopRow}>
                <View>
                  <Text style={styles.heroLabel}>PROJECTED DEBT-FREE DATE</Text>
                  <Text style={styles.heroTargetDate}>{activeResult?.debtFreeDate}</Text>
                </View>
                {comparison.monthsSaved > 0 && (
                  <View style={styles.speedPill}>
                    <MaterialIcons name="speed" size={14} color="#10B981" />
                    <Text style={styles.speedPillText}>{comparison.monthsSaved} mo faster</Text>
                  </View>
                )}
              </View>

              <View style={styles.metricGrid}>
                <View style={styles.metricCol}>
                  <Text style={styles.metricLabel}>Total Debt</Text>
                  <Text style={styles.metricValue}>{formatCurrency(comparison.totalDebt)}</Text>
                </View>

                <View style={[styles.gridDivider, { backgroundColor: colors.surfaceContainerHigh }]} />

                <View style={styles.metricCol}>
                  <Text style={styles.metricLabel}>Total Interest</Text>
                  <Text style={[styles.metricValue, { color: '#EF4444' }]}>
                    {formatCurrency(activeResult?.totalInterestPaid || 0)}
                  </Text>
                </View>

                <View style={[styles.gridDivider, { backgroundColor: colors.surfaceContainerHigh }]} />

                <View style={styles.metricCol}>
                  <Text style={styles.metricLabel}>Interest Saved</Text>
                  <Text style={[styles.metricValue, { color: '#10B981' }]}>
                    {interestSaved > 0 ? formatCurrency(interestSaved) : formatCurrency(0)}
                  </Text>
                </View>
              </View>
            </View>

            {/* INTERACTIVE EXTRA PAYMENT SIMULATOR */}
            <View style={styles.simulatorCard}>
              <View style={styles.simHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialIcons name="tune" size={16} color={colors.primary} />
                  <Text style={styles.simTitle}>Extra Monthly Payment</Text>
                </View>
                <Text style={styles.simValueText}>{formatCurrency(extraPayment)}/mo</Text>
              </View>

              <Text style={styles.simSubtitle}>
                Accelerate payoff by putting surplus cash into your priority debt each month.
              </Text>

              <View style={styles.presetRow}>
                {EXTRA_PAYMENT_PRESETS.map((amt) => {
                  const isActive = extraPayment === amt;
                  return (
                    <TouchableOpacity
                      key={amt}
                      style={[
                        styles.presetPill,
                        {
                          backgroundColor: isActive ? colors.primary : colors.surfaceContainerLow,
                          borderColor: isActive ? colors.primary : colors.surfaceVariant,
                        },
                      ]}
                      onPress={() => setExtraPayment(amt)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.presetPillText,
                          { color: isActive ? colors.onPrimary : colors.onSurfaceVariant },
                        ]}
                      >
                        {amt === 0 ? 'Minimums Only' : `+${formatCurrency(amt)}`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* PAYOFF ORDER & TIMELINE */}
            <View style={styles.payoffSection}>
              <View style={styles.sectionHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialIcons name="format-list-numbered" size={18} color={colors.primary} />
                  <Text style={styles.sectionTitle}>
                    {strategy === 'avalanche' ? 'Avalanche Payoff Order' : 'Snowball Payoff Order'}
                  </Text>
                </View>
                <Text style={styles.debtCountText}>{activeResult?.payoffOrder.length} debts</Text>
              </View>

              <View style={styles.debtList}>
                {activeResult?.payoffOrder.map((item, idx) => {
                  const origDebt = debts.find((d) => d.id === item.id);
                  const isTopPriority = idx === 0;

                  return (
                    <View key={item.id} style={styles.debtCard}>
                      <View style={styles.debtCardHeader}>
                        <View style={styles.debtRankRow}>
                          <View
                            style={[
                              styles.rankBadge,
                              { backgroundColor: isTopPriority ? `${colors.primary}20` : colors.surfaceContainerHigh },
                            ]}
                          >
                            <Text
                              style={[
                                styles.rankBadgeText,
                                { color: isTopPriority ? colors.primary : colors.onSurfaceVariant },
                              ]}
                            >
                              #{idx + 1}
                            </Text>
                          </View>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={styles.debtName} numberOfLines={1}>
                              {item.name}
                            </Text>
                            <Text style={styles.debtTerms}>
                              {item.interestRate}% APR • Min {formatCurrency(origDebt?.minPayment || 0)}/mo
                            </Text>
                          </View>
                        </View>

                        <TouchableOpacity
                          style={styles.editBtn}
                          onPress={() => origDebt && handleOpenEdit(origDebt)}
                        >
                          <MaterialIcons name="edit" size={16} color={colors.onSurfaceVariant} />
                        </TouchableOpacity>
                      </View>

                      <View style={styles.debtFooterRow}>
                        <View>
                          <Text style={styles.debtBalanceLabel}>Outstanding Balance</Text>
                          <Text style={styles.debtBalanceVal}>{formatCurrency(item.balance)}</Text>
                        </View>

                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={styles.debtPayoffDateLabel}>Target Payoff Date</Text>
                          <View style={styles.payoffDateRow}>
                            <MaterialIcons name="event-available" size={14} color="#10B981" />
                            <Text style={styles.debtPayoffDateVal}>{item.payoffDate}</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* EDIT DEBT TERMS MODAL */}
      <Modal
        visible={Boolean(editingDebt)}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingDebt(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surfaceContainerHighest }]}>
            <Text style={styles.modalTitle}>Edit Debt Terms</Text>
            <Text style={styles.modalSubtitle}>{editingDebt?.name}</Text>

            <Text style={styles.inputLabel}>ANNUAL INTEREST RATE (APR %)</Text>
            <TextInput
              style={[styles.modalInput, { color: colors.onSurface, borderColor: colors.surfaceVariant }]}
              keyboardType="numeric"
              placeholder="e.g. 36 (Credit Card), 12 (Loan)"
              placeholderTextColor={colors.onSurfaceVariant}
              value={tempApr}
              onChangeText={setTempApr}
            />

            <Text style={[styles.inputLabel, { marginTop: 12 }]}>MINIMUM MONTHLY PAYMENT ({getCurrencySymbol()})</Text>
            <TextInput
              style={[styles.modalInput, { color: colors.onSurface, borderColor: colors.surfaceVariant }]}
              keyboardType="numeric"
              placeholder="e.g. 2000"
              placeholderTextColor={colors.onSurfaceVariant}
              value={tempMin}
              onChangeText={setTempMin}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: colors.outlineVariant, borderWidth: 1 }]}
                onPress={() => setEditingDebt(null)}
              >
                <Text style={[styles.modalBtnText, { color: colors.onSurface }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}
                onPress={handleSaveEdit}
              >
                <Text style={[styles.modalBtnText, { color: colors.onPrimary }]}>Save Terms</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    emptyCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 24,
      alignItems: 'center',
      marginTop: 20,
    },
    emptyIconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    emptyTitle: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 16,
      color: colors.onSurface,
      marginBottom: 8,
    },
    emptyText: {
      ...typography.bodyMd,
      fontSize: 12,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
      lineHeight: 18,
      marginBottom: 20,
    },
    primaryActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: radius.full,
    },
    primaryActionText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 12,
    },
    strategyToggleCard: {
      flexDirection: 'row',
      borderRadius: radius.full,
      padding: 3,
      marginBottom: 8,
    },
    strategyBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      borderRadius: radius.full,
    },
    strategyBtnText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 12,
    },
    strategyExplainer: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      lineHeight: 16,
      marginBottom: 14,
      paddingHorizontal: 2,
    },
    heroCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 16,
      marginBottom: 14,
    },
    heroTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    heroLabel: {
      ...typography.labelMd,
      fontFamily: 'Manrope_800ExtraBold',
      fontSize: 9,
      color: colors.primary,
      letterSpacing: 0.5,
    },
    heroTargetDate: {
      ...typography.labelMd,
      fontFamily: 'Manrope_800ExtraBold',
      fontSize: 22,
      color: colors.onSurface,
      marginTop: 2,
    },
    speedPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(16, 185, 129, 0.12)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radius.full,
    },
    speedPillText: {
      ...typography.labelMd,
      fontSize: 10,
      fontFamily: 'Manrope_700Bold',
      color: '#10B981',
    },
    metricGrid: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.surfaceContainerHigh,
    },
    metricCol: {
      flex: 1,
      alignItems: 'center',
    },
    metricLabel: {
      ...typography.labelMd,
      fontSize: 10,
      color: colors.onSurfaceVariant,
      marginBottom: 2,
    },
    metricValue: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      color: colors.onSurface,
    },
    gridDivider: {
      width: 1,
      height: 24,
    },
    simulatorCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 14,
      marginBottom: 14,
    },
    simHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 2,
    },
    simTitle: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      color: colors.onSurface,
    },
    simValueText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      color: colors.primary,
    },
    simSubtitle: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      marginBottom: 10,
    },
    presetRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    presetPill: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: radius.full,
      borderWidth: 1,
    },
    presetPillText: {
      ...typography.labelMd,
      fontSize: 11,
      fontFamily: 'Manrope_600SemiBold',
    },
    payoffSection: {
      marginBottom: 16,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    sectionTitle: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      color: colors.onSurface,
    },
    debtCountText: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
    },
    debtList: {
      gap: 10,
    },
    debtCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 14,
    },
    debtCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    debtRankRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    rankBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rankBadgeText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_800ExtraBold',
      fontSize: 11,
    },
    debtName: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      color: colors.onSurface,
    },
    debtTerms: {
      ...typography.bodyMd,
      fontSize: 10,
      color: colors.onSurfaceVariant,
    },
    editBtn: {
      padding: 6,
    },
    debtFooterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.surfaceContainerHigh,
    },
    debtBalanceLabel: {
      ...typography.labelMd,
      fontSize: 10,
      color: colors.onSurfaceVariant,
      marginBottom: 1,
    },
    debtBalanceVal: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      color: colors.onSurface,
    },
    debtPayoffDateLabel: {
      ...typography.labelMd,
      fontSize: 10,
      color: colors.onSurfaceVariant,
      marginBottom: 1,
    },
    payoffDateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    debtPayoffDateVal: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      color: '#10B981',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContent: {
      width: '100%',
      maxWidth: 360,
      borderRadius: radius.xl,
      padding: 20,
    },
    modalTitle: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 16,
      color: colors.onSurface,
      marginBottom: 2,
    },
    modalSubtitle: {
      ...typography.bodyMd,
      fontSize: 12,
      color: colors.onSurfaceVariant,
      marginBottom: 14,
    },
    inputLabel: {
      ...typography.labelMd,
      fontSize: 10,
      fontFamily: 'Manrope_700Bold',
      color: colors.onSurfaceVariant,
      marginBottom: 6,
    },
    modalInput: {
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 13,
      fontFamily: 'Manrope_600SemiBold',
    },
    modalActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 20,
    },
    modalBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: radius.full,
    },
    modalBtnText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 12,
    },
  });
  return styles;
};

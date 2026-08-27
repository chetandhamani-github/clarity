import { Text, useAlert, Header } from '@/components/ui';
import { useBudgetPlan, useUpdateBudgetPlan } from '@/hooks/use-budget';
import { ThemeColors, typography, useTheme } from '@/theme';
import { formatCurrencyWhole, getCurrencySymbol } from '@/utils/format';
import { MaterialIcons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function BudgetSetupScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { plan, isLoading } = useBudgetPlan();
  const { mutate: updatePlan, isPending } = useUpdateBudgetPlan();
  const { showAlert } = useAlert();

  const [income, setIncome] = useState('5000');
  const [needsPct, setNeedsPct] = useState('50');
  const [wantsPct, setWantsPct] = useState('30');
  const [savingsPct, setSavingsPct] = useState('20');

  useEffect(() => {
    if (plan) {
      setIncome(plan.monthlyIncome.toString());
      setNeedsPct(plan.needsPercent.toString());
      setWantsPct(plan.wantsPercent.toString());
      setSavingsPct(plan.savingsPercent.toString());
    }
  }, [plan]);

  const parsedIncome = parseFloat(income.replace(/,/g, '')) || 0;
  const needsNum = parseInt(needsPct) || 0;
  const wantsNum = parseInt(wantsPct) || 0;
  const savingsNum = parseInt(savingsPct) || 0;

  const totalPct = needsNum + wantsNum + savingsNum;

  const needsAmt = parsedIncome * (needsNum / 100);
  const wantsAmt = parsedIncome * (wantsNum / 100);
  const savingsAmt = parsedIncome * (savingsNum / 100);

  const handleSave = () => {
    if (totalPct !== 100) {
      showAlert('Validation Error', 'Total allocation must equal 100%.');
      return;
    }
    if (parsedIncome <= 0) {
      showAlert('Validation Error', 'Please enter a valid monthly income.');
      return;
    }

    const now = new Date();
    updatePlan(
      {
        monthlyIncome: parsedIncome,
        needsPercent: needsNum,
        wantsPercent: wantsNum,
        savingsPercent: savingsNum,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      },
      {
        onSuccess: () => {
          router.back();
        },
      }
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Simplified Header */}
      <Header
        showBack
        title="Configure Budget"
        rightNode={
          <TouchableOpacity style={styles.skipButton} onPress={() => router.back()}>
            <Text style={styles.skipText}>Cancel</Text>
          </TouchableOpacity>
        }
      />

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        extraScrollHeight={200}
      >
        {/* Header Text */}
        <View style={styles.introSection}>
          <Text style={styles.titleText}>Design your foundation</Text>
          <Text style={styles.subtitleText}>
            Set your monthly income and we'll help structure a balanced allocation.
          </Text>
        </View>

        {/* Income Input Section */}
        <View style={styles.incomeCard}>
          <Text style={styles.incomeLabel}>MONTHLY AFTER-TAX INCOME</Text>
          <View style={styles.incomeInputRow}>
            <Text style={styles.incomeCurrency}>{getCurrencySymbol()}</Text>
            <TextInput
              style={styles.incomeInput}
              keyboardType="numeric"
              value={income}
              onChangeText={setIncome}
              placeholder="0.00"
              placeholderTextColor={colors.onSurfaceVariant}
            />
          </View>
          {/* Decorative element */}
          <View style={styles.decorativeCircle} />
        </View>

        {/* Allocation Section */}
        <View style={styles.allocationSection}>
          <View style={styles.allocationHeader}>
            <Text style={styles.allocationTitle}>Allocation Strategy</Text>
            <View style={styles.strategyBadge}>
              <Text style={styles.strategyBadgeText}>Standard 50/30/20</Text>
            </View>
          </View>

          {/* Visual Allocation Bar */}
          <View style={styles.allocationBarContainer}>
            <View
              style={[
                styles.allocationSegment,
                { backgroundColor: colors.primary, flex: needsNum },
              ]}
            />
            <View
              style={[
                styles.allocationSegment,
                { backgroundColor: colors.tertiary, flex: wantsNum },
              ]}
            />
            <View
              style={[
                styles.allocationSegment,
                { backgroundColor: colors.secondary, flex: savingsNum },
              ]}
            />
          </View>

          {totalPct !== 100 && (
            <Text style={styles.warningText}>
              Total allocation is {totalPct}%. It must equal 100%.
            </Text>
          )}

          {/* Bento Grid */}
          <View style={styles.bentoGrid}>
            {/* Needs */}
            <View style={styles.bentoCard}>
              <View style={styles.bentoCardHeader}>
                <View style={styles.bentoCardTitleRow}>
                  <View style={[styles.colorDot, { backgroundColor: colors.primary }]} />
                  <Text style={styles.bentoCardTitle}>NEEDS</Text>
                </View>
                <MaterialIcons
                  name="home"
                  size={18}
                  color={colors.onSurfaceVariant}
                  style={{ opacity: 0.5 }}
                />
              </View>
              <Text style={styles.bentoAmount}>{formatCurrencyWhole(needsAmt)}</Text>

              <View style={styles.inputControlsRow}>
                <Slider
                  style={{ flex: 1, height: 40, marginHorizontal: -8 }}
                  minimumValue={0}
                  maximumValue={100}
                  step={1}
                  value={needsNum}
                  onValueChange={(val) => setNeedsPct(val.toString())}
                  minimumTrackTintColor={colors.primary}
                  maximumTrackTintColor={colors.surfaceVariant}
                  thumbTintColor={colors.primary}
                />
                <View style={styles.percentageInputBox}>
                  <TextInput
                    style={styles.percentageInput}
                    keyboardType="numeric"
                    value={needsPct}
                    onChangeText={setNeedsPct}
                    maxLength={3}
                  />
                  <Text style={styles.percentageSymbol}>%</Text>
                </View>
              </View>
            </View>

            {/* Wants */}
            <View style={styles.bentoCard}>
              <View style={styles.bentoCardHeader}>
                <View style={styles.bentoCardTitleRow}>
                  <View style={[styles.colorDot, { backgroundColor: colors.tertiary }]} />
                  <Text style={styles.bentoCardTitle}>WANTS</Text>
                </View>
                <MaterialIcons
                  name="local-cafe"
                  size={18}
                  color={colors.onSurfaceVariant}
                  style={{ opacity: 0.5 }}
                />
              </View>
              <Text style={styles.bentoAmount}>{formatCurrencyWhole(wantsAmt)}</Text>

              <View style={styles.inputControlsRow}>
                <Slider
                  style={{ flex: 1, height: 40, marginHorizontal: -8 }}
                  minimumValue={0}
                  maximumValue={100}
                  step={1}
                  value={wantsNum}
                  onValueChange={(val) => setWantsPct(val.toString())}
                  minimumTrackTintColor={colors.tertiary}
                  maximumTrackTintColor={colors.surfaceVariant}
                  thumbTintColor={colors.tertiary}
                />
                <View style={styles.percentageInputBox}>
                  <TextInput
                    style={styles.percentageInput}
                    keyboardType="numeric"
                    value={wantsPct}
                    onChangeText={setWantsPct}
                    maxLength={3}
                  />
                  <Text style={styles.percentageSymbol}>%</Text>
                </View>
              </View>
            </View>

            {/* Savings */}
            <View style={styles.bentoCard}>
              <View style={styles.bentoCardHeader}>
                <View style={styles.bentoCardTitleRow}>
                  <View style={[styles.colorDot, { backgroundColor: colors.secondary }]} />
                  <Text style={styles.bentoCardTitle}>SAVINGS</Text>
                </View>
                <MaterialIcons
                  name="account-balance"
                  size={18}
                  color={colors.onSurfaceVariant}
                  style={{ opacity: 0.5 }}
                />
              </View>
              <Text style={styles.bentoAmount}>{formatCurrencyWhole(savingsAmt)}</Text>

              <View style={styles.inputControlsRow}>
                <Slider
                  style={{ flex: 1, height: 40, marginHorizontal: -8 }}
                  minimumValue={0}
                  maximumValue={100}
                  step={1}
                  value={savingsNum}
                  onValueChange={(val) => setSavingsPct(val.toString())}
                  minimumTrackTintColor={colors.secondary}
                  maximumTrackTintColor={colors.surfaceVariant}
                  thumbTintColor={colors.secondary}
                />
                <View style={styles.percentageInputBox}>
                  <TextInput
                    style={styles.percentageInput}
                    keyboardType="numeric"
                    value={savingsPct}
                    onChangeText={setSavingsPct}
                    maxLength={3}
                  />
                  <Text style={styles.percentageSymbol}>%</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </KeyboardAwareScrollView>

      {/* Fixed Bottom Action Area */}
      <View style={[styles.bottomActionArea, { paddingBottom: Math.max(insets.bottom + 20, 16) }]}>
        <TouchableOpacity
          style={[styles.confirmButton, (isPending || totalPct !== 100) && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={isPending || totalPct !== 100}
        >
          <Text style={styles.confirmButtonText}>
            {isPending ? 'SAVING...' : 'CONFIRM ALLOCATION'}
          </Text>
          <MaterialIcons name="check" size={18} color={colors.onPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },

    skipButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    skipText: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 40,
    },
    introSection: {
      gap: 4,
      marginBottom: 32,
    },
    titleText: {
      ...typography.displayLg,
      color: colors.onSurface,
    },
    subtitleText: {
      ...typography.bodyLg,
      color: colors.onSurfaceVariant,
    },
    incomeCard: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: 16,
      padding: 16,
      marginBottom: 32,
      position: 'relative',
      overflow: 'hidden',
    },
    incomeLabel: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: 4,
    },
    incomeInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      zIndex: 2,
    },
    incomeCurrency: {
      ...typography.dataLg,
      color: colors.onSurface,
      marginRight: 4,
    },
    incomeInput: {
      ...typography.dataLg,
      color: colors.onSurface,
      flex: 1,
      padding: 0,
    },
    decorativeCircle: {
      position: 'absolute',
      right: -32,
      bottom: -32,
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: colors.primary + '0D',
      zIndex: 1,
    },
    allocationSection: {
      gap: 16,
    },
    allocationHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
    },
    allocationTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
    },
    strategyBadge: {
      backgroundColor: colors.primary + '1A',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    strategyBadgeText: {
      ...typography.labelMd,
      color: colors.primary,
    },
    allocationBarContainer: {
      width: '100%',
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.surfaceContainer,
      flexDirection: 'row',
      overflow: 'hidden',
    },
    allocationSegment: {
      height: '100%',
    },
    warningText: {
      ...typography.labelMd,
      color: colors.error,
    },
    bentoGrid: {
      gap: 8,
    },
    bentoCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: 16,
      padding: 16,
      gap: 16,
      shadowColor: colors.onSurface,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.02,
      shadowRadius: 12,
      elevation: 1,
    },
    bentoCardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    bentoCardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    colorDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    bentoCardTitle: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      textTransform: 'uppercase',
    },
    bentoAmount: {
      ...typography.headlineMd,
      color: colors.onSurface,
    },
    inputControlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surfaceContainer + '80',
      padding: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.outlineVariant + '4D',
      marginTop: 'auto',
    },
    mockSliderTrack: {
      flex: 1,
      height: 4,
      backgroundColor: colors.surfaceVariant,
      borderRadius: 2,
      position: 'relative',
      justifyContent: 'center',
    },
    mockSliderThumb: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.onPrimary,
      borderWidth: 2,
      borderColor: colors.primary,
      position: 'absolute',
      shadowColor: colors.onSurface,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 2,
    },
    percentageInputBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderWidth: 1,
      borderColor: colors.outlineVariant + '80',
    },
    percentageInput: {
      width: 32,
      textAlign: 'center',
      ...typography.labelMd,
      color: colors.onSurface,
      padding: 0,
    },
    percentageSymbol: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
    },
    bottomActionArea: {
      backgroundColor: colors.surfaceContainerLowest + 'E6',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.outlineVariant,
      padding: 16,
      alignItems: 'center',
      zIndex: 50,
    },
    confirmButton: {
      width: '100%',
      maxWidth: 400,
      height: 56,
      borderRadius: 16,
      backgroundColor: colors.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.2,
      shadowRadius: 16,
      elevation: 4,
    },
    confirmButtonText: {
      ...typography.labelMd,
      color: colors.onPrimary,
      letterSpacing: 1,
    },
  });
  return styles;
};

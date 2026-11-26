import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Text, Header, DatePickerModal, useToast, useAlert } from '@/components/ui';
import { typography, useTheme, radius, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  useCreateInvestmentHolding,
  useUpdateInvestmentHolding,
  useInvestment,
} from '@/hooks/use-investments';
import { useAccounts } from '@/hooks/use-accounts';
import type { AssetClass, InvestmentSubType } from '@/types';
import { formatCurrency, formatLocalDate, getCurrencySymbol } from '@/utils/format';

interface AssetClassOption {
  label: string;
  value: AssetClass;
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
}

const ASSET_CLASSES: AssetClassOption[] = [
  { label: 'Equity / Stocks', value: 'equity', icon: 'trending-up', color: '#3B82F6' },
  { label: 'FD & Debt', value: 'debt_fixed_income', icon: 'account-balance', color: '#10B981' },
  { label: 'Gold', value: 'gold', icon: 'stars', color: '#F59E0B' },
  { label: 'Real Estate', value: 'real_estate', icon: 'apartment', color: '#8B5CF6' },
  { label: 'Crypto', value: 'crypto', icon: 'currency-bitcoin', color: '#EC4899' },
];

const SUBTYPES_BY_CLASS: Record<AssetClass, { label: string; value: InvestmentSubType }[]> = {
  equity: [
    { label: 'Mutual Fund (SIP / Lumpsum)', value: 'mutual_fund' },
    { label: 'Direct Stocks / Shares', value: 'stocks' },
    { label: 'Exchange Traded Fund (ETF)', value: 'etf' },
  ],
  debt_fixed_income: [
    { label: 'Fixed Deposit (FD)', value: 'fd' },
    { label: 'Recurring Deposit (RD)', value: 'rd' },
    { label: 'Public Provident Fund (PPF)', value: 'ppf' },
    { label: 'Employee Provident Fund (EPF)', value: 'epf' },
    { label: 'National Pension Scheme (NPS)', value: 'nps' },
    { label: 'Bonds / Debt Fund', value: 'other' },
  ],
  gold: [
    { label: 'Sovereign Gold Bond (SGB)', value: 'sgb' },
    { label: 'Digital Gold', value: 'digital_gold' },
    { label: 'Physical Gold / Coins', value: 'physical_gold' },
  ],
  real_estate: [
    { label: 'Residential / Flat', value: 'real_estate' },
    { label: 'Commercial Property', value: 'real_estate' },
    { label: 'Land / Plot', value: 'real_estate' },
  ],
  crypto: [
    { label: 'Cryptocurrency / Token', value: 'crypto' },
  ],
  cash: [
    { label: 'Cash / Liquid', value: 'other' },
  ],
};

export default function AddInvestmentScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeInsets();
  const router = useRouter();
  const { showToast } = useToast();
  const { showAlert } = useAlert();

  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;
  const { holding } = useInvestment(id);
  const { accounts } = useAccounts();

  const { mutate: createHolding, isPending: isCreating } = useCreateInvestmentHolding();
  const { mutate: updateHolding, isPending: isUpdating } = useUpdateInvestmentHolding();

  const [name, setName] = useState('');
  const [assetClass, setAssetClass] = useState<AssetClass>('equity');
  const [subType, setSubType] = useState<InvestmentSubType>('mutual_fund');
  const [investedAmountStr, setInvestedAmountStr] = useState('');
  const [currentValueStr, setCurrentValueStr] = useState('');
  const [unitsStr, setUnitsStr] = useState('');
  const [navStr, setNavStr] = useState('');
  const [folioNumber, setFolioNumber] = useState('');
  const [interestRateStr, setInterestRateStr] = useState('');
  const [maturityDate, setMaturityDate] = useState<string>('');
  const [sipAmountStr, setSipAmountStr] = useState('');
  const [sipDayOfMonthStr, setSipDayOfMonthStr] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Pre-populate if editing
  useEffect(() => {
    if (isEditing && holding && !initialized) {
      setName(holding.name);
      setAssetClass(holding.assetClass);
      setSubType(holding.subType);
      setInvestedAmountStr(
        holding.investedAmount !== undefined && holding.investedAmount !== null
          ? holding.investedAmount.toString()
          : ''
      );
      setCurrentValueStr(
        holding.currentValue !== undefined && holding.currentValue !== null
          ? holding.currentValue.toString()
          : ''
      );
      setUnitsStr(
        holding.units !== undefined && holding.units !== null ? holding.units.toString() : ''
      );
      setNavStr(
        holding.navOrPrice !== undefined && holding.navOrPrice !== null
          ? holding.navOrPrice.toString()
          : ''
      );
      setFolioNumber(holding.folioOrAccountNumber || '');
      setInterestRateStr(
        holding.interestRate !== undefined && holding.interestRate !== null
          ? holding.interestRate.toString()
          : ''
      );
      setMaturityDate(holding.maturityDate || '');
      setSipAmountStr(
        holding.sipAmount !== undefined && holding.sipAmount !== null
          ? holding.sipAmount.toString()
          : ''
      );
      setSipDayOfMonthStr(
        holding.sipDayOfMonth !== undefined && holding.sipDayOfMonth !== null
          ? holding.sipDayOfMonth.toString()
          : ''
      );
      setNotes(holding.notes || '');
      setSelectedAccountId(holding.accountId || '');
      if (holding.interestRate || holding.maturityDate || holding.sipAmount || holding.units) {
        setShowAdvanced(true);
      }
      setInitialized(true);
    }
  }, [isEditing, holding, initialized]);

  // Adjust default subType when asset class changes
  const handleSelectClass = (cls: AssetClass) => {
    setAssetClass(cls);
    const availableSubtypes = SUBTYPES_BY_CLASS[cls];
    if (availableSubtypes && availableSubtypes.length > 0) {
      setSubType(availableSubtypes[0].value);
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      showToast('Asset name is required', 'error');
      return;
    }

    const invested = parseFloat(investedAmountStr);
    const current = parseFloat(currentValueStr);

    if (isNaN(invested) || invested < 0) {
      showToast('Please enter a valid invested amount', 'error');
      return;
    }
    if (isNaN(current) || current < 0) {
      showToast('Please enter a valid current valuation', 'error');
      return;
    }

    const units = parseFloat(unitsStr);
    const nav = parseFloat(navStr);
    const interest = parseFloat(interestRateStr);
    const sipAmount = parseFloat(sipAmountStr);
    const sipDay = parseInt(sipDayOfMonthStr, 10);

    const payload = {
      name: name.trim(),
      assetClass,
      subType,
      investedAmount: invested,
      currentValue: current,
      units: !isNaN(units) && units > 0 ? units : undefined,
      navOrPrice: !isNaN(nav) && nav > 0 ? nav : undefined,
      folioOrAccountNumber: folioNumber.trim() || undefined,
      interestRate: !isNaN(interest) && interest > 0 ? interest : undefined,
      maturityDate: maturityDate || undefined,
      sipAmount: !isNaN(sipAmount) && sipAmount > 0 ? sipAmount : undefined,
      sipDayOfMonth: !isNaN(sipDay) && sipDay >= 1 && sipDay <= 31 ? sipDay : undefined,
      notes: notes.trim() || undefined,
      accountId: selectedAccountId || undefined,
    };

    if (isEditing && id) {
      updateHolding(
        { id, data: payload },
        {
          onSuccess: () => {
            showToast('Asset updated successfully', 'success');
            router.back();
          },
          onError: (err) => {
            showAlert('Error', err.message || 'Failed to update asset');
          },
        }
      );
    } else {
      createHolding(payload, {
        onSuccess: () => {
          showToast('Asset added to portfolio', 'success');
          router.back();
        },
        onError: (err) => {
          showAlert('Error', err.message || 'Failed to add asset');
        },
      });
    }
  };

  const isPending = isCreating || isUpdating;

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Header
        showBack
        title={isEditing ? 'Edit Asset Holding' : 'Add Wealth Asset'}
        rightNode={
          <TouchableOpacity
            style={[styles.headerSaveBtn, { backgroundColor: colors.primary }]}
            onPress={handleSave}
            disabled={isPending}
            activeOpacity={0.8}
          >
            {isPending ? (
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
          { paddingBottom: 64 },
        ])}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        enableResetScrollToCoords={false}
        extraScrollHeight={Platform.OS === 'ios' ? 140 : 160}
        extraHeight={Platform.OS === 'ios' ? 75 : 140}
        keyboardOpeningTime={0}
      >
        {/* CARD 1: ASSET CLASS SELECTOR */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Asset Class*</Text>
          <View style={styles.assetClassGrid}>
            {ASSET_CLASSES.map((cls) => {
              const isSelected = assetClass === cls.value;
              return (
                <TouchableOpacity
                  key={cls.value}
                  style={[
                    styles.assetClassChip,
                    {
                      backgroundColor: isSelected
                        ? colors.primaryContainer + '30'
                        : colors.surfaceContainerLow,
                      borderColor: isSelected ? colors.primary : colors.outlineVariant,
                      borderWidth: isSelected ? 1.5 : 1,
                    },
                  ]}
                  onPress={() => handleSelectClass(cls.value)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons
                    name={cls.icon}
                    size={18}
                    color={isSelected ? colors.primary : cls.color}
                  />
                  <Text
                    style={[
                      styles.assetClassText,
                      {
                        color: isSelected ? colors.primary : colors.onSurface,
                        fontFamily: isSelected ? 'Manrope_700Bold' : 'Manrope_600SemiBold',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {cls.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Subtype Selector */}
          <Text style={[styles.subLabel, { marginTop: 14 }]}>Investment Subtype</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subTypeScroll}>
            {SUBTYPES_BY_CLASS[assetClass]?.map((sub) => {
              const isSubSelected = subType === sub.value;
              return (
                <TouchableOpacity
                  key={sub.value}
                  style={[
                    styles.subTypePill,
                    {
                      backgroundColor: isSubSelected
                        ? colors.primary
                        : colors.surfaceContainerHigh,
                    },
                  ]}
                  onPress={() => setSubType(sub.value)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.subTypeText,
                      { color: isSubSelected ? colors.onPrimary : colors.onSurfaceVariant },
                    ]}
                    numberOfLines={1}
                  >
                    {sub.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* CARD 2: BASIC DETAILS & VALUATION */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Asset Details</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Asset Name / Fund Name*</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Parag Parikh Flexi Cap, HDFC 1-Yr FD, SGB 2028"
              placeholderTextColor={colors.outline}
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.rowInputs}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Invested (Principal)*</Text>
              <TextInput
                style={styles.input}
                placeholder={`${getCurrencySymbol()}0.00`}
                placeholderTextColor={colors.outline}
                keyboardType="decimal-pad"
                value={investedAmountStr}
                onChangeText={setInvestedAmountStr}
              />
            </View>

            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.inputLabel}>Current Market Value*</Text>
              <TextInput
                style={styles.input}
                placeholder={`${getCurrencySymbol()}0.00`}
                placeholderTextColor={colors.outline}
                keyboardType="decimal-pad"
                value={currentValueStr}
                onChangeText={setCurrentValueStr}
              />
            </View>
          </View>

          {/* Return / P&L Preview */}
          {!isNaN(parseFloat(investedAmountStr)) &&
            parseFloat(investedAmountStr) > 0 &&
            !isNaN(parseFloat(currentValueStr)) &&
            parseFloat(currentValueStr) >= 0 && (
            <View style={[styles.pnlPreviewBox, { backgroundColor: colors.surfaceContainerHigh }]}>
              <View>
                <Text style={styles.pnlLabel}>Unrealized Gain / Loss</Text>
                <Text
                  style={[
                    styles.pnlValue,
                    {
                      color:
                        parseFloat(currentValueStr) >= parseFloat(investedAmountStr)
                          ? '#10b981'
                          : '#ef4444',
                    },
                  ]}
                >
                  {parseFloat(currentValueStr) >= parseFloat(investedAmountStr) ? '+' : ''}
                  {formatCurrency(
                    parseFloat(currentValueStr) - parseFloat(investedAmountStr)
                  )}{' '}
                  (
                  {(
                    ((parseFloat(currentValueStr) - parseFloat(investedAmountStr)) /
                      parseFloat(investedAmountStr)) *
                    100
                  ).toFixed(2)}
                  %)
                </Text>
              </View>
            </View>
          )}

          {/* Linked Account Selector */}
          {accounts.length > 0 && (
            <View style={[styles.inputGroup, { marginTop: 14 }]}>
              <Text style={styles.inputLabel}>Linked Account / Demat (Optional)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subTypeScroll}>
                <TouchableOpacity
                  style={[
                    styles.subTypePill,
                    {
                      backgroundColor: !selectedAccountId
                        ? colors.primary
                        : colors.surfaceContainerHigh,
                    },
                  ]}
                  onPress={() => setSelectedAccountId('')}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.subTypeText,
                      { color: !selectedAccountId ? colors.onPrimary : colors.onSurfaceVariant },
                    ]}
                  >
                    None / Direct
                  </Text>
                </TouchableOpacity>

                {accounts.map((acc) => {
                  const isAccSelected = selectedAccountId === acc.id;
                  return (
                    <TouchableOpacity
                      key={acc.id}
                      style={[
                        styles.subTypePill,
                        {
                          backgroundColor: isAccSelected
                            ? colors.primary
                            : colors.surfaceContainerHigh,
                        },
                      ]}
                      onPress={() => setSelectedAccountId(acc.id)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.subTypeText,
                          {
                            color: isAccSelected ? colors.onPrimary : colors.onSurfaceVariant,
                            fontFamily: isAccSelected ? 'Manrope_700Bold' : 'Manrope_600SemiBold',
                          },
                        ]}
                      >
                        {acc.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>

        {/* CARD 3: SCHEDULES, SIP & MATURITY (COLLAPSIBLE / ADVANCED) */}
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.advancedToggleHeader}
            onPress={() => setShowAdvanced(!showAdvanced)}
            activeOpacity={0.8}
          >
            <View style={styles.labelWithIcon}>
              <MaterialIcons name="event-repeat" size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>SIP & Maturity Schedule (Optional)</Text>
            </View>
            <MaterialIcons
              name={showAdvanced ? 'expand-less' : 'expand-more'}
              size={22}
              color={colors.onSurfaceVariant}
            />
          </TouchableOpacity>

          {showAdvanced && (
            <View style={styles.advancedBody}>
              {/* Maturity Date */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Maturity / Expiry Date (FD, RD, SGB, Bond)</Text>
                <TouchableOpacity
                  style={styles.datePickerTrigger}
                  onPress={() => setShowDatePicker(true)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="event" size={18} color={colors.primary} />
                  <Text style={[styles.dateText, { color: colors.onSurface }]}>
                    {maturityDate ? maturityDate : 'Select maturity date'}
                  </Text>
                  {maturityDate ? (
                    <TouchableOpacity onPress={() => setMaturityDate('')}>
                      <MaterialIcons name="close" size={16} color={colors.onSurfaceVariant} />
                    </TouchableOpacity>
                  ) : null}
                </TouchableOpacity>
              </View>

              {/* Interest Rate */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Interest Rate / Guaranteed Return (% APR)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 7.25%"
                  placeholderTextColor={colors.outline}
                  keyboardType="decimal-pad"
                  value={interestRateStr}
                  onChangeText={setInterestRateStr}
                />
              </View>

              {/* Recurring SIP Setup */}
              <View style={styles.rowInputs}>
                <View style={[styles.inputGroup, { flex: 1.2 }]}>
                  <Text style={styles.inputLabel}>Monthly SIP Amount</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={`${getCurrencySymbol()}5,000`}
                    placeholderTextColor={colors.outline}
                    keyboardType="decimal-pad"
                    value={sipAmountStr}
                    onChangeText={setSipAmountStr}
                  />
                </View>

                <View style={[styles.inputGroup, { flex: 0.8 }]}>
                  <Text style={styles.inputLabel}>SIP Day (1-31)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 5"
                    placeholderTextColor={colors.outline}
                    keyboardType="number-pad"
                    maxLength={2}
                    value={sipDayOfMonthStr}
                    onChangeText={setSipDayOfMonthStr}
                  />
                </View>
              </View>

              {/* Folio & Notes */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Folio / Demat / Certificate Number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. 12345678/90"
                  placeholderTextColor={colors.outline}
                  value={folioNumber}
                  onChangeText={setFolioNumber}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Notes</Text>
                <TextInput
                  style={[styles.input, { minHeight: 60 }]}
                  placeholder="e.g. Tax saving ELSS 3-year lock-in"
                  placeholderTextColor={colors.outline}
                  multiline
                  value={notes}
                  onChangeText={setNotes}
                />
              </View>
            </View>
          )}
        </View>

        {/* SUBMIT BUTTON */}
        <TouchableOpacity
          style={[styles.submitButton, { backgroundColor: colors.primary }]}
          onPress={handleSave}
          disabled={isPending}
          activeOpacity={0.85}
        >
          {isPending ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Text style={[styles.submitButtonText, { color: colors.onPrimary }]}>
              {isEditing ? 'Save Asset Updates' : 'Add to Wealth Portfolio'}
            </Text>
          )}
        </TouchableOpacity>
      </KeyboardAwareScrollView>

      {/* Date Picker Modal for Maturity Date */}
      <DatePickerModal
        visible={showDatePicker}
        value={maturityDate || formatLocalDate(new Date())}
        onChange={(newDate) => setMaturityDate(newDate)}
        onClose={() => setShowDatePicker(false)}
      />
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headerSaveBtn: {
      paddingHorizontal: 16,
      paddingVertical: 7,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerSaveText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      lineHeight: 18,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 10,
    },
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 16,
      marginBottom: 14,
    },
    sectionTitle: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      color: colors.onSurface,
      lineHeight: 18,
    },
    subLabel: {
      ...typography.labelMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
    },
    assetClassGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10,
    },
    assetClassChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: radius.lg,
    },
    assetClassText: {
      ...typography.labelMd,
      fontSize: 12,
    },
    subTypeScroll: {
      marginTop: 8,
    },
    subTypePill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: radius.full,
      marginRight: 8,
    },
    subTypeText: {
      ...typography.labelMd,
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
    },
    inputGroup: {
      marginTop: 12,
    },
    inputLabel: {
      ...typography.labelMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      marginBottom: 6,
    },
    input: {
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: radius.lg,
      paddingHorizontal: 14,
      paddingVertical: 10,
      color: colors.onSurface,
      ...typography.bodyMd,
      fontSize: 14,
    },
    rowInputs: {
      flexDirection: 'row',
      gap: 12,
    },
    pnlPreviewBox: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 12,
      borderRadius: radius.md,
      marginTop: 14,
    },
    pnlLabel: {
      ...typography.labelMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
    },
    pnlValue: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 14,
      marginTop: 2,
    },
    advancedToggleHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    labelWithIcon: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    advancedBody: {
      marginTop: 12,
    },
    datePickerTrigger: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: radius.lg,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 10,
    },
    dateText: {
      flex: 1,
      ...typography.bodyMd,
      fontSize: 13,
    },
    submitButton: {
      paddingVertical: 14,
      borderRadius: radius.xl,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    submitButtonText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 15,
    },
  });
  return styles;
};

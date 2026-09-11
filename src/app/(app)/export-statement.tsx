import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Text, Header, useToast } from '@/components/ui';
import { typography, radius, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccounts } from '@/hooks/use-accounts';
import { exportCustomStatement } from '@/services/export/export-service';

type ExportFormat = 'pdf' | 'csv';
type DatePreset = 'this_month' | 'last_month' | 'last_90_days' | 'ytd' | 'all' | 'custom';

export default function ExportStatementScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { accounts } = useAccounts();

  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [preset, setPreset] = useState<DatePreset>('this_month');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);

  // Custom date inputs
  const now = new Date();
  const [customFrom, setCustomFrom] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  );
  const [customTo, setCustomTo] = useState(now.toISOString().split('T')[0]);

  // Compute actual date range based on preset
  const dateRange = useMemo<{ dateFrom?: string; dateTo?: string }>(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();

    switch (preset) {
      case 'this_month': {
        const from = new Date(y, m, 1).toISOString().split('T')[0];
        const to = today.toISOString().split('T')[0];
        return { dateFrom: from, dateTo: to };
      }
      case 'last_month': {
        const from = new Date(y, m - 1, 1).toISOString().split('T')[0];
        const to = new Date(y, m, 0).toISOString().split('T')[0];
        return { dateFrom: from, dateTo: to };
      }
      case 'last_90_days': {
        const fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 90);
        return { dateFrom: fromDate.toISOString().split('T')[0], dateTo: today.toISOString().split('T')[0] };
      }
      case 'ytd': {
        const from = new Date(y, 0, 1).toISOString().split('T')[0];
        return { dateFrom: from, dateTo: today.toISOString().split('T')[0] };
      }
      case 'custom': {
        return { dateFrom: customFrom, dateTo: customTo };
      }
      case 'all':
      default:
        return {};
    }
  }, [preset, customFrom, customTo]);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await exportCustomStatement({
        format,
        dateFrom: dateRange.dateFrom,
        dateTo: dateRange.dateTo,
        accountId: selectedAccountId === 'all' ? undefined : selectedAccountId,
      });

      if (res.success) {
        showToast(
          format === 'pdf' ? 'PDF Statement generated!' : 'CSV exported successfully!',
          'success'
        );
      } else {
        showToast(res.message || 'Failed to generate statement', 'error');
      }
    } catch (e: any) {
      console.error('Export statement error:', e);
      showToast(e?.message || 'Error generating statement', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const PRESETS: { label: string; value: DatePreset }[] = [
    { label: 'This Month', value: 'this_month' },
    { label: 'Last Month', value: 'last_month' },
    { label: 'Last 90 Days', value: 'last_90_days' },
    { label: 'Year to Date', value: 'ytd' },
    { label: 'All Time', value: 'all' },
    { label: 'Custom Range', value: 'custom' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.background }]}>
      <Header showBack title="Export Statement" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Format Selector */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.onSurfaceVariant }]}>1. CHOOSE FORMAT</Text>
          <View style={styles.formatRow}>
            <TouchableOpacity
              style={[
                styles.formatCard,
                {
                  backgroundColor: colors.surfaceContainerLowest,
                  borderColor: colors.surfaceVariant,
                },
                format === 'pdf' && {
                  borderColor: colors.primary,
                  backgroundColor: colors.primaryContainer + '20',
                },
              ]}
              onPress={() => setFormat('pdf')}
            >
              <MaterialIcons
                name="picture-as-pdf"
                size={32}
                color={format === 'pdf' ? colors.primary : colors.onSurfaceVariant}
              />
              <Text
                style={[
                  styles.formatCardTitle,
                  { color: colors.onSurface },
                  format === 'pdf' && { color: colors.primary, fontWeight: '700' },
                ]}
              >
                PDF Statement
              </Text>
              <Text style={[styles.formatCardDesc, { color: colors.onSurfaceVariant }]}>Printable statement with summary & tables</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.formatCard,
                {
                  backgroundColor: colors.surfaceContainerLowest,
                  borderColor: colors.surfaceVariant,
                },
                format === 'csv' && {
                  borderColor: colors.primary,
                  backgroundColor: colors.primaryContainer + '20',
                },
              ]}
              onPress={() => setFormat('csv')}
            >
              <MaterialIcons
                name="table-view"
                size={32}
                color={format === 'csv' ? colors.primary : colors.onSurfaceVariant}
              />
              <Text
                style={[
                  styles.formatCardTitle,
                  { color: colors.onSurface },
                  format === 'csv' && { color: colors.primary, fontWeight: '700' },
                ]}
              >
                CSV Spreadsheet
              </Text>
              <Text style={[styles.formatCardDesc, { color: colors.onSurfaceVariant }]}>Excel & Google Sheets compatible data</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Date Range Presets */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.onSurfaceVariant }]}>2. TIME PERIOD</Text>
          <View style={styles.presetGrid}>
            {PRESETS.map((p) => {
              const isSelected = preset === p.value;
              return (
                <TouchableOpacity
                  key={p.value}
                  style={[
                    styles.presetChip,
                    {
                      borderColor: colors.surfaceVariant,
                      backgroundColor: colors.surfaceContainerLowest,
                    },
                    isSelected && {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() => setPreset(p.value)}
                >
                  <Text
                    style={[
                      styles.presetChipText,
                      { color: colors.onSurface },
                      isSelected && { color: colors.onPrimary, fontWeight: '700' },
                    ]}
                  >
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {preset === 'custom' && (
            <View style={styles.customDateRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.onSurfaceVariant }]}>From Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={[
                    styles.dateInput,
                    {
                      backgroundColor: colors.surfaceContainerLow,
                      borderColor: colors.surfaceVariant,
                      color: colors.onSurface,
                    },
                  ]}
                  value={customFrom}
                  onChangeText={setCustomFrom}
                  placeholder="2026-01-01"
                  placeholderTextColor={colors.onSurfaceVariant}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.onSurfaceVariant }]}>To Date (YYYY-MM-DD)</Text>
                <TextInput
                  style={[
                    styles.dateInput,
                    {
                      backgroundColor: colors.surfaceContainerLow,
                      borderColor: colors.surfaceVariant,
                      color: colors.onSurface,
                    },
                  ]}
                  value={customTo}
                  onChangeText={setCustomTo}
                  placeholder="2026-12-31"
                  placeholderTextColor={colors.onSurfaceVariant}
                />
              </View>
            </View>
          )}
        </View>

        {/* Account Filter */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.onSurfaceVariant }]}>3. ACCOUNT FILTER</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <TouchableOpacity
              style={[
                styles.accountChip,
                {
                  borderColor: colors.surfaceVariant,
                  backgroundColor: colors.surfaceContainerLowest,
                },
                selectedAccountId === 'all' && {
                  backgroundColor: colors.primary,
                  borderColor: colors.primary,
                },
              ]}
              onPress={() => setSelectedAccountId('all')}
            >
              <Text
                style={[
                  styles.accountChipText,
                  { color: colors.onSurface },
                  selectedAccountId === 'all' && { color: colors.onPrimary, fontWeight: '700' },
                ]}
              >
                All Accounts
              </Text>
            </TouchableOpacity>

            {accounts.map((acc) => {
              const isSelected = selectedAccountId === acc.id;
              return (
                <TouchableOpacity
                  key={acc.id}
                  style={[
                    styles.accountChip,
                    {
                      borderColor: colors.surfaceVariant,
                      backgroundColor: colors.surfaceContainerLowest,
                    },
                    isSelected && {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                  ]}
                  onPress={() => setSelectedAccountId(acc.id)}
                >
                  <Text
                    style={[
                      styles.accountChipText,
                      { color: colors.onSurface },
                      isSelected && { color: colors.onPrimary, fontWeight: '700' },
                    ]}
                  >
                    {acc.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Action Buttons */}
        <View style={{ gap: 12 }}>
          <TouchableOpacity
            style={[styles.exportButton, { backgroundColor: colors.primary }]}
            onPress={handleExport}
            disabled={isExporting}
            activeOpacity={0.8}
          >
            {isExporting ? (
              <ActivityIndicator color={colors.onPrimary} size="small" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <MaterialIcons
                  name={format === 'pdf' ? 'share' : 'file-download'}
                  size={22}
                  color={colors.onPrimary}
                />
                <Text style={[styles.exportButtonText, { color: colors.onPrimary }]}>
                  {format === 'pdf' ? 'Share / Save PDF Statement' : 'Export & Share CSV'}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {format === 'pdf' && (
            <TouchableOpacity
              style={[
                styles.exportButton,
                {
                  backgroundColor: colors.surfaceContainerHighest,
                  borderWidth: 1,
                  borderColor: colors.surfaceVariant,
                },
              ]}
              onPress={async () => {
                setIsExporting(true);
                try {
                  const res = await exportCustomStatement({
                    format: 'pdf',
                    action: 'print',
                    dateFrom: dateRange.dateFrom,
                    dateTo: dateRange.dateTo,
                    accountId: selectedAccountId === 'all' ? undefined : selectedAccountId,
                  });
                  if (res.success) {
                    showToast('Print dialog opened', 'info');
                  }
                } catch (e: any) {
                  showToast(e?.message || 'Failed to open print dialog', 'error');
                } finally {
                  setIsExporting(false);
                }
              }}
              disabled={isExporting}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <MaterialIcons name="print" size={22} color={colors.onSurface} />
                <Text style={[styles.exportButtonText, { color: colors.onSurface }]}>
                  Print / Save as PDF via System
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 24,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    ...typography.labelMd,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '600',
  },
  formatRow: {
    flexDirection: 'row',
    gap: 12,
  },
  formatCard: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 6,
  },
  formatCardTitle: {
    ...typography.bodyLg,
    fontWeight: '600',
    marginTop: 4,
  },
  formatCardDesc: {
    ...typography.labelMd,
    fontSize: 11,
    textAlign: 'center',
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  presetChipText: {
    ...typography.labelMd,
  },
  customDateRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  inputLabel: {
    ...typography.labelMd,
    fontSize: 11,
    marginBottom: 4,
  },
  dateInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...typography.bodyMd,
  },
  accountChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  accountChipText: {
    ...typography.labelMd,
  },
  exportButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  exportButtonText: {
    ...typography.bodyLg,
    fontWeight: '700',
  },
});


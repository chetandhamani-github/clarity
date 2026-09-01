import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Text, Header, useAlert, useToast } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  getExportStats,
  exportTransactionsToCSV,
  exportFullBackupToJSON,
  exportFinancialSummaryReport,
  type ExportStats,
} from '@/services/export/export-service';

export default function ExportSuccessScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showAlert } = useAlert();
  const { showToast } = useToast();

  const [selectedFormat, setSelectedFormat] = useState<'csv' | 'json' | 'summary'>('csv');
  const [isExporting, setIsExporting] = useState(false);
  const [stats, setStats] = useState<ExportStats>({
    transactionCount: 0,
    accountCount: 0,
    goalCount: 0,
  });

  useEffect(() => {
    getExportStats().then(setStats).catch(console.error);
  }, []);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      let result;
      if (selectedFormat === 'csv') {
        result = await exportTransactionsToCSV();
      } else if (selectedFormat === 'json') {
        result = await exportFullBackupToJSON();
      } else {
        result = await exportFinancialSummaryReport();
      }

      if (
        !result.success &&
        !result.message?.toLowerCase().includes('cancel') &&
        !result.message?.toLowerCase().includes('dismiss')
      ) {
        showToast(result.message || 'Could not complete file export', 'error');
      }
    } catch (err: any) {
      console.error('Export error:', err);
      showToast(err?.message || 'An unexpected error occurred during export', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header showBack title="Export Data" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>
          Export your financial records. Data is generated directly from your local vault.
        </Text>

        {/* Data Stats Badge */}
        <View style={styles.statsCard}>
          <MaterialIcons name="storage" size={20} color={colors.primary} />
          <Text style={styles.statsText}>
            Ready to export:{' '}
            <Text style={{ fontWeight: '700', color: colors.onSurface }}>
              {stats.transactionCount}
            </Text>{' '}
            transactions across{' '}
            <Text style={{ fontWeight: '700', color: colors.onSurface }}>{stats.accountCount}</Text>{' '}
            accounts
          </Text>
        </View>

        <View style={styles.optionsList}>
          {/* CSV Option */}
          <TouchableOpacity
            style={[styles.optionCard, selectedFormat === 'csv' && styles.optionCardSelected]}
            onPress={() => setSelectedFormat('csv')}
            activeOpacity={0.7}
          >
            <View style={styles.radioOuter}>
              {selectedFormat === 'csv' && <View style={styles.radioInner} />}
            </View>
            <View style={styles.optionContent}>
              <Text style={styles.optionTitle}>CSV Spreadsheet</Text>
              <Text style={styles.optionSub}>
                All transactions for Excel, Numbers, or Google Sheets
              </Text>
            </View>
            <MaterialIcons name="table-chart" size={24} color={colors.secondary} />
          </TouchableOpacity>

          {/* Summary Report */}
          <TouchableOpacity
            style={[styles.optionCard, selectedFormat === 'summary' && styles.optionCardSelected]}
            onPress={() => setSelectedFormat('summary')}
            activeOpacity={0.7}
          >
            <View style={styles.radioOuter}>
              {selectedFormat === 'summary' && <View style={styles.radioInner} />}
            </View>
            <View style={styles.optionContent}>
              <Text style={styles.optionTitle}>Financial Summary Report</Text>
              <Text style={styles.optionSub}>
                Formatted executive overview of income, spending & goals
              </Text>
            </View>
            <MaterialIcons name="assessment" size={24} color={colors.secondary} />
          </TouchableOpacity>

          {/* JSON Option */}
          <TouchableOpacity
            style={[styles.optionCard, selectedFormat === 'json' && styles.optionCardSelected]}
            onPress={() => setSelectedFormat('json')}
            activeOpacity={0.7}
          >
            <View style={styles.radioOuter}>
              {selectedFormat === 'json' && <View style={styles.radioInner} />}
            </View>
            <View style={styles.optionContent}>
              <Text style={styles.optionTitle}>Full JSON Backup</Text>
              <Text style={styles.optionSub}>Complete structured database snapshot</Text>
            </View>
            <MaterialIcons name="data-object" size={24} color={colors.secondary} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => router.back()}
          disabled={isExporting}
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.primaryBtnFooter}
          onPress={handleExport}
          disabled={isExporting}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <Text style={styles.primaryBtnText}>Export Now</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surfaceContainerLowest, // acting like a modal surface
    },

    scrollContent: {
      padding: 20,
    },
    statsCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.surfaceContainerLow,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 12,
      marginBottom: 20,
    },
    statsText: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      flex: 1,
    },
    subtitle: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      marginBottom: 16,
    },
    optionsList: {
      gap: 16,
    },
    optionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: 16,
      backgroundColor: colors.surfaceContainerLowest,
    },
    optionCardSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.surfaceContainerLowest,
    },
    radioOuter: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.outline,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
    },
    radioInner: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.primary,
    },
    optionContent: {
      flex: 1,
    },
    optionTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
    },
    optionSub: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      marginTop: 4,
    },
    footer: {
      flexDirection: 'row',
      gap: 16,
      paddingHorizontal: 20,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: colors.outlineVariant + '40',
      backgroundColor: colors.surfaceContainerLowest,
    },
    cancelBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.outline,
      alignItems: 'center',
    },
    cancelBtnText: {
      ...typography.labelMd,
      color: colors.onSurface,
    },
    primaryBtnFooter: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 24,
      backgroundColor: colors.primary,
      alignItems: 'center',
    },
    primaryBtnText: {
      ...typography.labelMd,
      color: colors.onPrimary,
    },
  });
  return styles;
};

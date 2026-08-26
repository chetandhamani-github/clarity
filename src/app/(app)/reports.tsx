import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMonthlyReports } from '@/hooks/use-transactions';
import { formatCurrency } from '@/utils/format';

export default function ReportsScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { reports, isLoading } = useMonthlyReports();

  const getMonthName = (datePrefix: string) => {
    const [year, month] = datePrefix.split('-');
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top App Bar */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Reports History
        </Text>
        <TouchableOpacity style={styles.iconButton}>
          <MaterialIcons name="search" size={24} color={colors.onSurface} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 60 }]} showsVerticalScrollIndicator={false}>
          <View style={styles.introSection}>
            <Text style={styles.introText}>Review your past monthly financial performance.</Text>
          </View>

          <View style={styles.reportsList}>
            {reports.map((report) => {
              const savingsRate = report.income > 0 
                ? ((report.income - report.expenses) / report.income) * 100 
                : 0;

              return (
                <TouchableOpacity key={report.datePrefix} style={styles.reportCard}>
                  <View style={styles.reportHeader}>
                    <View>
                      <Text style={styles.reportTitle}>{getMonthName(report.datePrefix)}</Text>
                      <Text style={styles.reportSubtitle}>MONTHLY SUMMARY</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={24} color={colors.onSurfaceVariant} />
                  </View>
                  <View style={styles.reportGrid}>
                    <View style={styles.gridItem}>
                      <Text style={styles.gridLabel}>Income</Text>
                      <Text style={styles.gridValue}>{formatCurrency(report.income)}</Text>
                    </View>
                    <View style={styles.gridItem}>
                      <Text style={styles.gridLabel}>Expenses</Text>
                      <Text style={styles.gridValue}>{formatCurrency(report.expenses)}</Text>
                    </View>
                    <View style={styles.gridItem}>
                      <Text style={styles.gridLabel}>Savings Rate</Text>
                      <Text style={[styles.gridValue, { color: savingsRate > 0 ? colors.primary : colors.error }]}>
                        {savingsRate.toFixed(1)}%
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}

            {reports.length === 0 && (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <MaterialIcons name="insert-chart-outlined" size={64} color={colors.surfaceVariant} />
                <Text style={{ ...typography.headlineSm, color: colors.onSurface, marginTop: 16 }}>No Reports Yet</Text>
                <Text style={{ ...typography.bodyMd, color: colors.onSurfaceVariant, textAlign: 'center', marginTop: 8 }}>
                  Your monthly summaries will appear here as you add transactions.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background, // colors.background
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.surfaceVariant,
    },
    headerTitle: {
      ...typography.headlineMd,
      color: colors.onSurface,
      flex: 1,
      textAlign: 'left',
      marginLeft: 8,
    },
    iconButton: {
      padding: 8,
      borderRadius: 24,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    introSection: {
      marginBottom: 32,
    },
    introText: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
    },
    reportsList: {
      gap: 16,
    },
    reportCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: 12,
      padding: 20,
    },
    reportHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceVariant,
      marginBottom: 16,
    },
    reportTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
    },
    reportSubtitle: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      marginTop: 4,
    },
    reportGrid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    gridItem: {
      flex: 1,
    },
    gridLabel: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      marginBottom: 4,
    },
    gridValue: {
      ...typography.dataLg,
      color: colors.onSurface,
    },
  });
  return styles;
};

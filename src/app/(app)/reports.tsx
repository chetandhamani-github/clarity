import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, Header, Loader } from '@/components/ui';
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
      <Header
        showBack
        title="Reports History"
        rightNode={
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.push('/export-success')}
          >
            <MaterialIcons name="download" size={24} color={colors.onSurface} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <Loader />
        ) : (
          <>
            <View style={styles.introSection}>
              <Text style={styles.introText}>Review your past monthly financial performance.</Text>
            </View>

            <View style={styles.reportsList}>
              {reports.map((report) => {
                const savingsRate =
                  report.income > 0 ? ((report.income - report.expenses) / report.income) * 100 : 0;
                const [y, m] = report.datePrefix.split('-');

                return (
                  <TouchableOpacity
                    key={report.datePrefix}
                    style={styles.reportCard}
                    onPress={() =>
                      router.push({ pathname: '/analytics', params: { month: m, year: y } })
                    }
                    activeOpacity={0.7}
                  >
                    <View style={styles.reportHeader}>
                      <View>
                        <Text style={styles.reportTitle}>{getMonthName(report.datePrefix)}</Text>
                        <Text style={styles.reportSubtitle}>MONTHLY SUMMARY</Text>
                      </View>
                      <MaterialIcons
                        name="chevron-right"
                        size={24}
                        color={colors.onSurfaceVariant}
                      />
                    </View>
                    <View style={styles.reportGrid}>
                      <View style={styles.gridItem}>
                        <Text style={styles.gridLabel}>Income</Text>
                        <Text style={styles.gridValue} numberOfLines={1} adjustsFontSizeToFit>
                          {formatCurrency(report.income)}
                        </Text>
                      </View>
                      <View style={styles.gridItem}>
                        <Text style={styles.gridLabel}>Expenses</Text>
                        <Text style={styles.gridValue} numberOfLines={1} adjustsFontSizeToFit>
                          {formatCurrency(report.expenses)}
                        </Text>
                      </View>
                      <View style={styles.gridItem}>
                        <Text style={styles.gridLabel}>Savings Rate</Text>
                        <Text
                          style={[
                            styles.gridValue,
                            { color: savingsRate > 0 ? colors.primary : colors.onSurface },
                          ]}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                        >
                          {savingsRate.toFixed(1)}%
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {reports.length === 0 && (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <MaterialIcons
                    name="insert-chart-outlined"
                    size={64}
                    color={colors.surfaceVariant}
                  />
                  <Text
                    style={{ ...typography.headlineSm, color: colors.onSurface, marginTop: 16 }}
                  >
                    No Reports Yet
                  </Text>
                  <Text
                    style={{
                      ...typography.bodyMd,
                      color: colors.onSurfaceVariant,
                      textAlign: 'center',
                      marginTop: 8,
                    }}
                  >
                    Your monthly summaries will appear here as you add transactions.
                  </Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background, // colors.background
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
      ...typography.headlineMd,
      color: colors.onSurface,
    },
    reportSubtitle: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      letterSpacing: 0.8,
      marginTop: 4,
    },
    reportGrid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
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
      ...typography.headlineSm,
      color: colors.onSurface,
      fontSize: 18,
    },
  });
  return styles;
};

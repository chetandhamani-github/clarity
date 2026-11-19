import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Text, Header } from '@/components/ui';
import { typography, useTheme, radius, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useFinancialHealth } from '@/hooks/use-financial-health';
import type { HealthPillar } from '@/services/analytics/financial-health-engine';

export default function FinancialHealthScreen() {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const insets = useSafeInsets();
  const { report, isLoading, refetch } = useFinancialHealth();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const renderPillarCard = (pillar: HealthPillar, icon: keyof typeof MaterialIcons.glyphMap) => {
    const statusColor =
      pillar.status === 'excellent'
        ? '#10B981'
        : pillar.status === 'good'
          ? '#3B82F6'
          : pillar.status === 'fair'
            ? '#F59E0B'
            : '#EF4444';

    return (
      <View key={pillar.id} style={styles.pillarCard}>
        <View style={styles.pillarHeader}>
          <View style={styles.pillarLeft}>
            <View style={[styles.pillarIconCircle, { backgroundColor: `${statusColor}15` }]}>
              <MaterialIcons name={icon} size={18} color={statusColor} />
            </View>
            <View>
              <Text style={styles.pillarName}>{pillar.name}</Text>
              <Text style={styles.pillarDesc}>{pillar.description}</Text>
            </View>
          </View>

          <View style={styles.pillarScoreBlock}>
            <Text style={[styles.pillarPoints, { color: statusColor }]}>
              {pillar.score}
              <Text style={styles.pillarMaxPoints}>/{pillar.maxScore}</Text>
            </Text>
            <Text style={styles.pillarMetricVal}>{pillar.metricValue}</Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={[styles.progressBarTrack, { backgroundColor: colors.surfaceContainerHigh }]}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${pillar.percentage}%`, backgroundColor: statusColor },
            ]}
          />
        </View>

        {/* Personalized Tip */}
        <View style={styles.adviceRow}>
          <MaterialIcons name="info-outline" size={13} color={colors.onSurfaceVariant} />
          <Text style={styles.adviceText}>{pillar.advice}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header showBack title="Financial Health Score" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {isLoading || !report ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <>
            {/* HERO SCORE CARD */}
            <View style={styles.heroCard}>
              <View style={styles.scoreRow}>
                <View style={[styles.bigScoreCircle, { borderColor: report.gradeColor }]}>
                  <Text style={[styles.bigScoreNumber, { color: report.gradeColor }]}>
                    {report.overallScore}
                  </Text>
                  <Text style={styles.bigScoreMax}>OUT OF 100</Text>
                </View>

                <View style={styles.scoreDetails}>
                  <View
                    style={[
                      styles.gradeBadge,
                      {
                        backgroundColor: `${report.gradeColor}18`,
                        borderColor: `${report.gradeColor}40`,
                      },
                    ]}
                  >
                    <Text style={[styles.gradeBadgeText, { color: report.gradeColor }]}>
                      {report.grade.toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.heroHeadline}>{report.headline}</Text>
                  <Text style={styles.heroSummary}>{report.summary}</Text>
                </View>
              </View>
            </View>

            {/* ACTIONABLE RECOMMENDATIONS */}
            {report.actionableTips.length > 0 && (
              <View style={styles.actionSection}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <MaterialIcons name="lightbulb" size={18} color="#F59E0B" />
                  <Text style={styles.sectionHeaderTitle}>Priority Recommendations</Text>
                </View>

                <View style={styles.tipsList}>
                  {report.actionableTips.map((tip, idx) => (
                    <View key={idx} style={styles.tipCard}>
                      <MaterialIcons name="arrow-forward" size={14} color={colors.primary} />
                      <Text style={styles.tipText}>{tip}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* 5 HEALTH PILLARS SECTION */}
            <View style={styles.pillarsSection}>
              <Text style={styles.sectionHeaderTitle}>5 Core Pillars of Health</Text>

              <View style={styles.pillarsList}>
                {renderPillarCard(report.pillars.runway, 'shield')}
                {renderPillarCard(report.pillars.savingsRate, 'savings')}
                {renderPillarCard(report.pillars.creditUtilization, 'credit-card')}
                {renderPillarCard(report.pillars.debtBurden, 'trending-down')}
                {renderPillarCard(report.pillars.budgetAdherence, 'pie-chart')}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingContainer: {
      paddingVertical: 50,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 12,
      gap: 14,
    },
    heroCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 16,
    },
    scoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    bigScoreCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      borderWidth: 4,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
      backgroundColor: colors.surfaceContainerLow,
    },
    bigScoreNumber: {
      ...typography.labelMd,
      fontFamily: 'Manrope_800ExtraBold',
      fontSize: 32,
      lineHeight: 36,
    },
    bigScoreMax: {
      ...typography.labelMd,
      fontSize: 8,
      fontFamily: 'Manrope_700Bold',
      color: colors.onSurfaceVariant,
    },
    scoreDetails: {
      flex: 1,
    },
    gradeBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.full,
      borderWidth: 1,
      marginBottom: 4,
    },
    gradeBadgeText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_800ExtraBold',
      fontSize: 9,
    },
    heroHeadline: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 15,
      color: colors.onSurface,
      marginBottom: 2,
    },
    heroSummary: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      lineHeight: 16,
    },
    actionSection: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 14,
    },
    sectionHeaderTitle: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      color: colors.onSurface,
      marginBottom: 8,
    },
    tipsList: {
      gap: 8,
    },
    tipCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: colors.surfaceContainerLow,
      padding: 10,
      borderRadius: radius.md,
    },
    tipText: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurface,
      flex: 1,
      lineHeight: 16,
    },
    pillarsSection: {
      marginBottom: 16,
    },
    pillarsList: {
      gap: 10,
    },
    pillarCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 14,
    },
    pillarHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    pillarLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      marginRight: 12,
    },
    pillarIconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pillarName: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      color: colors.onSurface,
    },
    pillarDesc: {
      ...typography.bodyMd,
      fontSize: 10,
      color: colors.onSurfaceVariant,
      marginTop: 1,
    },
    pillarScoreBlock: {
      alignItems: 'flex-end',
    },
    pillarPoints: {
      ...typography.labelMd,
      fontFamily: 'Manrope_800ExtraBold',
      fontSize: 14,
    },
    pillarMaxPoints: {
      ...typography.labelMd,
      fontSize: 10,
      color: colors.onSurfaceVariant,
    },
    pillarMetricVal: {
      ...typography.bodyMd,
      fontSize: 10,
      color: colors.onSurfaceVariant,
      marginTop: 1,
    },
    progressBarTrack: {
      height: 6,
      borderRadius: 3,
      overflow: 'hidden',
      marginBottom: 8,
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 3,
    },
    adviceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    adviceText: {
      ...typography.bodyMd,
      fontSize: 10,
      color: colors.onSurfaceVariant,
      flex: 1,
      lineHeight: 14,
    },
  });
}

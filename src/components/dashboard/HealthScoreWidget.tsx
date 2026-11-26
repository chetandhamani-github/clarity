import { Text } from '@/components/ui';
import { useFinancialHealth } from '@/hooks/use-financial-health';
import { radius, ThemeColors, typography, useTheme } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

export function HealthScoreWidget() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const { report, isLoading } = useFinancialHealth();

  if (isLoading || !report) return null;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.navigate('/(app)/financial-health')}
      activeOpacity={0.8}
    >
      <View style={styles.contentRow}>
        <View style={[styles.scoreBadge, { borderColor: report.gradeColor }]}>
          <Text style={[styles.scoreNumber, { color: report.gradeColor }]}>
            {report.overallScore}
          </Text>
          <Text style={styles.scoreMax}>/100</Text>
        </View>

        <View style={styles.textContainer}>
          <View style={styles.titleRow}>
            <Text style={styles.titleLabel}>FINANCIAL HEALTH SCORE</Text>
            <View
              style={[
                styles.gradePill,
                { backgroundColor: `${report.gradeColor}18` },
              ]}
            >
              <Text style={[styles.gradeText, { color: report.gradeColor }]}>
                {report.grade}
              </Text>
            </View>
          </View>
          <Text style={styles.headline} numberOfLines={1}>
            {report.headline}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {report.summary}
          </Text>
        </View>

        <MaterialIcons name="chevron-right" size={20} color={colors.onSurfaceVariant} />
      </View>
    </TouchableOpacity>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 14,
      marginBottom: 14,
    },
    contentRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    scoreBadge: {
      width: 50,
      height: 50,
      borderRadius: 25,
      borderWidth: 2.5,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
      backgroundColor: colors.surfaceContainerLow,
    },
    scoreNumber: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 16,
      lineHeight: 18,
    },
    scoreMax: {
      ...typography.labelMd,
      fontSize: 8,
      color: colors.onSurfaceVariant,
    },
    textContainer: {
      flex: 1,
      marginRight: 8,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    titleLabel: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 9,
      color: colors.primary,
      letterSpacing: 0.5,
    },
    gradePill: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: radius.full,
    },
    gradeText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 9,
    },
    headline: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 13,
      color: colors.onSurface,
      marginTop: 2,
    },
    subtitle: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      marginTop: 1,
    },
  });
  return styles;
};

import React from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text } from './Text';
import { useTheme, typography, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { formatCurrency } from '@/utils/format';

export interface DiscrepancyBannerProps {
  discrepancy: number; // positive = ledger is lower than statement, negative = ledger is higher than statement
  statementBalance: number;
  calculatedBalance: number;
  onAdjust: () => void;
  isAdjusting?: boolean;
}

export function DiscrepancyBanner({
  discrepancy,
  statementBalance,
  calculatedBalance,
  onAdjust,
  isAdjusting = false,
}: DiscrepancyBannerProps) {
  const { colors } = useTheme();

  const diffAbs = Math.abs(discrepancy);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.tertiaryContainer + '33',
          borderColor: colors.tertiary + '66',
        },
      ]}
    >
      <View style={styles.headerRow}>
        <View style={[styles.iconCircle, { backgroundColor: colors.tertiaryContainer }]}>
          <MaterialIcons name="sync-problem" size={18} color={colors.tertiary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.onSurface }]}>Discrepancy Detected</Text>
          <Text style={[styles.subtitle, { color: colors.onSurfaceVariant }]}>
            Mismatch of {formatCurrency(diffAbs)} between your bank SMS ({formatCurrency(statementBalance)}) and ledger ({formatCurrency(calculatedBalance)}).
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: colors.tertiaryContainer }]}
        onPress={onAdjust}
        disabled={isAdjusting}
        activeOpacity={0.8}
      >
        {isAdjusting ? (
          <ActivityIndicator size="small" color={colors.onTertiaryContainer} />
        ) : (
          <>
            <MaterialIcons name="auto-fix-high" size={16} color={colors.onTertiaryContainer} />
            <Text style={[styles.actionButtonText, { color: colors.onTertiaryContainer }]}>Add Adjustment Entry</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  title: {
    ...typography.bodyLg,
    fontWeight: '700',
  },
  subtitle: {
    ...typography.bodyMd,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  actionButtonText: {
    ...typography.labelMd,
    fontWeight: '600',
  },
});

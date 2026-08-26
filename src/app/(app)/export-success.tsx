import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Text } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

export default function ExportSuccessScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [selectedFormat, setSelectedFormat] = useState('pdf');
  const [isExporting, setIsExporting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleExport = () => {
    setIsExporting(true);
    // Simulate network delay
    setTimeout(() => {
      setIsExporting(false);
      setIsSuccess(true);
    }, 1500);
  };

  if (isSuccess) {
    return (
      <View style={[styles.container, styles.centeredContainer]}>
        <View style={styles.successIconBox}>
          <MaterialIcons name="check-circle" size={40} color={colors.onPrimaryContainer} />
        </View>
        <Text style={styles.successTitle}>Export Successful</Text>
        <Text style={styles.successBody}>
          Your financial report has been exported successfully and is ready for download.
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
          <Text style={styles.primaryBtnText}>Return to Dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Export Report
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.subtitle}>
          Select a format to download your customized financial summary.
        </Text>

        <View style={styles.optionsList}>
          {/* PDF Option */}
          <TouchableOpacity
            style={[styles.optionCard, selectedFormat === 'pdf' && styles.optionCardSelected]}
            onPress={() => setSelectedFormat('pdf')}
            activeOpacity={0.7}
          >
            <View style={styles.radioOuter}>
              {selectedFormat === 'pdf' && <View style={styles.radioInner} />}
            </View>
            <View style={styles.optionContent}>
              <Text style={styles.optionTitle}>PDF Document</Text>
              <Text style={styles.optionSub}>Best for printing and sharing</Text>
            </View>
            <MaterialIcons name="picture-as-pdf" size={24} color={colors.secondary} />
          </TouchableOpacity>

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
              <Text style={styles.optionSub}>Raw data for Excel or Numbers</Text>
            </View>
            <MaterialIcons name="table-chart" size={24} color={colors.secondary} />
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
              <Text style={styles.optionTitle}>JSON Data</Text>
              <Text style={styles.optionSub}>Structured data for developers</Text>
            </View>
            <MaterialIcons name="data-object" size={24} color={colors.secondary} />
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom || 20 }]}>
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
          <Text style={styles.primaryBtnText}>{isExporting ? 'Exporting...' : 'Export Now'}</Text>
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
    centeredContainer: {
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      height: 64,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.surfaceVariant,
    },
    headerTitle: {
      ...typography.headlineMd,
      color: colors.onSurface,
    },
    iconButton: {
      padding: 8,
      marginRight: -8,
    },
    scrollContent: {
      padding: 20,
    },
    subtitle: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      marginBottom: 24,
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
    primaryBtn: {
      width: '100%',
      paddingVertical: 14,
      borderRadius: 24,
      backgroundColor: colors.primary,
      alignItems: 'center',
    },
    primaryBtnText: {
      ...typography.labelMd,
      color: colors.onPrimary,
    },
    successIconBox: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    successTitle: {
      ...typography.headlineMd,
      color: colors.onSurface,
      marginBottom: 12,
    },
    successBody: {
      ...typography.bodyLg,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
      marginBottom: 32,
    },
  });
  return styles;
};

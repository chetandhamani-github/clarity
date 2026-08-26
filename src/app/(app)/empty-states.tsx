import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

export default function EmptyStatesScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={colors.onSurfaceVariant} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Empty States Demo
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 60 }]} showsVerticalScrollIndicator={false}>
        {/* Empty Dashboard */}
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <MaterialIcons name="account-balance" size={64} color={colors.primary} />
          </View>
          <Text style={styles.title}>Welcome to Your Sanctuary</Text>
          <Text style={styles.description}>
            Your financial picture begins here. Link your accounts to gain absolute clarity over
            your wealth, seamlessly and securely.
          </Text>
          <TouchableOpacity style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Link Your First Account</Text>
          </TouchableOpacity>
        </View>

        {/* Empty Transactions */}
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <MaterialIcons name="receipt-long" size={64} color={colors.tertiary} />
          </View>
          <Text style={styles.title}>A Blank Ledger</Text>
          <Text style={styles.description}>
            No recent activity to display. Once your accounts are linked, your transactions will
            elegantly categorize themselves here.
          </Text>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.primaryBtn}>
              <Text style={styles.primaryBtnText}>Sync Your Bank</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>Add Manually</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Empty Goals */}
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <MaterialIcons name="flag" size={64} color={colors.primary} />
          </View>
          <Text style={styles.title}>Design Your Future</Text>
          <Text style={styles.description}>
            Wealth is a tool for your ambitions. Dream big and set your first financial goal,
            whether it's an emergency fund or a new endeavor.
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}
          >
            <MaterialIcons name="add" size={20} color={colors.onPrimary} />
            <Text style={styles.primaryBtnText}>Create Your First Goal</Text>
          </TouchableOpacity>
        </View>
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
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
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 60,
      gap: 32,
    },
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      borderRadius: 16,
      padding: 24,
      alignItems: 'center',
      shadowColor: colors.onSurface,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.02,
      shadowRadius: 12,
      elevation: 2,
    },
    iconCircle: {
      width: 140,
      height: 140,
      borderRadius: 70,
      backgroundColor: colors.surfaceContainerLow,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 24,
    },
    title: {
      ...typography.headlineMd,
      color: colors.onSurface,
      textAlign: 'center',
      marginBottom: 16,
    },
    description: {
      ...typography.bodyLg,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
      marginBottom: 24,
    },
    actionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 12,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: {
      ...typography.labelMd,
      color: colors.onPrimary,
    },
    secondaryBtn: {
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      borderColor: colors.outline,
      paddingHorizontal: 24,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryBtnText: {
      ...typography.labelMd,
      color: colors.onSurface,
    },
  });
  return styles;
};

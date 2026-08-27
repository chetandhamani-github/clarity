import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { Text, Button, Header } from '@/components/ui';
import { spacing, typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type TimeoutOption = 'immediate' | '1min' | '5min' | 'never';

import { useAppStore } from '@/store/use-app-store';

export default function SecurityPrivacyScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const biometricEnabled = useAppStore(state => state.biometricEnabled);
  const twoFaEnabled = useAppStore(state => state.twoFaEnabled);
  const timeoutSetting = useAppStore(state => state.timeoutSetting);
  const setBiometricEnabled = useAppStore(state => state.setBiometricEnabled);
  const setTwoFaEnabled = useAppStore(state => state.setTwoFaEnabled);
  const setTimeoutSetting = useAppStore(state => state.setTimeoutSetting);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header
        showBack
        title="Security & Privacy"
      />

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 60 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.introSection}>
          <Text style={styles.introText}>
            Manage your authentication methods and control how your data is handled within Clarity.
          </Text>
        </View>

        {/* Access Controls */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="lock" size={20} color={colors.outline} />
            <Text style={styles.sectionTitle}>Access Controls</Text>
          </View>

          <View style={styles.gridContainer}>
            {/* Biometric */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <View style={styles.iconBox}>
                    <MaterialIcons name="fingerprint" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.cardTextContent}>
                    <Text style={styles.cardTitle}>Biometric Unlock</Text>
                    <Text style={styles.cardSubtitle}>Use Face ID or Touch ID to log in.</Text>
                  </View>
                </View>
                <Switch
                  value={biometricEnabled}
                  onValueChange={setBiometricEnabled}
                  trackColor={{ false: colors.surfaceVariant, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>

            {/* 2FA */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <View style={styles.iconBox}>
                    <MaterialIcons name="phonelink-lock" size={20} color={colors.primary} />
                  </View>
                  <View style={styles.cardTextContent}>
                    <Text style={styles.cardTitle}>Two-Factor Auth</Text>
                    <Text style={styles.cardSubtitle}>Require a code for new devices.</Text>
                  </View>
                </View>
                <Switch
                  value={twoFaEnabled}
                  onValueChange={setTwoFaEnabled}
                  trackColor={{ false: colors.surfaceVariant, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>

            {/* App Timeout */}
            <View style={styles.cardFullWidth}>
              <View style={styles.timeoutHeaderRow}>
                <View style={styles.iconBox}>
                  <MaterialIcons name="timer" size={20} color={colors.primary} />
                </View>
                <View style={styles.cardTextContent}>
                  <Text style={styles.cardTitle}>Auto-Lock Timeout</Text>
                  <Text style={styles.cardSubtitle}>Time before requiring re-authentication.</Text>
                </View>
              </View>

              <View style={styles.radioGroupRow}>
                <TouchableOpacity
                  style={[
                    styles.radioPill,
                    timeoutSetting === 'immediate' && styles.radioPillActive,
                  ]}
                  onPress={() => setTimeoutSetting('immediate')}
                >
                  <Text
                    style={[
                      styles.radioPillText,
                      timeoutSetting === 'immediate' && styles.radioPillTextActive,
                    ]}
                  >
                    Immediate
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.radioPill, timeoutSetting === '1min' && styles.radioPillActive]}
                  onPress={() => setTimeoutSetting('1min')}
                >
                  <Text
                    style={[
                      styles.radioPillText,
                      timeoutSetting === '1min' && styles.radioPillTextActive,
                    ]}
                  >
                    1 Minute
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.radioPill, timeoutSetting === '5min' && styles.radioPillActive]}
                  onPress={() => setTimeoutSetting('5min')}
                >
                  <Text
                    style={[
                      styles.radioPillText,
                      timeoutSetting === '5min' && styles.radioPillTextActive,
                    ]}
                  >
                    5 Minutes
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.radioPill,
                    timeoutSetting === 'never' && styles.radioPillActive,
                    { opacity: 0.7 },
                  ]}
                  onPress={() => setTimeoutSetting('never')}
                >
                  <Text
                    style={[
                      styles.radioPillText,
                      timeoutSetting === 'never' && styles.radioPillTextActive,
                    ]}
                  >
                    Never (Not Recommended)
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* Data Privacy */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="data-usage" size={20} color={colors.outline} />
            <Text style={styles.sectionTitle}>Data Privacy</Text>
          </View>

          <View style={styles.listContainer}>
            {/* Linked Accounts */}
            <View style={styles.listItem}>
              <View style={styles.listItemTextContent}>
                <Text style={styles.cardTitle}>Third-Party Connections</Text>
                <Text style={styles.cardSubtitle}>
                  Manage banks and services linked to your account.
                </Text>
              </View>
              <TouchableOpacity style={styles.outlineBtn}>
                <Text style={styles.outlineBtnText}>Manage Links</Text>
              </TouchableOpacity>
            </View>

            {/* Download Data */}
            <View style={styles.listItem}>
              <View style={styles.listItemTextContent}>
                <Text style={styles.cardTitle}>Download Personal Data</Text>
                <Text style={styles.cardSubtitle}>
                  Get a complete archive of your transaction history and profile data.
                </Text>
              </View>
              <TouchableOpacity style={styles.textBtn}>
                <MaterialIcons name="download" size={18} color={colors.primary} />
                <Text style={styles.textBtnText}>Request Archive</Text>
              </TouchableOpacity>
            </View>

            {/* Delete Account */}
            <View
              style={[
                styles.listItem,
                styles.listItemNoBorder,
                { backgroundColor: colors.error + '0D' },
              ]}
            >
              <View style={styles.listItemTextContent}>
                <Text style={[styles.cardTitle, { color: colors.error }]}>Delete Account</Text>
                <Text style={styles.cardSubtitle}>
                  Permanently remove your account and all associated data.
                </Text>
              </View>
              <TouchableOpacity style={styles.errorBtn}>
                <Text style={styles.errorBtnText}>Delete Account</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Save Changes */}
        <View style={styles.footer}>
          <Button title="Save Changes" onPress={() => router.back()} style={styles.saveBtn} />
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

    scrollContent: {
      padding: 20,
      paddingBottom: 60,
      gap: 24,
    },
    introSection: {
      marginBottom: 8,
    },
    introText: {
      ...typography.bodyLg,
      color: colors.secondary,
    },
    section: {
      gap: 16,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sectionTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
    },
    gridContainer: {
      gap: 12,
    },
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: 12,
      padding: 20,
    },
    cardFullWidth: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: 12,
      padding: 20,
      gap: 16,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    cardHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
      paddingRight: 16,
    },
    timeoutHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    iconBox: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTextContent: {
      flex: 1,
    },
    cardTitle: {
      ...typography.headlineSm,
      fontSize: 18,
      color: colors.onSurface,
      marginBottom: 4,
    },
    cardSubtitle: {
      ...typography.bodyMd,
      color: colors.secondary,
    },
    radioGroupRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    radioPill: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      backgroundColor: 'transparent',
    },
    radioPillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    radioPillText: {
      ...typography.bodyMd,
      color: colors.onSurface,
    },
    radioPillTextActive: {
      color: colors.onPrimary,
    },
    listContainer: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: 12,
      overflow: 'hidden',
    },
    listItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceVariant,
      gap: 16,
    },
    listItemNoBorder: {
      borderBottomWidth: 0,
    },
    listItemTextContent: {
      flex: 1,
    },
    outlineBtn: {
      borderWidth: 1.5,
      borderColor: colors.onSurface,
      paddingHorizontal: 24,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: 'transparent',
    },
    outlineBtnText: {
      ...typography.labelMd,
      color: colors.onSurface,
    },
    textBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      height: 44,
    },
    textBtnText: {
      ...typography.labelMd,
      color: colors.primary,
    },
    errorBtn: {
      backgroundColor: colors.error,
      paddingHorizontal: 24,
      paddingVertical: 10,
      borderRadius: 8,
    },
    errorBtnText: {
      ...typography.labelMd,
      color: colors.onError,
    },
    footer: {
      marginTop: 16,
      alignItems: 'center',
    },
    saveBtn: {
      minWidth: 200,
      height: 48,
      borderRadius: 12,
      shadowColor: colors.onSurface,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 2,
    },
  });
  return styles;
};

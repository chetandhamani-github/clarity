import React from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { Text } from '@/components/ui';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme, typography, ThemeColors } from '@/theme';
import { useSafeInsets } from '@/hooks/use-safe-insets';

interface LegalModalProps {
  visible: boolean;
  type: 'privacy' | 'terms' | null;
  onClose: () => void;
}

export function LegalModal({ visible, type, onClose }: LegalModalProps) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeInsets();

  if (!visible || !type) return null;

  const isPrivacy = type === 'privacy';
  const title = isPrivacy ? 'Privacy Policy' : 'Terms of Service';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <MaterialIcons
              name={isPrivacy ? 'verified-user' : 'gavel'}
              size={24}
              color={colors.primary}
            />
            <Text style={styles.title}>{title}</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialIcons name="close" size={24} color={colors.onSurface} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView style={styles.content} contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 24 }]}>
          {isPrivacy ? (
            <View style={styles.bodySection}>
              <Text style={styles.effectiveDate}>Effective Date: November 2026</Text>

              <Text style={styles.heading}>1. 100% On-Device Processing</Text>
              <Text style={styles.paragraph}>
                Clarity is built with a privacy-first, on-device architecture. When you grant SMS permissions,
                all parsing, classification, categorization, and merchant extraction happen entirely on your
                device. None of your SMS texts, OTPs, or notifications are transmitted to any external server or API.
              </Text>

              <Text style={styles.heading}>2. Local Data Storage & Sandboxing</Text>
              <Text style={styles.paragraph}>
                All financial accounts, transactions, merchants, and custom categorization rules are persisted
                locally in an encrypted-at-rest SQLite database inside your operating system's protected application sandbox.
              </Text>

              <Text style={styles.heading}>3. Optional Google Drive Cloud Backups</Text>
              <Text style={styles.paragraph}>
                If you choose to enable cloud backups, backups are stored exclusively in your personal Google Drive's
                isolated Application Data Folder. Clarity cannot read or access any other files on your Google Drive,
                and no third-party servers mediate or store this data.
              </Text>

              <Text style={styles.heading}>4. Zero Advertising & No Third-Party Trackers</Text>
              <Text style={styles.paragraph}>
                Clarity does not contain third-party ad networks, telemetry surveillance, or data brokers.
                We do not sell, rent, monetize, or harvest user financial transactions or contact details under any circumstances.
              </Text>

              <Text style={styles.heading}>5. Complete User Data Ownership</Text>
              <Text style={styles.paragraph}>
                You retain complete control of your financial data. You can export all your accounts and transactions
                to CSV or PDF at any time, or permanently purge your local database using the "Reset App Data" option in Settings.
              </Text>
            </View>
          ) : (
            <View style={styles.bodySection}>
              <Text style={styles.effectiveDate}>Effective Date: November 2026</Text>

              <Text style={styles.heading}>1. Acceptance of Terms</Text>
              <Text style={styles.paragraph}>
                By installing, accessing, or using Clarity, you agree to these Terms of Service. If you do not agree
                with any portion of these terms, please discontinue use and uninstall the application.
              </Text>

              <Text style={styles.heading}>2. Personal Finance Utility</Text>
              <Text style={styles.paragraph}>
                Clarity is a personal finance bookkeeping and analysis tool. It is designed to assist you in tracking
                expenses and income. Clarity is not a banking institution, certified financial advisor, or tax consultancy.
              </Text>

              <Text style={styles.heading}>3. Information Accuracy</Text>
              <Text style={styles.paragraph}>
                While Clarity employs advanced deterministic parsing patterns to interpret financial alerts, SMS formats
                vary between financial institutions. You are encouraged to reconcile and verify transaction records against
                your official bank statements.
              </Text>

              <Text style={styles.heading}>4. Device Security & Account Safeguards</Text>
              <Text style={styles.paragraph}>
                Because Clarity operates on-device, security of your local data relies on your personal device security.
                We recommend securing your device with biometric authentication (Fingerprint or Face Unlock) and a strong device PIN.
              </Text>

              <Text style={styles.heading}>5. Modifications</Text>
              <Text style={styles.paragraph}>
                We may periodically update these terms to reflect feature changes or compliance standards. Continued use
                of Clarity constitutes acceptance of any revised terms.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineVariant,
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    title: {
      ...typography.headlineSm,
      color: colors.onSurface,
      fontWeight: '700',
    },
    content: {
      flex: 1,
    },
    contentContainer: {
      padding: 20,
      paddingBottom: 40,
    },
    bodySection: {
      gap: 16,
    },
    effectiveDate: {
      ...typography.labelMd,
      color: colors.primary,
      fontWeight: '600',
    },
    heading: {
      ...typography.bodyLg,
      color: colors.onSurface,
      fontWeight: '700',
      marginTop: 8,
    },
    paragraph: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      lineHeight: 22,
    },
  });


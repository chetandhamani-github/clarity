import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { useTheme, typography, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { parseVoiceTranscript, ParsedVoiceTransaction, UserAccountRef } from '@/services/voice/voice-parser';
import { getCurrencySymbol } from '@/utils/format';

interface VoiceTransactionModalProps {
  visible: boolean;
  onDismiss: () => void;
  onApply: (parsed: ParsedVoiceTransaction) => void;
  accounts: UserAccountRef[];
}

export function VoiceTransactionModal({
  visible,
  onDismiss,
  onApply,
  accounts,
}: VoiceTransactionModalProps) {
  const { colors } = useTheme();
  const styles = getStyles(colors);

  const [inputPhrase, setInputPhrase] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedResult, setParsedResult] = useState<ParsedVoiceTransaction | null>(null);

  const handleProcessPhrase = async (phraseToUse?: string) => {
    const text = (phraseToUse ?? inputPhrase).trim();
    if (!text || isProcessing) return;

    setIsProcessing(true);
    try {
      const result = await parseVoiceTranscript(text, accounts);
      setParsedResult(result);
    } catch {
      // Error handled gracefully
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApply = () => {
    if (parsedResult) {
      onApply(parsedResult);
      handleClose();
    }
  };

  const handleClose = () => {
    setInputPhrase('');
    setParsedResult(null);
    setIsProcessing(false);
    onDismiss();
  };

  const SAMPLE_PHRASES = [
    'Paid 350 for lunch at Subway with HDFC',
    'Chai and samosa 60 rupees cash',
    'Petrol 1500 using SBI card',
    'Got 45000 salary credited to ICICI',
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

        <View style={styles.sheetContainer}>
          <View style={styles.handleBar} />

          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleRow}>
              <View style={styles.micIconCircle}>
                <MaterialIcons name="mic" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.title}>Voice Transaction</Text>
                <Text style={styles.subtitle}>Speak or type in natural language</Text>
              </View>
            </View>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="close" size={22} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          </View>

          {/* Spoken/Typed Input Box */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Paid 350 for lunch at Subway with HDFC"
              placeholderTextColor={colors.outline}
              value={inputPhrase}
              onChangeText={(text) => {
                setInputPhrase(text);
                if (parsedResult) setParsedResult(null);
              }}
              multiline
              numberOfLines={2}
              returnKeyType="done"
              onSubmitEditing={() => handleProcessPhrase()}
            />
            {inputPhrase.trim().length > 0 && (
              <TouchableOpacity
                style={styles.parseBtn}
                onPress={() => handleProcessPhrase()}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialIcons name="arrow-forward" size={18} color="#fff" />
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Quick Example Chips */}
          {!parsedResult && (
            <View style={styles.samplesContainer}>
              <Text style={styles.samplesTitle}>Try saying or tapping:</Text>
              <View style={styles.chipsRow}>
                {SAMPLE_PHRASES.map((phrase, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.chip}
                    onPress={() => {
                      setInputPhrase(phrase);
                      handleProcessPhrase(phrase);
                    }}
                  >
                    <Text style={styles.chipText}>{phrase}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Parsed Result Card */}
          {parsedResult && (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <Text style={styles.resultHeaderTitle}>Extracted Details</Text>
                <View
                  style={[
                    styles.sourceBadge,
                    {
                      backgroundColor:
                        parsedResult.source === 'local'
                          ? colors.surfaceContainerHigh
                          : colors.primaryContainer,
                    },
                  ]}
                >
                  <MaterialIcons
                    name={parsedResult.source === 'local' ? 'offline-bolt' : 'cloud-done'}
                    size={12}
                    color={
                      parsedResult.source === 'local'
                        ? colors.onSurfaceVariant
                        : colors.onPrimaryContainer
                    }
                  />
                  <Text
                    style={[
                      styles.sourceBadgeText,
                      {
                        color:
                          parsedResult.source === 'local'
                            ? colors.onSurfaceVariant
                            : colors.onPrimaryContainer,
                      },
                    ]}
                  >
                    {parsedResult.source === 'local' ? 'On-Device (Offline)' : 'Privacy AI'}
                  </Text>
                </View>
              </View>

              <View style={styles.detailsGrid}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Merchant</Text>
                  <Text style={styles.detailValue} numberOfLines={1}>
                    {parsedResult.merchant || 'General'}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Amount</Text>
                  <Text style={[styles.detailValue, styles.amountHighlight]}>
                    {getCurrencySymbol()}
                    {parsedResult.amount.toFixed(2)}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Category</Text>
                  <Text style={styles.detailValue}>{parsedResult.category}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Type</Text>
                  <Text style={styles.detailValue}>
                    {parsedResult.type.charAt(0).toUpperCase() + parsedResult.type.slice(1)}
                  </Text>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => {
                    setParsedResult(null);
                    setInputPhrase('');
                  }}
                >
                  <Text style={styles.retryBtnText}>Clear</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.applyBtn} onPress={handleApply}>
                  <MaterialIcons name="check" size={18} color="#fff" />
                  <Text style={styles.applyBtnText}>Fill Transaction</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0, 0, 0, 0.45)',
    },
    backdrop: {
      flex: 1,
    },
    sheetContainer: {
      backgroundColor: colors.surfaceContainerLowest,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: Platform.OS === 'ios' ? 36 : 24,
      borderTopWidth: 1,
      borderTopColor: colors.outlineVariant,
    },
    handleBar: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.outlineVariant,
      alignSelf: 'center',
      marginBottom: 16,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    micIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      ...typography.headlineSm,
      color: colors.onSurface,
      fontWeight: '700',
    },
    subtitle: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      fontSize: 12,
      marginTop: 2,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      paddingHorizontal: 14,
      paddingVertical: 8,
      marginBottom: 16,
    },
    textInput: {
      flex: 1,
      ...typography.bodyMd,
      color: colors.onSurface,
      minHeight: 44,
      textAlignVertical: 'center',
    },
    parseBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 8,
    },
    samplesContainer: {
      marginBottom: 8,
    },
    samplesTitle: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      fontSize: 11,
      marginBottom: 8,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      backgroundColor: colors.surfaceContainerHigh,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.outlineVariant,
    },
    chipText: {
      ...typography.labelMd,
      fontSize: 12,
      color: colors.onSurface,
    },
    resultCard: {
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      marginTop: 4,
    },
    resultHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      paddingBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.outlineVariant,
    },
    resultHeaderTitle: {
      ...typography.bodyLg,
      color: colors.onSurface,
      fontWeight: '700',
    },
    sourceBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
    },
    sourceBadgeText: {
      ...typography.labelMd,
      fontSize: 10,
      fontWeight: '600',
    },
    detailsGrid: {
      gap: 8,
      marginBottom: 16,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    detailLabel: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      fontSize: 13,
    },
    detailValue: {
      ...typography.bodyMd,
      color: colors.onSurface,
      fontWeight: '600',
      fontSize: 13,
      maxWidth: '60%',
    },
    amountHighlight: {
      color: colors.primary,
      fontWeight: '700',
      fontSize: 15,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 12,
    },
    retryBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
    },
    retryBtnText: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      fontWeight: '600',
    },
    applyBtn: {
      flex: 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.primary,
    },
    applyBtnText: {
      ...typography.labelMd,
      color: '#fff',
      fontWeight: '700',
    },
  });
  return styles;
};

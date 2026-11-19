import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { Text, Header, useToast } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useRouter } from 'expo-router';
import { useAccounts } from '@/hooks/use-accounts';
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  parseBankStatementCsv,
  ParsedCsvTransaction,
} from '@/services/export/csv-parser-service';
import {
  parseBankStatementPdf,
  SUPPORTED_BANK_PROFILES,
  type BankProfile,
  type ParsedPdfTransaction,
} from '@/services/export/pdf-statement-parser';
import { getTransactions, insertTransaction } from '@/services/database/transaction-dao';
import { formatCurrency, formatDate } from '@/utils/format';
import { getCategoryIcon } from '@/utils/icons';

interface StatementItem {
  date: string;
  merchant: string;
  amount: number;
  type: 'expense' | 'income' | 'transfer';
  category: string;
  note: string;
}

export default function ImportStatementScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeInsets();
  const router = useRouter();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { accounts, isLoading: isLoadingAccounts } = useAccounts();

  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [parsedTransactions, setParsedTransactions] = useState<StatementItem[]>([]);
  const [newTransactions, setNewTransactions] = useState<StatementItem[]>([]);
  const [duplicateCount, setDuplicateCount] = useState<number>(0);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // PDF password unlocking states
  const [pendingPdfUri, setPendingPdfUri] = useState<string | null>(null);
  const [pdfPasswordModalVisible, setPdfPasswordModalVisible] = useState(false);
  const [pdfPassword, setPdfPassword] = useState('');
  const [showPdfPassword, setShowPdfPassword] = useState(false);
  const [selectedBankProfile, setSelectedBankProfile] = useState<BankProfile>(
    SUPPORTED_BANK_PROFILES[0]
  );
  const [selectedTxIndexes, setSelectedTxIndexes] = useState<Set<number>>(new Set());

  // Set default account when accounts load
  React.useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId),
    [accounts, selectedAccountId]
  );

  const processTransactionsDeduplication = async (
    rawTransactions: (ParsedCsvTransaction | ParsedPdfTransaction)[]
  ) => {
    const transactionsToProcess: StatementItem[] = rawTransactions.map((tx) => ({
      date: tx.date,
      merchant: tx.merchant,
      amount: tx.amount,
      type: tx.type,
      category: tx.category,
      note: tx.note || '',
    }));
    setParsedTransactions(transactionsToProcess);

    const existing = await getTransactions({ accountId: selectedAccountId });
    const nonDuplicates: StatementItem[] = [];
    let duplicates = 0;
    const matchedExistingIds = new Set<string>();

    for (const tx of transactionsToProcess) {
      const txMerchantNorm = (tx.merchant || '').trim().toLowerCase();

      const matchedItem = existing.find(
        (e) =>
          !matchedExistingIds.has(e.id) &&
          e.date === tx.date &&
          Math.abs(e.amount - tx.amount) < 0.01 &&
          e.type === tx.type &&
          (!e.merchant || !txMerchantNorm || e.merchant.trim().toLowerCase() === txMerchantNorm)
      );

      if (matchedItem) {
        matchedExistingIds.add(matchedItem.id);
        duplicates++;
      } else {
        nonDuplicates.push(tx);
      }
    }

    setNewTransactions(nonDuplicates);
    setSelectedTxIndexes(new Set(nonDuplicates.map((_, i) => i)));
    setDuplicateCount(duplicates);
    setIsParsing(false);
    showToast(`Parsed ${transactionsToProcess.length} transactions`, 'info');
  };

  const handlePickDocument = async () => {
    if (!selectedAccountId) {
      showToast('Please select a target account first', 'error');
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'application/pdf',
          'text/comma-separated-values',
          'application/vnd.ms-excel',
          '*/*',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      setFileName(asset.name);
      setIsParsing(true);

      const isPdf =
        asset.name.toLowerCase().endsWith('.pdf') || asset.mimeType === 'application/pdf';

      if (isPdf) {
        const pdfResult = await parseBankStatementPdf(asset.uri);
        if (pdfResult.isEncrypted) {
          setPendingPdfUri(asset.uri);
          setPdfPasswordModalVisible(true);
          setIsParsing(false);
          return;
        }

        if (pdfResult.transactions.length === 0) {
          showToast(
            pdfResult.errors[0] || 'No transactions could be parsed from this PDF',
            'error'
          );
          setIsParsing(false);
          return;
        }

        await processTransactionsDeduplication(pdfResult.transactions);
      } else {
        const fileContent = await FileSystem.readAsStringAsync(asset.uri);
        const parseResult = parseBankStatementCsv(fileContent);

        if (parseResult.transactions.length === 0) {
          showToast(
            parseResult.errors[0] || 'No transactions could be parsed from this file',
            'error'
          );
          setIsParsing(false);
          return;
        }

        await processTransactionsDeduplication(parseResult.transactions);
      }
    } catch (err: unknown) {
      setIsParsing(false);
      showToast(err instanceof Error ? err.message : 'Failed to read file', 'error');
    }
  };

  const handleUnlockPdf = async () => {
    if (!pendingPdfUri) return;
    setIsParsing(true);
    try {
      const pdfResult = await parseBankStatementPdf(pendingPdfUri, { password: pdfPassword });
      if (pdfResult.isEncrypted && pdfResult.transactions.length === 0) {
        showToast('Incorrect password. Please try again.', 'error');
        setIsParsing(false);
        return;
      }
      if (pdfResult.transactions.length === 0) {
        showToast(pdfResult.errors[0] || 'No transactions found in this statement', 'error');
        setIsParsing(false);
        return;
      }

      setPdfPasswordModalVisible(false);
      setPdfPassword('');
      await processTransactionsDeduplication(pdfResult.transactions);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to unlock PDF', 'error');
    } finally {
      setIsParsing(false);
    }
  };

  const toggleSelectTx = (index: number) => {
    setSelectedTxIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleImport = async () => {
    if (!selectedAccountId || newTransactions.length === 0) return;

    const txsToImport = newTransactions.filter((_, i) => selectedTxIndexes.has(i));
    if (txsToImport.length === 0) {
      showToast('Please select at least one transaction to import', 'error');
      return;
    }

    setIsImporting(true);
    try {
      for (const tx of txsToImport) {
        await insertTransaction({
          accountId: selectedAccountId,
          amount: tx.amount,
          type: tx.type,
          merchant: tx.merchant,
          category: tx.category,
          date: tx.date,
          isRecurring: false,
          note: tx.note,
          source: 'MANUAL',
          status: 'VERIFIED',
        });
      }

      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['categorySpending'] });
      queryClient.invalidateQueries({ queryKey: ['budgetPlan'] });

      showToast(
        `Imported ${txsToImport.length} transactions into ${selectedAccount?.name || 'account'}`,
        'success'
      );
      router.back();
    } catch (err: unknown) {
      setIsImporting(false);
      showToast(err instanceof Error ? err.message : 'Import failed', 'error');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Header title="Import Statement" showBack />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 64 }]}>
        {/* Step 1: Select Target Account */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Target Account</Text>
          <Text style={styles.sectionSub}>
            Transactions in the CSV will be imported into this account.
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountChips}>
            {accounts.map((acc) => {
              const isSelected = selectedAccountId === acc.id;
              return (
                <TouchableOpacity
                  key={acc.id}
                  style={[styles.accountChip, isSelected && styles.accountChipSelected]}
                  onPress={() => {
                    setSelectedAccountId(acc.id);
                    // Reset parsed preview if account changed
                    setParsedTransactions([]);
                    setNewTransactions([]);
                  }}
                >
                  <MaterialIcons
                    name="account-balance"
                    size={16}
                    color={isSelected ? colors.onPrimaryContainer : colors.onSurfaceVariant}
                  />
                  <Text style={[styles.accountChipText, isSelected && styles.accountChipTextSelected]}>
                    {acc.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Step 2: Upload File (PDF or CSV) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Select Statement File</Text>
          <Text style={styles.sectionSub}>
            Supported formats: PDF statements (including password-protected e-statements) or standard CSV statements.
          </Text>

          <TouchableOpacity
            style={styles.uploadCard}
            onPress={handlePickDocument}
            disabled={isParsing || isImporting}
          >
            {isParsing ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <View style={styles.uploadContent}>
                <View style={styles.uploadIconBox}>
                  <MaterialIcons name="upload-file" size={32} color={colors.onPrimaryContainer} />
                </View>
                <Text style={styles.uploadTitle}>
                  {fileName ? fileName : 'Tap to select PDF or CSV statement'}
                </Text>
                <Text style={styles.uploadSub}>
                  {fileName ? 'Tap to choose a different file' : 'Browse files on device'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Step 3: Preview & Confirm */}
        {parsedTransactions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3. Preview & Deduplication</Text>

            {/* Stats row */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Total Found</Text>
                <Text style={styles.statValue}>{parsedTransactions.length}</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>New Entries</Text>
                <Text style={[styles.statValue, { color: colors.primary }]}>
                  {newTransactions.length}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Duplicates Skipped</Text>
                <Text style={[styles.statValue, { color: colors.outline }]}>
                  {duplicateCount}
                </Text>
              </View>
            </View>

            {/* Preview list with toggle selection */}
            <View style={styles.previewCard}>
              <View style={styles.previewHeader}>
                <Text style={styles.previewTitle}>
                  New Transactions ({selectedTxIndexes.size} of {newTransactions.length} Selected)
                </Text>
              </View>
              {newTransactions.slice(0, 10).map((tx, idx) => {
                const isExpense = tx.type === 'expense';
                const isSelected = selectedTxIndexes.has(idx);
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.previewItem, !isSelected && { opacity: 0.5 }]}
                    onPress={() => toggleSelectTx(idx)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.previewCheckbox}>
                      <MaterialIcons
                        name={isSelected ? 'check-box' : 'check-box-outline-blank'}
                        size={20}
                        color={isSelected ? colors.primary : colors.outline}
                      />
                    </View>
                    <View style={styles.previewIconBox}>
                      <MaterialIcons
                        name={getCategoryIcon(tx.category)}
                        size={18}
                        color={colors.onSurfaceVariant}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.previewMerchant} numberOfLines={1}>
                        {tx.merchant}
                      </Text>
                      <Text style={styles.previewMeta}>
                        {formatDate(tx.date, 'short')} • {tx.category}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.previewAmount,
                        { color: isExpense ? colors.error : colors.primary },
                      ]}
                    >
                      {isExpense ? '-' : '+'}
                      {formatCurrency(tx.amount)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {newTransactions.length > 10 && (
                <View style={{ paddingVertical: 10, alignItems: 'center' }}>
                  <Text style={styles.previewMeta}>
                    +{newTransactions.length - 10} more transactions to import
                  </Text>
                </View>
              )}
            </View>

            {/* Import Button */}
            <TouchableOpacity
              style={[
                styles.importBtn,
                (selectedTxIndexes.size === 0 || isImporting) && { opacity: 0.5 },
              ]}
              onPress={handleImport}
              disabled={selectedTxIndexes.size === 0 || isImporting}
            >
              {isImporting ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Text style={styles.importBtnText}>
                  {selectedTxIndexes.size > 0
                    ? `Import ${selectedTxIndexes.size} Transactions`
                    : 'No Transactions Selected'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Password Prompt Modal for Encrypted PDFs */}
      <Modal
        visible={pdfPasswordModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPdfPasswordModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconBox}>
                <MaterialIcons name="lock-outline" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Password Protected PDF</Text>
                <Text style={styles.modalSub}>This bank statement is encrypted with a password.</Text>
              </View>
              <TouchableOpacity
                onPress={() => setPdfPasswordModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={24} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            {/* Bank Format Hints */}
            <Text style={styles.fieldLabel}>Select Bank for Password Hint</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.bankChips}
            >
              {SUPPORTED_BANK_PROFILES.map((profile) => {
                const isSelected = selectedBankProfile.id === profile.id;
                return (
                  <TouchableOpacity
                    key={profile.id}
                    style={[styles.bankChip, isSelected && styles.bankChipSelected]}
                    onPress={() => setSelectedBankProfile(profile)}
                  >
                    <Text
                      style={[
                        styles.bankChipText,
                        isSelected && styles.bankChipTextSelected,
                      ]}
                    >
                      {profile.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Password Hint Card */}
            <View style={styles.hintCard}>
              <MaterialIcons name="info-outline" size={16} color={colors.primary} />
              <Text style={styles.hintText}>{selectedBankProfile.passwordHint}</Text>
            </View>

            {/* Password Input */}
            <View style={styles.passwordInputWrapper}>
              <MaterialIcons
                name="vpn-key"
                size={20}
                color={colors.onSurfaceVariant}
                style={{ marginRight: 8 }}
              />
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter statement password"
                placeholderTextColor={colors.outline}
                value={pdfPassword}
                onChangeText={setPdfPassword}
                secureTextEntry={!showPdfPassword}
                autoFocus={true}
                onSubmitEditing={handleUnlockPdf}
              />
              <TouchableOpacity
                onPress={() => setShowPdfPassword(!showPdfPassword)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons
                  name={showPdfPassword ? 'visibility-off' : 'visibility'}
                  size={20}
                  color={colors.onSurfaceVariant}
                />
              </TouchableOpacity>
            </View>

            {/* Action Buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setPdfPasswordModalVisible(false);
                  setPdfPassword('');
                }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.unlockBtn,
                  (!pdfPassword.trim() || isParsing) && { opacity: 0.5 },
                ]}
                onPress={handleUnlockPdf}
                disabled={!pdfPassword.trim() || isParsing}
              >
                {isParsing ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Text style={styles.unlockBtnText}>Unlock & Parse</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 20,
      gap: 28,
    },
    section: {
      gap: 12,
    },
    sectionTitle: {
      ...typography.labelMd,
      color: colors.onSurface,
      fontWeight: '700',
      fontSize: 16,
    },
    sectionSub: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      fontSize: 13,
      lineHeight: 18,
    },
    accountChips: {
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 4,
    },
    accountChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    accountChipSelected: {
      backgroundColor: colors.primaryContainer,
      borderColor: colors.primary,
    },
    accountChipText: {
      ...typography.bodyMd,
      fontSize: 13,
      color: colors.onSurfaceVariant,
      fontWeight: '500',
    },
    accountChipTextSelected: {
      color: colors.onPrimaryContainer,
      fontWeight: '700',
    },
    uploadCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: colors.primary,
      borderStyle: 'dashed',
      padding: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    uploadContent: {
      alignItems: 'center',
      gap: 8,
    },
    uploadIconBox: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    uploadTitle: {
      ...typography.headlineSm,
      fontSize: 15,
      color: colors.onSurface,
      fontWeight: '700',
      textAlign: 'center',
    },
    uploadSub: {
      ...typography.bodyMd,
      fontSize: 13,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
    },
    statsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.surfaceContainer,
      borderRadius: 12,
      padding: 12,
      gap: 4,
      alignItems: 'center',
    },
    statLabel: {
      ...typography.bodyMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
    },
    statValue: {
      ...typography.headlineSm,
      fontSize: 18,
      fontWeight: '700',
      color: colors.onSurface,
    },
    previewCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      overflow: 'hidden',
    },
    previewHeader: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.surfaceVariant,
    },
    previewTitle: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      fontWeight: '600',
      fontSize: 12,
    },
    previewItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.surfaceVariant,
      gap: 12,
    },
    previewIconBox: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    previewMerchant: {
      ...typography.bodyMd,
      fontWeight: '600',
      color: colors.onSurface,
    },
    previewMeta: {
      ...typography.bodyMd,
      fontSize: 12,
      color: colors.onSurfaceVariant,
    },
    previewAmount: {
      ...typography.bodyLg,
      fontWeight: '700',
      fontSize: 14,
    },
    importBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    importBtnText: {
      ...typography.labelMd,
      color: colors.onPrimary,
      fontWeight: '700',
      fontSize: 15,
    },
    previewCheckbox: {
      marginRight: -4,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: colors.surfaceContainerLowest,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      gap: 14,
      maxHeight: '85%',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    modalIconBox: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
      fontSize: 17,
      fontWeight: '700',
    },
    modalSub: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      fontSize: 12,
      marginTop: 2,
    },
    fieldLabel: {
      ...typography.labelMd,
      color: colors.onSurface,
      fontSize: 13,
      fontWeight: '600',
      marginTop: 4,
    },
    bankChips: {
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 2,
    },
    bankChip: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
    },
    bankChipSelected: {
      backgroundColor: colors.primaryContainer,
      borderColor: colors.primary,
    },
    bankChipText: {
      ...typography.labelMd,
      fontSize: 12,
      color: colors.onSurfaceVariant,
    },
    bankChipTextSelected: {
      color: colors.onPrimaryContainer,
      fontWeight: '700',
    },
    hintCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 10,
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
    },
    hintText: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      fontSize: 12,
      flex: 1,
    },
    passwordInputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainer,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      paddingHorizontal: 14,
      height: 48,
    },
    passwordInput: {
      flex: 1,
      ...typography.bodyLg,
      fontSize: 14,
      color: colors.onSurface,
    },
    modalActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
    },
    cancelBtn: {
      flex: 1,
      height: 46,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainer,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    cancelBtnText: {
      ...typography.labelMd,
      color: colors.onSurface,
      fontWeight: '600',
    },
    unlockBtn: {
      flex: 1.5,
      height: 46,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    unlockBtnText: {
      ...typography.labelMd,
      color: colors.onPrimary,
      fontWeight: '700',
    },
  });
  return styles;
};

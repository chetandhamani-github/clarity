import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Text, Header, useToast } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAccounts } from '@/hooks/use-accounts';
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  parseBankStatementCsv,
  ParsedCsvTransaction,
} from '@/services/export/csv-parser-service';
import { getTransactions, insertTransaction } from '@/services/database/transaction-dao';
import { formatCurrency, formatDate } from '@/utils/format';
import { getCategoryIcon } from '@/utils/icons';

export default function ImportStatementScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { accounts, isLoading: isLoadingAccounts } = useAccounts();

  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [parsedTransactions, setParsedTransactions] = useState<ParsedCsvTransaction[]>([]);
  const [newTransactions, setNewTransactions] = useState<ParsedCsvTransaction[]>([]);
  const [duplicateCount, setDuplicateCount] = useState<number>(0);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

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

  const handlePickDocument = async () => {
    if (!selectedAccountId) {
      showToast('Please select a target account first', 'error');
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      setFileName(asset.name);
      setIsParsing(true);

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

      setParsedTransactions(parseResult.transactions);

      // Check existing transactions for frequency-aware and merchant-matched deduplication
      const existing = await getTransactions({ accountId: selectedAccountId });
      const nonDuplicates: ParsedCsvTransaction[] = [];
      let duplicates = 0;
      const matchedExistingIds = new Set<string>();

      for (const tx of parseResult.transactions) {
        const txMerchantNorm = (tx.merchant || '').trim().toLowerCase();

        // Match against existing transactions, consuming each match only once
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
      setDuplicateCount(duplicates);
      setIsParsing(false);
      showToast(`Parsed ${parseResult.transactions.length} transactions`, 'info');
    } catch (err: unknown) {
      setIsParsing(false);
      showToast(err instanceof Error ? err.message : 'Failed to read file', 'error');
    }
  };

  const handleImport = async () => {
    if (!selectedAccountId || newTransactions.length === 0) return;

    setIsImporting(true);
    try {
      for (const tx of newTransactions) {
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
        `Imported ${newTransactions.length} transactions into ${selectedAccount?.name || 'account'}`,
        'success'
      );
      router.back();
    } catch (err: unknown) {
      setIsImporting(false);
      showToast(err instanceof Error ? err.message : 'Import failed', 'error');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header title="Import Statement" showBack />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
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

        {/* Step 2: Upload CSV File */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Select Statement File</Text>
          <Text style={styles.sectionSub}>
            Supported formats: HDFC, ICICI, SBI, Axis, or standard CSV statements.
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
                  <MaterialIcons name="upload-file" size={32} color={colors.primary} />
                </View>
                <Text style={styles.uploadTitle}>
                  {fileName ? fileName : 'Tap to select CSV statement'}
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

            {/* Preview sample */}
            <View style={styles.previewCard}>
              <View style={styles.previewHeader}>
                <Text style={styles.previewTitle}>Transaction Preview (First 5)</Text>
              </View>
              {parsedTransactions.slice(0, 5).map((tx, idx) => {
                const isExpense = tx.type === 'expense';
                return (
                  <View key={idx} style={styles.previewItem}>
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
                  </View>
                );
              })}
            </View>

            {/* Import Button */}
            <TouchableOpacity
              style={[
                styles.importBtn,
                (newTransactions.length === 0 || isImporting) && { opacity: 0.5 },
              ]}
              onPress={handleImport}
              disabled={newTransactions.length === 0 || isImporting}
            >
              {isImporting ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Text style={styles.importBtnText}>
                  {newTransactions.length > 0
                    ? `Import ${newTransactions.length} Transactions`
                    : 'All Transactions Already Exist'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: ThemeColors) =>
  StyleSheet.create({
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
  });

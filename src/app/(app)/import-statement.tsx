import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Text, Header, useToast } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAccounts } from '@/hooks/use-accounts';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateAnalyticsAndHealthQueries } from '@/hooks/use-financial-health';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  parseBankStatementCsv,
  type ParsedCsvTransaction,
} from '@/services/export/csv-parser-service';
import {
  parseBankStatementPdf,
  SUPPORTED_BANK_PROFILES,
  type BankProfile,
  type ParsedPdfTransaction,
} from '@/services/export/pdf-statement-parser';
import {
  deduplicateStatementTransactions,
  getStatementFileKind,
  inferBankProfileForAccount,
  isLiabilityAccountType,
  supportsStatementImport,
  type StatementImportItem,
} from '@/services/export/statement-import-helpers';
import { getTransactions, insertTransaction } from '@/services/database/transaction-dao';
import { updateAccountBalance } from '@/services/database/account-dao';
import { queueAutoBackup } from '@/services/cloud/google-drive-service';
import { ACCOUNT_TYPES } from '@/types';
import { formatCurrency, formatDate } from '@/utils/format';
import { getAccountTypeIcon, getBankBranding, getCategoryIcon } from '@/utils/icons';

const PREVIEW_COLLAPSED_COUNT = 15;

function mapParsedTransactions(
  rawTransactions: (ParsedCsvTransaction | ParsedPdfTransaction)[]
): StatementImportItem[] {
  return rawTransactions.map((tx) => ({
    date: tx.date,
    merchant: tx.merchant,
    amount: tx.amount,
    type: tx.type,
    category: tx.category,
    note: tx.note || '',
  }));
}

export default function ImportStatementScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ accountId?: string }>();
  const rawAccountId = params.accountId;
  const routeAccountId = Array.isArray(rawAccountId) ? rawAccountId[0] : rawAccountId;

  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { accounts, isLoading: isLoadingAccounts } = useAccounts();

  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [showAccountChips, setShowAccountChips] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedTransactions, setParsedTransactions] = useState<StatementImportItem[]>([]);
  const [newTransactions, setNewTransactions] = useState<StatementImportItem[]>([]);
  const [statementBalance, setStatementBalance] = useState<number | null>(null);
  const [statementDate, setStatementDate] = useState<string | null>(null);
  const [applyStatementBalance, setApplyStatementBalance] = useState<boolean>(true);
  const [duplicateCount, setDuplicateCount] = useState<number>(0);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showAllPreview, setShowAllPreview] = useState(false);

  // PDF password unlocking states
  const [pendingPdfUri, setPendingPdfUri] = useState<string | null>(null);
  const [pdfPasswordModalVisible, setPdfPasswordModalVisible] = useState(false);
  const [pdfPassword, setPdfPassword] = useState('');
  const [pdfModalError, setPdfModalError] = useState<string | null>(null);
  const [showPdfPassword, setShowPdfPassword] = useState(false);
  const [selectedBankProfile, setSelectedBankProfile] = useState<BankProfile>(
    SUPPORTED_BANK_PROFILES[0]
  );
  const [selectedTxIndexes, setSelectedTxIndexes] = useState<Set<number>>(new Set());

  const lastAppliedRouteAccountIdRef = useRef<string | undefined>(undefined);
  const parseRunIdRef = useRef(0);

  const orderedAccounts = useMemo(() => {
    const eligible = accounts.filter((acc) => supportsStatementImport(acc.type));
    const others = accounts.filter((acc) => !supportsStatementImport(acc.type));
    return [...eligible, ...others];
  }, [accounts]);

  const selectedAccount = useMemo(
    () => accounts.find((acc) => acc.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId]
  );

  const clearPreviewResults = useCallback(() => {
    setParsedTransactions([]);
    setNewTransactions([]);
    setStatementBalance(null);
    setStatementDate(null);
    setApplyStatementBalance(true);
    setDuplicateCount(0);
    setSelectedTxIndexes(new Set());
    setShowAllPreview(false);
  }, []);

  const closePasswordModal = useCallback(() => {
    setPdfPasswordModalVisible(false);
    setPdfPassword('');
    setPdfModalError(null);
    setPendingPdfUri(null);
  }, []);

  const resetParsedState = useCallback(() => {
    parseRunIdRef.current += 1;
    setFileName('');
    setParseError(null);
    clearPreviewResults();
    closePasswordModal();
    setIsParsing(false);
  }, [clearPreviewResults, closePasswordModal]);

  useEffect(() => {
    if (accounts.length === 0) return;

    if (routeAccountId && accounts.some((acc) => acc.id === routeAccountId)) {
      if (lastAppliedRouteAccountIdRef.current !== routeAccountId) {
        lastAppliedRouteAccountIdRef.current = routeAccountId;
        setSelectedAccountId(routeAccountId);
        setShowAccountChips(false);
        resetParsedState();
      }
      return;
    }

    if (!routeAccountId && lastAppliedRouteAccountIdRef.current !== undefined) {
      lastAppliedRouteAccountIdRef.current = undefined;
    }

    if (!selectedAccountId || !accounts.some((acc) => acc.id === selectedAccountId)) {
      const preferred = orderedAccounts[0] ?? accounts[0];
      setSelectedAccountId(preferred.id);
    }
  }, [accounts, orderedAccounts, routeAccountId, selectedAccountId, resetParsedState]);

  useEffect(() => {
    if (selectedAccount) {
      setSelectedBankProfile(
        inferBankProfileForAccount(selectedAccount.institution, selectedAccount.name)
      );
    }
  }, [selectedAccount]);

  const applyParsedStatement = async (
    items: StatementImportItem[],
    targetAccountId: string,
    extractedBalance?: number,
    extractedDate?: string,
    runId?: number
  ) => {
    const existing = await getTransactions({ accountId: targetAccountId });
    if (runId !== undefined && parseRunIdRef.current !== runId) {
      return;
    }

    const targetAccount = accounts.find((acc) => acc.id === targetAccountId);
    const { newTransactions: nonDuplicates, duplicateCount: duplicates } =
      deduplicateStatementTransactions(items, existing);

    if (extractedBalance !== undefined && extractedBalance !== null) {
      setStatementBalance(extractedBalance);
      setStatementDate(extractedDate || null);
      const isLiability = isLiabilityAccountType(targetAccount?.type);
      setApplyStatementBalance(!(isLiability && extractedBalance > 0));
    } else {
      setStatementBalance(null);
      setStatementDate(null);
      setApplyStatementBalance(false);
    }

    setParsedTransactions(items);
    setNewTransactions(nonDuplicates);
    setSelectedTxIndexes(new Set(nonDuplicates.map((_, idx) => idx)));
    setDuplicateCount(duplicates);
    setShowAllPreview(false);
    setParseError(null);
    setIsParsing(false);
    showToast(`Parsed ${items.length} transaction${items.length === 1 ? '' : 's'}`, 'info');
  };

  const handleSelectAccount = async (accountId: string) => {
    if (accountId === selectedAccountId || isParsing || isImporting) return;
    setSelectedAccountId(accountId);
    setParseError(null);
    closePasswordModal();

    if (parsedTransactions.length > 0) {
      const runId = ++parseRunIdRef.current;
      setIsParsing(true);
      try {
        await applyParsedStatement(
          parsedTransactions,
          accountId,
          statementBalance ?? undefined,
          statementDate ?? undefined,
          runId
        );
      } catch (err: unknown) {
        if (parseRunIdRef.current === runId) {
          setIsParsing(false);
          showToast(
            err instanceof Error ? err.message : 'Failed to match transactions for account',
            'error'
          );
        }
      }
    }
  };

  const handlePickDocument = async () => {
    if (isParsing || isImporting) return;
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
      const fileKind = getStatementFileKind(asset.name, asset.mimeType);
      const runId = ++parseRunIdRef.current;
      const targetAccountId = selectedAccountId;

      setFileName(asset.name);
      setParseError(null);
      clearPreviewResults();
      closePasswordModal();

      if (fileKind === 'unsupported') {
        const message = 'Unsupported file format. Please choose a PDF or CSV bank statement.';
        setParseError(message);
        showToast(message, 'error');
        return;
      }

      setIsParsing(true);

      if (fileKind === 'pdf') {
        const pdfResult = await parseBankStatementPdf(asset.uri);
        if (parseRunIdRef.current !== runId) return;

        if (pdfResult.isEncrypted) {
          setPendingPdfUri(asset.uri);
          setPdfPassword('');
          setPdfModalError(null);
          setPdfPasswordModalVisible(true);
          setIsParsing(false);
          return;
        }

        if (pdfResult.transactions.length === 0) {
          const message =
            pdfResult.errors[0] || 'No transactions could be parsed from this PDF statement.';
          clearPreviewResults();
          setParseError(message);
          setIsParsing(false);
          showToast(message, 'error');
          return;
        }

        await applyParsedStatement(
          mapParsedTransactions(pdfResult.transactions),
          targetAccountId,
          pdfResult.closingBalance,
          pdfResult.statementDate,
          runId
        );
      } else {
        const fileContent = await FileSystem.readAsStringAsync(asset.uri);
        if (parseRunIdRef.current !== runId) return;

        const parseResult = parseBankStatementCsv(fileContent);

        if (parseResult.transactions.length === 0) {
          const message =
            parseResult.errors[0] || 'No transactions could be parsed from this CSV file.';
          clearPreviewResults();
          setParseError(message);
          setIsParsing(false);
          showToast(message, 'error');
          return;
        }

        await applyParsedStatement(
          mapParsedTransactions(parseResult.transactions),
          targetAccountId,
          parseResult.closingBalance,
          parseResult.statementDate,
          runId
        );
      }
    } catch (err: unknown) {
      setIsParsing(false);
      const message = err instanceof Error ? err.message : 'Failed to read statement file.';
      setParseError(message);
      showToast(message, 'error');
    }
  };

  const handleUnlockPdf = async () => {
    if (!pendingPdfUri || !selectedAccountId || isParsing) return;
    const runId = ++parseRunIdRef.current;
    const targetAccountId = selectedAccountId;
    setIsParsing(true);
    setPdfModalError(null);

    try {
      const pdfResult = await parseBankStatementPdf(pendingPdfUri, { password: pdfPassword });
      if (parseRunIdRef.current !== runId) return;

      if (pdfResult.isEncrypted && pdfResult.transactions.length === 0) {
        const message =
          pdfResult.errors[0] ||
          'Incorrect password or unable to decrypt this bank statement format.';
        setPdfModalError(message);
        setIsParsing(false);
        return;
      }

      if (pdfResult.transactions.length === 0) {
        const message =
          pdfResult.errors[0] || 'No transactions found in this unlocked statement.';
        setPdfModalError(message);
        setIsParsing(false);
        return;
      }

      closePasswordModal();
      await applyParsedStatement(
        mapParsedTransactions(pdfResult.transactions),
        targetAccountId,
        pdfResult.closingBalance,
        pdfResult.statementDate,
        runId
      );
    } catch (err: unknown) {
      if (parseRunIdRef.current === runId) {
        setIsParsing(false);
        setPdfModalError(err instanceof Error ? err.message : 'Failed to unlock PDF.');
      }
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

  const allSelected =
    newTransactions.length > 0 && selectedTxIndexes.size === newTransactions.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedTxIndexes(new Set());
    } else {
      setSelectedTxIndexes(new Set(newTransactions.map((_, idx) => idx)));
    }
  };

  const canApplyBalanceOnly =
    statementBalance !== null && applyStatementBalance && selectedTxIndexes.size === 0;
  const canSubmitImport =
    Boolean(selectedAccountId) &&
    !isImporting &&
    (selectedTxIndexes.size > 0 || canApplyBalanceOnly);

  const handleImport = async () => {
    if (!selectedAccountId || isImporting) return;

    const txsToImport = newTransactions.filter((_, idx) => selectedTxIndexes.has(idx));
    const shouldSyncBalance = statementBalance !== null && applyStatementBalance;

    if (txsToImport.length === 0 && !shouldSyncBalance) {
      showToast('Select at least one transaction or enable balance sync to continue', 'error');
      return;
    }

    setIsImporting(true);
    try {
      const shouldUpdateBalancePerTx = statementBalance === null || !applyStatementBalance;

      for (const tx of txsToImport) {
        await insertTransaction(
          {
            accountId: selectedAccountId,
            amount: tx.amount,
            type: tx.type,
            merchant: tx.merchant,
            category: tx.category,
            date: tx.date,
            isRecurring: false,
            note: tx.note,
            source: 'STATEMENT',
            status: 'VERIFIED',
          },
          { updateAccountBalance: shouldUpdateBalancePerTx }
        );
      }

      if (shouldSyncBalance && statementBalance !== null) {
        await updateAccountBalance(selectedAccountId, statementBalance);
      }

      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['categorySpending'] });
      queryClient.invalidateQueries({ queryKey: ['budgetPlan'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
      invalidateAnalyticsAndHealthQueries(queryClient);
      queueAutoBackup('import-statement');

      if (txsToImport.length > 0) {
        showToast(
          `Imported ${txsToImport.length} transaction${txsToImport.length === 1 ? '' : 's'} into ${selectedAccount?.name || 'account'}`,
          'success'
        );
      } else if (statementBalance !== null) {
        showToast(
          `Updated ${selectedAccount?.name || 'account'} balance to ${formatCurrency(statementBalance)}`,
          'success'
        );
      }

      if (router.canGoBack()) {
        router.back();
      } else {
        router.navigate('/(app)/(tabs)/accounts');
      }
    } catch (err: unknown) {
      setIsImporting(false);
      showToast(err instanceof Error ? err.message : 'Import failed', 'error');
    }
  };

  const selectedAccountBranding = selectedAccount
    ? getBankBranding(selectedAccount.institution || selectedAccount.name)
    : null;
  const selectedAccountTypeLabel = selectedAccount
    ? ACCOUNT_TYPES.find((t) => t.value === selectedAccount.type)?.label ?? selectedAccount.type
    : '';
  const hasRouteAccountParam = Boolean(
    routeAccountId && accounts.some((acc) => acc.id === routeAccountId)
  );
  const isSelectedAccountLiability = isLiabilityAccountType(selectedAccount?.type);
  const visibleNewTransactions = showAllPreview
    ? newTransactions
    : newTransactions.slice(0, PREVIEW_COLLAPSED_COUNT);

  const importButtonLabel =
    selectedTxIndexes.size > 0
      ? `Import ${selectedTxIndexes.size} Transaction${selectedTxIndexes.size === 1 ? '' : 's'}`
      : canApplyBalanceOnly && statementBalance !== null
      ? `Update Balance to ${formatCurrency(statementBalance)}`
      : 'No Transactions Selected';

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Header title="Import Statement" showBack />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 64 }]}>
        {/* Step 1: Select Target Account */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>1. Target Account</Text>
            {hasRouteAccountParam && accounts.length > 1 && (
              <TouchableOpacity
                onPress={() => setShowAccountChips((prev) => !prev)}
                disabled={isParsing || isImporting}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.sectionActionLink}>
                  {showAccountChips ? 'Done' : 'Change'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.sectionSub}>
            Transactions in the PDF or CSV statement will be imported into this account.
          </Text>

          {isLoadingAccounts && accounts.length === 0 ? (
            <View style={styles.accountLoadingBox}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.sectionSub}>Loading your accounts...</Text>
            </View>
          ) : accounts.length === 0 ? (
            <View style={styles.emptyAccountCard}>
              <MaterialIcons name="account-balance" size={28} color={colors.primary} />
              <Text style={styles.emptyAccountTitle}>No Accounts Found</Text>
              <Text style={styles.emptyAccountSub}>
                Add a bank account or credit card first so Clarity knows where to import statements.
              </Text>
              <TouchableOpacity
                style={styles.emptyAccountBtn}
                onPress={() => router.navigate('/(app)/add-account')}
                activeOpacity={0.8}
              >
                <MaterialIcons name="add" size={18} color={colors.onPrimary} />
                <Text style={styles.emptyAccountBtnText}>Add Bank Account</Text>
              </TouchableOpacity>
            </View>
          ) : hasRouteAccountParam && selectedAccount && !showAccountChips ? (
            <View style={styles.selectedAccountCard}>
              <View
                style={[
                  styles.selectedAccountIcon,
                  selectedAccountBranding
                    ? { backgroundColor: selectedAccountBranding.backgroundColor }
                    : undefined,
                ]}
              >
                <MaterialIcons
                  name={
                    selectedAccount.institution
                      ? 'account-balance'
                      : getAccountTypeIcon(selectedAccount.type)
                  }
                  size={22}
                  color={selectedAccountBranding ? selectedAccountBranding.color : colors.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.selectedAccountTitleRow}>
                  <Text style={styles.selectedAccountName}>{selectedAccount.name}</Text>
                  {selectedAccount.lastFour &&
                  !selectedAccount.name.includes(selectedAccount.lastFour) ? (
                    <View style={styles.lastFourPill}>
                      <Text style={styles.lastFourPillText}>•••• {selectedAccount.lastFour}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.selectedAccountMeta}>
                  {selectedAccount.institution || selectedAccountTypeLabel} • Balance:{' '}
                  {formatCurrency(selectedAccount.balance)}
                </Text>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.accountChips}>
                {orderedAccounts.map((acc) => {
                  const isSelected = selectedAccountId === acc.id;
                  const showLastFour = Boolean(acc.lastFour && !acc.name.includes(acc.lastFour));
                  return (
                    <TouchableOpacity
                      key={acc.id}
                      style={[styles.accountChip, isSelected && styles.accountChipSelected]}
                      onPress={() => handleSelectAccount(acc.id)}
                      disabled={isParsing || isImporting}
                    >
                      <MaterialIcons
                        name={getAccountTypeIcon(acc.type)}
                        size={16}
                        color={isSelected ? colors.onPrimaryContainer : colors.onSurfaceVariant}
                      />
                      <Text
                        style={[
                          styles.accountChipText,
                          isSelected && styles.accountChipTextSelected,
                        ]}
                      >
                        {acc.name}
                        {showLastFour ? ` ••${acc.lastFour}` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {selectedAccount && (
                <Text style={styles.selectedAccountSummaryLine}>
                  {selectedAccount.institution ? `${selectedAccount.institution} • ` : ''}
                  {selectedAccountTypeLabel} • Current balance:{' '}
                  {formatCurrency(selectedAccount.balance)}
                </Text>
              )}
            </>
          )}
        </View>

        {/* Step 2: Upload File (PDF or CSV) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Select Statement File</Text>
          <Text style={styles.sectionSub}>
            Supported formats: PDF statements (including password-protected e-statements) or standard CSV statements.
          </Text>

          <TouchableOpacity
            style={[
              styles.uploadCard,
              (!selectedAccountId || isParsing || isImporting) && styles.uploadCardDisabled,
            ]}
            onPress={handlePickDocument}
            disabled={!selectedAccountId || isParsing || isImporting}
          >
            {isParsing ? (
              <View style={styles.uploadContent}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.uploadSub}>
                  {fileName ? `Reading ${fileName}...` : 'Parsing statement...'}
                </Text>
              </View>
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

          {parseError && (
            <View style={styles.errorBanner}>
              <MaterialIcons name="error-outline" size={18} color={colors.error} />
              <Text style={styles.errorBannerText}>{parseError}</Text>
            </View>
          )}
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

            {/* Statement Balance Card */}
            {statementBalance !== null && (
              <View
                style={[
                  styles.balanceCard,
                  {
                    backgroundColor: colors.surfaceContainerLow,
                    borderColor: colors.outlineVariant,
                  },
                ]}
              >
                <View style={styles.balanceInfo}>
                  <View style={styles.balanceHeaderRow}>
                    <MaterialIcons name="account-balance" size={18} color={colors.primary} />
                    <Text style={[styles.balanceCardTitle, { color: colors.onSurface }]}>
                      Statement Closing Balance
                    </Text>
                  </View>
                  <Text style={[styles.balanceCardAmount, { color: colors.onSurface }]}>
                    {formatCurrency(statementBalance)}
                    {statementDate ? ` (as of ${formatDate(statementDate)})` : ''}
                  </Text>
                  {selectedAccount && (
                    <Text style={[styles.balanceCurrentHint, { color: colors.onSurfaceVariant }]}>
                      Current recorded balance: {formatCurrency(selectedAccount.balance)}
                    </Text>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.balanceToggleRow}
                  onPress={() => setApplyStatementBalance((prev) => !prev)}
                  activeOpacity={0.7}
                >
                  <MaterialIcons
                    name={applyStatementBalance ? 'check-box' : 'check-box-outline-blank'}
                    size={20}
                    color={applyStatementBalance ? colors.primary : colors.outline}
                  />
                  <Text style={[styles.balanceToggleText, { color: colors.onSurfaceVariant }]}>
                    Update {selectedAccount?.name || 'account'} balance to{' '}
                    {formatCurrency(statementBalance)}
                  </Text>
                </TouchableOpacity>

                {isSelectedAccountLiability && statementBalance > 0 && (
                  <Text style={[styles.balanceLiabilityHint, { color: colors.onSurfaceVariant }]}>
                    Note: Credit card and loan balances are tracked as negative debt in Clarity.
                  </Text>
                )}
              </View>
            )}

            {/* Preview list or up-to-date message */}
            {newTransactions.length === 0 ? (
              <View style={styles.upToDateCard}>
                <MaterialIcons name="check-circle" size={24} color={colors.primary} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.upToDateTitle}>All Transactions Already Recorded</Text>
                  <Text style={styles.upToDateSub}>
                    All {parsedTransactions.length} transactions in this statement already match entries in{' '}
                    {selectedAccount?.name || 'this account'}.
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.previewCard}>
                <View style={styles.previewHeader}>
                  <Text style={styles.previewTitle}>
                    New Transactions ({selectedTxIndexes.size} of {newTransactions.length} Selected)
                  </Text>
                  <TouchableOpacity
                    onPress={toggleSelectAll}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.previewSelectAll}>
                      {allSelected ? 'Deselect All' : 'Select All'}
                    </Text>
                  </TouchableOpacity>
                </View>
                {visibleNewTransactions.map((tx, idx) => {
                  const isExpense = tx.type === 'expense';
                  const isSelected = selectedTxIndexes.has(idx);
                  return (
                    <TouchableOpacity
                      key={`${tx.date}-${tx.merchant}-${tx.amount}-${idx}`}
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
                {newTransactions.length > PREVIEW_COLLAPSED_COUNT && (
                  <TouchableOpacity
                    style={styles.previewExpandBtn}
                    onPress={() => setShowAllPreview((prev) => !prev)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.previewExpandText}>
                      {showAllPreview
                        ? 'Show fewer transactions'
                        : `Show all ${newTransactions.length} transactions (+${newTransactions.length - PREVIEW_COLLAPSED_COUNT} more)`}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Import Button */}
            <TouchableOpacity
              style={[styles.importBtn, !canSubmitImport && { opacity: 0.5 }]}
              onPress={handleImport}
              disabled={!canSubmitImport}
            >
              {isImporting ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Text style={styles.importBtnText}>{importButtonLabel}</Text>
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
        onRequestClose={closePasswordModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          style={styles.modalBackdrop}
        >
          <TouchableOpacity
            style={styles.modalBackdropTouch}
            activeOpacity={1}
            onPress={closePasswordModal}
          />
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconBox}>
                <MaterialIcons name="lock-outline" size={24} color={colors.onPrimaryContainer} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Password Protected PDF</Text>
                <Text style={styles.modalSub}>This bank statement is encrypted with a password.</Text>
              </View>
              <TouchableOpacity
                onPress={closePasswordModal}
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
                onChangeText={(text) => {
                  setPdfPassword(text);
                  if (pdfModalError) setPdfModalError(null);
                }}
                secureTextEntry={!showPdfPassword}
                autoFocus={true}
                onSubmitEditing={handleUnlockPdf}
              />
              <TouchableOpacity
                onPress={() => setShowPdfPassword((prev) => !prev)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons
                  name={showPdfPassword ? 'visibility-off' : 'visibility'}
                  size={20}
                  color={colors.onSurfaceVariant}
                />
              </TouchableOpacity>
            </View>

            {pdfModalError && (
              <View style={styles.modalErrorRow}>
                <MaterialIcons name="error-outline" size={16} color={colors.error} />
                <Text style={styles.modalErrorText}>{pdfModalError}</Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closePasswordModal}>
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
        </KeyboardAvoidingView>
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
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      ...typography.labelMd,
      color: colors.onSurface,
      fontWeight: '700',
      fontSize: 16,
      lineHeight: 24,
    },
    sectionActionLink: {
      ...typography.labelMd,
      color: colors.primary,
      fontWeight: '700',
      fontSize: 13,
      lineHeight: 20,
    },
    sectionSub: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      fontSize: 13,
      lineHeight: 19,
    },
    accountLoadingBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 14,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainerLow,
    },
    emptyAccountCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: 20,
      alignItems: 'center',
      gap: 8,
    },
    emptyAccountTitle: {
      ...typography.headlineSm,
      fontSize: 16,
      color: colors.onSurface,
      fontWeight: '700',
    },
    emptyAccountSub: {
      ...typography.bodyMd,
      fontSize: 13,
      color: colors.onSurfaceVariant,
      textAlign: 'center',
    },
    emptyAccountBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      marginTop: 6,
    },
    emptyAccountBtnText: {
      ...typography.labelMd,
      color: colors.onPrimary,
      fontWeight: '700',
    },
    selectedAccountCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.primary,
      padding: 14,
    },
    selectedAccountIcon: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    selectedAccountTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
    },
    selectedAccountName: {
      ...typography.bodyLg,
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '700',
      color: colors.onSurface,
      flexShrink: 1,
    },
    lastFourPill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
      backgroundColor: colors.surfaceContainer,
    },
    lastFourPillText: {
      ...typography.labelSm,
      color: colors.onSurfaceVariant,
      fontWeight: '600',
    },
    selectedAccountMeta: {
      ...typography.bodyMd,
      fontSize: 12,
      lineHeight: 18,
      color: colors.onSurfaceVariant,
      marginTop: 2,
    },
    selectedAccountSummaryLine: {
      ...typography.bodySm,
      color: colors.onSurfaceVariant,
      fontSize: 12,
      lineHeight: 19,
    },
    accountChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
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
      maxWidth: '100%',
    },
    accountChipSelected: {
      backgroundColor: colors.primaryContainer,
      borderColor: colors.primary,
    },
    accountChipText: {
      ...typography.bodyMd,
      fontSize: 13,
      lineHeight: 20,
      color: colors.onSurfaceVariant,
      fontWeight: '500',
      flexShrink: 1,
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
    uploadCardDisabled: {
      opacity: 0.5,
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
    errorBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.errorContainer,
      borderRadius: 12,
      padding: 12,
    },
    errorBannerText: {
      ...typography.bodyMd,
      fontSize: 13,
      color: colors.onErrorContainer,
      flex: 1,
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
    balanceCard: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 16,
      gap: 10,
    },
    balanceInfo: {
      gap: 4,
    },
    balanceHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    balanceCardTitle: {
      ...typography.labelMd,
      fontWeight: '700',
      fontSize: 13,
    },
    balanceCardAmount: {
      ...typography.headlineSm,
      fontWeight: '700',
      fontSize: 20,
    },
    balanceCurrentHint: {
      ...typography.bodySm,
      fontSize: 12,
    },
    balanceToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingTop: 4,
    },
    balanceToggleText: {
      ...typography.bodyMd,
      fontSize: 13,
      flex: 1,
    },
    balanceLiabilityHint: {
      ...typography.bodySm,
      fontSize: 11,
    },
    upToDateCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: 16,
    },
    upToDateTitle: {
      ...typography.bodyMd,
      fontWeight: '700',
      color: colors.onSurface,
    },
    upToDateSub: {
      ...typography.bodySm,
      color: colors.onSurfaceVariant,
      lineHeight: 17,
    },
    previewCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      overflow: 'hidden',
    },
    previewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
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
    previewSelectAll: {
      ...typography.labelMd,
      color: colors.primary,
      fontWeight: '700',
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
    previewExpandBtn: {
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerLow,
    },
    previewExpandText: {
      ...typography.labelMd,
      color: colors.primary,
      fontWeight: '700',
      fontSize: 12,
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
      lineHeight: 22,
    },
    previewCheckbox: {
      marginRight: -4,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalBackdropTouch: {
      flex: 1,
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
    modalErrorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    modalErrorText: {
      ...typography.bodySm,
      color: colors.error,
      flex: 1,
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

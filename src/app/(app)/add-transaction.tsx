import { DatePickerModal, Header, SkeletonBox, Text, useAlert, useToast } from '@/components/ui';
import { useAccounts } from '@/hooks/use-accounts';
import { useCategories } from '@/hooks/use-budget';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useTags } from '@/hooks/use-tags';
import {
  useCreateRecurringTransaction,
  useCreateTransaction,
  useDeleteTransaction,
  useTransaction,
  useUpdateTransaction,
} from '@/hooks/use-transactions';
import { calculateNextDate } from '@/services/database/recurring-dao';
import { evaluateTransactionBudgetAlerts } from '@/services/notifications/alert-engine';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { scanReceiptWithAi } from '@/services/api/ai.api';
import { VoiceTransactionModal } from '@/components/modals/VoiceTransactionModal';
import type { ParsedVoiceTransaction } from '@/services/voice/voice-parser';
import { useNetworkStore } from '@/store/use-network-store';
import { isNetworkError } from '@/services/network/network.service';
import { ThemeColors, typography, radius, useTheme } from '@/theme';
import type { Account, RecurringFrequency, TransactionType } from '@/types';
import { formatCurrency, formatLocalDate, getCurrencySymbol } from '@/utils/format';
import {
  computeTransferImpact,
  getAccountTypeShortLabel,
  isLiabilityAccountType,
  pickDefaultSourceAccountId,
} from '@/utils/account-metrics';
import { getAccountTypeIcon, getCategoryIcon } from '@/utils/icons';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

const CATEGORIES = [
  'Groceries',
  'Dining',
  'Rent',
  'Utilities',
  'Transport',
  'Health',
  'Shopping',
  'Entertainment',
  'Subscriptions',
  'Travel',
  'Salary',
  'Transfer',
  'Personal',
  'Other',
];

export default function AddTransactionScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const router = useRouter();
  const insets = useSafeInsets();

  const params = useLocalSearchParams<{
    id?: string;
    type?: TransactionType;
    toAccountId?: string;
    accountId?: string;
    amount?: string;
    merchant?: string;
    category?: string;
    note?: string;
    recurring?: string;
  }>();
  const id = params.id;
  const isEditing = !!id;
  const { transaction, isLoading: isTxLoading } = useTransaction(id);
  const { showToast } = useToast();
  const { showAlert } = useAlert();

  const { accounts, isLoading: isLoadingAccounts } = useAccounts();
  const { categories: dbCategories } = useCategories();
  const { tags: availableTags } = useTags();
  const { mutate: createTransaction, isPending: isCreating } = useCreateTransaction();
  const { mutate: updateTransaction, isPending: isUpdating } = useUpdateTransaction();
  const { mutate: deleteTransaction, isPending: isDeleting } = useDeleteTransaction();
  const { mutate: createRecurring, isPending: isCreatingRecurring } =
    useCreateRecurringTransaction();

  const allCategories = useMemo(() => {
    const names = new Set(CATEGORIES);
    if (dbCategories) {
      dbCategories.forEach((c) => names.add(c.name));
    }
    return Array.from(names);
  }, [dbCategories]);

  const isPending = isCreating || isUpdating || isDeleting || isCreatingRecurring;

  const [type, setType] = useState<TransactionType>(params.type || 'expense');
  const [amountStr, setAmountStr] = useState(params.amount || '');
  const [merchant, setMerchant] = useState(params.merchant || '');
  const [category, setCategory] = useState(
    params.category
      ? CATEGORIES.find((c) => c.toLowerCase() === params.category?.toLowerCase()) || params.category
      : CATEGORIES[0]
  );
  const [date, setDate] = useState(formatLocalDate(new Date()));
  const [accountId, setAccountId] = useState<string | null>(params.accountId || null);
  const [toAccountId, setToAccountId] = useState<string | null>(params.toAccountId || null);
  const [note, setNote] = useState(params.note || '');
  const [isRecurring, setIsRecurring] = useState(
    params.recurring === '1' || params.recurring === 'true'
  );
  const [recurringFreq, setRecurringFreq] = useState<RecurringFrequency>('monthly');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isScanningReceipt, setIsScanningReceipt] = useState(false);
  const isConnected = useNetworkStore((state) => state.isConnected);

  // Split Category states
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [splitItems, setSplitItems] = useState<{ category: string; amount: string }[]>([
    { category: CATEGORIES[0], amount: '' },
    { category: CATEGORIES[1], amount: '' },
  ]);
  const [activeSplitCategoryIndex, setActiveSplitCategoryIndex] = useState<number | null>(null);

  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showToAccountMenu, setShowToAccountMenu] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);
  const [showFullReceiptModal, setShowFullReceiptModal] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [initialized, setInitialized] = useState(false);

  const isPdfReceipt = useMemo(() => {
    if (!receiptUri) return false;
    if (receiptFileName?.toLowerCase().endsWith('.pdf')) return true;
    const cleanUri = receiptUri.toLowerCase().split('?')[0];
    return cleanUri.endsWith('.pdf') || cleanUri.includes('.pdf');
  }, [receiptUri, receiptFileName]);

  const receiptDisplayName = useMemo(() => {
    if (receiptFileName) return receiptFileName;
    if (!receiptUri) return '';
    try {
      const segments = decodeURIComponent(receiptUri).split('/');
      const last = segments[segments.length - 1];
      if (last && last.trim().length > 0) {
        return last.split('?')[0];
      }
    } catch {
      // fallback
    }
    return isPdfReceipt ? 'document.pdf' : 'Receipt';
  }, [receiptFileName, receiptUri, isPdfReceipt]);

  const handlePickReceipt = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) return;
      const asset = res.assets[0];
      setReceiptUri(asset.uri);
      setReceiptFileName(asset.name || null);
      const isSelectedPdf =
        asset.name?.toLowerCase().endsWith('.pdf') || asset.mimeType === 'application/pdf';
      showToast(isSelectedPdf ? 'PDF receipt attached!' : 'Receipt attached!', 'success');
    } catch {
      showToast('Could not attach receipt file', 'error');
    }
  };

  const handleOpenReceipt = async () => {
    if (!receiptUri) return;
    if (isPdfReceipt) {
      try {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(receiptUri, {
            mimeType: 'application/pdf',
            dialogTitle: receiptDisplayName || 'Receipt PDF',
            UTI: 'com.adobe.pdf',
          });
        } else {
          showToast('File viewing is not available on this device', 'error');
        }
      } catch {
        showToast('Could not open PDF file', 'error');
      }
    } else {
      setShowFullReceiptModal(true);
    }
  };

  const handleApplyVoiceParsed = (parsed: ParsedVoiceTransaction) => {
    if (parsed.amount > 0) {
      setAmountStr(parsed.amount.toString());
    }
    if (parsed.merchant) {
      setMerchant(parsed.merchant);
    }
    if (parsed.category) {
      const matched = CATEGORIES.find(
        (c) => c.toLowerCase() === parsed.category.toLowerCase()
      );
      setCategory(matched || parsed.category);
    }
    if (parsed.type) {
      setType(parsed.type);
    }
    if (parsed.accountId) {
      setAccountId(parsed.accountId);
    }
    if (parsed.note) {
      setNote(parsed.note);
    }
    showToast(
      `Auto-filled: ${parsed.merchant || 'Transaction'} (${getCurrencySymbol()}${parsed.amount.toFixed(2)})`,
      'success'
    );
  };

  // Pre-populate if editing
  React.useEffect(() => {
    if (isEditing && transaction && !initialized) {
      setType(transaction.type);
      setAmountStr(transaction.amount.toString());
      setMerchant(
        transaction.type === 'transfer' && transaction.merchant === 'Transfer'
          ? ''
          : transaction.merchant
      );
      setCategory(transaction.category);
      setDate(transaction.date ? transaction.date.split('T')[0] : formatLocalDate(new Date()));
      setAccountId(transaction.accountId);
      setNote(transaction.note || '');
      if ('toAccountId' in transaction) {
        setToAccountId(transaction.toAccountId || null);
      }
      setIsRecurring(transaction.isRecurring);
      if (transaction.splits && transaction.splits.length > 0) {
        setIsSplitMode(true);
        setSplitItems(
          transaction.splits.map((s) => ({
            category: s.category,
            amount: s.amount.toString(),
          }))
        );
      }
      if (transaction.receiptUri) {
        setReceiptUri(transaction.receiptUri);
      }
      if (transaction.tags && transaction.tags.length > 0) {
        setTags(transaction.tags);
      }
      setInitialized(true);
    }
  }, [isEditing, transaction, initialized]);

  // Set default account once accounts load
  React.useEffect(() => {
    if (accounts.length > 0 && !accountId && !isEditing) {
      if (params.accountId) {
        setAccountId(params.accountId);
        return;
      }
      if (params.type === 'transfer' || params.toAccountId) {
        setAccountId(pickDefaultSourceAccountId(accounts, params.toAccountId || toAccountId));
        return;
      }
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId, isEditing, params.accountId, params.type, params.toAccountId, toAccountId]);

  // Sync params when navigated with pre-filled voice, debt payoff, or recurring schedule data
  React.useEffect(() => {
    if (!isEditing) {
      if (params.amount) setAmountStr(params.amount);
      if (params.merchant) setMerchant(params.merchant);
      if (params.category) {
        const matched = CATEGORIES.find(
          (c) => c.toLowerCase() === params.category?.toLowerCase()
        );
        setCategory(matched || params.category);
      }
      if (params.note) setNote(params.note);
      if (params.type) setType(params.type);
      if (params.accountId) setAccountId(params.accountId);
      if (params.toAccountId) {
        setToAccountId(params.toAccountId);
        if (!params.accountId && accounts.length > 0 && accountId === params.toAccountId) {
          setAccountId(pickDefaultSourceAccountId(accounts, params.toAccountId));
        }
      }
      if (params.recurring === '1' || params.recurring === 'true') {
        setIsRecurring(true);
      }
    }
  }, [
    params.amount,
    params.merchant,
    params.category,
    params.note,
    params.type,
    params.accountId,
    params.toAccountId,
    params.recurring,
    accounts,
    accountId,
    isEditing,
  ]);

  const handleTypeChange = (nextType: TransactionType) => {
    if (nextType === 'transfer') {
      const currentAcc = accounts.find((a) => a.id === accountId);
      if (
        currentAcc &&
        isLiabilityAccountType(currentAcc.type) &&
        (!toAccountId || toAccountId === currentAcc.id)
      ) {
        setToAccountId(currentAcc.id);
        const suggestedSource = pickDefaultSourceAccountId(accounts, currentAcc.id);
        if (suggestedSource) {
          setAccountId(suggestedSource);
        }
      } else if (toAccountId && toAccountId === accountId) {
        setToAccountId(null);
      }
    }
    setType(nextType);
  };

  const handleSwitchToLoanPayment = (targetAccount: Account) => {
    const currentAcc = accounts.find((a) => a.id === accountId);
    const nextSourceId =
      currentAcc && !isLiabilityAccountType(currentAcc.type) && currentAcc.id !== targetAccount.id
        ? currentAcc.id
        : pickDefaultSourceAccountId(accounts, targetAccount.id);
    if (nextSourceId) {
      setAccountId(nextSourceId);
    }
    setToAccountId(targetAccount.id);
    setType('transfer');
  };

  const handleSwapTransferAccounts = () => {
    if (!accountId || !toAccountId || accountId === toAccountId) return;
    setAccountId(toAccountId);
    setToAccountId(accountId);
  };

  const handleSave = () => {
    Keyboard.dismiss();
    if (!accountId) {
      showToast('Please select an account', 'error');
      return;
    }
    if (type === 'transfer' && !toAccountId) {
      showToast('Please select a destination account', 'error');
      return;
    }
    if (type === 'transfer' && accountId === toAccountId) {
      showToast('Source and destination accounts must be different', 'error');
      return;
    }
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      showToast('Please enter a valid amount greater than 0', 'error');
      return;
    }
    // Merchant description is optional
    // Basic date validation (handles full ISO strings and YYYY-MM-DD)
    const normalizedDate = date.includes('T') ? date.split('T')[0] : date.trim();
    if (!normalizedDate || normalizedDate.length !== 10) {
      showToast('Please enter date in YYYY-MM-DD format', 'error');
      return;
    }

    let splitsToSave: { category: string; amount: number }[] | undefined = undefined;
    if (type === 'expense' && isSplitMode) {
      const validSplits = splitItems.filter((s) => parseFloat(s.amount) > 0);
      if (validSplits.length < 2) {
        showToast('Please add at least 2 categories with amounts for split', 'error');
        return;
      }
      const splitSum = validSplits.reduce((acc, s) => acc + (parseFloat(s.amount) || 0), 0);
      if (Math.abs(splitSum - amount) > 0.01) {
        showToast(
          `Sum of split amounts (${splitSum}) must equal total amount (${amount})`,
          'error'
        );
        return;
      }
      splitsToSave = validSplits.map((s) => ({
        category: s.category,
        amount: parseFloat(s.amount),
      }));
    }

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    let finalDate = normalizedDate;
    if (id && transaction?.date && transaction.date.startsWith(normalizedDate) && transaction.date.includes('T')) {
      finalDate = transaction.date;
    } else {
      const [y, m, d] = normalizedDate.split('-').map(Number);
      const dateWithTime = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
      finalDate = !isNaN(dateWithTime.getTime()) ? dateWithTime.toISOString() : new Date().toISOString();
    }

    const txData = {
      accountId,
      toAccountId: type === 'transfer' ? toAccountId || undefined : undefined,
      amount,
      type,
      merchant: type === 'transfer' ? (merchant.trim() || 'Transfer') : (merchant.trim() || category),
      category: type === 'transfer' ? 'Transfer' : category,
      date: finalDate,
      isRecurring,
      splits: splitsToSave,
      note: note.trim(),
      receiptUri: receiptUri || undefined,
      tags: tags.length > 0 ? tags : undefined,
      createdAt: transaction?.createdAt || new Date().toISOString(),
    };

    if (isEditing && id) {
      updateTransaction(id, txData, {
        onSuccess: () => {
          evaluateTransactionBudgetAlerts(txData);
          if (type !== 'transfer' && txData.merchant.trim() && txData.category) {
            import('@/services/database/merchant-rule-dao')
              .then(({ saveMerchantRule }) => saveMerchantRule(txData.merchant, txData.category))
              .catch(() => {});
            import('@/modules/sms/categorizer/localCategorizerEngine')
              .then(({ LocalCategorizerEngine }) =>
                LocalCategorizerEngine.addCustomRule(txData.merchant, txData.category)
              )
              .catch(() => {});
          }
          showToast('Transaction updated successfully', 'success');
          router.back();
        },
      });
      return;
    }

    // New transaction with future recurring date
    if (isRecurring && normalizedDate > today) {
      const recData = {
        accountId,
        toAccountId: type === 'transfer' ? toAccountId || undefined : undefined,
        amount,
        type,
        merchant: txData.merchant,
        category: txData.category,
        frequency: recurringFreq,
        nextProcessDate: normalizedDate,
        splits: splitsToSave,
      };
      createRecurring(recData, {
        onSuccess: () => {
          showToast(`Recurring schedule created (First on ${normalizedDate})`, 'success');
          router.back();
        },
      });
      return;
    }

    // New transaction occurring today (or past): record transaction now & schedule next cycle
    createTransaction(txData, {
      onSuccess: () => {
        evaluateTransactionBudgetAlerts(txData);
        if (type !== 'transfer' && txData.merchant.trim() && txData.category) {
          import('@/services/database/merchant-rule-dao')
            .then(({ saveMerchantRule }) => saveMerchantRule(txData.merchant, txData.category))
            .catch(() => {});
          import('@/modules/sms/categorizer/localCategorizerEngine')
            .then(({ LocalCategorizerEngine }) =>
              LocalCategorizerEngine.addCustomRule(txData.merchant, txData.category)
            )
            .catch(() => {});
        }

        if (isRecurring) {
          const nextDate = calculateNextDate(normalizedDate, recurringFreq);
          const recData = {
            accountId,
            toAccountId: type === 'transfer' ? toAccountId || undefined : undefined,
            amount,
            type,
            merchant: txData.merchant,
            category: txData.category,
            frequency: recurringFreq,
            nextProcessDate: nextDate,
            lastProcessedDate: normalizedDate,
            splits: splitsToSave,
          };
          createRecurring(recData, {
            onSuccess: () => {
              showToast(`Transaction added & scheduled ${recurringFreq}`, 'success');
              router.back();
            },
          });
        } else {
          showToast('Transaction added successfully', 'success');
          router.back();
        }
      },
    });
  };

  const handleDelete = () => {
    Keyboard.dismiss();
    if (isEditing && id) {
      showAlert('Delete Transaction', 'Are you sure you want to delete this transaction?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const backupData = transaction ? { ...transaction } : null;
            deleteTransaction(id, {
              onSuccess: () => {
                showToast(
                  'Transaction deleted',
                  'info',
                  backupData
                    ? {
                        label: 'UNDO',
                        onPress: () => {
                          createTransaction(backupData, {
                            onSuccess: () => {
                              showToast('Transaction restored!', 'success');
                            },
                          });
                        },
                      }
                    : undefined
                );
                router.back();
              },
            });
          },
        },
      ]);
    }
  };

  const handleDuplicate = () => {
    Keyboard.dismiss();
    showAlert(
      'Duplicate Transaction',
      "Create a copy of this transaction with today's date?",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Duplicate',
          style: 'default',
          onPress: () => {
            const amount = parseFloat(amountStr);
            if (isNaN(amount) || amount <= 0) {
              showToast('Please enter a valid amount', 'error');
              return;
            }
            if (!accountId) {
              showToast('Please select an account', 'error');
              return;
            }

            const splitsToSave = isSplitMode
              ? splitItems
                  .filter((s) => parseFloat(s.amount) > 0)
                  .map((s) => ({ category: s.category, amount: parseFloat(s.amount) }))
              : undefined;

            const duplicateData = {
              accountId,
              toAccountId: type === 'transfer' ? toAccountId || undefined : undefined,
              amount,
              type,
              merchant: merchant.trim(),
              category: type === 'transfer' ? 'Transfer' : category,
              date: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              isRecurring: false,
              splits: splitsToSave,
              note: note.trim(),
              receiptUri: receiptUri || transaction?.receiptUri,
              tags: tags.length > 0 ? tags : undefined,
              source: 'MANUAL' as const,
              status: 'VERIFIED' as const,
            };

            createTransaction(duplicateData, {
              onSuccess: () => {
                evaluateTransactionBudgetAlerts(duplicateData);
                showToast('Transaction duplicated for today!', 'success');
                router.back();
              },
              onError: () => {
                showToast('Failed to duplicate transaction', 'error');
              },
            });
          },
        },
      ]
    );
  };

  const handleAddTag = (rawTag: string) => {
    const cleaned = rawTag.trim().toLowerCase().replace(/^#/, '');
    if (!cleaned) return;
    if (!tags.includes(cleaned)) {
      setTags((prev) => [...prev, cleaned]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
  };

  const handleScanReceipt = async () => {
    if (!isConnected) {
      showAlert(
        'Internet Required',
        'AI Receipt Scanner uses advanced vision AI in the cloud to read receipts and auto-fill details. Please connect to the internet and try again.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) {
        return;
      }

      const asset = res.assets[0];
      setIsScanningReceipt(true);
      showToast('Scanning receipt with AI...', 'info');

      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const isPdfAsset =
        asset.name?.toLowerCase().endsWith('.pdf') || asset.mimeType === 'application/pdf';

      const scanResult = await scanReceiptWithAi({
        imageBase64: base64,
        mimeType: isPdfAsset ? 'application/pdf' : (asset.mimeType || 'image/jpeg'),
      });

      if (scanResult) {
        setType('expense');

        if (scanResult.merchant) {
          setMerchant(scanResult.merchant);
        }
        if (scanResult.totalAmount && scanResult.totalAmount > 0) {
          setAmountStr(scanResult.totalAmount.toString());
        }
        if (scanResult.category) {
          const matched = CATEGORIES.find(
            (c) => c.toLowerCase() === scanResult.category.toLowerCase()
          );
          setCategory(matched || scanResult.category);
        }
        if (scanResult.date) {
          const cleanDate = scanResult.date.includes('T') ? scanResult.date.split('T')[0] : scanResult.date.trim();
          if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
            setDate(cleanDate);
          }
        }

        // Reconcile and activate split mode when multiple line items are detected
        if (scanResult.items && scanResult.items.length > 1) {
          const validItems = scanResult.items.filter((it) => (it.amount || 0) > 0);
          const itemSum = validItems.reduce((acc, it) => acc + (it.amount || 0), 0);
          const total = scanResult.totalAmount || 0;
          const diff = Math.round((total - itemSum) * 100) / 100;

          if (total > 0 && validItems.length > 1) {
            const mappedSplits = validItems.map((it) => ({
              category: it.category || scanResult.category || 'Groceries',
              amount: it.amount ? it.amount.toString() : '0',
            }));

            // If line items don't fully add up due to taxes, fees, or service charges, add a balancing split item
            if (diff > 0.5) {
              mappedSplits.push({
                category: 'Bills & Utilities',
                amount: diff.toString(),
              });
            }

            setIsSplitMode(true);
            setSplitItems(mappedSplits);
          } else {
            setIsSplitMode(false);
          }
        } else {
          setIsSplitMode(false);
        }

        setReceiptUri(asset.uri);
        setReceiptFileName(asset.name || null);
        showToast('Receipt details auto-filled by AI!', 'success');
      }
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        void useNetworkStore.getState().verifyConnection();
        showToast('Network request timed out. Please check your connection and try again.', 'error');
      } else {
        const errMsg = err instanceof Error && err.message.includes('timeout')
          ? 'Receipt scan timed out. Try with a smaller image or enter manually.'
          : 'Could not scan receipt. Please enter manually.';
        showToast(errMsg, 'error');
      }
    } finally {
      setIsScanningReceipt(false);
    }
  };

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const selectedToAccount = accounts.find((a) => a.id === toAccountId);
  const liabilityAccounts = useMemo(
    () => accounts.filter((a) => isLiabilityAccountType(a.type)),
    [accounts]
  );
  const parsedAmount = parseFloat(amountStr) || 0;
  const transferPreview = useMemo(() => {
    if (
      type !== 'transfer' ||
      !selectedAccount ||
      !selectedToAccount ||
      selectedAccount.id === selectedToAccount.id ||
      parsedAmount <= 0
    ) {
      return null;
    }
    return computeTransferImpact(selectedAccount, selectedToAccount, parsedAmount);
  }, [type, selectedAccount, selectedToAccount, parsedAmount]);

  const isSelectedExpenseLoanOrBorrowed =
    type === 'expense' &&
    Boolean(
      selectedAccount && (selectedAccount.type === 'loan' || selectedAccount.type === 'borrowed')
    );

  const looksLikeDebtPayment =
    type === 'expense' &&
    liabilityAccounts.length > 0 &&
    !isSelectedExpenseLoanOrBorrowed &&
    (isRecurring ||
      /\b(loan|emi|debt|mortgage|repay|credit|card|installment)\b/i.test(
        `${merchant} ${category} ${note}`
      ));

  const formatAccountBalanceLabel = (acc: Account): string => {
    if (isLiabilityAccountType(acc.type)) {
      if (acc.balance < 0) return `${formatCurrency(Math.abs(acc.balance))} owed`;
      if (acc.balance === 0) return `${formatCurrency(0)} settled`;
      return `${formatCurrency(acc.balance)} credit`;
    }
    return formatCurrency(acc.balance);
  };

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <Header
        showBack
        title={isEditing ? 'Edit Transaction' : 'Add Transaction'}
        rightNode={
          isEditing ? (
            <TouchableOpacity
              onPress={handleDuplicate}
              style={styles.headerIconButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Duplicate Transaction"
            >
              <MaterialIcons name="content-copy" size={20} color={colors.onSurface} />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerActionsRow}>
              <TouchableOpacity
                onPress={() => {
                  Keyboard.dismiss();
                  setShowVoiceModal(true);
                }}
                style={styles.headerIconButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Voice Add"
              >
                <MaterialIcons name="mic" size={20} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  Keyboard.dismiss();
                  handleScanReceipt();
                }}
                disabled={isScanningReceipt}
                style={styles.headerIconButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="AI Receipt Scan"
              >
                {isScanningReceipt ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <MaterialIcons name="document-scanner" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            </View>
          )
        }
      />

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={StyleSheet.flatten([
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 40 },
        ])}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        enableResetScrollToCoords={false}
        extraScrollHeight={Platform.OS === 'ios' ? 140 : 160}
        extraHeight={Platform.OS === 'ios' ? 75 : 140}
        keyboardOpeningTime={0}
      >
        <View style={styles.card}>
          {/* Smart Input Row: Voice & Receipt AI */}
          {!isEditing && (
            <View style={styles.smartActionsRow}>
              <TouchableOpacity
                style={styles.smartActionCard}
                onPress={() => {
                  Keyboard.dismiss();
                  setShowVoiceModal(true);
                }}
                activeOpacity={0.7}
              >
                <View style={styles.smartActionIconBox}>
                  <MaterialIcons name="mic" size={18} color={colors.onPrimaryContainer} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.smartActionTitle}>Voice Add</Text>
                  <Text style={styles.smartActionSubtitle}>Speak expense</Text>
                </View>
                <MaterialIcons name="chevron-right" size={16} color={colors.onSurfaceVariant} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.smartActionCard}
                onPress={() => {
                  Keyboard.dismiss();
                  handleScanReceipt();
                }}
                disabled={isScanningReceipt}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.smartActionIconBox,
                    !isConnected && { backgroundColor: colors.surfaceContainerHighest },
                  ]}
                >
                  {isScanningReceipt ? (
                    <ActivityIndicator
                      size="small"
                      color={!isConnected ? colors.onSurfaceVariant : colors.onPrimaryContainer}
                    />
                  ) : (
                    <MaterialIcons
                      name={!isConnected ? 'wifi-off' : 'auto-awesome'}
                      size={18}
                      color={!isConnected ? colors.onSurfaceVariant : colors.onPrimaryContainer}
                    />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.smartActionTitle}>
                    {isScanningReceipt ? 'Scanning...' : 'Scan Receipt'}
                  </Text>
                  <Text style={styles.smartActionSubtitle}>Auto-fill photo</Text>
                </View>
                <MaterialIcons name="chevron-right" size={16} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>
          )}

          {/* Type Switcher */}
          <View style={styles.typeSwitcher}>
            {(['expense', 'income', 'transfer'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.typeButton, type === t && styles.typeButtonActive]}
                onPress={() => handleTypeChange(t)}
              >
                <Text style={[styles.typeButtonText, type === t && styles.typeButtonTextActive]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Amount Input */}
          <View style={styles.amountContainer}>
            <Text style={styles.amountLabel}>Amount</Text>
            <View style={styles.amountInputRow}>
              <Text style={styles.currencySymbol}>{getCurrencySymbol()}</Text>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                keyboardType="decimal-pad"
                placeholderTextColor={colors.outline}
                value={amountStr}
                onChangeText={setAmountStr}
              />
            </View>

            {/* Quick Amount Chips */}
            <View style={styles.quickChipsRow}>
              {[100, 500, 1000, 2000].map((delta) => (
                <TouchableOpacity
                  key={delta}
                  style={styles.quickChip}
                  onPress={() => {
                    const curr = parseFloat(amountStr) || 0;
                    setAmountStr((curr + delta).toString());
                  }}
                >
                  <Text style={styles.quickChipText} numberOfLines={1}>+{delta}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.quickChip, { borderColor: colors.error + '44' }]}
                onPress={() => setAmountStr('')}
              >
                <Text style={[styles.quickChipText, { color: colors.error }]} numberOfLines={1}>Clear</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Form Fields */}
          <View style={styles.formGroup}>
            {type === 'transfer' ? (
              <>
                <View style={styles.transferRouteCard}>
                  {/* From Account (Deduct from) */}
                  <View style={styles.inputContainer}>
                    <View style={styles.transferLabelRow}>
                      <Text style={styles.inputLabel}>From Account</Text>
                      <Text style={styles.transferRoleHint}>Money deducted from</Text>
                    </View>

                    {isLoadingAccounts ? (
                      <SkeletonBox height={52} borderRadius={radius.lg} />
                    ) : accounts.length === 0 ? (
                      <View style={[styles.textInput, { justifyContent: 'center' }]}>
                        <Text style={{ color: colors.error }}>No accounts available.</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.textInputWrapper}
                        onPress={() => {
                          Keyboard.dismiss();
                          setShowAccountMenu(true);
                        }}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons
                          name={
                            selectedAccount
                              ? getAccountTypeIcon(selectedAccount.type)
                              : 'account-balance'
                          }
                          size={22}
                          color={colors.primary}
                          style={styles.inputIcon}
                        />
                        <View style={[styles.textInput, styles.accountSelectContent]}>
                          <Text
                            style={{
                              color: selectedAccount ? colors.onSurface : colors.outline,
                              flex: 1,
                              ...typography.bodyMd,
                            }}
                            numberOfLines={1}
                          >
                            {selectedAccount
                              ? `${selectedAccount.name}${
                                  selectedAccount.lastFour ? ` (...${selectedAccount.lastFour})` : ''
                                }`
                              : 'Select paying account'}
                          </Text>
                          {selectedAccount && (
                            <Text style={styles.accountSelectBalance} numberOfLines={1}>
                              {formatAccountBalanceLabel(selectedAccount)}
                            </Text>
                          )}
                        </View>
                        <MaterialIcons
                          name="expand-more"
                          size={24}
                          color={colors.onSurfaceVariant}
                          style={styles.inputRightIcon}
                        />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Route Direction & Swap */}
                  <View style={styles.transferSwapRow}>
                    <View style={styles.transferRouteDivider} />
                    <TouchableOpacity
                      style={styles.transferSwapBtn}
                      onPress={handleSwapTransferAccounts}
                      disabled={!accountId || !toAccountId || accountId === toAccountId}
                      activeOpacity={0.75}
                      accessibilityLabel="Swap From and To accounts"
                    >
                      <MaterialIcons
                        name={accountId && toAccountId ? 'swap-vert' : 'arrow-downward'}
                        size={16}
                        color={colors.primary}
                      />
                      <Text style={styles.transferSwapText}>
                        {accountId && toAccountId ? 'Swap' : 'To'}
                      </Text>
                    </TouchableOpacity>
                    <View style={styles.transferRouteDivider} />
                  </View>

                  {/* To Account (Recipient / Loan / Card) */}
                  <View style={styles.inputContainer}>
                    <View style={styles.transferLabelRow}>
                      <Text style={styles.inputLabel}>To Account</Text>
                      <Text style={styles.transferRoleHint}>
                        {selectedToAccount && isLiabilityAccountType(selectedToAccount.type)
                          ? 'Reduces debt balance'
                          : 'Recipient / Loan / Card'}
                      </Text>
                    </View>

                    {isLoadingAccounts ? (
                      <SkeletonBox height={52} borderRadius={radius.lg} />
                    ) : accounts.length === 0 ? (
                      <View style={[styles.textInput, { justifyContent: 'center' }]}>
                        <Text style={{ color: colors.error }}>No accounts available.</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.textInputWrapper}
                        onPress={() => {
                          Keyboard.dismiss();
                          setShowToAccountMenu(true);
                        }}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons
                          name={
                            selectedToAccount
                              ? getAccountTypeIcon(selectedToAccount.type)
                              : 'handshake'
                          }
                          size={22}
                          color={colors.primary}
                          style={styles.inputIcon}
                        />
                        <View style={[styles.textInput, styles.accountSelectContent]}>
                          <Text
                            style={{
                              color: selectedToAccount ? colors.onSurface : colors.outline,
                              flex: 1,
                              ...typography.bodyMd,
                            }}
                            numberOfLines={1}
                          >
                            {selectedToAccount
                              ? `${selectedToAccount.name}${
                                  selectedToAccount.lastFour
                                    ? ` (...${selectedToAccount.lastFour})`
                                    : ''
                                }`
                              : 'Select recipient / loan account'}
                          </Text>
                          {selectedToAccount && (
                            <Text
                              style={[
                                styles.accountSelectBalance,
                                isLiabilityAccountType(selectedToAccount.type) &&
                                  selectedToAccount.balance < 0 && { color: colors.error },
                              ]}
                              numberOfLines={1}
                            >
                              {formatAccountBalanceLabel(selectedToAccount)}
                            </Text>
                          )}
                        </View>
                        <MaterialIcons
                          name="expand-more"
                          size={24}
                          color={colors.onSurfaceVariant}
                          style={styles.inputRightIcon}
                        />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Live Double-Entry Balance Impact Preview */}
                  {transferPreview && selectedAccount && selectedToAccount && (
                    <View style={styles.impactPreviewCard}>
                      <View style={styles.impactPreviewHeader}>
                        <MaterialIcons
                          name={transferPreview.isToLiability ? 'verified' : 'compare-arrows'}
                          size={15}
                          color={colors.primary}
                        />
                        <Text style={styles.impactPreviewTitle}>
                          {transferPreview.isToLiability
                            ? 'Debt Paydown Preview'
                            : 'Balance Impact Preview'}
                        </Text>
                      </View>

                      <View style={styles.impactPreviewRow}>
                        <Text style={styles.impactAccountName} numberOfLines={1}>
                          {selectedAccount.name}
                        </Text>
                        <View style={styles.impactValuesCol}>
                          <Text style={styles.impactTransitionText} numberOfLines={1}>
                            {`${formatCurrency(transferPreview.fromBefore)} → ${formatCurrency(transferPreview.fromAfter)}`}
                          </Text>
                          <Text style={[styles.impactDeltaBadge, { color: colors.error }]}>
                            {`-${formatCurrency(parsedAmount)}`}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.impactPreviewRow}>
                        <Text style={styles.impactAccountName} numberOfLines={1}>
                          {selectedToAccount.name}
                        </Text>
                        <View style={styles.impactValuesCol}>
                          {transferPreview.isToLiability ? (
                            <>
                              <Text style={styles.impactTransitionText} numberOfLines={1}>
                                {`${
                                  transferPreview.debtBefore > 0
                                    ? `${formatCurrency(transferPreview.debtBefore)} owed`
                                    : formatCurrency(transferPreview.toBefore)
                                } → ${
                                  transferPreview.debtAfter > 0
                                    ? `${formatCurrency(transferPreview.debtAfter)} owed`
                                    : transferPreview.toAfter === 0
                                    ? 'Settled'
                                    : `+${formatCurrency(transferPreview.toAfter)}`
                                }`}
                              </Text>
                              <Text style={[styles.impactDeltaBadge, { color: '#10B981' }]}>
                                {transferPreview.debtReduced > 0
                                  ? `Debt -${formatCurrency(transferPreview.debtReduced)}`
                                  : `+${formatCurrency(parsedAmount)}`}
                              </Text>
                            </>
                          ) : (
                            <>
                              <Text style={styles.impactTransitionText} numberOfLines={1}>
                                {`${formatCurrency(transferPreview.toBefore)} → ${formatCurrency(transferPreview.toAfter)}`}
                              </Text>
                              <Text style={[styles.impactDeltaBadge, { color: '#10B981' }]}>
                                {`+${formatCurrency(parsedAmount)}`}
                              </Text>
                            </>
                          )}
                        </View>
                      </View>

                      {transferPreview.exceedsDebtBy > 0 && (
                        <View style={styles.impactWarningRow}>
                          <MaterialIcons name="info-outline" size={14} color="#D97706" />
                          <Text style={styles.impactWarningText}>
                            Exceeds remaining {selectedToAccount.name} debt by{' '}
                            {formatCurrency(transferPreview.exceedsDebtBy)}.
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>

                {/* Optional Payment Label for Transfers / EMIs */}
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>
                    Payment Label{' '}
                    <Text style={{ color: colors.outline, fontWeight: '400' }}>(Optional)</Text>
                  </Text>
                  <View style={styles.textInputWrapper}>
                    <MaterialIcons
                      name="label-outline"
                      size={22}
                      color={colors.onSurfaceVariant}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.textInput}
                      placeholder={
                        selectedToAccount && isLiabilityAccountType(selectedToAccount.type)
                          ? `e.g. ${selectedToAccount.name} EMI`
                          : 'e.g. Monthly Transfer, Card Payment'
                      }
                      placeholderTextColor={colors.outline}
                      value={merchant}
                      onChangeText={setMerchant}
                    />
                  </View>
                </View>
              </>
            ) : (
              <>
                {/* Merchant */}
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>
                    Merchant / Description{' '}
                    <Text style={{ color: colors.outline, fontWeight: '400' }}>(Optional)</Text>
                  </Text>
                  <View style={styles.textInputWrapper}>
                    <MaterialIcons
                      name="storefront"
                      size={24}
                      color={colors.onSurfaceVariant}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. Whole Foods Market"
                      placeholderTextColor={colors.outline}
                      value={merchant}
                      onChangeText={setMerchant}
                    />
                  </View>
                </View>

                {/* Category or Split Categories */}
                {type === 'expense' && (
                  <View style={styles.splitToggleContainer}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.inputLabel}>Split across categories</Text>
                      <Text style={styles.splitToggleSubtitle}>
                        Divide expense into multiple budget buckets
                      </Text>
                    </View>
                    <Switch
                      value={isSplitMode}
                      onValueChange={setIsSplitMode}
                      trackColor={{ false: colors.surfaceVariant, true: colors.primary }}
                    />
                  </View>
                )}

                {!isSplitMode || type !== 'expense' ? (
                  <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>Category</Text>
                    <TouchableOpacity
                      style={styles.textInputWrapper}
                      onPress={() => {
                        Keyboard.dismiss();
                        setActiveSplitCategoryIndex(null);
                        setShowCategoryMenu(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <MaterialIcons
                        name={getCategoryIcon(category)}
                        size={24}
                        color={colors.primary}
                        style={styles.inputIcon}
                      />
                      <View style={[styles.textInput, { justifyContent: 'center' }]}>
                        <Text style={{ color: colors.onSurface }}>{category}</Text>
                      </View>
                      <MaterialIcons
                        name="expand-more"
                        size={24}
                        color={colors.onSurfaceVariant}
                        style={styles.inputRightIcon}
                      />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.splitsCard}>
                    <View style={styles.splitHeaderRow}>
                      <Text style={styles.splitHeaderTitle}>Category Splits</Text>
                      <Text
                        style={[
                          styles.splitSumText,
                          {
                            color:
                              Math.abs(
                                splitItems.reduce(
                                  (sum, s) => sum + (parseFloat(s.amount) || 0),
                                  0
                                ) - (parseFloat(amountStr) || 0)
                              ) < 0.01 && (parseFloat(amountStr) || 0) > 0
                                ? colors.primary
                                : colors.error,
                          },
                        ]}
                      >
                        Allocated:{' '}
                        {getCurrencySymbol() +
                          splitItems
                            .reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0)
                            .toFixed(2)}{' '}
                        / {getCurrencySymbol() + (parseFloat(amountStr) || 0).toFixed(2)}
                      </Text>
                    </View>

                    {splitItems.map((item, idx) => (
                      <View key={idx} style={styles.splitRow}>
                        <TouchableOpacity
                          style={styles.splitCategoryBtn}
                          onPress={() => {
                            Keyboard.dismiss();
                            setActiveSplitCategoryIndex(idx);
                            setShowCategoryMenu(true);
                          }}
                        >
                          <MaterialIcons
                            name={getCategoryIcon(item.category)}
                            size={18}
                            color={colors.primary}
                          />
                          <Text style={styles.splitCategoryText} numberOfLines={1}>
                            {item.category}
                          </Text>
                          <MaterialIcons
                            name="arrow-drop-down"
                            size={18}
                            color={colors.onSurfaceVariant}
                          />
                        </TouchableOpacity>

                        <View style={styles.splitAmountInputWrapper}>
                          <Text style={styles.splitCurrency}>{getCurrencySymbol()}</Text>
                          <TextInput
                            style={styles.splitAmountInput}
                            placeholder="0.00"
                            placeholderTextColor={colors.outline}
                            keyboardType="decimal-pad"
                            value={item.amount}
                            onChangeText={(val) => {
                              setSplitItems((prev) => {
                                const updated = [...prev];
                                updated[idx] = { ...updated[idx], amount: val };
                                return updated;
                              });
                            }}
                          />
                        </View>

                        {splitItems.length > 2 && (
                          <TouchableOpacity
                            style={styles.splitDeleteBtn}
                            onPress={() => {
                              setSplitItems((prev) => prev.filter((_, i) => i !== idx));
                            }}
                          >
                            <MaterialIcons name="close" size={18} color={colors.onErrorContainer} />
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}

                    <TouchableOpacity
                      style={styles.addSplitBtn}
                      onPress={() => {
                        const unusedCat =
                          allCategories.find((c) => !splitItems.some((s) => s.category === c)) ||
                          allCategories[0];
                        setSplitItems((prev) => [...prev, { category: unusedCat, amount: '' }]);
                      }}
                    >
                      <MaterialIcons name="add" size={18} color={colors.primary} />
                      <Text style={[styles.addSplitBtnText, { color: colors.primary }]}>
                        Add Category Split
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            <View style={[styles.inputContainer, { zIndex: 1 }]}>
              <Text style={styles.inputLabel}>Date</Text>
              <TouchableOpacity
                style={styles.textInputWrapper}
                onPress={() => {
                  Keyboard.dismiss();
                  setShowDatePicker(true);
                }}
                activeOpacity={0.7}
              >
                <MaterialIcons
                  name="event"
                  size={24}
                  color={colors.primary}
                  style={styles.inputIcon}
                />
                <View style={[styles.textInput, { justifyContent: 'center' }]}>
                  <Text style={{ color: date ? colors.onSurface : colors.outline }}>
                    {date || 'Select Date'}
                  </Text>
                </View>
                <MaterialIcons
                  name="expand-more"
                  size={24}
                  color={colors.onSurfaceVariant}
                  style={styles.inputRightIcon}
                />
              </TouchableOpacity>
            </View>

            <DatePickerModal
              visible={showDatePicker}
              value={date}
              onChange={(newDate) => setDate(newDate)}
              onClose={() => setShowDatePicker(false)}
            />

            {/* Account Selector (for Expense / Income — Transfer uses the From → To Route Card above) */}
            {type !== 'transfer' && (
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>
                  {type === 'expense' ? 'Pay From Account' : 'Deposit To Account'}
                </Text>

                {isLoadingAccounts ? (
                  <SkeletonBox height={52} borderRadius={radius.lg} />
                ) : accounts.length === 0 ? (
                  <View style={[styles.textInput, { justifyContent: 'center' }]}>
                    <Text style={{ color: colors.error }}>
                      No accounts available. Please add one first.
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.textInputWrapper}
                    onPress={() => {
                      Keyboard.dismiss();
                      setShowAccountMenu(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons
                      name={
                        selectedAccount
                          ? getAccountTypeIcon(selectedAccount.type)
                          : 'account-balance'
                      }
                      size={24}
                      color={colors.primary}
                      style={styles.inputIcon}
                    />
                    <View style={[styles.textInput, styles.accountSelectContent]}>
                      <Text
                        style={{
                          color: selectedAccount ? colors.onSurface : colors.outline,
                          flex: 1,
                          ...typography.bodyMd,
                        }}
                        numberOfLines={1}
                      >
                        {selectedAccount
                          ? `${selectedAccount.name}${
                              selectedAccount.lastFour ? ` (...${selectedAccount.lastFour})` : ''
                            }`
                          : 'Select an account'}
                      </Text>
                      {selectedAccount && (
                        <Text style={styles.accountSelectBalance} numberOfLines={1}>
                          {formatAccountBalanceLabel(selectedAccount)}
                        </Text>
                      )}
                    </View>
                    <MaterialIcons
                      name="expand-more"
                      size={24}
                      color={colors.onSurfaceVariant}
                      style={styles.inputRightIcon}
                    />
                  </TouchableOpacity>
                )}

                {isSelectedExpenseLoanOrBorrowed && selectedAccount && (
                  <View style={styles.debtHelperCardWarn}>
                    <View style={styles.debtHelperHeaderRow}>
                      <MaterialIcons name="info-outline" size={18} color="#D97706" />
                      <Text style={styles.debtHelperTitle}>
                        Paying down {selectedAccount.name} from your bank?
                      </Text>
                    </View>
                    <Text style={styles.debtHelperBody}>
                      Recording an expense directly on a loan increases your debt. Switch to a Bank → Loan payment to deduct from your bank and reduce this loan balance.
                    </Text>
                    <TouchableOpacity
                      style={styles.debtHelperPrimaryBtn}
                      onPress={() => handleSwitchToLoanPayment(selectedAccount)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.debtHelperPrimaryBtnText}>
                        Switch to Bank → Loan Payment
                      </Text>
                      <MaterialIcons name="arrow-forward" size={16} color={colors.onPrimary} />
                    </TouchableOpacity>
                  </View>
                )}

                {looksLikeDebtPayment && (
                  <View style={styles.debtHelperCardInfo}>
                    <View style={styles.debtHelperHeaderRow}>
                      <MaterialIcons name="account-balance" size={17} color={colors.primary} />
                      <Text style={styles.debtHelperTitle}>
                        Paying a Loan, EMI, or Credit Card?
                      </Text>
                    </View>
                    <Text style={styles.debtHelperBody}>
                      Select the recipient debt account below so deducting from{' '}
                      {selectedAccount?.name || 'your bank'} also reduces that debt automatically:
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 8, paddingTop: 6 }}
                    >
                      {liabilityAccounts.map((acc) => (
                        <TouchableOpacity
                          key={acc.id}
                          style={styles.debtQuickTargetChip}
                          onPress={() => handleSwitchToLoanPayment(acc)}
                          activeOpacity={0.75}
                        >
                          <MaterialIcons
                            name={getAccountTypeIcon(acc.type)}
                            size={14}
                            color={colors.primary}
                          />
                          <Text style={styles.debtQuickTargetText} numberOfLines={1}>
                            {acc.name} ({formatAccountBalanceLabel(acc)})
                          </Text>
                          <MaterialIcons name="arrow-forward" size={14} color={colors.primary} />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {type === 'expense' &&
                  liabilityAccounts.length > 0 &&
                  !isSelectedExpenseLoanOrBorrowed &&
                  !looksLikeDebtPayment && (
                    <TouchableOpacity
                      style={styles.debtInlineLink}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowToAccountMenu(true);
                      }}
                      activeOpacity={0.75}
                    >
                      <MaterialIcons name="handshake" size={15} color={colors.primary} />
                      <Text style={styles.debtInlineLinkText}>
                        Paying a Loan or Credit Card? Link recipient account →
                      </Text>
                    </TouchableOpacity>
                  )}
              </View>
            )}

            {/* Receipt / Document Attachment */}
            <View style={styles.attachmentSection}>
              <View style={styles.attachmentHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialIcons name="receipt-long" size={18} color={colors.onSurfaceVariant} />
                  <Text style={styles.attachmentTitle}>Receipt / Document</Text>
                </View>
                {!receiptUri && (
                  <TouchableOpacity
                    style={styles.attachBtn}
                    onPress={handlePickReceipt}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="attach-file" size={16} color={colors.primary} />
                    <Text style={[styles.attachBtnText, { color: colors.primary }]}>Attach File / PDF</Text>
                  </TouchableOpacity>
                )}
              </View>

              {receiptUri ? (
                <View style={[styles.receiptPreviewCard, { backgroundColor: colors.surfaceContainerLow, borderColor: colors.surfaceVariant }]}>
                  <TouchableOpacity
                    style={styles.receiptThumbWrapper}
                    onPress={handleOpenReceipt}
                    activeOpacity={0.8}
                  >
                    {isPdfReceipt ? (
                      <View style={styles.pdfThumbnailBox}>
                        <MaterialIcons name="picture-as-pdf" size={24} color={colors.error} />
                      </View>
                    ) : (
                      <Image source={{ uri: receiptUri }} style={styles.receiptThumbnail} resizeMode="cover" />
                    )}
                    <View style={styles.zoomOverlayBadge}>
                      <MaterialIcons name={isPdfReceipt ? 'open-in-new' : 'zoom-in'} size={14} color="#FFFFFF" />
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.receiptInfoCol}
                    onPress={handleOpenReceipt}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.receiptAttachedText, { color: colors.onSurface }]} numberOfLines={1}>
                      {isPdfReceipt ? 'PDF Document Attached' : 'Receipt Attached'}
                    </Text>
                    <Text style={[styles.receiptSubtext, { color: colors.onSurfaceVariant }]} numberOfLines={1}>
                      {isPdfReceipt ? (receiptDisplayName || 'Tap to view / open PDF') : 'Tap to preview full size'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.removeReceiptBtn, { backgroundColor: colors.surfaceContainerHighest }]}
                    onPress={() => {
                      setReceiptUri(null);
                      setReceiptFileName(null);
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons name="delete-outline" size={18} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>

            {/* Recurring Toggle */}
            <View style={styles.recurringContainer}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.recurringLabel}>Recurring Transaction</Text>
                <Text style={styles.recurringSubtext}>
                  {type === 'transfer' && selectedAccount && selectedToAccount
                    ? isLiabilityAccountType(selectedToAccount.type)
                      ? `Auto-deducts from ${selectedAccount.name} & reduces ${selectedToAccount.name} debt on schedule`
                      : `Auto-transfers from ${selectedAccount.name} to ${selectedToAccount.name} on schedule`
                    : 'Mark if this happens regularly'}
                </Text>
              </View>
              <Switch
                value={isRecurring}
                onValueChange={setIsRecurring}
                trackColor={{ false: colors.surfaceVariant, true: colors.primary }}
                disabled={isEditing}
              />
            </View>

            {isRecurring && !isEditing && (
              <View style={styles.frequencySection}>
                <Text style={styles.inputLabel}>Repeat Frequency</Text>
                <View style={styles.freqPillRow}>
                  {(['daily', 'weekly', 'monthly', 'yearly'] as RecurringFrequency[]).map(
                    (freq) => {
                      const isSelected = recurringFreq === freq;
                      return (
                        <TouchableOpacity
                          key={freq}
                          style={[styles.freqPill, isSelected && styles.freqPillActive]}
                          onPress={() => setRecurringFreq(freq)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[styles.freqPillText, isSelected && styles.freqPillTextActive]}
                            numberOfLines={1}
                          >
                            {freq.charAt(0).toUpperCase() + freq.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      );
                    }
                  )}
                </View>
              </View>
            )}

            {/* Note Input */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>
                Note{' '}
                <Text style={{ color: colors.outline, fontWeight: '400' }}>(Optional)</Text>
              </Text>
              <View style={styles.textInputWrapper}>
                <MaterialIcons
                  name="edit-note"
                  size={24}
                  color={colors.onSurfaceVariant}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.textInput}
                  placeholder="e.g. Dinner with team"
                  placeholderTextColor={colors.outline}
                  value={note}
                  onChangeText={setNote}
                />
              </View>
            </View>

            {/* Custom Cross-Category Tags */}
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>
                Tags{' '}
                <Text style={{ color: colors.outline, fontWeight: '400' }}>(Optional)</Text>
              </Text>
              <View style={styles.textInputWrapper}>
                <MaterialIcons
                  name="label-outline"
                  size={22}
                  color={colors.onSurfaceVariant}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.textInput, { flex: 1 }]}
                  placeholder="e.g. trip, medical, tax-saving"
                  placeholderTextColor={colors.outline}
                  value={tagInput}
                  onChangeText={setTagInput}
                  onSubmitEditing={() => handleAddTag(tagInput)}
                  returnKeyType="done"
                />
                {tagInput.trim().length > 0 && (
                  <TouchableOpacity
                    onPress={() => handleAddTag(tagInput)}
                    style={styles.addTagInlineBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialIcons name="add" size={20} color={colors.primary} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Selected Tags Chips */}
              {tags.length > 0 && (
                <View style={styles.tagChipsContainer}>
                  {tags.map((t) => (
                    <View key={t} style={styles.selectedTagChip}>
                      <Text style={styles.selectedTagText}>#{t}</Text>
                      <TouchableOpacity
                        onPress={() => handleRemoveTag(t)}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <MaterialIcons name="close" size={14} color={colors.onPrimaryContainer} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Quick Tag Suggestions */}
              {availableTags.length > 0 && availableTags.some((t) => !tags.includes(t.name)) && (
                <View style={styles.tagSuggestionsRow}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 6 }}
                  >
                    {availableTags
                      .filter((t) => !tags.includes(t.name))
                      .slice(0, 8)
                      .map((t) => (
                        <TouchableOpacity
                          key={t.id}
                          style={styles.suggestionTagChip}
                          onPress={() => handleAddTag(t.name)}
                        >
                          <Text style={styles.suggestionTagText}>#{t.name}</Text>
                        </TouchableOpacity>
                      ))}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.submitButton,
              (isPending || isLoadingAccounts || accounts.length === 0) && { opacity: 0.5 },
            ]}
            onPress={handleSave}
            disabled={isPending || isLoadingAccounts || accounts.length === 0}
          >
            <Text style={styles.submitButtonText}>
              {isPending ? 'Saving...' : isEditing ? 'Save Changes' : 'Save Transaction'}
            </Text>
          </TouchableOpacity>

          {isEditing && (
            <TouchableOpacity
              style={styles.duplicateButton}
              onPress={handleDuplicate}
              disabled={isPending}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <MaterialIcons name="content-copy" size={18} color={colors.primary} />
                <Text style={styles.duplicateButtonText}>Duplicate for Today</Text>
              </View>
            </TouchableOpacity>
          )}

          {isEditing && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDelete}
              disabled={isPending}
            >
              <Text style={styles.deleteButtonText}>Delete Transaction</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAwareScrollView>

      {/* Category Selection Bottom Sheet Modal */}
      <Modal
        visible={showCategoryMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCategoryMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowCategoryMenu(false)}
        >
          <View
            style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <View style={styles.categoryIconBoxHeader}>
                  <MaterialIcons name="category" size={20} color={colors.onPrimaryContainer} />
                </View>
                <Text style={styles.modalTitle}>Select Category</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowCategoryMenu(false)}
              >
                <MaterialIcons name="close" size={24} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
            >
              {allCategories.map((cat) => {
                const isSelected =
                  activeSplitCategoryIndex !== null
                    ? splitItems[activeSplitCategoryIndex]?.category === cat
                    : cat === category;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.categoryOption, isSelected && styles.categoryOptionSelected]}
                    onPress={() => {
                      if (activeSplitCategoryIndex !== null) {
                        setSplitItems((prev) => {
                          const updated = [...prev];
                          updated[activeSplitCategoryIndex] = {
                            ...updated[activeSplitCategoryIndex],
                            category: cat,
                          };
                          return updated;
                        });
                        setActiveSplitCategoryIndex(null);
                      } else {
                        setCategory(cat);
                      }
                      setShowCategoryMenu(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.categoryOptionLeft}>
                      <View
                        style={[
                          styles.categoryIconBox,
                          isSelected && { backgroundColor: colors.primary },
                        ]}
                      >
                        <MaterialIcons
                          name={getCategoryIcon(cat)}
                          size={20}
                          color={isSelected ? colors.onPrimary : colors.onSurfaceVariant}
                        />
                      </View>
                      <Text
                        style={[
                          styles.categoryOptionText,
                          isSelected && { color: colors.primary, fontWeight: '700' },
                        ]}
                      >
                        {cat}
                      </Text>
                    </View>
                    {isSelected && <MaterialIcons name="check" size={20} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  paddingVertical: 14,
                  marginTop: 8,
                  marginBottom: 16,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.primary + '50',
                  backgroundColor: colors.primaryContainer + '25',
                }}
                onPress={() => {
                  setShowCategoryMenu(false);
                  router.navigate('/manage-categories');
                }}
              >
                <MaterialIcons name="add-circle-outline" size={20} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>
                  Manage / Add Custom Categories
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
      {/* Account Selection Bottom Sheet Modal */}
      <Modal
        visible={showAccountMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAccountMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowAccountMenu(false)}
        >
          <View
            style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <View style={styles.categoryIconBoxHeader}>
                  <MaterialIcons name="account-balance" size={20} color={colors.onPrimaryContainer} />
                </View>
                <Text style={styles.modalTitle}>
                  {type === 'transfer' ? 'Select From Account' : 'Select Account'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowAccountMenu(false)}
              >
                <MaterialIcons name="close" size={24} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
            >
              {accounts.map((acc) => {
                const isSelected = acc.id === accountId;
                return (
                  <TouchableOpacity
                    key={acc.id}
                    style={[styles.categoryOption, isSelected && styles.categoryOptionSelected]}
                    onPress={() => {
                      if (type === 'transfer' && acc.id === toAccountId) {
                        setToAccountId(accountId && accountId !== acc.id ? accountId : null);
                      }
                      setAccountId(acc.id);
                      setShowAccountMenu(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.categoryOptionLeft, { flex: 1 }]}>
                      <View
                        style={[
                          styles.categoryIconBox,
                          isSelected && { backgroundColor: colors.primary },
                        ]}
                      >
                        <MaterialIcons
                          name={getAccountTypeIcon(acc.type)}
                          size={20}
                          color={isSelected ? colors.onPrimary : colors.onSurfaceVariant}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.categoryOptionText,
                            isSelected && { color: colors.primary, fontWeight: '700' },
                          ]}
                          numberOfLines={1}
                        >
                          {acc.name}
                        </Text>
                        <Text
                          style={{
                            ...typography.labelMd,
                            color: colors.onSurfaceVariant,
                            fontSize: 11,
                          }}
                          numberOfLines={1}
                        >
                          {getAccountTypeShortLabel(acc.type)}
                          {acc.lastFour ? ` • ...${acc.lastFour}` : ''}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text
                        style={{
                          ...typography.labelMd,
                          fontSize: 12,
                          color:
                            isLiabilityAccountType(acc.type) && acc.balance < 0
                              ? colors.error
                              : colors.onSurfaceVariant,
                        }}
                      >
                        {formatAccountBalanceLabel(acc)}
                      </Text>
                      {isSelected && <MaterialIcons name="check" size={20} color={colors.primary} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Destination Account Selection Bottom Sheet Modal */}
      <Modal
        visible={showToAccountMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowToAccountMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowToAccountMenu(false)}
        >
          <View
            style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 24) + 16 }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <View style={styles.categoryIconBoxHeader}>
                  <MaterialIcons name="handshake" size={20} color={colors.onPrimaryContainer} />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Select Recipient Account</Text>
                  <Text style={{ ...typography.labelMd, fontSize: 11, color: colors.onSurfaceVariant }}>
                    Loan, credit card, or destination account
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setShowToAccountMenu(false)}
              >
                <MaterialIcons name="close" size={24} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
            >
              {accounts.map((acc) => {
                const isSelected = type === 'transfer' && acc.id === toAccountId;
                const isSameAsSource = acc.id === accountId;
                return (
                  <TouchableOpacity
                    key={acc.id}
                    style={[
                      styles.categoryOption,
                      isSelected && styles.categoryOptionSelected,
                      isSameAsSource && { opacity: 0.5 },
                    ]}
                    onPress={() => {
                      if (isSameAsSource) {
                        showToast('Source and recipient accounts must be different', 'info');
                        return;
                      }
                      if (type !== 'transfer') {
                        handleSwitchToLoanPayment(acc);
                      } else {
                        setToAccountId(acc.id);
                      }
                      setShowToAccountMenu(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.categoryOptionLeft, { flex: 1 }]}>
                      <View
                        style={[
                          styles.categoryIconBox,
                          isSelected && { backgroundColor: colors.primary },
                        ]}
                      >
                        <MaterialIcons
                          name={getAccountTypeIcon(acc.type)}
                          size={20}
                          color={isSelected ? colors.onPrimary : colors.onSurfaceVariant}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.categoryOptionText,
                            isSelected && { color: colors.primary, fontWeight: '700' },
                          ]}
                          numberOfLines={1}
                        >
                          {acc.name}
                        </Text>
                        <Text
                          style={{
                            ...typography.labelMd,
                            color: colors.onSurfaceVariant,
                            fontSize: 11,
                          }}
                          numberOfLines={1}
                        >
                          {isSameAsSource
                            ? 'Currently selected as From Account'
                            : `${getAccountTypeShortLabel(acc.type)}${
                                acc.lastFour ? ` • ...${acc.lastFour}` : ''
                              }`}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text
                        style={{
                          ...typography.labelMd,
                          fontSize: 12,
                          color:
                            isLiabilityAccountType(acc.type) && acc.balance < 0
                              ? colors.error
                              : colors.onSurfaceVariant,
                        }}
                      >
                        {formatAccountBalanceLabel(acc)}
                      </Text>
                      {isSelected && <MaterialIcons name="check" size={20} color={colors.primary} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      <VoiceTransactionModal
        visible={showVoiceModal}
        onDismiss={() => setShowVoiceModal(false)}
        onApply={handleApplyVoiceParsed}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, lastFour: a.lastFour }))}
      />

      {/* Fullscreen Receipt Viewer Modal (Images only) */}
      {receiptUri && !isPdfReceipt && (
        <Modal
          visible={showFullReceiptModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowFullReceiptModal(false)}
        >
          <View style={styles.fullscreenModalBackdrop}>
            <View style={styles.fullscreenModalHeader}>
              <Text style={styles.fullscreenModalTitle}>Receipt Photo</Text>
              <TouchableOpacity
                style={styles.fullscreenCloseBtn}
                onPress={() => setShowFullReceiptModal(false)}
              >
                <MaterialIcons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <View style={styles.fullscreenImageContainer}>
              <Image
                source={{ uri: receiptUri }}
                style={styles.fullscreenImage}
                resizeMode="contain"
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surfaceContainerLow,
    },

    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    card: {
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.surfaceContainer,
      borderRadius: 16,
      padding: 24,
      shadowColor: colors.onSurface,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.04,
      shadowRadius: 24,
      elevation: 2,
    },
    typeSwitcher: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceContainer,
      padding: 4,
      borderRadius: 8,
      marginBottom: 32,
    },
    typeButton: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderRadius: 6,
    },
    typeButtonActive: {
      backgroundColor: colors.surfaceContainerLowest,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 1,
    },
    typeButtonText: {
      ...typography.labelMd,
      color: colors.secondary,
    },
    typeButtonTextActive: {
      color: colors.onSurface,
    },
    amountContainer: {
      alignItems: 'center',
      marginBottom: 32,
    },
    amountLabel: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      marginBottom: 8,
    },
    amountInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    currencySymbol: {
      ...typography.dataLg,
      color: colors.onSurface,
      marginRight: 6,
    },
    amountInput: {
      ...typography.displayLg,
      color: colors.onSurface,
      textAlign: 'left',
      paddingHorizontal: 0,
      paddingVertical: 2,
      margin: 0,
    },
    formGroup: {
      gap: 16,
    },
    inputContainer: {
      gap: 4,
      position: 'relative',
    },
    inputLabel: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      marginLeft: 4,
    },
    textInputWrapper: {
      position: 'relative',
      justifyContent: 'center',
    },
    inputIcon: {
      position: 'absolute',
      left: 16,
      zIndex: 10,
    },
    inputRightIcon: {
      position: 'absolute',
      right: 16,
      zIndex: 10,
    },
    textInput: {
      backgroundColor: colors.surfaceContainer,
      borderRadius: 8,
      height: 48,
      paddingLeft: 48,
      paddingRight: 16,
      ...typography.bodyLg,
      color: colors.onSurface,
    },
    recurringContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: colors.surfaceContainer,
      marginTop: 8,
    },
    recurringLabel: {
      ...typography.bodyMd,
      color: colors.onSurface,
    },
    recurringSubtext: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      fontSize: 10,
      lineHeight: 14,
    },
    frequencySection: {
      gap: 8,
      marginTop: 8,
    },
    freqPillRow: {
      flexDirection: 'row',
      backgroundColor: colors.surfaceContainer,
      borderRadius: 12,
      padding: 4,
      gap: 4,
    },
    freqPill: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
    },
    freqPillActive: {
      backgroundColor: colors.primary,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    freqPillText: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      fontSize: 12,
      lineHeight: 16,
    },
    freqPillTextActive: {
      color: colors.onPrimary,
      fontFamily: 'Manrope_700Bold',
    },
    submitButton: {
      marginTop: 32,
      height: 48,
      backgroundColor: colors.primary,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitButtonText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 15,
      lineHeight: 20,
      color: colors.onPrimary,
    },
    duplicateButton: {
      marginTop: 12,
      height: 48,
      backgroundColor: colors.surfaceContainer,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.outlineVariant,
    },
    duplicateButtonText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 15,
      lineHeight: 20,
      color: colors.primary,
    },
    deleteButton: {
      marginTop: 16,
      height: 48,
      backgroundColor: colors.surfaceContainer,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.error + '40',
    },
    deleteButtonText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 15,
      lineHeight: 20,
      color: colors.error,
    },
    addTagInlineBtn: {
      padding: 4,
      marginRight: 6,
    },
    tagChipsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 10,
    },
    selectedTagChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      backgroundColor: colors.primaryContainer,
    },
    selectedTagText: {
      ...typography.labelMd,
      color: colors.onPrimaryContainer,
      fontWeight: '600',
      fontSize: 12,
    },
    tagSuggestionsRow: {
      marginTop: 10,
    },
    suggestionTagChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
    },
    suggestionTagText: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      fontSize: 11,
      fontWeight: '500',
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
      maxHeight: '75%',
      paddingTop: 20,
      paddingHorizontal: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.1,
      shadowRadius: 16,
      elevation: 8,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceVariant,
    },
    modalHeaderTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    categoryIconBoxHeader: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalTitle: {
      ...typography.headlineSm,
      color: colors.onSurface,
    },
    modalCloseBtn: {
      padding: 4,
    },
    modalScroll: {
      maxHeight: 380,
    },
    modalScrollContent: {
      paddingVertical: 12,
      gap: 4,
    },
    categoryOption: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
    },
    categoryOptionSelected: {
      backgroundColor: colors.surfaceContainer,
    },
    categoryOptionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    categoryIconBox: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryOptionText: {
      ...typography.bodyLg,
      color: colors.onSurface,
    },
    quickChipsRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
      justifyContent: 'center',
      flexWrap: 'wrap',
    },
    quickChip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: colors.surfaceContainer,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickChipText: {
      ...typography.labelMd,
      color: colors.onSurface,
      fontWeight: '600',
      lineHeight: 16,
      textAlignVertical: 'center',
    },
    splitToggleContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.surfaceVariant,
    },
    splitToggleSubtitle: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 2,
    },
    splitsCard: {
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 12,
      padding: 12,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
    },
    splitHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    splitHeaderTitle: {
      ...typography.labelMd,
      fontFamily: 'Manrope_600SemiBold',
      color: colors.onSurface,
      textTransform: 'uppercase',
      letterSpacing: Platform.OS === 'ios' ? 0.5 : 0,
    },
    splitSumText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 11,
      lineHeight: 16,
    },
    splitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    splitCategoryBtn: {
      flex: 1.2,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surfaceContainer,
      borderRadius: 8,
      paddingHorizontal: 10,
      height: 42,
    },
    splitCategoryText: {
      ...typography.bodyMd,
      color: colors.onSurface,
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
    },
    splitAmountInputWrapper: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainer,
      borderRadius: 8,
      paddingHorizontal: 8,
      height: 42,
    },
    splitCurrency: {
      ...typography.bodyMd,
      color: colors.onSurfaceVariant,
      marginRight: 4,
    },
    splitAmountInput: {
      flex: 1,
      ...typography.bodyMd,
      color: colors.onSurface,
      padding: 0,
    },
    splitDeleteBtn: {
      padding: 6,
      borderRadius: 16,
      backgroundColor: colors.errorContainer,
    },
    addSplitBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.primary + '44',
      borderStyle: 'dashed',
    },
    addSplitBtnText: {
      ...typography.labelMd,
      fontWeight: '600',
    },
    headerActionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 0,
    },
    headerIconButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      alignItems: 'center',
      justifyContent: 'center',
    },
    smartActionsRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 16,
    },
    smartActionCard: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderRadius: 14,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    smartActionIconBox: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.primaryContainer,
      alignItems: 'center',
      justifyContent: 'center',
    },
    smartActionTitle: {
      ...typography.labelMd,
      fontWeight: '700',
      fontSize: 12,
      color: colors.onSurface,
    },
    smartActionSubtitle: {
      ...typography.labelMd,
      fontSize: 10,
      color: colors.onSurfaceVariant,
    },
    attachmentSection: {
      gap: 8,
    },
    attachmentHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    attachmentTitle: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
    },
    attachBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    attachBtnText: {
      ...typography.labelMd,
      fontWeight: '700',
      fontSize: 12,
    },
    receiptPreviewCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: 14,
      padding: 10,
      gap: 12,
    },
    receiptThumbWrapper: {
      width: 52,
      height: 52,
      borderRadius: 8,
      overflow: 'hidden',
      position: 'relative',
    },
    receiptThumbnail: {
      width: '100%',
      height: '100%',
    },
    pdfThumbnailBox: {
      width: '100%',
      height: '100%',
      backgroundColor: colors.surfaceContainerHighest,
      alignItems: 'center',
      justifyContent: 'center',
    },
    zoomOverlayBadge: {
      position: 'absolute',
      bottom: 2,
      right: 2,
      backgroundColor: 'rgba(0,0,0,0.6)',
      borderRadius: 4,
      padding: 2,
    },
    receiptInfoCol: {
      flex: 1,
      gap: 2,
    },
    receiptAttachedText: {
      ...typography.labelMd,
      fontWeight: '700',
      fontSize: 13,
    },
    receiptSubtext: {
      ...typography.bodyMd,
      fontSize: 11,
    },
    removeReceiptBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fullscreenModalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.92)',
      justifyContent: 'space-between',
    },
    fullscreenModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 50,
      paddingBottom: 16,
    },
    fullscreenModalTitle: {
      ...typography.headlineSm,
      color: '#FFFFFF',
      fontSize: 18,
    },
    fullscreenCloseBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.2)',
    },
    fullscreenImageContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    },
    fullscreenImage: {
      width: '100%',
      height: '100%',
    },
    transferRouteCard: {
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: 12,
      gap: 10,
    },
    transferLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingRight: 4,
    },
    transferRoleHint: {
      ...typography.labelMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
    },
    accountSelectContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      paddingRight: 42,
    },
    accountSelectBalance: {
      ...typography.labelMd,
      fontSize: 12,
      color: colors.onSurfaceVariant,
      flexShrink: 0,
    },
    transferSwapRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    transferRouteDivider: {
      flex: 1,
      height: 1,
      backgroundColor: colors.surfaceContainerHigh,
    },
    transferSwapBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      backgroundColor: colors.primaryContainer + '55',
      borderWidth: 1,
      borderColor: colors.primary + '35',
    },
    transferSwapText: {
      ...typography.labelMd,
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
      color: colors.primary,
    },
    impactPreviewCard: {
      backgroundColor: colors.surfaceContainerLowest,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      padding: 10,
      gap: 7,
      marginTop: 2,
    },
    impactPreviewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    impactPreviewTitle: {
      ...typography.labelMd,
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
      color: colors.primary,
    },
    impactPreviewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    impactAccountName: {
      ...typography.bodyMd,
      fontSize: 12,
      fontFamily: 'Manrope_600SemiBold',
      color: colors.onSurface,
      flex: 1,
    },
    impactValuesCol: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexShrink: 0,
    },
    impactTransitionText: {
      ...typography.labelMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
    },
    impactDeltaBadge: {
      ...typography.labelMd,
      fontSize: 11,
      fontFamily: 'Manrope_700Bold',
    },
    impactWarningRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingTop: 4,
      borderTopWidth: 1,
      borderTopColor: colors.surfaceContainer,
    },
    impactWarningText: {
      ...typography.labelMd,
      fontSize: 11,
      color: '#D97706',
      flex: 1,
    },
    debtHelperCardWarn: {
      marginTop: 8,
      backgroundColor: 'rgba(217, 119, 6, 0.08)',
      borderWidth: 1,
      borderColor: 'rgba(217, 119, 6, 0.35)',
      borderRadius: 12,
      padding: 12,
      gap: 8,
    },
    debtHelperCardInfo: {
      marginTop: 8,
      backgroundColor: colors.primaryContainer + '35',
      borderWidth: 1,
      borderColor: colors.primary + '35',
      borderRadius: 12,
      padding: 12,
      gap: 6,
    },
    debtHelperHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    debtHelperTitle: {
      ...typography.labelMd,
      fontSize: 12,
      fontFamily: 'Manrope_700Bold',
      color: colors.onSurface,
      flex: 1,
    },
    debtHelperBody: {
      ...typography.bodyMd,
      fontSize: 12,
      color: colors.onSurfaceVariant,
      lineHeight: 17,
    },
    debtHelperPrimaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 9,
      paddingHorizontal: 12,
    },
    debtHelperPrimaryBtnText: {
      ...typography.labelMd,
      fontSize: 12,
      fontFamily: 'Manrope_700Bold',
      color: colors.onPrimary,
    },
    debtQuickTargetChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surfaceContainerLowest,
      borderWidth: 1,
      borderColor: colors.primary + '45',
      borderRadius: 16,
      paddingVertical: 6,
      paddingHorizontal: 10,
    },
    debtQuickTargetText: {
      ...typography.labelMd,
      fontSize: 11,
      fontFamily: 'Manrope_600SemiBold',
      color: colors.primary,
    },
    debtInlineLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingTop: 6,
      paddingHorizontal: 4,
    },
    debtInlineLinkText: {
      ...typography.labelMd,
      fontSize: 12,
      color: colors.primary,
      fontFamily: 'Manrope_600SemiBold',
    },
  });
  return styles;
};

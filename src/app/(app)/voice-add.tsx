import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAccounts } from '@/hooks/use-accounts';
import { useCreateTransaction } from '@/hooks/use-transactions';
import { VoiceTransactionModal } from '@/components/modals/VoiceTransactionModal';
import { useToast } from '@/components/ui';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useTheme } from '@/theme';
import { getCurrencySymbol } from '@/utils/format';
import { haptics } from '@/utils/haptics';
import type { ParsedVoiceTransaction } from '@/services/voice/voice-parser';

export default function VoiceAddScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeInsets();
  const { showToast } = useToast();
  const { accounts, isLoading } = useAccounts();
  const { mutate: createTransaction } = useCreateTransaction();
  const [modalVisible, setModalVisible] = useState(true);

  const handleDismiss = useCallback(() => {
    setModalVisible(false);
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)/(tabs)');
    }
  }, [router]);

  const handleApply = useCallback(
    (parsed: ParsedVoiceTransaction) => {
      setModalVisible(false);
      const queryParams: Record<string, string> = {
        amount: parsed.amount.toString(),
        type: parsed.type || 'expense',
      };
      if (parsed.merchant) queryParams.merchant = parsed.merchant;
      if (parsed.category) queryParams.category = parsed.category;
      if (parsed.note) queryParams.note = parsed.note;
      if (parsed.accountId) {
        queryParams.accountId = parsed.accountId;
      }

      router.replace({
        pathname: '/(app)/add-transaction',
        params: queryParams,
      });
    },
    [router]
  );

  const handleDirectSave = useCallback(
    (parsed: ParsedVoiceTransaction) => {
      setModalVisible(false);
      const targetAccount =
        accounts.find((a) => a.id === parsed.accountId) ||
        accounts.find((a) => a.isPrimary) ||
        accounts[0];
      if (!targetAccount) {
        showToast('Please add a bank account first', 'error');
        handleDismiss();
        return;
      }

      createTransaction(
        {
          accountId: targetAccount.id,
          amount: parsed.amount,
          type: parsed.type || 'expense',
          merchant: parsed.merchant || 'General',
          category: parsed.category || 'General',
          date: new Date().toISOString(),
          note: parsed.note || 'Logged via Quick Voice',
          isRecurring: false,
          source: 'MANUAL',
          status: 'VERIFIED',
        },
        {
          onSuccess: () => {
            haptics.success();
            showToast(
              `Saved ${parsed.type || 'expense'}: ${parsed.merchant || 'Transaction'} (${getCurrencySymbol()}${parsed.amount.toFixed(2)})`,
              'success'
            );
            handleDismiss();
          },
          onError: () => {
            haptics.error();
            showToast('Could not save voice transaction. Please try again.', 'error');
            handleDismiss();
          },
        }
      );
    },
    [accounts, createTransaction, handleDismiss, showToast]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: insets.bottom }]}>
      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : (
        <VoiceTransactionModal
          visible={modalVisible}
          onDismiss={handleDismiss}
          onApply={handleApply}
          onSave={handleDirectSave}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, lastFour: a.lastFour }))}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

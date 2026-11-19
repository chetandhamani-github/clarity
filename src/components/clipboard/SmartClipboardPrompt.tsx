import { Text, useToast } from '@/components/ui';
import { useAccounts } from '@/hooks/use-accounts';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useCreateTransaction } from '@/hooks/use-transactions';
import { ParsedPaymentIntent, parsePaymentClipboard } from '@/services/clipboard/payment-clipboard-parser';
import { useAppStore } from '@/store/use-app-store';
import { radius, ThemeColors, typography, useTheme } from '@/theme';
import { formatCurrency } from '@/utils/format';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    Animated,
    AppState,
    AppStateStatus,
    StyleSheet,
    TouchableOpacity,
    View,
} from 'react-native';

export function SmartClipboardPrompt() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeInsets();
  const router = useRouter();
  const { showToast } = useToast();

  const clipboardDetectionEnabled = useAppStore((state) => state.clipboardDetectionEnabled);
  const lastDismissedClipboardHash = useAppStore((state) => state.lastDismissedClipboardHash);
  const setLastDismissedClipboardHash = useAppStore((state) => state.setLastDismissedClipboardHash);

  const { accounts } = useAccounts();
  const addTransactionMutation = useCreateTransaction();

  const [intent, setIntent] = useState<ParsedPaymentIntent | null>(null);
  const slideAnim = useRef(new Animated.Value(120)).current;
  const isChecking = useRef(false);

  const checkClipboard = async () => {
    if (!clipboardDetectionEnabled || isChecking.current) return;
    isChecking.current = true;

    try {
      const text = await Clipboard.getStringAsync();
      if (!text) {
        isChecking.current = false;
        return;
      }

      const parsed = parsePaymentClipboard(text);
      if (parsed && parsed.contentHash !== lastDismissedClipboardHash) {
        setIntent(parsed);
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 10,
        }).start();
      }
    } catch {
      // Ignore clipboard read failure
    } finally {
      isChecking.current = false;
    }
  };

  useEffect(() => {
    // Check on mount
    checkClipboard();

    // Check when returning from background (e.g. after returning from GPay / PhonePe)
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        checkClipboard();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [clipboardDetectionEnabled, lastDismissedClipboardHash]);

  const handleDismiss = () => {
    if (intent) {
      setLastDismissedClipboardHash(intent.contentHash);
    }
    Animated.timing(slideAnim, {
      toValue: 140,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setIntent(null));
  };

  const handleQuickSave = async () => {
    if (!intent) return;

    // Pick first valid bank account or fallback
    const targetAccount =
      accounts.find((a) => ['savings', 'checking', 'current', 'wallet'].includes(a.type)) ||
      accounts[0];

    if (!targetAccount) {
      showToast('Please create an account first to log expenses', 'error');
      handleDismiss();
      return;
    }

    try {
      await addTransactionMutation.mutateAsync({
        accountId: targetAccount.id,
        amount: intent.amount,
        type: 'expense',
        merchant: intent.merchant,
        category: 'Food & Dining', // Smart rules engine will automatically override if a rule matches!
        date: intent.dateStr,
        isRecurring: false,
        note: intent.upiRef ? `UPI Ref: ${intent.upiRef}` : 'Logged via Quick Clipboard',
        source: 'MANUAL',
      });

      showToast(
        `Logged ${formatCurrency(intent.amount)} at ${intent.merchant} to ${targetAccount.name}!`,
        'success'
      );
    } catch {
      showToast('Failed to save payment', 'error');
    } finally {
      handleDismiss();
    }
  };

  const handleCustomize = () => {
    if (!intent) return;
    const { amount, merchant, upiRef } = intent;
    handleDismiss();
    router.navigate({
      pathname: '/(app)/add-transaction',
      params: {
        amount: amount.toString(),
        merchant,
        note: upiRef ? `UPI Ref: ${upiRef}` : '',
        type: 'expense',
      },
    });
  };

  if (!intent) return null;

  return (
    <Animated.View
      style={[
        styles.floatingContainer,
        {
          bottom: insets.bottom + 65,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.card}>
        <View style={styles.contentRow}>
          <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}18` }]}>
            <MaterialIcons name="bolt" size={20} color={colors.primary} />
          </View>

          <View style={{ flex: 1, marginRight: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.headerLabel}>UPI PAYMENT DETECTED</Text>
              {intent.upiRef && (
                <View style={[styles.refBadge, { backgroundColor: colors.surfaceContainerHigh }]}>
                  <Text style={styles.refBadgeText}>UTR MATCH</Text>
                </View>
              )}
            </View>

            <Text style={styles.amountText} numberOfLines={1}>
              {formatCurrency(intent.amount)}{' '}
              <Text style={styles.merchantText}>at {intent.merchant}</Text>
            </Text>
          </View>

          <TouchableOpacity onPress={handleDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <MaterialIcons name="close" size={18} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
        </View>

        {/* Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.quickSaveBtn, { backgroundColor: colors.primary }]}
            onPress={handleQuickSave}
            activeOpacity={0.8}
          >
            <MaterialIcons name="check" size={16} color={colors.onPrimary} />
            <Text style={[styles.quickSaveText, { color: colors.onPrimary }]}>1-Tap Save</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.customizeBtn, { backgroundColor: colors.surfaceContainerHigh }]}
            onPress={handleCustomize}
            activeOpacity={0.8}
          >
            <MaterialIcons name="tune" size={16} color={colors.onSurface} />
            <Text style={styles.customizeText}>Customize</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    floatingContainer: {
      position: 'absolute',
      left: 16,
      right: 16,
      zIndex: 9999,
      elevation: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
    },
    card: {
      backgroundColor: colors.surfaceContainerHighest,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
      padding: 12,
    },
    contentRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    headerLabel: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 9,
      color: colors.primary,
      letterSpacing: 0.5,
    },
    refBadge: {
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: radius.sm,
    },
    refBadgeText: {
      ...typography.labelMd,
      fontSize: 8,
      fontFamily: 'Manrope_700Bold',
      color: colors.onSurfaceVariant,
    },
    amountText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 14,
      color: colors.onSurface,
      marginTop: 1,
    },
    merchantText: {
      ...typography.bodyMd,
      fontSize: 13,
      color: colors.onSurfaceVariant,
    },
    buttonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    quickSaveBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      borderRadius: radius.full,
    },
    quickSaveText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_700Bold',
      fontSize: 12,
    },
    customizeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: radius.full,
    },
    customizeText: {
      ...typography.labelMd,
      fontFamily: 'Manrope_600SemiBold',
      fontSize: 12,
      color: colors.onSurface,
    },
  });
  return styles;
};

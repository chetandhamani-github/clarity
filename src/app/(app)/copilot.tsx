import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Text, Header, useAlert, useToast, NoNetworkView } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useMonthlyTotals, useRecurringTransactions } from '@/hooks/use-transactions';
import { useBudgetPlan, useCategorySpending } from '@/hooks/use-budget';
import { useAccounts } from '@/hooks/use-accounts';
import { useInvestments, usePortfolioSummary } from '@/hooks/use-investments';
import { useMonthlyBillSummary } from '@/hooks/use-bills';
import { useGoals } from '@/hooks/use-goals';
import { useSafeToSpend } from '@/hooks/use-cashflow';
import { useDebtPayoff } from '@/hooks/use-debt-payoff';
import { useFinancialHealth } from '@/hooks/use-financial-health';
import { chatWithFinancialCopilot } from '@/services/api/ai.api';
import { fetchRemoteConfig } from '@/services/api/config.api';
import { apiClient } from '@/services/api/client';
import { useNetworkStore } from '@/store/use-network-store';
import { isNetworkError } from '@/services/network/network.service';
import { ChatMessage, useCopilotStore } from '@/store/use-copilot-store';
import { getCurrencySymbol } from '@/utils/format';

const SUGGESTED_PROMPTS = [
  'What is my total net worth and investment breakdown?',
  'What are my active recurring subscriptions and payments?',
  'How are my investments and portfolio performing?',
  'Am I meeting my 50/30/20 budget targets?',
  'What are my upcoming bills and debt commitments?',
  'What is my safe-to-spend balance and runway?',
  'How can I save more money this month?',
];

function getActionLabel(actionRoute: string): string {
  if (actionRoute.includes('investments')) return 'View Investments & Portfolio →';
  if (actionRoute.includes('debt-payoff')) return 'Open Debt Payoff Planner →';
  if (actionRoute.includes('cashflow')) return 'View Cashflow & Runway →';
  if (actionRoute.includes('financial-health')) return 'View Financial Health →';
  if (actionRoute.includes('plan')) return 'Open Budget Plan →';
  if (actionRoute.includes('bills')) return 'Manage Bills & Subscriptions →';
  if (actionRoute.includes('goals')) return 'View Savings Goals →';
  if (actionRoute.includes('accounts')) return 'View Bank Accounts →';
  if (actionRoute.includes('analytics')) return 'View Analytics & Recurring →';
  return 'View Transactions →';
}

const ChatMessageBubble = React.memo(function ChatMessageBubble({
  item,
  colors,
  styles,
  onActionPress,
  onRetryPress,
}: {
  item: ChatMessage;
  colors: ThemeColors;
  styles: any;
  onActionPress: (action: string) => void;
  onRetryPress?: (failedQuery: string) => void;
}) {
  const isUser = item.sender === 'user';

  return (
    <View
      style={[
        styles.messageRow,
        isUser ? styles.messageRowUser : styles.messageRowAssistant,
      ]}
    >
      {!isUser && (
        <View style={styles.assistantAvatar}>
          <MaterialIcons name="auto-awesome" size={15} color={colors.onPrimary} />
        </View>
      )}

      <View
        style={[
          styles.bubbleContainer,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
        ]}
      >
        <Text
          selectable
          style={[styles.messageText, isUser ? styles.messageTextUser : styles.messageTextAssistant]}
        >
          {item.text}
        </Text>

        {item.suggestedAction && (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => onActionPress(item.suggestedAction!)}
            activeOpacity={0.7}
          >
            <MaterialIcons name="arrow-outward" size={14} color={colors.primary} />
            <Text style={styles.actionBtnText}>{getActionLabel(item.suggestedAction)}</Text>
          </TouchableOpacity>
        )}

        {item.isError && item.failedQuery && onRetryPress && (
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => onRetryPress(item.failedQuery!)}
            activeOpacity={0.7}
          >
            <MaterialIcons name="refresh" size={14} color={colors.error} />
            <Text style={styles.retryBtnText}>Tap to retry</Text>
          </TouchableOpacity>
        )}

        <View style={[styles.timestampContainer, isUser ? styles.timestampContainerUser : styles.timestampContainerAssistant]}>
          <Text style={[styles.timestampText, isUser ? styles.timestampUser : styles.timestampAssistant]}>
            {item.timestamp}
          </Text>
          {isUser && (
            <MaterialIcons
              name="done-all"
              size={14}
              color="rgba(255, 255, 255, 0.75)"
              style={styles.readReceiptIcon}
            />
          )}
        </View>
      </View>
    </View>
  );
});

export default function CopilotScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const router = useRouter();
  const insets = useSafeInsets();
  const { height: windowHeight } = useWindowDimensions();
  const params = useLocalSearchParams<{ month?: string; year?: string }>();
  const { showAlert } = useAlert();
  const { showToast } = useToast();

  const now = new Date();
  const selectedMonth = params.month ? parseInt(params.month, 10) : now.getMonth() + 1;
  const selectedYear = params.year ? parseInt(params.year, 10) : now.getFullYear();

  const { totals } = useMonthlyTotals(selectedMonth, selectedYear);
  const { plan } = useBudgetPlan();
  const { spending } = useCategorySpending(selectedMonth, selectedYear);
  const { accounts } = useAccounts();
  const { summary: portfolioSummary } = usePortfolioSummary();
  const { holdings } = useInvestments();
  const { data: billSummary } = useMonthlyBillSummary(selectedMonth, selectedYear);
  const { goals } = useGoals();
  const { summary: safeToSpendSummary } = useSafeToSpend();
  const { debts } = useDebtPayoff();
  const { transactions: recurringTransactions } = useRecurringTransactions();
  const { report: healthReport } = useFinancialHealth(selectedMonth, selectedYear);

  const isConnected = useNetworkStore((state) => state.isConnected);
  const isChecking = useNetworkStore((state) => state.isChecking);
  const checkConnection = useNetworkStore((state) => state.checkConnection);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const textInputRef = useRef<TextInput>(null);
  const isAtBottomRef = useRef(true);
  const initialWindowHeightRef = useRef(windowHeight);

  if (keyboardHeight === 0 && windowHeight > initialWindowHeightRef.current) {
    initialWindowHeightRef.current = windowHeight;
  }

  const scrollToEnd = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Warm up backend silently so Render is active when user sends a query
  useEffect(() => {
    apiClient.get('/actuator/health', { timeoutMs: 30000 }).catch(() => {});
    fetchRemoteConfig().catch(() => {});
  }, []);

  const messages = useCopilotStore((state) => state.messages);
  const setMessages = useCopilotStore((state) => state.setMessages);
  const clearMessages = useCopilotStore((state) => state.clearMessages);

  // Comprehensive anonymized context summary constructed on-device across all financial pillars
  const financialContext = useMemo(() => {
    const parts: string[] = [];
    const sym = getCurrencySymbol();

    // 1. Period
    parts.push(`[PERIOD] Month: ${selectedMonth}/${selectedYear}`);

    // 2. Monthly Cashflow & Savings
    const income = totals?.income || 0;
    const expenses = totals?.expenses || 0;
    const netSavings = income - expenses;
    parts.push(
      `[MONTHLY CASHFLOW] Income: ${sym}${Math.round(income)}, Expenses: ${sym}${Math.round(expenses)}, Net Savings: ${sym}${Math.round(netSavings)}`
    );

    // 3. Category Spending Breakdown
    const activeSpending = (spending || [])
      .filter((s) => s.spent > 0)
      .sort((a, b) => b.spent - a.spent);
    if (activeSpending.length > 0) {
      const topCategories = activeSpending
        .slice(0, 6)
        .map(
          (s) =>
            `${s.category}: ${sym}${Math.round(s.spent)}${s.limit > 0 ? ` (Budget: ${sym}${Math.round(s.limit)})` : ''}`
        )
        .join(', ');
      parts.push(`[TOP SPENDING CATEGORIES] ${topCategories}`);
    }

    // 4. Accounts & Liquid Balances
    const safeAccounts = Array.isArray(accounts) ? accounts : [];
    const liquidAccounts = safeAccounts.filter((a) =>
      ['savings', 'current', 'wallet', 'checking'].includes(a.type)
    );
    const totalLiquidCash = liquidAccounts.reduce(
      (sum, a) => sum + (a.balance > 0 ? a.balance : 0),
      0
    );
    const liquidBreakdown = liquidAccounts
      .filter((a) => a.balance > 0)
      .map((a) => `${a.name}: ${sym}${Math.round(a.balance)}`)
      .join(', ');

    parts.push(
      `[LIQUID CASH & ACCOUNTS] Total Liquid Cash: ${sym}${Math.round(totalLiquidCash)}${
        liquidBreakdown ? ` (${liquidBreakdown})` : ''
      }`
    );

    // 5. Net Worth & Investments Portfolio
    if (portfolioSummary) {
      const p = portfolioSummary;
      const gainSign = p.unrealizedGainLoss >= 0 ? '+' : '';
      const allocSummary = (p.allocations || [])
        .filter((a) => a.amount > 0)
        .map((a) => `${a.label}: ${sym}${Math.round(a.amount)} (${Math.round(a.percentage)}%)`)
        .join(', ');

      const totalSipCommitment = (holdings || [])
        .filter((h) => (h.sipAmount || 0) > 0)
        .reduce((sum, h) => sum + (h.sipAmount || 0), 0);

      const topHoldings = (holdings || [])
        .slice(0, 5)
        .map(
          (h) =>
            `${h.name} (${h.subType || h.assetClass}): Value ${sym}${Math.round(h.currentValue)} [Invested: ${sym}${Math.round(h.investedAmount)}]`
        )
        .join(', ');

      parts.push(
        `[NET WORTH & INVESTMENTS] Total Net Worth: ${sym}${Math.round(
          p.totalNetWorthWithInvestments
        )}, Total Portfolio Value: ${sym}${Math.round(
          p.totalPortfolioValue
        )}, Total Invested: ${sym}${Math.round(
          p.totalInvestedAmount
        )}, Unrealized Gain/Loss: ${gainSign}${sym}${Math.round(
          p.unrealizedGainLoss
        )} (${gainSign}${(p.gainLossPercentage ?? 0).toFixed(1)}%), Holdings Count: ${p.holdingsCount}${
          allocSummary ? `, Asset Allocation: [${allocSummary}]` : ''
        }${totalSipCommitment > 0 ? `, Active Monthly SIP Total: ${sym}${Math.round(totalSipCommitment)}` : ''}${
          topHoldings ? `, Top Holdings: [${topHoldings}]` : ''
        }`
      );
    } else {
      parts.push(`[NET WORTH & INVESTMENTS] No investment portfolio recorded yet.`);
    }

    // 6. Debts & Liabilities
    const safeDebts = Array.isArray(debts) ? debts : [];
    const totalDebt = safeDebts.reduce((sum, d) => sum + (d.balance || 0), 0);
    if (safeDebts.length > 0) {
      const debtDetails = safeDebts
        .map(
          (d) =>
            `${d.name} (${d.type}): ${sym}${Math.round(d.balance)}${
              d.interestRate ? ` @ ${d.interestRate}% APR` : ''
            }`
        )
        .join(', ');
      parts.push(
        `[DEBTS & LIABILITIES] Total Outstanding Debt: ${sym}${Math.round(totalDebt)} across ${
          safeDebts.length
        } account(s) (${debtDetails})`
      );
    } else {
      parts.push(`[DEBTS & LIABILITIES] Total Outstanding Debt: ${sym}0 (No active debts)`);
    }

    // 7. Bills & Subscriptions
    if (billSummary) {
      parts.push(
        `[BILLS & OBLIGATIONS] Monthly Committed Bills: ${sym}${Math.round(
          billSummary.totalCommitted || 0
        )}, Paid: ${sym}${Math.round(billSummary.totalPaid || 0)}, Pending: ${sym}${Math.round(
          billSummary.totalPending || 0
        )}, Overdue: ${sym}${Math.round(billSummary.totalOverdue || 0)}, Upcoming Due Count: ${
          billSummary.upcomingCount || 0
        }`
      );
    }

    // 8. Recurring Payments & Subscriptions (from Analytics Recurring ledger)
    const safeRecurring = Array.isArray(recurringTransactions) ? recurringTransactions : [];
    if (safeRecurring.length > 0) {
      const recurringDetails = safeRecurring
        .slice(0, 8)
        .map(
          (rt) =>
            `${rt.merchant || rt.category} (${rt.type}): ${sym}${Math.round(rt.amount)} [${rt.frequency}, next: ${rt.nextProcessDate}]`
        )
        .join(', ');

      const totalMonthlyEstimate = safeRecurring.reduce((sum, rt) => {
        const amt = rt.amount || 0;
        if (rt.type !== 'expense') return sum;
        if (rt.frequency === 'daily') return sum + amt * 30;
        if (rt.frequency === 'weekly') return sum + amt * 4.33;
        if (rt.frequency === 'yearly') return sum + amt / 12;
        return sum + amt; // monthly
      }, 0);

      parts.push(
        `[RECURRING PAYMENTS & COMMITMENTS] Total Active: ${safeRecurring.length} item(s) (~${sym}${Math.round(totalMonthlyEstimate)}/mo estimated expenses). Schedules: ${recurringDetails}`
      );
    } else {
      parts.push(`[RECURRING PAYMENTS & COMMITMENTS] No active recurring transactions scheduled.`);
    }

    // 9. Savings Goals
    const safeGoals = Array.isArray(goals) ? goals : [];
    if (safeGoals.length > 0) {
      const goalsSummary = safeGoals
        .slice(0, 4)
        .map((g) => {
          const target = g.targetAmount || 0;
          const current = g.currentAmount || 0;
          const pct = target > 0 ? Math.round((current / target) * 100) : 0;
          return `${g.name}: ${sym}${Math.round(current)}/${sym}${Math.round(target)} (${pct}%)`;
        })
        .join(', ');
      parts.push(`[SAVINGS GOALS] ${goalsSummary}`);
    }

    // 10. Cashflow Runway & Safe to Spend
    if (safeToSpendSummary) {
      const s = safeToSpendSummary;
      parts.push(
        `[SAFE TO SPEND & RUNWAY] Safe to Spend: ${sym}${Math.round(
          s.safeToSpendTotal || 0
        )} total (${sym}${Math.round(s.safeToSpendDaily || 0)}/day), Runway: ${s.runwayDays || 0} days, Days to Payday: ${
          s.daysToNextPayday || 0
        }${
          s.hasCashCrunch
            ? `, WARNING: Cash Crunch projected on ${s.cashCrunchDate} with shortfall of ${sym}${Math.round(
                s.cashCrunchShortfall || 0
              )}`
            : ''
        }`
      );
    }

    // 11. Budget Plan Targets
    if (plan) {
      parts.push(
        `[BUDGET PLAN] Income: ${sym}${plan.monthlyIncome}, Needs: ${plan.needsPercent}%, Wants: ${plan.wantsPercent}%, Savings: ${plan.savingsPercent}%`
      );
    }

    // 12. Holistic Financial Health Score
    if (healthReport) {
      parts.push(
        `[FINANCIAL HEALTH SCORE] Overall: ${healthReport.overallScore}/100 (${healthReport.grade} - ${healthReport.headline}), Runway: ${healthReport.pillars.runway.metricValue}, Savings Rate: ${healthReport.pillars.savingsRate.metricValue}, Credit Utilization: ${healthReport.pillars.creditUtilization.metricValue}, DTI: ${healthReport.pillars.debtBurden.metricValue}, Spend/Income: ${healthReport.pillars.budgetAdherence.metricValue}`
      );
    }

    return parts.join('\n');
  }, [
    selectedMonth,
    selectedYear,
    totals,
    spending,
    accounts,
    portfolioSummary,
    holdings,
    debts,
    billSummary,
    recurringTransactions,
    goals,
    safeToSpendSummary,
    plan,
    healthReport,
  ]);

  const handleSendMessage = useCallback(async (textToSend?: string) => {
    const query = (textToSend ?? inputText).trim();
    if (!query || isSending) return;

    if (!isConnected) {
      const isOnline = await checkConnection();
      if (!isOnline) {
        showToast('Cannot send message while offline. Please check your connection.', 'error');
        return;
      }
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsSending(true);

    requestAnimationFrame(() => {
      textInputRef.current?.focus();
    });

    setTimeout(() => scrollToEnd(true), 80);

    try {
      const response = await chatWithFinancialCopilot({
        message: query,
        financialContextSummary: financialContext,
      });

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: response.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedAction: response.suggestedAction,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      scrollToEnd(true);
      setTimeout(() => scrollToEnd(true), 150);
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        void useNetworkStore.getState().verifyConnection();
      }
      showToast('Could not reach assistant. Please try again.', 'error');
      const isNet = isNetworkError(err);
      const errorMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: isNet
          ? "I'm having trouble reaching the Clarity AI server. The cloud service may be waking up or your connection was interrupted."
          : "I couldn't process that query right now. Please check your connection and try again.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: true,
        failedQuery: query,
      };
      setMessages((prev) => [...prev, errorMsg]);
      scrollToEnd(true);
      setTimeout(() => scrollToEnd(true), 150);
    } finally {
      setIsSending(false);
      requestAnimationFrame(() => {
        textInputRef.current?.focus();
      });
    }
  }, [inputText, isSending, isConnected, checkConnection, financialContext, scrollToEnd, showToast]);

  const handleClearHistory = () => {
    showAlert(
      'Clear Conversation',
      'Are you sure you want to clear this conversation and start fresh?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            clearMessages();
            showToast('Conversation cleared', 'info');
          },
        },
      ]
    );
  };

  const handleActionPress = useCallback((actionRoute: string) => {
    try {
      // Normalize tab routes to stack screen routes so they are cleanly opened from the Copilot stack
      const normalizedRoute = actionRoute
        .replace('/(tabs)/', '/')
        .replace('/(app)/(tabs)/', '/(app)/');
      router.navigate(normalizedRoute as any);
    } catch {
      router.navigate('/(app)/plan');
    }
  }, [router]);

  const handleRetry = useCallback(
    (failedQuery: string) => {
      handleSendMessage(failedQuery);
    },
    [handleSendMessage]
  );

  const renderMessageItem = useCallback(
    ({ item }: { item: ChatMessage }) => (
      <ChatMessageBubble
        item={item}
        colors={colors}
        styles={styles}
        onActionPress={handleActionPress}
        onRetryPress={handleRetry}
      />
    ),
    [colors, styles, handleActionPress, handleRetry]
  );

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
    const isCloseToBottom = distanceFromBottom < 80;
    isAtBottomRef.current = isCloseToBottom;
    setShowScrollBottom(distanceFromBottom > 150);
  }, []);

  const handleContentSizeChange = useCallback(() => {
    if (isAtBottomRef.current) {
      scrollToEnd(true);
    }
  }, [scrollToEnd]);

  // Extra breathing room gap between chat bar and keyboard
  const KEYBOARD_GAP = 18;

  // Check if Android OS already resized the window (adjustResize)
  const isAndroidWindowResized =
    Platform.OS === 'android' && initialWindowHeightRef.current - windowHeight > 100;

  const androidBottomPadding =
    Platform.OS === 'android' && keyboardHeight > 0
      ? isAndroidWindowResized
        ? KEYBOARD_GAP
        : keyboardHeight + KEYBOARD_GAP
      : 0;

  if (!isConnected && messages.length <= 1) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, flex: 1, backgroundColor: colors.background }]}>
        <Header showBack title="Clarity Copilot" />
        <NoNetworkView
          variant="fullscreen"
          title="Clarity Copilot Offline"
          message="Clarity AI runs in the cloud and requires an active internet connection to analyze your spending patterns and answer queries. Please check your network and try again."
          onRetry={checkConnection}
          isRetrying={isChecking}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 18 : 0}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header
          showBack
          title="Clarity Copilot"
          rightNode={
            <TouchableOpacity
              style={styles.headerActionBtn}
              onPress={handleClearHistory}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MaterialIcons name="delete-sweep" size={22} color={colors.onSurfaceVariant} />
            </TouchableOpacity>
          }
        />

        {!isConnected && (
          <NoNetworkView
            variant="banner"
            message="You're offline. Reconnect to send messages to Copilot."
            onRetry={checkConnection}
            isRetrying={isChecking}
          />
        )}

        <View style={[styles.chatWrapper, { paddingBottom: androidBottomPadding }]}>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessageItem}
            contentContainerStyle={styles.messagesList}
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="none"
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            onLayout={() => scrollToEnd(false)}
            onContentSizeChange={handleContentSizeChange}
            maxToRenderPerBatch={10}
            windowSize={7}
            initialNumToRender={10}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews={Platform.OS === 'android'}
            extraData={messages.length}
            ListHeaderComponent={
              <View style={styles.dateSeparatorContainer}>
                <View style={styles.dateSeparatorPill}>
                  <Text style={styles.dateSeparatorText} numberOfLines={1}>Today</Text>
                </View>
              </View>
            }
            ListFooterComponent={
              isSending ? (
                <View style={styles.thinkingContainer}>
                  <View style={styles.assistantAvatar}>
                    <MaterialIcons name="auto-awesome" size={15} color={colors.onPrimary} />
                  </View>
                  <View style={styles.thinkingBubble}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.thinkingText}>Analyzing financial data...</Text>
                  </View>
                </View>
              ) : null
            }
          />

          {/* Floating Scroll to Bottom Button */}
          {showScrollBottom && (
            <TouchableOpacity
              style={styles.scrollBottomFab}
              onPress={() => scrollToEnd(true)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="keyboard-arrow-down" size={24} color={colors.onSurface} />
            </TouchableOpacity>
          )}

          {/* Suggested Prompts Carousel */}
          {messages.length <= 3 && !isSending && (
            <View style={styles.promptsContainer}>
              <Text style={styles.promptsTitle}>Suggested Prompts</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.promptsScroll}
                keyboardShouldPersistTaps="always"
              >
                {SUGGESTED_PROMPTS.map((prompt, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[styles.promptChip, !isConnected && { opacity: 0.5 }]}
                    onPress={() => {
                      if (!isConnected) {
                        showToast('Cannot send message while offline. Please check your connection.', 'error');
                        return;
                      }
                      handleSendMessage(prompt);
                    }}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="chat-bubble-outline" size={14} color={colors.primary} />
                    <Text style={styles.promptChipText} numberOfLines={1}>{prompt}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Sticky Input Bar */}
          <View
            style={[
              styles.inputBarContainer,
              {
                paddingBottom:
                  keyboardHeight > 0
                    ? 20
                    : Math.max(insets.bottom, 28) + 16,
              },
            ]}
          >
            <View style={styles.inputInnerWrapper}>
              <TextInput
                ref={textInputRef}
                style={[styles.textInput, !isConnected && { opacity: 0.7 }]}
                placeholder={
                  !isConnected
                    ? 'Offline — Connect to internet to chat...'
                    : 'Ask about spending, saving, or budget...'
                }
                placeholderTextColor={colors.onSurfaceVariant}
                value={inputText}
                onChangeText={setInputText}
                editable={!isSending}
                multiline
                maxLength={500}
                returnKeyType="send"
                blurOnSubmit={false}
                onFocus={() => {
                  setTimeout(() => {
                    flatListRef.current?.scrollToEnd({ animated: true });
                  }, 100);
                }}
                onSubmitEditing={() => handleSendMessage()}
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  (!inputText.trim() || isSending) && styles.sendButtonDisabled,
                ]}
                onPress={() => {
                  handleSendMessage();
                  textInputRef.current?.focus();
                }}
                disabled={!inputText.trim() || isSending}
                activeOpacity={0.8}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <MaterialIcons name="arrow-upward" size={20} color={colors.onPrimary} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const getStyles = (colors: ThemeColors) => {
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headerActionBtn: {
      padding: 6,
      borderRadius: 20,
    },
    chatWrapper: {
      flex: 1,
    },
    dateSeparatorContainer: {
      alignItems: 'center',
      marginVertical: 12,
    },
    dateSeparatorPill: {
      backgroundColor: colors.surfaceContainerHigh,
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateSeparatorText: {
      ...typography.labelMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
    },
    messagesList: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 8,
    },
    messageRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      marginBottom: 10,
    },
    messageRowUser: {
      justifyContent: 'flex-end',
    },
    messageRowAssistant: {
      justifyContent: 'flex-start',
    },
    assistantAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    bubbleContainer: {
      maxWidth: '80%',
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 8,
    },
    bubbleUser: {
      backgroundColor: colors.primary,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 4,
    },
    bubbleAssistant: {
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 18,
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 18,
    },
    messageText: {
      ...typography.bodyMd,
      lineHeight: 22,
    },
    messageTextUser: {
      color: colors.onPrimary,
    },
    messageTextAssistant: {
      color: colors.onSurface,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surfaceContainerHigh,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
      marginTop: 8,
      alignSelf: 'flex-start',
    },
    actionBtnText: {
      ...typography.labelMd,
      color: colors.primary,
      fontWeight: '700',
    },
    retryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.errorContainer,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
      marginTop: 8,
      alignSelf: 'flex-start',
    },
    retryBtnText: {
      ...typography.labelMd,
      color: colors.onErrorContainer,
      fontWeight: '700',
    },
    timestampContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      marginTop: 4,
    },
    timestampContainerUser: {
      justifyContent: 'flex-end',
      alignSelf: 'flex-end',
    },
    timestampContainerAssistant: {
      justifyContent: 'flex-start',
      alignSelf: 'flex-start',
    },
    timestampText: {
      ...typography.labelMd,
      fontSize: 10,
    },
    timestampUser: {
      color: 'rgba(255, 255, 255, 0.75)',
    },
    timestampAssistant: {
      color: colors.onSurfaceVariant,
    },
    readReceiptIcon: {
      marginLeft: 1,
    },
    scrollBottomFab: {
      position: 'absolute',
      right: 16,
      bottom: 70,
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.surfaceContainerHigh,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.outlineVariant,
      zIndex: 10,
    },
    thinkingContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      marginBottom: 10,
    },
    thinkingBubble: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 18,
      borderBottomLeftRadius: 4,
    },
    thinkingText: {
      ...typography.bodyMd,
      fontSize: 13,
      color: colors.onSurfaceVariant,
    },
    promptsContainer: {
      paddingHorizontal: 16,
      paddingBottom: 6,
    },
    promptsTitle: {
      ...typography.labelMd,
      color: colors.onSurfaceVariant,
      marginBottom: 6,
      fontWeight: '600',
    },
    promptsScroll: {
      gap: 8,
    },
    promptChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 16,
    },
    promptChipText: {
      ...typography.bodyMd,
      fontSize: 13,
      color: colors.onSurface,
    },
    inputBarContainer: {
      paddingHorizontal: 16,
      paddingTop: 8,
      backgroundColor: colors.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.outlineVariant,
    },
    inputInnerWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceContainerLow,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      paddingHorizontal: 12,
      paddingVertical: 4,
      minHeight: 46,
    },
    textInput: {
      flex: 1,
      ...typography.bodyMd,
      color: colors.onSurface,
      maxHeight: 100,
      paddingVertical: 8,
      paddingHorizontal: 8,
    },
    sendButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendButtonDisabled: {
      opacity: 0.4,
    },
  });
  return styles;
};

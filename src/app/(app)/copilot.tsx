import React, { useState, useRef, useEffect, useMemo } from 'react';
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
  Dimensions,
} from 'react-native';
import { Text, Header, useAlert, useToast } from '@/components/ui';
import { typography, useTheme, ThemeColors } from '@/theme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeInsets } from '@/hooks/use-safe-insets';
import { useMonthlyTotals } from '@/hooks/use-transactions';
import { useBudgetPlan, useCategorySpending } from '@/hooks/use-budget';
import { useAccounts } from '@/hooks/use-accounts';
import { formatCurrency } from '@/utils/format';
import { chatWithFinancialCopilot } from '@/services/api/ai.api';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  suggestedAction?: string;
}

const SUGGESTED_PROMPTS = [
  'How can I save more money this month?',
  'Am I meeting my 50/30/20 budget targets?',
  'How much did I spend on food and dining?',
  'Explain my monthly burn rate and pacing.',
  'What are my key financial observations?',
];

export default function CopilotScreen() {
  const { colors } = useTheme();
  const styles = getStyles(colors);
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

  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);

  // Detect whether Android OS resized the window or if it's drawing edge-to-edge under the keyboard
  const screenHeight = Dimensions.get('screen').height;
  const isAndroidWindowResized = Platform.OS === 'android' && screenHeight - windowHeight > 150;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 60);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      sender: 'assistant',
      text: `Hello! I'm your private Clarity Financial Copilot.\n\nI can analyze your spending patterns, track your 50/30/20 budget targets, and answer questions about your cash flow without sharing any account numbers or personal identity data. How can I assist you today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  // Anonymized context summary constructed on-device
  const financialContext = useMemo(() => {
    const netSavings = totals.income - totals.expenses;
    const topCategories = spending
      ?.filter((s) => s.spent > 0)
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 3)
      .map((s) => `${s.category}: ₹${Math.round(s.spent)}`)
      .join(', ');

    const totalBankBalance = accounts
      ?.filter((a) => a.balance > 0)
      .reduce((sum, a) => sum + a.balance, 0);

    return `Month: ${selectedMonth}/${selectedYear}, Monthly Income: ₹${Math.round(totals.income)}, Monthly Expenses: ₹${Math.round(totals.expenses)}, Net Savings: ₹${Math.round(netSavings)}, Top Spending: [${topCategories || 'None'}], Total Balance: ₹${Math.round(totalBankBalance || 0)}, Budget Plan: ${plan ? `Income ₹${plan.monthlyIncome}, Needs ${plan.needsPercent}%, Wants ${plan.wantsPercent}%, Savings ${plan.savingsPercent}%` : 'Not set'}`;
  }, [totals, spending, accounts, plan, selectedMonth, selectedYear]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend ?? inputText).trim();
    if (!query || isSending) return;

    const userMsgId = `user-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsSending(true);

    console.log('[Clarity AI] Sending chat message:', { query, context: financialContext });
    console.tron?.display?.({
      name: 'Clarity AI Chat',
      preview: query,
      value: { query, context: financialContext },
    });

    try {
      const response = await chatWithFinancialCopilot({
        message: query,
        financialContextSummary: financialContext,
      });

      console.log('[Clarity AI] Received response successfully:', response);
      console.tron?.display?.({
        name: 'Clarity AI Reply',
        preview: response.reply?.slice(0, 40) + '...',
        value: response,
      });

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: response.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedAction: response.suggestedAction,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error: any) {
      console.error('[Clarity AI] Error calling chatWithFinancialCopilot:', {
        message: error?.message,
        status: error?.status,
        data: error?.data,
        error,
      });
      console.tron?.error?.('[Clarity AI] Chat Error', error?.message ?? error);
      showToast('Could not reach assistant. Please try again.', 'error');
      const errorMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: "I couldn't process that query right now. Please check your connection and try again.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
    }
  };

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
            setMessages([
              {
                id: `welcome-${Date.now()}`,
                sender: 'assistant',
                text: 'Conversation reset. What would you like to explore about your finances?',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              },
            ]);
            showToast('Conversation cleared', 'info');
          },
        },
      ]
    );
  };

  const handleActionPress = (actionRoute: string) => {
    try {
      router.push(actionRoute as any);
    } catch {
      router.push('/(app)/(tabs)/plan');
    }
  };

  const renderActionLabel = (actionRoute: string) => {
    if (actionRoute.includes('plan')) return 'Open Budget Plan →';
    if (actionRoute.includes('bills')) return 'Manage Bills & Subscriptions →';
    if (actionRoute.includes('goals')) return 'View Savings Goals →';
    if (actionRoute.includes('accounts')) return 'View Bank Accounts →';
    return 'View Transactions →';
  };

  const renderMessageItem = ({ item }: { item: ChatMessage }) => {
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
            <MaterialIcons name="auto-awesome" size={16} color={colors.onPrimary} />
          </View>
        )}

        <View
          style={[
            styles.bubbleContainer,
            isUser ? styles.bubbleUser : styles.bubbleAssistant,
          ]}
        >
          <Text style={[styles.messageText, isUser ? styles.messageTextUser : styles.messageTextAssistant]}>
            {item.text}
          </Text>

          {item.suggestedAction && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleActionPress(item.suggestedAction!)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-outward" size={14} color={colors.primary} />
              <Text style={styles.actionBtnText}>{renderActionLabel(item.suggestedAction)}</Text>
            </TouchableOpacity>
          )}

          <Text style={[styles.timestampText, isUser ? styles.timestampUser : styles.timestampAssistant]}>
            {item.timestamp}
          </Text>
        </View>
      </View>
    );
  };

  // Extra breathing room gap between chat bar and keyboard
  const KEYBOARD_GAP = 14;

  // On Android when edge-to-edge is not resizing window, offset the chat wrapper by keyboard height + extra gap
  const androidBottomPadding =
    Platform.OS === 'android' && keyboardHeight > 0
      ? Math.max(0, keyboardHeight - Math.max(0, screenHeight - windowHeight)) + KEYBOARD_GAP
      : 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
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

        {/* Privacy & Context Banner */}
        <View style={styles.contextBanner}>
          <View style={styles.contextLeft}>
            <MaterialIcons name="security" size={14} color={colors.primary} />
            <Text style={styles.contextText}>
              Privacy Guaranteed • Anonymized context for {selectedMonth}/{selectedYear}
            </Text>
          </View>
          <View style={styles.contextBadge}>
            <Text style={styles.contextBadgeText}>
              Net: {formatCurrency(totals.income - totals.expenses)}
            </Text>
          </View>
        </View>

        <View style={[styles.chatWrapper, { paddingBottom: androidBottomPadding }]}>
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessageItem}
            contentContainerStyle={styles.messagesList}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
            ListFooterComponent={
              isSending ? (
                <View style={styles.thinkingContainer}>
                  <View style={styles.assistantAvatar}>
                    <MaterialIcons name="auto-awesome" size={16} color={colors.onPrimary} />
                  </View>
                  <View style={styles.thinkingBubble}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.thinkingText}>Analyzing financial data...</Text>
                  </View>
                </View>
              ) : null
            }
          />

          {/* Suggested Prompts Carousel */}
          {messages.length <= 3 && !isSending && (
            <View style={styles.promptsContainer}>
              <Text style={styles.promptsTitle}>Suggested Prompts</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.promptsScroll}
                keyboardShouldPersistTaps="handled"
              >
                {SUGGESTED_PROMPTS.map((prompt, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.promptChip}
                    onPress={() => handleSendMessage(prompt)}
                    activeOpacity={0.7}
                  >
                    <MaterialIcons name="chat-bubble-outline" size={14} color={colors.primary} />
                    <Text style={styles.promptChipText}>{prompt}</Text>
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
                    ? 14
                    : Math.max(insets.bottom, 16),
              },
            ]}
          >
            <View style={styles.inputInnerWrapper}>
              <TextInput
                style={styles.textInput}
                placeholder="Ask about spending, saving, or budget..."
                placeholderTextColor={colors.onSurfaceVariant}
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={() => handleSendMessage()}
                editable={!isSending}
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  (!inputText.trim() || isSending) && styles.sendButtonDisabled,
                ]}
                onPress={() => handleSendMessage()}
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
    contextBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surfaceContainerLow,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.outlineVariant,
    },
    contextLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flex: 1,
    },
    contextText: {
      ...typography.labelMd,
      fontSize: 11,
      color: colors.onSurfaceVariant,
      flex: 1,
    },
    contextBadge: {
      backgroundColor: colors.primaryContainer,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    contextBadgeText: {
      ...typography.labelMd,
      fontSize: 11,
      color: colors.onPrimaryContainer,
      fontWeight: '600',
    },
    chatWrapper: {
      flex: 1,
    },
    messagesList: {
      padding: 16,
      gap: 16,
    },
    messageRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
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
      maxWidth: '82%',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 18,
    },
    bubbleUser: {
      backgroundColor: colors.primary,
      borderBottomRightRadius: 4,
    },
    bubbleAssistant: {
      backgroundColor: colors.surfaceContainerLow,
      borderWidth: 1,
      borderColor: colors.outlineVariant,
      borderBottomLeftRadius: 4,
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
    timestampText: {
      ...typography.labelMd,
      fontSize: 10,
      marginTop: 4,
    },
    timestampUser: {
      color: 'rgba(255, 255, 255, 0.75)',
      alignSelf: 'flex-end',
    },
    timestampAssistant: {
      color: colors.onSurfaceVariant,
      alignSelf: 'flex-start',
    },
    thinkingContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      marginTop: 4,
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
      paddingBottom: 4,
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
      borderTopWidth: 1,
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

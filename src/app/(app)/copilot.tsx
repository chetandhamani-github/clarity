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
import { useMonthlyTotals } from '@/hooks/use-transactions';
import { useBudgetPlan, useCategorySpending } from '@/hooks/use-budget';
import { useAccounts } from '@/hooks/use-accounts';
import { chatWithFinancialCopilot } from '@/services/api/ai.api';
import { fetchRemoteConfig } from '@/services/api/config.api';
import { useNetworkStore } from '@/store/use-network-store';
import { isNetworkError } from '@/services/network/network.service';
import { ChatMessage, useCopilotStore } from '@/store/use-copilot-store';

const SUGGESTED_PROMPTS = [
  'How can I save more money this month?',
  'Am I meeting my 50/30/20 budget targets?',
  'How much did I spend on food and dining?',
  'Explain my monthly burn rate and pacing.',
  'What are my key financial observations?',
];

function getActionLabel(actionRoute: string): string {
  if (actionRoute.includes('plan')) return 'Open Budget Plan →';
  if (actionRoute.includes('bills')) return 'Manage Bills & Subscriptions →';
  if (actionRoute.includes('goals')) return 'View Savings Goals →';
  if (actionRoute.includes('accounts')) return 'View Bank Accounts →';
  return 'View Transactions →';
}

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
    fetchRemoteConfig().catch(() => {});
  }, []);

  const messages = useCopilotStore((state) => state.messages);
  const setMessages = useCopilotStore((state) => state.setMessages);
  const clearMessages = useCopilotStore((state) => state.clearMessages);

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

  const handleSendMessage = useCallback(async (textToSend?: string) => {
    const query = (textToSend ?? inputText).trim();
    if (!query || isSending) return;

    if (!isConnected) {
      showToast('Cannot send message while offline. Please check your connection.', 'error');
      return;
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
      setTimeout(() => scrollToEnd(true), 80);
    } catch (err: unknown) {
      if (isNetworkError(err)) {
        void useNetworkStore.getState().verifyConnection();
      }
      showToast('Could not reach assistant. Please try again.', 'error');
      const errorMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: "I couldn't process that query right now. Please check your connection and try again.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
      setTimeout(() => scrollToEnd(true), 80);
    } finally {
      setIsSending(false);
      requestAnimationFrame(() => {
        textInputRef.current?.focus();
      });
    }
  }, [inputText, isSending, isConnected, financialContext, scrollToEnd, showToast]);

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
      // Normalize tab routes to stack screen routes so they are cleanly pushed onto the Copilot stack
      const normalizedRoute = actionRoute
        .replace('/(tabs)/', '/')
        .replace('/(app)/(tabs)/', '/(app)/');
      router.push(normalizedRoute as any);
    } catch {
      router.push('/(app)/plan');
    }
  }, [router]);

  const renderMessageItem = useCallback(({ item }: { item: ChatMessage }) => {
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
              onPress={() => handleActionPress(item.suggestedAction!)}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-outward" size={14} color={colors.primary} />
              <Text style={styles.actionBtnText}>{getActionLabel(item.suggestedAction)}</Text>
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
  }, [colors, styles, handleActionPress]);

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
            windowSize={15}
            initialNumToRender={15}
            removeClippedSubviews={Platform.OS === 'android'}
            ListHeaderComponent={
              <View style={styles.dateSeparatorContainer}>
                <View style={styles.dateSeparatorPill}>
                  <Text style={styles.dateSeparatorText}>Today</Text>
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
                editable={isConnected}
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
                  (!inputText.trim() || isSending || !isConnected) && styles.sendButtonDisabled,
                ]}
                onPress={() => {
                  handleSendMessage();
                  textInputRef.current?.focus();
                }}
                disabled={!inputText.trim() || isSending || !isConnected}
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

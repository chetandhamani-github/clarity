import React from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '@/theme';
import { SmartClipboardPrompt } from '@/components/clipboard/SmartClipboardPrompt';
import { BillDetectedPromptModal } from '@/components/modals/BillDetectedPromptModal';
import { useNotificationListener } from '@/modules/notifications';

export default function AppLayout() {
  const { colors } = useTheme();
  useNotificationListener();

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="copilot" />
        <Stack.Screen name="goals" />
        <Stack.Screen name="plan" />
        <Stack.Screen name="accounts" />
        <Stack.Screen name="transactions" />
        <Stack.Screen name="account-transactions" />
        <Stack.Screen name="bills" />
        <Stack.Screen name="bill-details" />
        <Stack.Screen name="reminders" />
        <Stack.Screen name="splitwise" />
        <Stack.Screen name="splitwise-people" />
        <Stack.Screen name="splitwise-person-details" />
        <Stack.Screen name="investments" />
        <Stack.Screen name="cashflow" />
        <Stack.Screen name="debt-payoff" />
        <Stack.Screen name="financial-health" />
        <Stack.Screen name="add-investment" options={{ presentation: 'modal' }} />
        <Stack.Screen name="add-transaction" options={{ presentation: 'modal' }} />
        <Stack.Screen name="add-bill" options={{ presentation: 'modal' }} />
        <Stack.Screen name="add-reminder" options={{ presentation: 'modal' }} />
        <Stack.Screen name="add-splitwise-person" options={{ presentation: 'modal' }} />
        <Stack.Screen name="add-splitwise-debt" options={{ presentation: 'modal' }} />
        <Stack.Screen name="add-splitwise-settlement" options={{ presentation: 'modal' }} />
      </Stack>
      <SmartClipboardPrompt />
      <BillDetectedPromptModal />
    </>
  );
}

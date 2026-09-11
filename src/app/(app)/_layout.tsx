import React from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '@/theme';

export default function AppLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="bills" />
      <Stack.Screen name="bill-details" />
      <Stack.Screen name="splitwise" />
      <Stack.Screen name="splitwise-people" />
      <Stack.Screen name="splitwise-person-details" />
      <Stack.Screen name="add-transaction" options={{ presentation: 'modal' }} />
      <Stack.Screen name="add-bill" options={{ presentation: 'modal' }} />
      <Stack.Screen name="add-splitwise-person" options={{ presentation: 'modal' }} />
      <Stack.Screen name="add-splitwise-debt" options={{ presentation: 'modal' }} />
      <Stack.Screen name="add-splitwise-settlement" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

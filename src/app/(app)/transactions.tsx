import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import TransactionsScreen from './(tabs)/transactions';
import type { DatePreset } from '@/components/modals/TransactionFilterModal';

const VALID_TYPES = new Set(['all', 'expense', 'income', 'transfer']);
const VALID_PRESETS = new Set(['all', 'this_month', 'last_month', 'last_90_days']);

export default function TransactionsStackRoute() {
  const params = useLocalSearchParams<{
    category?: string | string[];
    type?: string | string[];
    datePreset?: string | string[];
  }>();

  const category = Array.isArray(params.category) ? params.category[0] : params.category;
  const rawType = Array.isArray(params.type) ? params.type[0] : params.type;
  const rawPreset = Array.isArray(params.datePreset) ? params.datePreset[0] : params.datePreset;

  const initialType =
    rawType && VALID_TYPES.has(rawType)
      ? (rawType as 'all' | 'expense' | 'income' | 'transfer')
      : undefined;
  const initialDatePreset =
    rawPreset && VALID_PRESETS.has(rawPreset)
      ? (rawPreset as DatePreset)
      : undefined;

  return (
    <TransactionsScreen
      showBack
      initialCategory={category}
      initialType={initialType}
      initialDatePreset={initialDatePreset}
    />
  );
}

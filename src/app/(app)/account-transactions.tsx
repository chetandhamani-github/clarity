import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import TransactionsScreen from './(tabs)/transactions';

export default function AccountTransactionsRoute() {
  const { accountId } = useLocalSearchParams<{ accountId?: string | string[] }>();
  const normalizedAccountId = Array.isArray(accountId) ? accountId[0] : accountId;

  return <TransactionsScreen showBack lockedAccountId={normalizedAccountId} />;
}

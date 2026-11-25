import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useNotificationStore } from '@/store/useNotificationStore';
import { NativeNotificationListenerAdapter } from '../adapters/nativeNotificationListenerAdapter';
import { NotificationParsingService } from '../services/notificationParsingService';
import type { RawNotificationPayload } from '../types';

export function useNotificationListener() {
  const isEnabled = useNotificationStore((state) => state.isEnabled);
  const parseTransactions = useNotificationStore((state) => state.parseTransactions);
  const parseBills = useNotificationStore((state) => state.parseBills);
  const enabledPackages = useNotificationStore((state) => state.enabledPackages);
  const checkPermission = useNotificationStore((state) => state.checkPermission);
  const refreshHealth = useNotificationStore((state) => state.refreshHealth);
  const requestRebind = useNotificationStore((state) => state.requestRebind);
  const drainAndProcessPending = useNotificationStore((state) => state.drainAndProcessPending);
  const showDetectedBillModal = useNotificationStore((state) => state.showDetectedBillModal);

  const isEnabledRef = useRef(isEnabled);
  isEnabledRef.current = isEnabled;

  const parseTxRef = useRef(parseTransactions);
  parseTxRef.current = parseTransactions;

  const parseBillsRef = useRef(parseBills);
  parseBillsRef.current = parseBills;

  const enabledPkgsRef = useRef(enabledPackages);
  enabledPkgsRef.current = enabledPackages;

  useEffect(() => {
    const syncHealthAndDrain = async () => {
      const status = await checkPermission();
      const health = await refreshHealth();
      if (status === 'granted' && health && !health.isServiceConnected) {
        await requestRebind().catch(() => false);
      }
      await drainAndProcessPending();
    };

    syncHealthAndDrain();

    const unsubscribe = NativeNotificationListenerAdapter.subscribeToNotifications(
      async (notif: RawNotificationPayload) => {
        if (!isEnabledRef.current) return;
        if (!enabledPkgsRef.current.includes(notif.packageName)) return;

        try {
          const result = await NotificationParsingService.processNotification(notif, {
            parseTransactions: parseTxRef.current,
            parseBills: parseBillsRef.current,
          });

          if (result.type === 'BILL' && result.isNew !== false) {
            showDetectedBillModal(result.bill, result.billId);
          }

          if (result.type !== 'IGNORED') {
            refreshHealth().catch(() => null);
          }
        } catch {
          // Fault isolation: incoming notification failure must not crash UI
        }
      }
    );

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        syncHealthAndDrain();
      }
    };

    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      unsubscribe();
      appStateSub.remove();
    };
  }, [
    checkPermission,
    refreshHealth,
    requestRebind,
    drainAndProcessPending,
    showDetectedBillModal,
  ]);
}

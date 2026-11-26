import { DeviceEventEmitter } from 'react-native';
import { mmkv } from '@/lib/storage';
import { BillsRepository } from '@/modules/bills/database/bills.repository';
import { NativeNotificationListenerAdapter } from '@/modules/notifications/adapters/nativeNotificationListenerAdapter';
import { NotificationParsingService } from '@/modules/notifications/services/notificationParsingService';
import { LocalCategorizerEngine } from '@/modules/sms/categorizer/localCategorizerEngine';
import { DuplicateDetectionEngine } from '@/modules/sms/duplicate/duplicateDetectionEngine';
import { SmsSyncService } from '@/modules/sms/services/smsSyncService';
import { useSplitwiseStore } from '@/modules/splitwise/store/splitwise.store';
import { useBillsStore } from '@/modules/bills/store/bills.store';
import { clearAutoBackupTimer } from '@/services/cloud/google-drive-service';
import { clearDatabase } from '@/services/database';
import { clearCachedExportFiles } from '@/services/export/export-service';
import { resetBillReminderCheckCooldown } from '@/services/notifications/alert-engine';
import { BillAlertEngine } from '@/services/notifications/bill-alert-engine';
import { clearAllReceiptImages } from '@/services/storage/receipt-storage';
import { useAppStore } from '@/store/use-app-store';
import { useCopilotStore } from '@/store/use-copilot-store';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useSmsStore } from '@/store/useSmsStore';
import type { QueryClient } from '@tanstack/react-query';
import { resetEntireAppData } from './app-reset';

jest.mock('@/services/database', () => ({
  clearDatabase: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/cloud/google-drive-service', () => ({
  clearAutoBackupTimer: jest.fn(),
}));

jest.mock('@/services/storage/receipt-storage', () => ({
  clearAllReceiptImages: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/export/export-service', () => ({
  clearCachedExportFiles: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/notifications/bill-alert-engine', () => ({
  BillAlertEngine: {
    cancelAllNativeBillReminders: jest.fn().mockResolvedValue(undefined),
    dismissAllDeliveredNotifications: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/services/notifications/alert-engine', () => ({
  resetBillReminderCheckCooldown: jest.fn(),
}));

describe('resetEntireAppData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mmkv.clearAll();
  });

  it('resets all local data, files, notifications, stores, and caches while keeping install id and security/cloud locks', async () => {
    // Setup state
    mmkv.set('clarity_device_installation_id', 'test-install-uuid-1234');
    mmkv.set('clarity_last_sms_sync_timestamp', '1700000000000');
    mmkv.set('bills-storage', JSON.stringify({ bills: [{ id: '1' }] }));

    useBillsStore.setState({
      bills: [{ id: 'bill-1' } as any],
      isLoading: true,
      searchQuery: 'rent',
    });

    useSplitwiseStore.setState({
      people: [{ id: 'p1', name: 'John' } as any],
      searchQuery: 'John',
    });

    useSmsStore.setState({
      pendingTransactions: [{ id: 'tx-1' } as any],
      reviewQueueCount: 2,
      isPromptVisible: true,
    });

    useNotificationStore.setState({
      detectedBillModalVisible: true,
      detectedBillQueue: [{ bill: { billerName: 'BESCOM' } as any }],
    });

    useCopilotStore.setState({
      messages: [{ id: 'msg-1', sender: 'user', text: 'Hi', timestamp: '12:00' }],
    });

    useAppStore.setState({
      hasSeenNotificationPrompt: true,
      hasSeenDrivePrompt: true,
      lastCloudBackupTime: '2026-11-19T10:00:00Z',
      isPostResetLocked: false,
      hideBalances: true,
      hasOnboarded: true,
      paydayDayOfMonth: 25,
      safetyBufferAmount: 15000,
      biometricEnabled: true,
      googleDriveConnected: true,
    });

    const mockQueryClient = {
      cancelQueries: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn(),
      invalidateQueries: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryClient;

    const resetSchemaSpy = jest.spyOn(BillsRepository, 'resetSchemaCache');
    const clearCacheSpy = jest.spyOn(DuplicateDetectionEngine, 'clearCache');
    const clearCustomRulesSpy = jest.spyOn(LocalCategorizerEngine, 'clearCustomRules');
    const cancelSyncSpy = jest.spyOn(SmsSyncService, 'cancelSync');
    const flushWorkSpy = jest.spyOn(NotificationParsingService, 'flushPendingWork');
    const clearBridgeSpy = jest
      .spyOn(NativeNotificationListenerAdapter, 'clearBridgeState')
      .mockResolvedValue(true);
    const refreshHealthSpy = jest
      .spyOn(useNotificationStore.getState(), 'refreshHealth')
      .mockResolvedValue(null);
    const emitSpy = jest.spyOn(DeviceEventEmitter, 'emit');

    // Run reset
    await resetEntireAppData(mockQueryClient);

    // Verify ingestion quiesce, database, filesystem, notification tray, & cache cleanup
    expect(clearAutoBackupTimer).toHaveBeenCalled();
    expect(cancelSyncSpy).toHaveBeenCalled();
    expect(flushWorkSpy).toHaveBeenCalled();
    expect(clearDatabase).toHaveBeenCalled();
    expect(clearAllReceiptImages).toHaveBeenCalled();
    expect(clearCachedExportFiles).toHaveBeenCalled();
    expect(BillAlertEngine.cancelAllNativeBillReminders).toHaveBeenCalled();
    expect(BillAlertEngine.dismissAllDeliveredNotifications).toHaveBeenCalled();
    expect(resetBillReminderCheckCooldown).toHaveBeenCalled();
    expect(resetSchemaSpy).toHaveBeenCalled();
    expect(clearCacheSpy).toHaveBeenCalled();
    expect(clearCustomRulesSpy).toHaveBeenCalled();
    expect(clearBridgeSpy).toHaveBeenCalled();

    // Verify MMKV: installationId preserved, sync timestamps & cache wiped
    expect(mmkv.getString('clarity_device_installation_id')).toBe('test-install-uuid-1234');
    expect(mmkv.getString('clarity_last_sms_sync_timestamp')).toBeUndefined();
    expect(mmkv.getString('bills-storage')).toBeUndefined();

    // Verify Zustand stores reset to defaults
    expect(useBillsStore.getState().bills).toEqual([]);
    expect(useBillsStore.getState().searchQuery).toBe('');
    expect(useSplitwiseStore.getState().people).toEqual([]);
    expect(useSplitwiseStore.getState().searchQuery).toBe('');
    expect(useSmsStore.getState().pendingTransactions).toEqual([]);
    expect(useSmsStore.getState().reviewQueueCount).toBe(0);
    expect(useSmsStore.getState().isPromptVisible).toBe(false);
    expect(useNotificationStore.getState().detectedBillModalVisible).toBe(false);
    expect(useNotificationStore.getState().detectedBillQueue).toEqual([]);
    expect(refreshHealthSpy).toHaveBeenCalled();

    // Verify Copilot reset message
    const copilotMessages = useCopilotStore.getState().messages;
    expect(copilotMessages.length).toBe(1);
    expect(copilotMessages[0].text).toContain('Conversation reset');

    // Verify AppStore resets financial/prompt flags while preserving security/cloud lock
    expect(useAppStore.getState().isPostResetLocked).toBe(true);
    expect(useAppStore.getState().hasSeenNotificationPrompt).toBe(false);
    expect(useAppStore.getState().hasSeenDrivePrompt).toBe(false);
    expect(useAppStore.getState().lastCloudBackupTime).toBeNull();
    expect(useAppStore.getState().hideBalances).toBe(false);
    expect(useAppStore.getState().hasOnboarded).toBe(false);
    expect(useAppStore.getState().paydayDayOfMonth).toBe(1);
    expect(useAppStore.getState().safetyBufferAmount).toBe(2000);
    expect(useAppStore.getState().biometricEnabled).toBe(true);
    expect(useAppStore.getState().googleDriveConnected).toBe(true);

    // Verify TanStack Query reset lifecycle and UI update broadcasts
    expect(mockQueryClient.cancelQueries).toHaveBeenCalled();
    expect(mockQueryClient.clear).toHaveBeenCalled();
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalled();
    expect(emitSpy).toHaveBeenCalledWith('appDataReset');
    expect(emitSpy).toHaveBeenCalledWith('billsUpdated');
    expect(emitSpy).toHaveBeenCalledWith('notificationsUpdated');
    expect(emitSpy).toHaveBeenCalledWith('splitwiseUpdated');
  });

  it('deduplicates concurrent reset calls into a single execution', async () => {
    await Promise.all([resetEntireAppData(), resetEntireAppData()]);
    expect(clearDatabase).toHaveBeenCalledTimes(1);
  });
});

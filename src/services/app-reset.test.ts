import { mmkv } from '@/lib/storage';
import { BillsRepository } from '@/modules/bills/database/bills.repository';
import { useBillsStore } from '@/modules/bills/store/bills.store';
import { DuplicateDetectionEngine } from '@/modules/sms/duplicate/duplicateDetectionEngine';
import { useSplitwiseStore } from '@/modules/splitwise/store/splitwise.store';
import { clearAutoBackupTimer } from '@/services/cloud/google-drive-service';
import { clearDatabase } from '@/services/database';
import { useAppStore } from '@/store/use-app-store';
import { useCopilotStore } from '@/store/use-copilot-store';
import { useSmsStore } from '@/store/useSmsStore';
import type { QueryClient } from '@tanstack/react-query';
import { resetEntireAppData } from './app-reset';

jest.mock('@/services/database', () => ({
  clearDatabase: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/cloud/google-drive-service', () => ({
  clearAutoBackupTimer: jest.fn(),
}));

describe('resetEntireAppData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mmkv.clearAll();
  });

  it('resets all stores, caches, database, and MMKV while preserving installationId', async () => {
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

    useCopilotStore.setState({
      messages: [{ id: 'msg-1', sender: 'user', text: 'Hi', timestamp: '12:00' }],
    });

    useAppStore.setState({
      hasSeenNotificationPrompt: true,
      hasSeenDrivePrompt: true,
      lastCloudBackupTime: '2026-11-19T10:00:00Z',
      isPostResetLocked: false,
      hideBalances: true,
    });

    const mockQueryClient = {
      cancelQueries: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn(),
      invalidateQueries: jest.fn().mockResolvedValue(undefined),
    } as unknown as QueryClient;

    const resetSchemaSpy = jest.spyOn(BillsRepository, 'resetSchemaCache');
    const clearCacheSpy = jest.spyOn(DuplicateDetectionEngine, 'clearCache');

    // Run reset
    await resetEntireAppData(mockQueryClient);

    // Verify database & cloud backup calls
    expect(clearAutoBackupTimer).toHaveBeenCalled();
    expect(clearDatabase).toHaveBeenCalled();
    expect(resetSchemaSpy).toHaveBeenCalled();
    expect(clearCacheSpy).toHaveBeenCalled();

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

    // Verify Copilot reset message
    const copilotMessages = useCopilotStore.getState().messages;
    expect(copilotMessages.length).toBe(1);
    expect(copilotMessages[0].text).toContain('Conversation reset');

    // Verify AppStore flags
    expect(useAppStore.getState().isPostResetLocked).toBe(true);
    expect(useAppStore.getState().hasSeenNotificationPrompt).toBe(false);
    expect(useAppStore.getState().hasSeenDrivePrompt).toBe(false);
    expect(useAppStore.getState().lastCloudBackupTime).toBeNull();
    expect(useAppStore.getState().hideBalances).toBe(false);

    // Verify TanStack Query reset lifecycle
    expect(mockQueryClient.cancelQueries).toHaveBeenCalled();
    expect(mockQueryClient.clear).toHaveBeenCalled();
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalled();
  });
});

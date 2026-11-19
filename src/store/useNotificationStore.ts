import { create } from 'zustand';
import { mmkv } from '@/lib/storage';
import { NativeNotificationListenerAdapter } from '@/modules/notifications/adapters/nativeNotificationListenerAdapter';
import { NotificationParsingService } from '@/modules/notifications/services/notificationParsingService';
import { DEFAULT_TARGET_APPS } from '@/modules/notifications/constants';
import type { ExtractedBill } from '@/modules/sms/extractor/billExtractor';
import type { NotificationPermissionStatus } from '@/modules/notifications/types';

const KEY_ENABLED = 'clarity_notif_tracking_enabled';
const KEY_PARSE_TX = 'clarity_notif_parse_transactions';
const KEY_PARSE_BILLS = 'clarity_notif_parse_bills';
const KEY_ENABLED_PACKAGES = 'clarity_notif_enabled_packages';

function getStoredBoolean(key: string, defaultValue: boolean): boolean {
  const val = mmkv.getString(key);
  if (val === undefined || val === null) return defaultValue;
  return val === 'true';
}

function getStoredPackages(): string[] {
  const val = mmkv.getString(KEY_ENABLED_PACKAGES);
  if (!val) {
    return DEFAULT_TARGET_APPS.map((app) => app.packageName);
  }
  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // fallback
  }
  return DEFAULT_TARGET_APPS.map((app) => app.packageName);
}

interface NotificationStoreState {
  isEnabled: boolean;
  permissionStatus: NotificationPermissionStatus;
  parseTransactions: boolean;
  parseBills: boolean;
  enabledPackages: string[];
  activeDetectedBill: ExtractedBill | null;
  detectedBillModalVisible: boolean;

  // Actions
  checkPermission: () => Promise<NotificationPermissionStatus>;
  requestPermission: () => Promise<boolean>;
  setIsEnabled: (enabled: boolean) => void;
  setParseTransactions: (enabled: boolean) => void;
  setParseBills: (enabled: boolean) => void;
  togglePackage: (packageName: string) => void;
  setAllPackagesEnabled: (enabled: boolean) => void;
  showDetectedBillModal: (bill: ExtractedBill) => void;
  closeDetectedBillModal: () => void;
  drainAndProcessPending: () => Promise<number>;
}

export const useNotificationStore = create<NotificationStoreState>((set, get) => ({
  isEnabled: getStoredBoolean(KEY_ENABLED, true),
  permissionStatus: 'denied',
  parseTransactions: getStoredBoolean(KEY_PARSE_TX, true),
  parseBills: getStoredBoolean(KEY_PARSE_BILLS, true),
  enabledPackages: getStoredPackages(),
  activeDetectedBill: null,
  detectedBillModalVisible: false,

  checkPermission: async () => {
    const status = await NativeNotificationListenerAdapter.checkPermission();
    set({ permissionStatus: status });
    return status;
  },

  requestPermission: async () => {
    const granted = await NativeNotificationListenerAdapter.requestPermission();
    const status = await NativeNotificationListenerAdapter.checkPermission();
    set({ permissionStatus: status });
    return granted;
  },

  setIsEnabled: (enabled: boolean) => {
    mmkv.set(KEY_ENABLED, String(enabled));
    set({ isEnabled: enabled });
  },

  setParseTransactions: (enabled: boolean) => {
    mmkv.set(KEY_PARSE_TX, String(enabled));
    set({ parseTransactions: enabled });
  },

  setParseBills: (enabled: boolean) => {
    mmkv.set(KEY_PARSE_BILLS, String(enabled));
    set({ parseBills: enabled });
  },

  togglePackage: (packageName: string) => {
    const current = get().enabledPackages;
    let updated: string[];
    if (current.includes(packageName)) {
      updated = current.filter((p) => p !== packageName);
    } else {
      updated = [...current, packageName];
    }
    mmkv.set(KEY_ENABLED_PACKAGES, JSON.stringify(updated));
    set({ enabledPackages: updated });
  },

  setAllPackagesEnabled: (enabled: boolean) => {
    const updated = enabled ? DEFAULT_TARGET_APPS.map((a) => a.packageName) : [];
    mmkv.set(KEY_ENABLED_PACKAGES, JSON.stringify(updated));
    set({ enabledPackages: updated });
  },

  showDetectedBillModal: (bill: ExtractedBill) => {
    set({ activeDetectedBill: bill, detectedBillModalVisible: true });
  },

  closeDetectedBillModal: () => {
    set({ activeDetectedBill: null, detectedBillModalVisible: false });
  },

  drainAndProcessPending: async () => {
    const { isEnabled, parseTransactions, parseBills, enabledPackages } = get();
    if (!isEnabled) return 0;

    const pending = await NativeNotificationListenerAdapter.drainPendingNotifications();
    if (pending.length === 0) return 0;

    let processedCount = 0;
    for (const notif of pending) {
      if (!enabledPackages.includes(notif.packageName)) {
        continue;
      }
      try {
        const result = await NotificationParsingService.processNotification(notif, {
          parseTransactions,
          parseBills,
        });
        if (result.type !== 'IGNORED') {
          processedCount++;
        }
      } catch {
        // Safe continuation
      }
    }

    return processedCount;
  },
}));


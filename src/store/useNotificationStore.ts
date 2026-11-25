import { create } from 'zustand';
import { mmkv } from '@/lib/storage';
import { NativeNotificationListenerAdapter } from '@/modules/notifications/adapters/nativeNotificationListenerAdapter';
import { NotificationParsingService } from '@/modules/notifications/services/notificationParsingService';
import { DEFAULT_TARGET_APPS } from '@/modules/notifications/constants';
import type { ExtractedBill } from '@/modules/sms/extractor/billExtractor';
import type {
  NotificationPermissionStatus,
  NotificationListenerHealth,
} from '@/modules/notifications/types';

const KEY_ENABLED = 'clarity_notif_tracking_enabled';
const KEY_PARSE_TX = 'clarity_notif_parse_transactions';
const KEY_PARSE_BILLS = 'clarity_notif_parse_bills';
const KEY_ENABLED_PACKAGES = 'clarity_notif_enabled_packages';
const KEY_KNOWN_PACKAGES = 'clarity_notif_known_packages';

function getStoredBoolean(key: string, defaultValue: boolean): boolean {
  const val = mmkv.getString(key);
  if (val === undefined || val === null) return defaultValue;
  return val === 'true';
}

function getStoredPackages(): string[] {
  const allDefaults = DEFAULT_TARGET_APPS.map((app) => app.packageName);
  const val = mmkv.getString(KEY_ENABLED_PACKAGES);
  if (!val) {
    mmkv.set(KEY_KNOWN_PACKAGES, JSON.stringify(allDefaults));
    return allDefaults;
  }

  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed)) {
      const knownRaw = mmkv.getString(KEY_KNOWN_PACKAGES);
      const knownSet = new Set<string>(
        knownRaw ? (JSON.parse(knownRaw) as string[]) : []
      );
      const merged = new Set<string>(parsed.filter((item): item is string => typeof item === 'string'));
      let changed = false;

      for (const pkg of allDefaults) {
        if (!knownSet.has(pkg)) {
          merged.add(pkg);
          changed = true;
        }
      }

      if (changed || !knownRaw) {
        const mergedArr = Array.from(merged);
        mmkv.set(KEY_ENABLED_PACKAGES, JSON.stringify(mergedArr));
        mmkv.set(KEY_KNOWN_PACKAGES, JSON.stringify(allDefaults));
        return mergedArr;
      }

      return parsed.filter((item): item is string => typeof item === 'string');
    }
  } catch {
    // Fallback to defaults if stored JSON is corrupted
  }

  mmkv.set(KEY_KNOWN_PACKAGES, JSON.stringify(allDefaults));
  return allDefaults;
}

interface QueuedDetectedBill {
  bill: ExtractedBill;
  billId?: string;
}

interface NotificationStoreState {
  isEnabled: boolean;
  permissionStatus: NotificationPermissionStatus;
  parseTransactions: boolean;
  parseBills: boolean;
  enabledPackages: string[];
  health: NotificationListenerHealth | null;
  isDisclosureVisible: boolean;
  activeDetectedBill: ExtractedBill | null;
  activeDetectedBillId: string | null;
  detectedBillQueue: QueuedDetectedBill[];
  detectedBillModalVisible: boolean;

  // Actions
  checkPermission: () => Promise<NotificationPermissionStatus>;
  requestPermission: () => Promise<boolean>;
  refreshHealth: () => Promise<NotificationListenerHealth | null>;
  openBatterySettings: () => Promise<boolean>;
  requestRebind: () => Promise<boolean>;
  openDisclosure: () => void;
  closeDisclosure: () => void;
  setIsEnabled: (enabled: boolean) => void;
  setParseTransactions: (enabled: boolean) => void;
  setParseBills: (enabled: boolean) => void;
  togglePackage: (packageName: string) => void;
  setAllPackagesEnabled: (enabled: boolean) => void;
  showDetectedBillModal: (bill: ExtractedBill, billId?: string) => void;
  closeDetectedBillModal: () => void;
  drainAndProcessPending: () => Promise<number>;
}

let drainInFlight: Promise<number> | null = null;

export const useNotificationStore = create<NotificationStoreState>((set, get) => ({
  isEnabled: getStoredBoolean(KEY_ENABLED, true),
  permissionStatus: 'denied',
  parseTransactions: getStoredBoolean(KEY_PARSE_TX, true),
  parseBills: getStoredBoolean(KEY_PARSE_BILLS, true),
  enabledPackages: getStoredPackages(),
  health: null,
  isDisclosureVisible: false,
  activeDetectedBill: null,
  activeDetectedBillId: null,
  detectedBillQueue: [],
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

  refreshHealth: async () => {
    const health = await NativeNotificationListenerAdapter.getListenerHealth();
    if (health) {
      set({
        health,
        permissionStatus: health.isPermissionGranted ? 'granted' : 'denied',
      });
    }
    return health;
  },

  openBatterySettings: async () => {
    return NativeNotificationListenerAdapter.openBatteryOptimizationSettings();
  },

  requestRebind: async () => {
    const rebound = await NativeNotificationListenerAdapter.requestRebind();
    if (rebound) {
      await get().refreshHealth();
    }
    return rebound;
  },

  openDisclosure: () => set({ isDisclosureVisible: true }),

  closeDisclosure: () => set({ isDisclosureVisible: false }),

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

  showDetectedBillModal: (bill: ExtractedBill, billId?: string) => {
    const getBillKey = (item: ExtractedBill) =>
      `${item.billerName.trim().toLowerCase()}|${Math.round(item.amountDue)}|${item.dueDate}`;
    const incomingKey = getBillKey(bill);

    const { activeDetectedBill, detectedBillQueue } = get();
    if (activeDetectedBill && getBillKey(activeDetectedBill) === incomingKey) {
      return;
    }
    if (detectedBillQueue.some((queued) => getBillKey(queued.bill) === incomingKey)) {
      return;
    }

    if (!activeDetectedBill) {
      set({
        activeDetectedBill: bill,
        activeDetectedBillId: billId ?? null,
        detectedBillModalVisible: true,
      });
    } else {
      set({ detectedBillQueue: [...detectedBillQueue, { bill, billId }] });
    }
  },

  closeDetectedBillModal: () => {
    const { detectedBillQueue } = get();
    if (detectedBillQueue.length > 0) {
      const [nextItem, ...remainingQueue] = detectedBillQueue;
      set({
        activeDetectedBill: nextItem.bill,
        activeDetectedBillId: nextItem.billId ?? null,
        detectedBillQueue: remainingQueue,
        detectedBillModalVisible: true,
      });
    } else {
      set({
        activeDetectedBill: null,
        activeDetectedBillId: null,
        detectedBillModalVisible: false,
      });
    }
  },

  drainAndProcessPending: async () => {
    if (drainInFlight) {
      return drainInFlight;
    }

    drainInFlight = (async () => {
      const { isEnabled, parseTransactions, parseBills, enabledPackages } = get();
      if (!isEnabled) return 0;

      const useTransactionalQueue =
        NativeNotificationListenerAdapter.hasTransactionalQueueSupport();
      const pending = useTransactionalQueue
        ? await NativeNotificationListenerAdapter.peekPendingNotifications()
        : await NativeNotificationListenerAdapter.drainPendingNotifications();
      if (pending.length === 0) return 0;

      let processedCount = 0;
      const ackedIds: string[] = [];

      for (const notif of pending) {
        if (!enabledPackages.includes(notif.packageName)) {
          if (notif.id) ackedIds.push(notif.id);
          continue;
        }
        try {
          const result = await NotificationParsingService.processNotification(notif, {
            parseTransactions,
            parseBills,
          });
          if (notif.id) {
            ackedIds.push(notif.id);
          }
          if (result.type === 'BILL' && result.isNew !== false) {
            get().showDetectedBillModal(result.bill, result.billId);
          }
          if (result.type !== 'IGNORED') {
            processedCount++;
          }
        } catch {
          // Safe continuation; leave un-acked when transactional queue is active
        }
      }

      if (useTransactionalQueue && ackedIds.length > 0) {
        await NativeNotificationListenerAdapter.ackPendingNotifications(ackedIds);
      }

      await get().refreshHealth().catch(() => null);
      return processedCount;
    })().finally(() => {
      drainInFlight = null;
    });

    return drainInFlight;
  },
}));

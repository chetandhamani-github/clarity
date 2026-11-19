import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import * as SecureStore from 'expo-secure-store';

export const zustandStorage: StateStorage = {
  setItem: async (name, value) => {
    await SecureStore.setItemAsync(name, value);
  },
  getItem: async (name) => {
    const value = await SecureStore.getItemAsync(name);
    return value ?? null;
  },
  removeItem: async (name) => {
    await SecureStore.deleteItemAsync(name);
  },
};

interface AppState {
  _hasHydrated: boolean;
  hasOnboarded: boolean;
  theme: 'light' | 'dark' | 'system';
  currency: string;
  biometricEnabled: boolean;
  timeoutSetting: 'immediate' | '1min' | '5min' | 'never';
  googleDriveConnected: boolean;
  googleDriveUserEmail: string | null;
  lastCloudBackupTime: string | null;
  autoBackupEnabled: boolean;
  autoBackupOnlyWifi: boolean;
  hasSeenDrivePrompt: boolean;
  hasSeenSmsPrompt: boolean;
  hasSeenNotificationPrompt: boolean;
  hideBalances: boolean;
  hasDismissedOnboardingChecklist: boolean;
  hasCustomBackupPassphrase: boolean;
  isPostResetLocked: boolean;
  paydayDayOfMonth: number;
  safetyBufferAmount: number;
  clipboardDetectionEnabled: boolean;
  lastDismissedClipboardHash: string | null;
  setHasHydrated: (value: boolean) => void;
  setOnboarded: (value: boolean) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setCurrency: (currency: string) => void;
  setBiometricEnabled: (value: boolean) => void;
  setTimeoutSetting: (value: 'immediate' | '1min' | '5min' | 'never') => void;
  setGoogleDriveConnected: (connected: boolean, email?: string | null) => void;
  setLastCloudBackupTime: (time: string | null) => void;
  setAutoBackupEnabled: (enabled: boolean) => void;
  setAutoBackupOnlyWifi: (value: boolean) => void;
  setHasSeenDrivePrompt: (seen: boolean) => void;
  setHasSeenSmsPrompt: (seen: boolean) => void;
  setHasSeenNotificationPrompt: (seen: boolean) => void;
  setHideBalances: (value: boolean) => void;
  toggleHideBalances: () => void;
  setHasDismissedOnboardingChecklist: (dismissed: boolean) => void;
  setHasCustomBackupPassphrase: (value: boolean) => void;
  setPostResetLocked: (locked: boolean) => void;
  setPaydayDayOfMonth: (day: number) => void;
  setSafetyBufferAmount: (amt: number) => void;
  setClipboardDetectionEnabled: (enabled: boolean) => void;
  setLastDismissedClipboardHash: (hash: string | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      _hasHydrated: false,
      hasOnboarded: false,
      theme: 'system',
      currency: 'INR',
      biometricEnabled: false,
      timeoutSetting: 'immediate',
      googleDriveConnected: false,
      googleDriveUserEmail: null,
      lastCloudBackupTime: null,
      autoBackupEnabled: true,
      autoBackupOnlyWifi: true,
      hasSeenDrivePrompt: false,
      hasSeenSmsPrompt: false,
      hasSeenNotificationPrompt: false,
      hideBalances: false,
      hasDismissedOnboardingChecklist: false,
      hasCustomBackupPassphrase: false,
      isPostResetLocked: false,
      paydayDayOfMonth: 1,
      safetyBufferAmount: 2000,
      clipboardDetectionEnabled: true,
      lastDismissedClipboardHash: null,
      setHasHydrated: (value) => set({ _hasHydrated: value }),
      setOnboarded: (value) => set({ hasOnboarded: value }),
      setTheme: (theme) => set({ theme }),
      setCurrency: (currency) => set({ currency }),
      setBiometricEnabled: (value) => set({ biometricEnabled: value }),
      setTimeoutSetting: (value) => set({ timeoutSetting: value }),
      setGoogleDriveConnected: (connected, email = null) =>
        set({
          googleDriveConnected: connected,
          googleDriveUserEmail: email,
          ...(!connected ? { lastCloudBackupTime: null, hasCustomBackupPassphrase: false } : {}),
        }),
      setLastCloudBackupTime: (time) => set({ lastCloudBackupTime: time }),
      setAutoBackupEnabled: (enabled) => set({ autoBackupEnabled: enabled }),
      setAutoBackupOnlyWifi: (value) => set({ autoBackupOnlyWifi: value }),
      setHasSeenDrivePrompt: (seen) => set({ hasSeenDrivePrompt: seen }),
      setHasSeenSmsPrompt: (seen) => set({ hasSeenSmsPrompt: seen }),
      setHasSeenNotificationPrompt: (seen) => set({ hasSeenNotificationPrompt: seen }),
      setHideBalances: (value) => set({ hideBalances: value }),
      toggleHideBalances: () => set((state) => ({ hideBalances: !state.hideBalances })),
      setHasDismissedOnboardingChecklist: (dismissed) =>
        set({ hasDismissedOnboardingChecklist: dismissed }),
      setHasCustomBackupPassphrase: (value) => set({ hasCustomBackupPassphrase: value }),
      setPostResetLocked: (locked) => set({ isPostResetLocked: locked }),
      setPaydayDayOfMonth: (day) => set({ paydayDayOfMonth: Math.min(31, Math.max(1, day)) }),
      setSafetyBufferAmount: (amt) => set({ safetyBufferAmount: Math.max(0, amt) }),
      setClipboardDetectionEnabled: (enabled) => set({ clipboardDetectionEnabled: enabled }),
      setLastDismissedClipboardHash: (hash) => set({ lastDismissedClipboardHash: hash }),
    }),
    {
      name: 'app-storage',
      storage: createJSONStorage(() => zustandStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

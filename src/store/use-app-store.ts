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
  hasOnboarded: boolean;
  theme: 'light' | 'dark' | 'system';
  currency: string;
  biometricEnabled: boolean;
  twoFaEnabled: boolean;
  timeoutSetting: 'immediate' | '1min' | '5min' | 'never';
  setOnboarded: (value: boolean) => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setCurrency: (currency: string) => void;
  setBiometricEnabled: (value: boolean) => void;
  setTwoFaEnabled: (value: boolean) => void;
  setTimeoutSetting: (value: 'immediate' | '1min' | '5min' | 'never') => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      hasOnboarded: false,
      theme: 'system',
      currency: 'INR',
      biometricEnabled: false,
      twoFaEnabled: false,
      timeoutSetting: '1min',
      setOnboarded: (value) => set({ hasOnboarded: value }),
      setTheme: (theme) => set({ theme }),
      setCurrency: (currency) => set({ currency }),
      setBiometricEnabled: (value) => set({ biometricEnabled: value }),
      setTwoFaEnabled: (value) => set({ twoFaEnabled: value }),
      setTimeoutSetting: (value) => set({ timeoutSetting: value }),
    }),
    {
      name: 'app-storage',
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);

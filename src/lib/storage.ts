import type { MMKV } from 'react-native-mmkv';
import { StateStorage } from 'zustand/middleware';

// In-memory fallback for test and non-native environments
class MemoryStorageAdapter {
  private memory = new Map<string, string>();

  getString(key: string): string | undefined {
    return this.memory.get(key);
  }

  set(key: string, value: string | boolean | number | ArrayBuffer): void {
    this.memory.set(key, String(value));
  }

  remove(key: string): boolean {
    return this.memory.delete(key);
  }

  contains(key: string): boolean {
    return this.memory.has(key);
  }

  clearAll(): void {
    this.memory.clear();
  }
}

export type SafeMMKV = Pick<MMKV, 'getString' | 'set' | 'remove' | 'contains' | 'clearAll'>;

let mmkvInstance: SafeMMKV;

const isTestEnvironment =
  typeof jest !== 'undefined' ||
  process.env.NODE_ENV === 'test' ||
  (typeof process !== 'undefined' && process.env.JEST_WORKER_ID !== undefined);

if (isTestEnvironment) {
  mmkvInstance = new MemoryStorageAdapter() as unknown as SafeMMKV;
} else {
  try {
    const { createMMKV } = require('react-native-mmkv');
    mmkvInstance = createMMKV({ id: 'clarity-storage' });
  } catch {
    mmkvInstance = new MemoryStorageAdapter() as unknown as SafeMMKV;
  }
}

export const mmkv = mmkvInstance;

/**
 * Zustand StateStorage adapter backed by MMKV for synchronous, fast persistence
 */
export const mmkvZustandStorage: StateStorage = {
  setItem: (name: string, value: string) => {
    mmkv.set(name, value);
  },
  getItem: (name: string) => {
    const value = mmkv.getString(name);
    return value ?? null;
  },
  removeItem: (name: string) => {
    mmkv.remove(name);
  },
};

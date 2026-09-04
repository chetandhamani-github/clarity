import { mmkv } from '@/lib/storage';

const INSTALLATION_ID_STORAGE_KEY = 'clarity_device_installation_id';

/**
 * Standard RFC4122 v4 UUID generator
 */
function generateUUIDv4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Retrieves the persistent installationId for this device installation.
 * Generates a UUID on the first launch and stores it in MMKV to be reused forever.
 */
export function getInstallationId(): string {
  const existingId = mmkv.getString(INSTALLATION_ID_STORAGE_KEY);
  if (existingId && existingId.trim().length > 0) {
    return existingId;
  }

  const newId = generateUUIDv4();
  mmkv.set(INSTALLATION_ID_STORAGE_KEY, newId);
  return newId;
}

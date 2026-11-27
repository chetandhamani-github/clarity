import {
    isMeaningfulDatabaseSnapshot,
    type ClarityBackupPayload,
} from '@/services/database/backup-restore-service';
import { useAppStore } from '@/store/use-app-store';
import {
    GoogleSignin,
    statusCodes,
} from '@react-native-google-signin/google-signin';
import * as SecureStore from 'expo-secure-store';
import {
    decryptBackupPayload,
    encryptBackupPayload,
    isEncryptedBackup,
} from './backup-crypto';

const SECURE_KEYS = {
  ACCESS_TOKEN: 'gdrive_access_token',
  REFRESH_TOKEN: 'gdrive_refresh_token',
  EXPIRES_AT: 'gdrive_token_expires_at',
  USER_EMAIL: 'gdrive_user_email',
  BACKUP_PASSPHRASE: 'gdrive_backup_passphrase',
  HAS_CUSTOM_PASSPHRASE: 'gdrive_has_custom_passphrase',
};

const BACKUP_FILE_NAME = 'clarity_backup.json';

const DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files';

// Scope required: Drive AppData (private hidden app folder)
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DEFAULT_DRIVE_TIMEOUT_MS = 25000;
const TRANSFER_DRIVE_TIMEOUT_MS = 60000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_DRIVE_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

let isGoogleSignInConfigured = false;

export function configureGoogleSignIn(): void {
  if (isGoogleSignInConfigured) return;

  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

  GoogleSignin.configure({
    webClientId: webClientId || undefined,
    scopes: [DRIVE_SCOPE],
    offlineAccess: true,
    forceCodeForRefreshToken: true,
  });

  isGoogleSignInConfigured = true;
}

export interface GoogleDriveBackupInfo {
  fileId: string;
  name: string;
  modifiedTime: string;
  size?: number;
}

export interface GoogleDriveRevisionInfo {
  id: string;
  modifiedTime: string;
  size?: number;
  keepForever?: boolean;
}

export interface GoogleAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  userEmail?: string;
}

/**
 * Retrieve saved OAuth tokens from SecureStore.
 */
export async function getSavedTokens(): Promise<{
  accessToken: string | null;
  refreshToken: string | null;
  userEmail: string | null;
  isExpired: boolean;
}> {
  const accessToken = await SecureStore.getItemAsync(SECURE_KEYS.ACCESS_TOKEN);
  const refreshToken = await SecureStore.getItemAsync(SECURE_KEYS.REFRESH_TOKEN);
  const userEmail = await SecureStore.getItemAsync(SECURE_KEYS.USER_EMAIL);
  const expiresAtStr = await SecureStore.getItemAsync(SECURE_KEYS.EXPIRES_AT);

  const expiresAt = expiresAtStr ? parseInt(expiresAtStr, 10) : 0;
  const isExpired = Date.now() > expiresAt - 60000; // 1 min margin

  return { accessToken, refreshToken, userEmail, isExpired };
}

/**
 * Save OAuth tokens to SecureStore.
 */
export async function saveTokens(tokens: {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  userEmail?: string;
}): Promise<void> {
  await SecureStore.setItemAsync(SECURE_KEYS.ACCESS_TOKEN, tokens.accessToken);
  if (tokens.refreshToken) {
    await SecureStore.setItemAsync(SECURE_KEYS.REFRESH_TOKEN, tokens.refreshToken);
  }
  if (tokens.userEmail) {
    await SecureStore.setItemAsync(SECURE_KEYS.USER_EMAIL, tokens.userEmail);
  }
  if (tokens.expiresIn) {
    const expiresAt = (Date.now() + tokens.expiresIn * 1000).toString();
    await SecureStore.setItemAsync(SECURE_KEYS.EXPIRES_AT, expiresAt);
  }
}

/**
 * Clear saved OAuth tokens (sign out).
 */
export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE_KEYS.ACCESS_TOKEN);
  await SecureStore.deleteItemAsync(SECURE_KEYS.REFRESH_TOKEN);
  await SecureStore.deleteItemAsync(SECURE_KEYS.EXPIRES_AT);
  await SecureStore.deleteItemAsync(SECURE_KEYS.USER_EMAIL);
  await SecureStore.deleteItemAsync(SECURE_KEYS.BACKUP_PASSPHRASE);
  await SecureStore.deleteItemAsync(SECURE_KEYS.HAS_CUSTOM_PASSPHRASE);
  useAppStore.getState().setHasCustomBackupPassphrase(false);

  try {
    await GoogleSignin.signOut();
  } catch {
    // Ignore sign-out errors
  }
}

/**
 * Retrieve saved client-side backup encryption passphrase/key from SecureStore.
 */
export async function getStoredBackupPassphrase(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SECURE_KEYS.BACKUP_PASSPHRASE);
  } catch {
    return null;
  }
}

/**
 * Persist client-side backup encryption passphrase/key to SecureStore.
 */
export async function setStoredBackupPassphrase(passphrase: string, isCustom = true): Promise<void> {
  try {
    if (passphrase && passphrase.trim().length >= 4) {
      await SecureStore.setItemAsync(SECURE_KEYS.BACKUP_PASSPHRASE, passphrase.trim());
      if (isCustom) {
        await SecureStore.setItemAsync(SECURE_KEYS.HAS_CUSTOM_PASSPHRASE, 'true');
        useAppStore.getState().setHasCustomBackupPassphrase(true);
      } else {
        await SecureStore.deleteItemAsync(SECURE_KEYS.HAS_CUSTOM_PASSPHRASE);
        useAppStore.getState().setHasCustomBackupPassphrase(false);
      }
    }
  } catch {
    // Ignore SecureStore write errors
  }
}

/**
 * Delete saved backup encryption passphrase from SecureStore.
 */
export async function clearStoredBackupPassphrase(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SECURE_KEYS.BACKUP_PASSPHRASE);
    await SecureStore.deleteItemAsync(SECURE_KEYS.HAS_CUSTOM_PASSPHRASE);
    useAppStore.getState().setHasCustomBackupPassphrase(false);
  } catch {
    // Ignore delete errors
  }
}

/**
 * Checks whether user has explicitly configured a custom passphrase for device recovery.
 */
export async function checkHasCustomBackupPassphrase(): Promise<boolean> {
  try {
    const flag = await SecureStore.getItemAsync(SECURE_KEYS.HAS_CUSTOM_PASSPHRASE);
    if (flag === 'true') {
      useAppStore.getState().setHasCustomBackupPassphrase(true);
      return true;
    }
    if (flag === 'false') {
      useAppStore.getState().setHasCustomBackupPassphrase(false);
      return false;
    }
    const existing = await SecureStore.getItemAsync(SECURE_KEYS.BACKUP_PASSPHRASE);
    if (!existing) {
      useAppStore.getState().setHasCustomBackupPassphrase(false);
      return false;
    }
    // If it's a 64-char hex string, it was an auto-generated device key
    const isCustom = !/^[0-9a-fA-F]{64}$/.test(existing.trim());
    await SecureStore.setItemAsync(SECURE_KEYS.HAS_CUSTOM_PASSPHRASE, isCustom ? 'true' : 'false');
    useAppStore.getState().setHasCustomBackupPassphrase(isCustom);
    return isCustom;
  } catch {
    return false;
  }
}

/**
 * Returns the stored passphrase only if the user explicitly configured a custom password.
 * Legacy auto-generated 64-char device keys are ignored for new uploads so backups never
 * get silently encrypted without a user-known password.
 */
export async function getCustomBackupPassphrase(): Promise<string | null> {
  const hasCustom = await checkHasCustomBackupPassphrase();
  if (!hasCustom) {
    return null;
  }
  const existing = await getStoredBackupPassphrase();
  const trimmed = existing?.trim();
  return trimmed && trimmed.length >= 4 ? trimmed : null;
}

/**
 * Initiates native Google Sign-In flow with Drive AppData scope consent.
 */
export async function authenticateWithGoogle(): Promise<{
  success: boolean;
  email?: string;
  accessToken?: string;
  error?: string;
}> {
  try {
    configureGoogleSignIn();

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    // 1. Initial Google Sign In
    const signInResult = await GoogleSignin.signIn();
    const userEmail = signInResult.data?.user?.email;

    // 2. Explicitly request Drive AppData scope if needed
    try {
      await GoogleSignin.addScopes({ scopes: [DRIVE_SCOPE] });
    } catch {
      // Scopes may already be granted
    }

    // 3. Obtain access token for Drive API calls
    const tokenResult = await GoogleSignin.getTokens();
    const accessToken = tokenResult?.accessToken;

    if (!accessToken) {
      return { success: false, error: 'Failed to obtain access token from Google.' };
    }

    await saveTokens({
      accessToken,
      expiresIn: 3600,
      userEmail: userEmail || undefined,
    });

    return {
      success: true,
      email: userEmail || undefined,
      accessToken,
    };
  } catch (error: any) {
    if (error?.code === statusCodes.SIGN_IN_CANCELLED) {
      return { success: false, error: 'User canceled sign-in.' };
    }
    if (error?.code === statusCodes.IN_PROGRESS) {
      return { success: false, error: 'Sign-in is already in progress.' };
    }
    if (error?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return { success: false, error: 'Google Play Services is not available on this device.' };
    }
    return {
      success: false,
      error: error?.message || 'Failed to authenticate with Google.',
    };
  }
}

/**
 * Get active access token, refreshing if needed.
 * @param forceRefresh Clear cached token and force fresh token retrieval
 * @param allowInteractive If false, fails silently without prompting user login UI
 */
export async function getValidAccessToken(
  forceRefresh = false,
  allowInteractive = true
): Promise<string | null> {
  try {
    const { accessToken, isExpired } = await getSavedTokens();
    if (accessToken && !isExpired && !forceRefresh) {
      return accessToken;
    }

    configureGoogleSignIn();

    // Clear stale cached token if forced
    if (forceRefresh && accessToken) {
      try {
        await GoogleSignin.clearCachedAccessToken(accessToken);
      } catch {
        // Ignore cache clear error
      }
    }

    // 1. Try silent token retrieval from Google Sign-In SDK
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: false });
      const currentUser = await GoogleSignin.getCurrentUser();
      if (!currentUser) {
        await GoogleSignin.signInSilently();
      }
      const tokenResult = await GoogleSignin.getTokens();
      if (tokenResult?.accessToken) {
        await saveTokens({
          accessToken: tokenResult.accessToken,
          expiresIn: 3600,
          userEmail: currentUser?.user?.email || undefined,
        });
        return tokenResult.accessToken;
      }
    } catch {
      // Silent refresh fallback
    }

    // 2. Interactive sign-in fallback (only if interactive UI is allowed)
    if (!allowInteractive) {
      return null;
    }

    const auth = await authenticateWithGoogle();
    return auth.success && auth.accessToken ? auth.accessToken : null;
  } catch {
    return null;
  }
}

/**
 * Search for the Clarity backup file in the private AppData folder.
 * NOTE: spaces=appDataFolder does NOT support `trashed` field queries in Google Drive v3.
 */
export async function findBackupFile(accessToken: string): Promise<GoogleDriveBackupInfo | null> {
  try {
    // 1. Query files specifically in appDataFolder
    // Notice: Do NOT use `trashed = false` because appDataFolder does not support trash!
    const query = encodeURIComponent(`name = '${BACKUP_FILE_NAME}'`);
    const appDataUrl = `${DRIVE_FILES_ENDPOINT}?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime%20desc`;

    const response = await fetchWithTimeout(appDataUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 401) {
      throw new Error('UNAUTHORIZED');
    }

    if (response.ok) {
      const data = await response.json();
      if (data.files && Array.isArray(data.files) && data.files.length > 0) {
        const file = data.files[0];

        // If duplicate legacy files exist, prune older ones in background
        if (data.files.length > 1) {
          for (let i = 1; i < data.files.length; i++) {
            const oldId = data.files[i]?.id;
            if (oldId) {
              fetchWithTimeout(`${DRIVE_FILES_ENDPOINT}/${oldId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${accessToken}` },
              }).catch(() => {});
            }
          }
        }

        return {
          fileId: file.id,
          name: file.name,
          modifiedTime: file.modifiedTime,
          size: file.size ? parseInt(file.size, 10) : undefined,
        };
      }
    }

    // 2. Fallback: list all files in appDataFolder and filter client-side
    const listAllUrl = `${DRIVE_FILES_ENDPOINT}?spaces=appDataFolder&fields=files(id,name,modifiedTime,size)&pageSize=20`;
    const listResponse = await fetchWithTimeout(listAllUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (listResponse.ok) {
      const listData = await listResponse.json();
      if (listData.files && Array.isArray(listData.files)) {
        const matchingFiles = listData.files
          .filter((f: any) => f.name === BACKUP_FILE_NAME)
          .sort(
            (a: any, b: any) =>
              new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime()
          );

        if (matchingFiles.length > 0) {
          const file = matchingFiles[0];

          // Prune older duplicates in background
          if (matchingFiles.length > 1) {
            for (let i = 1; i < matchingFiles.length; i++) {
              const oldId = matchingFiles[i]?.id;
              if (oldId) {
                fetchWithTimeout(`${DRIVE_FILES_ENDPOINT}/${oldId}`, {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${accessToken}` },
                }).catch(() => {});
              }
            }
          }

          return {
            fileId: file.id,
            name: file.name,
            modifiedTime: file.modifiedTime,
            size: file.size ? parseInt(file.size, 10) : undefined,
          };
        }
      }
    }
  } catch (e: any) {
    if (e?.message === 'UNAUTHORIZED') {
      throw e;
    }
  }

  return null;
}

/**
 * Upload database snapshot to Google Drive AppData folder.
 * Uses direct PATCH for existing files and RFC-compliant multipart POST for new files.
 */
export async function uploadBackup(
  snapshot: ClarityBackupPayload,
  options?: {
    allowEmptyOverwrite?: boolean;
    allowInteractive?: boolean;
    passphrase?: string;
    disableEncryption?: boolean;
    pinRevision?: boolean;
  }
): Promise<{ success: boolean; modifiedTime?: string; encrypted?: boolean; error?: string }> {
  try {
    const allowInteractive = options?.allowInteractive ?? true;
    let accessToken = await getValidAccessToken(false, allowInteractive);
    if (!accessToken) {
      return { success: false, error: 'Google Drive is not connected or token expired.' };
    }

    let existingFile: GoogleDriveBackupInfo | null = null;
    try {
      existingFile = await findBackupFile(accessToken);
    } catch (findErr: any) {
      if (findErr?.message === 'UNAUTHORIZED') {
        accessToken = await getValidAccessToken(true, allowInteractive);
        if (accessToken) {
          existingFile = await findBackupFile(accessToken);
        }
      }
    }

    if (!accessToken) {
      return { success: false, error: 'Authentication expired. Please reconnect Google Drive.' };
    }

    const isMeaningful = isMeaningfulDatabaseSnapshot(snapshot);

    // Safeguard 1: Never overwrite an existing cloud backup with an empty/cleared local database
    if (existingFile && !isMeaningful && !options?.allowEmptyOverwrite) {
      return {
        success: false,
        error: 'Aborted: Cloud backup contains data, but current local device data is empty. Prevented accidental overwrite.',
      };
    }

    // Safeguard 2: Volumetric circuit breaker
    // If remote backup exists (> 3KB) and local payload is drastically smaller (< 35% of remote) with minimal transactions,
    // prevent silent auto-overwrite to avoid replacing a populated cloud backup with a near-blank test database.
    const localTxCount = Array.isArray(snapshot.data?.transactions) ? snapshot.data.transactions.length : 0;

    // Encrypt only when the user explicitly provides or previously set a backup password.
    // Without a user password, upload plain JSON to private Drive AppData so restore works across reinstalls.
    let activePassphrase: string | null = null;
    if (!options?.disableEncryption) {
      if (options?.passphrase !== undefined) {
        const trimmed = options.passphrase.trim();
        if (trimmed.length < 4) {
          return {
            success: false,
            error: 'Backup password must be at least 4 characters long.',
          };
        }
        activePassphrase = trimmed;
      } else {
        activePassphrase = await getCustomBackupPassphrase();
      }
    }

    const payloadToUpload = activePassphrase
      ? await encryptBackupPayload(snapshot, activePassphrase)
      : snapshot;
    const jsonContent = JSON.stringify(payloadToUpload, null, 2);

    if (
      existingFile &&
      existingFile.size &&
      existingFile.size > 3000 &&
      jsonContent.length < existingFile.size * 0.35 &&
      localTxCount < 3 &&
      !options?.allowEmptyOverwrite
    ) {
      return {
        success: false,
        error: 'Aborted: Cloud backup contains significantly more data than local device. Prevented accidental overwrite.',
      };
    }

    let response: Response;

    if (existingFile) {
      // 1. UPDATE EXISTING FILE: Use direct media PATCH (most reliable, avoids multipart boundary issues)
      const uploadUrl = `${DRIVE_UPLOAD_ENDPOINT}/${existingFile.fileId}?uploadType=media`;
      response = await fetchWithTimeout(uploadUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: jsonContent,
      }, TRANSFER_DRIVE_TIMEOUT_MS);

      // If 401, retry once with refreshed token
      if (response.status === 401) {
        accessToken = await getValidAccessToken(true, allowInteractive);
        if (accessToken) {
          response = await fetchWithTimeout(uploadUrl, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json; charset=UTF-8',
            },
            body: jsonContent,
          }, TRANSFER_DRIVE_TIMEOUT_MS);
        }
      }
    } else {
      // 2. CREATE NEW FILE: Use RFC-compliant multipart/related POST to appDataFolder
      const boundary = `boundary_clarity_${Date.now()}`;
      const metadata = {
        name: BACKUP_FILE_NAME,
        mimeType: 'application/json',
        parents: ['appDataFolder'],
      };

      // Ensure NO leading CRLF before the first boundary
      const multipartRequestBody =
        `--${boundary}\r\n` +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        `\r\n--${boundary}\r\n` +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        jsonContent +
        `\r\n--${boundary}--`;

      const uploadUrl = `${DRIVE_UPLOAD_ENDPOINT}?uploadType=multipart`;
      response = await fetchWithTimeout(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      }, TRANSFER_DRIVE_TIMEOUT_MS);

      // If 401, retry once with refreshed token
      if (response.status === 401) {
        accessToken = await getValidAccessToken(true, allowInteractive);
        if (accessToken) {
          response = await fetchWithTimeout(uploadUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body: multipartRequestBody,
          }, TRANSFER_DRIVE_TIMEOUT_MS);
        }
      }
    }

    if (!response.ok) {
      const errText = await response.text();
      return { success: false, error: `Google Drive upload failed (${response.status}): ${errText}` };
    }

    if (options?.disableEncryption) {
      await clearStoredBackupPassphrase();
    } else if (options?.passphrase && activePassphrase) {
      await setStoredBackupPassphrase(activePassphrase, true);
    }

    const resData = await response.json();
    const modifiedTime = resData.modifiedTime || new Date().toISOString();
    const fileId = resData.id || existingFile?.fileId;

    if (fileId && options?.pinRevision) {
      try {
        const revUrl = `${DRIVE_FILES_ENDPOINT}/${fileId}/revisions?fields=revisions(id)&orderBy=modifiedTime%20desc`;
        const revRes = await fetchWithTimeout(revUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (revRes.ok) {
          const revData = await revRes.json();
          const latestRev = revData.revisions?.[revData.revisions.length - 1];
          if (latestRev?.id) {
            await fetchWithTimeout(`${DRIVE_FILES_ENDPOINT}/${fileId}/revisions/${latestRev.id}`, {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ keepForever: true }),
            });
          }
        }
      } catch {
        // Pinning failure non-blocking
      }
    }

    return { success: true, modifiedTime, encrypted: Boolean(activePassphrase) };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Failed to upload backup to Google Drive.' };
  }
}

/**
 * Download backup snapshot from Google Drive AppData folder.
 */
export async function downloadBackup(passphrase?: string): Promise<{
  success: boolean;
  data?: ClarityBackupPayload;
  metadata?: GoogleDriveBackupInfo;
  error?: string;
  isRecoveredFromRevision?: boolean;
  isEncrypted?: boolean;
}> {
  try {
    let accessToken = await getValidAccessToken();
    if (!accessToken) {
      return { success: false, error: 'Google Drive is not connected or token expired.' };
    }

    let backupInfo: GoogleDriveBackupInfo | null = null;
    try {
      backupInfo = await findBackupFile(accessToken);
    } catch (findErr: any) {
      if (findErr?.message === 'UNAUTHORIZED') {
        accessToken = await getValidAccessToken(true);
        if (accessToken) {
          backupInfo = await findBackupFile(accessToken);
        }
      }
    }

    if (!backupInfo) {
      return { success: false, error: 'No backup file found in Google Drive.' };
    }

    const downloadUrl = `${DRIVE_FILES_ENDPOINT}/${backupInfo.fileId}?alt=media`;
    let response = await fetchWithTimeout(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }, TRANSFER_DRIVE_TIMEOUT_MS);

    if (response.status === 401) {
      accessToken = await getValidAccessToken(true);
      if (accessToken) {
        response = await fetchWithTimeout(downloadUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }, TRANSFER_DRIVE_TIMEOUT_MS);
      }
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to download backup file (${response.status}): ${errText}`);
    }

    const responseText = await response.text();
    let rawJson: any;
    try {
      rawJson = JSON.parse(responseText);
    } catch {
      throw new Error('Downloaded backup file is not valid JSON.');
    }

    let payload: ClarityBackupPayload;
    if (isEncryptedBackup(rawJson)) {
      const keyToUse = passphrase || (await getStoredBackupPassphrase());
      if (!keyToUse) {
        return {
          success: false,
          isEncrypted: true,
          metadata: backupInfo,
          error: 'This backup is encrypted with a passphrase.',
        };
      }
      try {
        payload = await decryptBackupPayload<ClarityBackupPayload>(rawJson, keyToUse);
        if (passphrase) {
          await setStoredBackupPassphrase(passphrase, true);
        }
      } catch (decErr: any) {
        return {
          success: false,
          isEncrypted: true,
          metadata: backupInfo,
          error: decErr?.message || 'Incorrect passphrase.',
        };
      }
    } else {
      payload = rawJson;
    }

    if (!payload || !payload.data) {
      throw new Error('Downloaded file does not contain valid Clarity backup data.');
    }

    // If the latest backup file is empty (e.g. was overwritten by auto-sync after data clear),
    // query Google Drive file revisions history to find the most recent valid backup with real data!
    if (!isMeaningfulDatabaseSnapshot(payload)) {
      try {
        const revUrl = `${DRIVE_FILES_ENDPOINT}/${backupInfo.fileId}/revisions?fields=revisions(id,modifiedTime,size)`;
        let revRes = await fetchWithTimeout(revUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (revRes.status === 401) {
          accessToken = await getValidAccessToken(true);
          if (accessToken) {
            revRes = await fetchWithTimeout(revUrl, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
          }
        }

        if (revRes.ok) {
          const revData = await revRes.json();
          const revisions = revData.revisions;
          if (Array.isArray(revisions) && revisions.length > 0) {
            const keyToUse = passphrase || (await getStoredBackupPassphrase());
            // Check revisions from newest to oldest
            for (let i = revisions.length - 1; i >= 0; i--) {
              const rev = revisions[i];
              const revDlUrl = `${DRIVE_FILES_ENDPOINT}/${backupInfo.fileId}/revisions/${rev.id}?alt=media`;
              const revFileRes = await fetchWithTimeout(revDlUrl, {
                headers: { Authorization: `Bearer ${accessToken}` },
              }, TRANSFER_DRIVE_TIMEOUT_MS);

              if (revFileRes.ok) {
                const revText = await revFileRes.text();
                try {
                  const revRaw = JSON.parse(revText);
                  let revPayload: ClarityBackupPayload;
                  if (isEncryptedBackup(revRaw)) {
                    if (!keyToUse) continue;
                    revPayload = await decryptBackupPayload<ClarityBackupPayload>(revRaw, keyToUse);
                    if (passphrase) {
                      await setStoredBackupPassphrase(passphrase, true);
                    }
                  } else {
                    revPayload = revRaw;
                  }
                  if (isMeaningfulDatabaseSnapshot(revPayload)) {
                    return {
                      success: true,
                      data: revPayload,
                      metadata: {
                        ...backupInfo,
                        modifiedTime: rev.modifiedTime || backupInfo.modifiedTime,
                      },
                      isRecoveredFromRevision: true,
                    };
                  }
                } catch {
                  // Ignore parse error on older revision
                }
              }
            }
          }
        }
      } catch {
        // Revision recovery attempt error ignored
      }
    }

    return {
      success: true,
      data: payload,
      metadata: backupInfo,
    };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Download failed.' };
  }
}

/**
 * List historical backup revisions available in Google Drive AppData folder.
 */
export async function listBackupRevisions(): Promise<{
  success: boolean;
  revisions?: GoogleDriveRevisionInfo[];
  error?: string;
}> {
  try {
    let accessToken = await getValidAccessToken();
    if (!accessToken) {
      return { success: false, error: 'Google Drive is not connected or token expired.' };
    }

    let backupInfo: GoogleDriveBackupInfo | null = null;
    try {
      backupInfo = await findBackupFile(accessToken);
    } catch (findErr: any) {
      if (findErr?.message === 'UNAUTHORIZED') {
        accessToken = await getValidAccessToken(true);
        if (accessToken) {
          backupInfo = await findBackupFile(accessToken);
        }
      }
    }

    if (!backupInfo) {
      return { success: false, error: 'No backup file found in Google Drive.' };
    }

    const revUrl = `${DRIVE_FILES_ENDPOINT}/${backupInfo.fileId}/revisions?fields=revisions(id,modifiedTime,size,keepForever)`;
    let revRes = await fetchWithTimeout(revUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (revRes.status === 401) {
      accessToken = await getValidAccessToken(true);
      if (accessToken) {
        revRes = await fetchWithTimeout(revUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }
    }

    if (!revRes.ok) {
      return { success: false, error: 'Failed to fetch revision history from Google Drive.' };
    }

    const data = await revRes.json();
    const rawList = Array.isArray(data.revisions) ? data.revisions : [];
    const revisions: GoogleDriveRevisionInfo[] = rawList
      .map((r: any) => ({
        id: String(r.id),
        modifiedTime: r.modifiedTime || new Date().toISOString(),
        size: r.size ? parseInt(r.size, 10) : undefined,
        keepForever: Boolean(r.keepForever),
      }))
      .reverse(); // Newest first

    return { success: true, revisions };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Failed to list backup revisions.' };
  }
}

/**
 * Download a specific historical revision by revisionId.
 */
export async function downloadBackupRevision(
  revisionId: string,
  passphrase?: string
): Promise<{
  success: boolean;
  data?: ClarityBackupPayload;
  metadata?: GoogleDriveBackupInfo;
  error?: string;
  isEncrypted?: boolean;
}> {
  try {
    let accessToken = await getValidAccessToken();
    if (!accessToken) {
      return { success: false, error: 'Google Drive is not connected or token expired.' };
    }

    let backupInfo: GoogleDriveBackupInfo | null = null;
    try {
      backupInfo = await findBackupFile(accessToken);
    } catch (findErr: any) {
      if (findErr?.message === 'UNAUTHORIZED') {
        accessToken = await getValidAccessToken(true);
        if (accessToken) {
          backupInfo = await findBackupFile(accessToken);
        }
      }
    }

    if (!backupInfo) {
      return { success: false, error: 'No backup file found in Google Drive.' };
    }

    const revDlUrl = `${DRIVE_FILES_ENDPOINT}/${backupInfo.fileId}/revisions/${revisionId}?alt=media`;
    let response = await fetchWithTimeout(revDlUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }, TRANSFER_DRIVE_TIMEOUT_MS);

    if (response.status === 401) {
      accessToken = await getValidAccessToken(true);
      if (accessToken) {
        response = await fetchWithTimeout(revDlUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        }, TRANSFER_DRIVE_TIMEOUT_MS);
      }
    }

    if (!response.ok) {
      return { success: false, error: `Failed to download revision (${response.status})` };
    }

    const responseText = await response.text();
    let rawJson: any;
    try {
      rawJson = JSON.parse(responseText);
    } catch {
      return { success: false, error: 'Revision file is not valid JSON.' };
    }

    let payload: ClarityBackupPayload;
    if (isEncryptedBackup(rawJson)) {
      const keyToUse = passphrase || (await getStoredBackupPassphrase());
      if (!keyToUse) {
        return {
          success: false,
          isEncrypted: true,
          metadata: backupInfo,
          error: 'This backup is encrypted with a passphrase.',
        };
      }
      try {
        payload = await decryptBackupPayload<ClarityBackupPayload>(rawJson, keyToUse);
        if (passphrase) {
          await setStoredBackupPassphrase(passphrase, true);
        }
      } catch (decErr: any) {
        return {
          success: false,
          isEncrypted: true,
          metadata: backupInfo,
          error: decErr?.message || 'Incorrect passphrase.',
        };
      }
    } else {
      payload = rawJson;
    }

    if (!payload || !payload.data) {
      return { success: false, error: 'Revision does not contain valid Clarity backup data.' };
    }

    return {
      success: true,
      data: payload,
      metadata: backupInfo,
    };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Failed to download revision.' };
  }
}

/**
 * Delete all Clarity backup files from Google Drive AppData folder.
 */
export async function deleteAllBackups(
  accessToken?: string
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    let token = accessToken || (await getValidAccessToken());
    if (!token) {
      return { success: false, count: 0, error: 'Google Drive is not connected or token expired.' };
    }

    // 1. List all files in the private appDataFolder
    const listUrl = `${DRIVE_FILES_ENDPOINT}?spaces=appDataFolder&fields=files(id,name)&pageSize=100`;
    let listResponse = await fetchWithTimeout(listUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (listResponse.status === 401) {
      token = await getValidAccessToken(true);
      if (token) {
        listResponse = await fetchWithTimeout(listUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    }

    if (!listResponse.ok) {
      return {
        success: false,
        count: 0,
        error: `Failed to list Drive backups: ${listResponse.statusText}`,
      };
    }

    const listData = await listResponse.json();
    const files: Array<{ id: string; name: string }> = listData.files || [];

    // Filter to Clarity backup files
    const backupFiles = files.filter(
      (f) => f.name === BACKUP_FILE_NAME || f.name.startsWith('clarity_')
    );

    if (backupFiles.length === 0) {
      return { success: true, count: 0 };
    }

    let deletedCount = 0;
    for (const file of backupFiles) {
      try {
        const delResponse = await fetchWithTimeout(`${DRIVE_FILES_ENDPOINT}/${file.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (delResponse.ok || delResponse.status === 204 || delResponse.status === 404) {
          deletedCount++;
        }
      } catch {
        // Individual file deletion error ignored
      }
    }

    return { success: true, count: deletedCount };
  } catch (error: any) {
    return {
      success: false,
      count: 0,
      error: error?.message || 'Failed to delete backups from Google Drive.',
    };
  }
}

let autoBackupDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let syncInFlight: Promise<boolean> | null = null;

/**
 * Cancel any pending debounced auto-backup timer.
 */
export function clearAutoBackupTimer(): void {
  if (autoBackupDebounceTimer) {
    clearTimeout(autoBackupDebounceTimer);
    autoBackupDebounceTimer = null;
  }
}

/**
 * Standalone background auto-sync utility.
 */
export async function syncDatabaseToDriveSilently(_reason = 'auto-sync'): Promise<boolean> {
  if (syncInFlight) {
    return syncInFlight;
  }

  syncInFlight = (async () => {
    try {
      const { useAppStore: appStore } = await import('@/store/use-app-store');
      const {
        generateDatabaseSnapshot,
        isMeaningfulDatabaseSnapshot: checkMeaningfulDatabaseSnapshot,
      } = await import('@/services/database/backup-restore-service');
      const state = appStore.getState();

      if (!state.googleDriveConnected || !state.autoBackupEnabled || state.isPostResetLocked) {
        return false;
      }

      const snapshot = await generateDatabaseSnapshot();

      // Safeguard: Never auto-sync an empty/cleared local database to the cloud
      if (!checkMeaningfulDatabaseSnapshot(snapshot)) {
        return false;
      }

      const result = await uploadBackup(snapshot, { allowInteractive: false });
      if (result.success && result.modifiedTime) {
        state.setLastCloudBackupTime(result.modifiedTime);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      syncInFlight = null;
    }
  })();

  return syncInFlight;
}

/**
 * Flushes any queued debounced auto-backup immediately (e.g. before app backgrounds).
 */
export async function flushPendingAutoBackup(reason = 'app-background'): Promise<boolean> {
  if (!autoBackupDebounceTimer) {
    return false;
  }
  clearAutoBackupTimer();
  return syncDatabaseToDriveSilently(reason);
}

/**
 * Debounced background auto-backup trigger.
 */
export function queueAutoBackup(reason = 'db-change'): void {
  if (autoBackupDebounceTimer) {
    clearTimeout(autoBackupDebounceTimer);
  }

  autoBackupDebounceTimer = setTimeout(() => {
    autoBackupDebounceTimer = null;
    syncDatabaseToDriveSilently(reason).catch(() => {});
  }, 5000);
}

import * as SecureStore from 'expo-secure-store';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import type { ClarityBackupPayload } from '@/services/database/backup-restore-service';

const SECURE_KEYS = {
  ACCESS_TOKEN: 'gdrive_access_token',
  REFRESH_TOKEN: 'gdrive_refresh_token',
  EXPIRES_AT: 'gdrive_token_expires_at',
  USER_EMAIL: 'gdrive_user_email',
};

const BACKUP_FILE_NAME = 'clarity_backup.json';

const DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files';

// Scope required: Drive AppData (private hidden app folder)
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

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

  try {
    await GoogleSignin.signOut();
  } catch {
    // Ignore sign-out errors
  }
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
    } catch (scopeErr) {
      if (__DEV__) {
        console.log('[GoogleDrive] addScopes notification:', scopeErr);
      }
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
    console.error('Google authentication error:', error);
    return {
      success: false,
      error: error?.message || 'Failed to authenticate with Google.',
    };
  }
}

/**
 * Get active access token, refreshing if needed.
 */
export async function getValidAccessToken(forceRefresh = false): Promise<string | null> {
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
    } catch (silentErr) {
      if (__DEV__) {
        console.log('[GoogleDrive] Silent token refresh attempt:', silentErr);
      }
    }

    // 2. Interactive sign-in fallback
    const auth = await authenticateWithGoogle();
    return auth.success && auth.accessToken ? auth.accessToken : null;
  } catch (err) {
    console.error('[GoogleDrive] getValidAccessToken error:', err);
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

    const response = await fetch(appDataUrl, {
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
              fetch(`${DRIVE_FILES_ENDPOINT}/${oldId}`, {
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
    } else {
      const errText = await response.text();
      console.warn('[GoogleDrive] AppData folder query failed:', response.status, errText);
    }

    // 2. Fallback: list all files in appDataFolder and filter client-side
    const listAllUrl = `${DRIVE_FILES_ENDPOINT}?spaces=appDataFolder&fields=files(id,name,modifiedTime,size)&pageSize=20`;
    const listResponse = await fetch(listAllUrl, {
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
                fetch(`${DRIVE_FILES_ENDPOINT}/${oldId}`, {
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
    console.warn('[GoogleDrive] Error finding backup file:', e);
  }

  return null;
}

/**
 * Upload database snapshot to Google Drive AppData folder.
 * Uses direct PATCH for existing files and RFC-compliant multipart POST for new files.
 */
export async function uploadBackup(
  snapshot: ClarityBackupPayload
): Promise<{ success: boolean; modifiedTime?: string; error?: string }> {
  try {
    let accessToken = await getValidAccessToken();
    if (!accessToken) {
      return { success: false, error: 'Google Drive is not connected or token expired.' };
    }

    let existingFile: GoogleDriveBackupInfo | null = null;
    try {
      existingFile = await findBackupFile(accessToken);
    } catch (findErr: any) {
      if (findErr?.message === 'UNAUTHORIZED') {
        accessToken = await getValidAccessToken(true);
        if (accessToken) {
          existingFile = await findBackupFile(accessToken);
        }
      }
    }

    if (!accessToken) {
      return { success: false, error: 'Authentication expired. Please reconnect Google Drive.' };
    }

    const jsonContent = JSON.stringify(snapshot, null, 2);

    let response: Response;

    if (existingFile) {
      // 1. UPDATE EXISTING FILE: Use direct media PATCH (most reliable, avoids multipart boundary issues)
      const uploadUrl = `${DRIVE_UPLOAD_ENDPOINT}/${existingFile.fileId}?uploadType=media`;
      response = await fetch(uploadUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: jsonContent,
      });

      // If 401, retry once with refreshed token
      if (response.status === 401) {
        accessToken = await getValidAccessToken(true);
        if (accessToken) {
          response = await fetch(uploadUrl, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json; charset=UTF-8',
            },
            body: jsonContent,
          });
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
      response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      });

      // If 401, retry once with refreshed token
      if (response.status === 401) {
        accessToken = await getValidAccessToken(true);
        if (accessToken) {
          response = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body: multipartRequestBody,
          });
        }
      }
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error('[GoogleDrive] Upload failed HTTP', response.status, errText);
      return { success: false, error: `Google Drive upload failed (${response.status}): ${errText}` };
    }

    const resData = await response.json();
    const modifiedTime = resData.modifiedTime || new Date().toISOString();

    if (__DEV__) {
      console.log('[GoogleDrive] Backup uploaded successfully at:', modifiedTime);
    }

    return { success: true, modifiedTime };
  } catch (error: any) {
    console.error('[GoogleDrive] Failed to upload backup:', error);
    return { success: false, error: error?.message || 'Failed to upload backup to Google Drive.' };
  }
}

/**
 * Download backup snapshot from Google Drive AppData folder.
 */
export async function downloadBackup(): Promise<{
  success: boolean;
  data?: ClarityBackupPayload;
  metadata?: GoogleDriveBackupInfo;
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

    const downloadUrl = `${DRIVE_FILES_ENDPOINT}/${backupInfo.fileId}?alt=media`;
    let response = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 401) {
      accessToken = await getValidAccessToken(true);
      if (accessToken) {
        response = await fetch(downloadUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to download backup file (${response.status}): ${errText}`);
    }

    const responseText = await response.text();
    let payload: ClarityBackupPayload;
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new Error('Downloaded backup file is not valid JSON.');
    }

    if (!payload || !payload.data) {
      throw new Error('Downloaded file does not contain valid Clarity backup data.');
    }

    return {
      success: true,
      data: payload,
      metadata: backupInfo,
    };
  } catch (error: any) {
    console.error('[GoogleDrive] Failed to download backup:', error);
    return { success: false, error: error?.message || 'Download failed.' };
  }
}

let autoBackupDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Standalone background auto-sync utility.
 */
export async function syncDatabaseToDriveSilently(reason = 'auto-sync'): Promise<boolean> {
  try {
    const { useAppStore } = await import('@/store/use-app-store');
    const { generateDatabaseSnapshot } = await import('@/services/database/backup-restore-service');
    const state = useAppStore.getState();

    if (!state.googleDriveConnected || !state.autoBackupEnabled) {
      return false;
    }

    const snapshot = await generateDatabaseSnapshot();
    const result = await uploadBackup(snapshot);
    if (result.success && result.modifiedTime) {
      state.setLastCloudBackupTime(result.modifiedTime);
      return true;
    }
    return false;
  } catch (err) {
    console.warn(`[AutoBackup:${reason}] Failed silent sync:`, err);
    return false;
  }
}

/**
 * Debounced background auto-backup trigger.
 */
export function queueAutoBackup(reason = 'db-change'): void {
  if (autoBackupDebounceTimer) {
    clearTimeout(autoBackupDebounceTimer);
  }

  autoBackupDebounceTimer = setTimeout(() => {
    syncDatabaseToDriveSilently(reason).catch(() => {});
  }, 5000);
}

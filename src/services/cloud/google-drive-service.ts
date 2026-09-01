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

const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v2/userinfo';
const DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files';

// Scopes required: Drive AppData (private app folder)
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

let isGoogleSignInConfigured = false;

function configureGoogleSignIn(): void {
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
 * Initiates native Google Sign-In flow.
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

    const signInResult = await GoogleSignin.signIn();
    const userEmail = signInResult.data?.user?.email;

    // Get access token for Drive API calls
    const tokenResult = await GoogleSignin.getTokens();
    const accessToken = tokenResult.accessToken;

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
 * Get active access token (or prompt re-authentication if expired).
 */
export async function getValidAccessToken(): Promise<string | null> {
  try {
    const { accessToken, isExpired } = await getSavedTokens();
    if (accessToken && !isExpired) {
      return accessToken;
    }

    configureGoogleSignIn();

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
      console.log('Silent token refresh attempt:', silentErr);
    }

    // 2. Interactive sign-in fallback
    const auth = await authenticateWithGoogle();
    return auth.success && auth.accessToken ? auth.accessToken : null;
  } catch (err) {
    console.error('getValidAccessToken error:', err);
    return null;
  }
}

/**
 * Search for the Clarity backup file in the private AppData folder or Drive.
 */
export async function findBackupFile(accessToken: string): Promise<GoogleDriveBackupInfo | null> {
  const query = encodeURIComponent(`name = '${BACKUP_FILE_NAME}' and trashed = false`);
  
  // 1. First search in private appDataFolder with newest first
  try {
    const appDataUrl = `${DRIVE_FILES_ENDPOINT}?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime%20desc`;
    const response = await fetch(appDataUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.files && data.files.length > 0) {
        const file = data.files[0];
        return {
          fileId: file.id,
          name: file.name,
          modifiedTime: file.modifiedTime,
          size: file.size ? parseInt(file.size, 10) : undefined,
        };
      }
    }
  } catch (e) {
    console.warn('Error querying appDataFolder:', e);
  }

  // 2. Fallback: Search globally in case it was stored in root folder
  try {
    const globalUrl = `${DRIVE_FILES_ENDPOINT}?q=${query}&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime%20desc`;
    const response = await fetch(globalUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.files && data.files.length > 0) {
        const file = data.files[0];
        return {
          fileId: file.id,
          name: file.name,
          modifiedTime: file.modifiedTime,
          size: file.size ? parseInt(file.size, 10) : undefined,
        };
      }
    }
  } catch (e) {
    console.warn('Error querying global drive:', e);
  }

  return null;
}

/**
 * Upload database snapshot to Google Drive AppData folder.
 */
export async function uploadBackup(
  snapshot: ClarityBackupPayload
): Promise<{ success: boolean; modifiedTime?: string; error?: string }> {
  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return { success: false, error: 'Google Drive is not connected or token expired.' };
    }

    const existingFile = await findBackupFile(accessToken);
    const jsonContent = JSON.stringify(snapshot, null, 2);

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name: BACKUP_FILE_NAME,
      mimeType: 'application/json',
      ...(existingFile ? {} : { parents: ['appDataFolder'] }),
    };

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      jsonContent +
      closeDelimiter;

    let uploadUrl = `${DRIVE_UPLOAD_ENDPOINT}?uploadType=multipart`;
    let method = 'POST';

    if (existingFile) {
      uploadUrl = `${DRIVE_UPLOAD_ENDPOINT}/${existingFile.fileId}?uploadType=multipart`;
      method = 'PATCH';
    }

    const response = await fetch(uploadUrl, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Drive upload failed: ${errText}`);
    }

    const resData = await response.json();
    const modifiedTime = resData.modifiedTime || new Date().toISOString();

    return { success: true, modifiedTime };
  } catch (error: any) {
    console.error('Failed to upload backup to Google Drive:', error);
    return { success: false, error: error?.message || 'Upload failed.' };
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
    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return { success: false, error: 'Google Drive is not connected or token expired.' };
    }

    const backupInfo = await findBackupFile(accessToken);
    if (!backupInfo) {
      return { success: false, error: 'No backup file found in Google Drive.' };
    }

    const downloadUrl = `${DRIVE_FILES_ENDPOINT}/${backupInfo.fileId}?alt=media`;
    const response = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to download backup file: ${errText}`);
    }

    const responseText = await response.text();
    let payload: ClarityBackupPayload;
    try {
      payload = JSON.parse(responseText);
    } catch (parseErr) {
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
    console.error('Failed to download backup from Google Drive:', error);
    return { success: false, error: error?.message || 'Download failed.' };
  }
}

let autoBackupDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Standalone background auto-sync utility.
 * Can be called anywhere (e.g. on app launch or after database mutations).
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
 * Waits 5 seconds after the last change before uploading to prevent unnecessary network requests.
 */
export function queueAutoBackup(reason = 'db-change'): void {
  if (autoBackupDebounceTimer) {
    clearTimeout(autoBackupDebounceTimer);
  }

  autoBackupDebounceTimer = setTimeout(() => {
    syncDatabaseToDriveSilently(reason).catch(() => {});
  }, 5000);
}

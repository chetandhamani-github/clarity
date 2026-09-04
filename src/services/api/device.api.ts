import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { apiClient } from './client';
import { fetchRemoteConfig } from './config.api';
import {
  DeviceRegistrationPayload,
  DeviceRegistrationResponse,
  DeviceStatusResponse,
  DeviceStatusResult,
} from './types';
import { getInstallationId } from '@/utils/installationId';

/**
 * Compares two semantic versions. Returns true if current < minRequired.
 */
export function isVersionOutdated(currentVersion: string, minRequiredVersion: string): boolean {
  const currentParts = currentVersion.split('.').map((p) => parseInt(p, 10) || 0);
  const minParts = minRequiredVersion.split('.').map((p) => parseInt(p, 10) || 0);
  const maxLength = Math.max(currentParts.length, minParts.length);

  for (let i = 0; i < maxLength; i++) {
    const curr = currentParts[i] ?? 0;
    const min = minParts[i] ?? 0;
    if (curr < min) return true;
    if (curr > min) return false;
  }
  return false;
}

export function getCurrentAppVersion(): string {
  return Constants.expoConfig?.version ?? '1.0.0';
}

/**
 * Silently registers device with retry logic.
 * Never throws or blocks app startup.
 */
export async function registerDevice(
  customPayload?: Partial<DeviceRegistrationPayload>,
  maxRetries = 2
): Promise<DeviceRegistrationResponse | null> {
  const installationId = getInstallationId();
  const appVersion = getCurrentAppVersion();
  const platform = Platform.OS;
  const deviceModel = Device.modelName ?? Device.deviceName ?? `${Platform.OS} Device`;
  const buildNumber =
    Platform.OS === 'android'
      ? String(Constants.expoConfig?.android?.versionCode ?? '1')
      : String(Constants.expoConfig?.ios?.buildNumber ?? '1');

  const payload: DeviceRegistrationPayload = {
    installationId,
    platform,
    appVersion,
    buildNumber,
    deviceModel,
    deviceName: Device.deviceName ?? undefined,
    ...customPayload,
  };

  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const response = await apiClient.post<DeviceRegistrationResponse>(
        '/api/v1/devices/register',
        payload
      );
      if (__DEV__) {
        console.log('📱 [Device API] Device registered successfully:', response);
      }
      return response;
    } catch (error) {
      attempt++;
      if (attempt > maxRetries) {
        if (__DEV__) {
          console.warn('⚠️ [Device API] Device registration failed after retries:', error);
        }
        return null;
      }
      // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  return null;
}

/**
 * Checks device status and evaluates maintenance mode and minimum version constraints.
 * Safe fallback for offline use (allows app usage when offline).
 */
export async function checkDeviceStatus(customInstallationId?: string): Promise<DeviceStatusResult> {
  const installationId = customInstallationId ?? getInstallationId();
  const currentVersion = getCurrentAppVersion();

  try {
    const [deviceStatusRes, remoteConfig] = await Promise.all([
      apiClient.get<DeviceStatusResponse>(`/api/v1/devices/${installationId}/status`),
      fetchRemoteConfig(),
    ]);

    const isBlocked =
      deviceStatusRes.status === 'BLOCKED' || deviceStatusRes.status === 'SUSPENDED';
    const isMaintenance = remoteConfig.maintenanceMode;
    const isForceUpdate = isVersionOutdated(currentVersion, remoteConfig.minVersion);

    const isAllowed = !isBlocked && !isMaintenance && !isForceUpdate;

    return {
      allowed: isAllowed,
      blocked: isBlocked,
      maintenanceMode: isMaintenance,
      forceUpdate: isForceUpdate,
      minimumVersion: remoteConfig.minVersion,
      status: deviceStatusRes.status,
    };
  } catch (error) {
    if (__DEV__) {
      console.warn('⚠️ [Device API] Status check failed (offline or network error), defaulting to allowed:', error);
    }
    // Offline resilience: allow local usage if network is unreachable
    return {
      allowed: true,
      blocked: false,
      maintenanceMode: false,
      forceUpdate: false,
      minimumVersion: currentVersion,
      status: 'ACTIVE',
    };
  }
}

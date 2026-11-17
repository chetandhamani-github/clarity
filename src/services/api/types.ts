export type DevicePlatform = 'android' | 'ios' | 'web';

export type BackendDeviceStatus = 'ACTIVE' | 'BLOCKED' | 'SUSPENDED';

export interface DeviceRegistrationPayload {
  installationId: string;
  platform: string;
  appVersion: string;
  buildNumber?: string;
  deviceModel?: string;
  deviceName?: string;
}

export interface DeviceRegistrationResponse {
  success: boolean;
  deviceId?: string;
}

export interface DeviceStatusResponse {
  status: BackendDeviceStatus;
}

export interface DeviceStatusResult {
  allowed: boolean;
  blocked: boolean;
  maintenanceMode: boolean;
  forceUpdate: boolean;
  minimumVersion: string;
  status?: BackendDeviceStatus;
}

export interface RemoteConfig {
  minVersion: string;
  latestVersion: string;
  maintenanceMode: boolean;
}

export interface FeatureFlagItem {
  key: string;
  enabled: boolean;
  description?: string;
}

export type FeatureFlagsMap = Record<string, boolean>;

export interface AnnouncementItem {
  id: string;
  title: string;
  message: string;
  createdAt: string;
}

export interface HealthStatus {
  status: string;
  service: string;
}

export interface SplitSyncPayload {
  installationId: string;
  lastSyncedAt?: string | null;
  people: Array<{
    id: string;
    name?: string;
    phone?: string;
    notes?: string;
    avatarUrl?: string;
    isDeleted?: boolean;
    createdAt?: string;
    updatedAt?: string;
  }>;
  debts: Array<{
    id: string;
    personId?: string;
    amount?: number;
    type?: string;
    description?: string;
    isDeleted?: boolean;
    createdAt?: string;
    updatedAt?: string;
  }>;
  settlements: Array<{
    id: string;
    personId?: string;
    amount?: number;
    settlementType?: string;
    description?: string;
    isDeleted?: boolean;
    createdAt?: string;
    updatedAt?: string;
  }>;
}

export interface SplitSyncResponse {
  success: boolean;
  syncedAt: string;
  people: Array<{
    id: string;
    name: string;
    phone?: string;
    notes?: string;
    avatarUrl?: string;
    isDeleted?: boolean;
    createdAt?: string;
    updatedAt?: string;
  }>;
  debts: Array<{
    id: string;
    personId: string;
    amount: number;
    type: string;
    description: string;
    isDeleted?: boolean;
    createdAt?: string;
    updatedAt?: string;
  }>;
  settlements: Array<{
    id: string;
    personId: string;
    amount: number;
    settlementType?: string;
    description?: string;
    isDeleted?: boolean;
    createdAt?: string;
    updatedAt?: string;
  }>;
  confirmedIds: string[];
}


import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { getInstallationId } from '@/utils/installationId';
import { registerDevice, checkDeviceStatus } from '@/services/api/device.api';
import { fetchRemoteConfig } from '@/services/api/config.api';
import { fetchFeatureFlags } from '@/services/api/feature.api';
import { fetchAnnouncements } from '@/services/api/announcement.api';
import { DeviceStatusResult } from '@/services/api/types';
import { FullScreenBlockedScreen } from '@/components/backend/FullScreenBlockedScreen';
import { MaintenanceScreen } from '@/components/backend/MaintenanceScreen';
import { ForceUpdateScreen } from '@/components/backend/ForceUpdateScreen';
import { useRemoteConfigStore } from '@/store/remoteConfig.store';
import { useFeatureFlagStore } from '@/store/featureFlag.store';

interface BackendContextValue {
  installationId: string;
  deviceStatus: DeviceStatusResult | null;
  refreshStatus: () => Promise<void>;
}

const BackendContext = createContext<BackendContextValue>({
  installationId: '',
  deviceStatus: null,
  refreshStatus: async () => {},
});

export function useBackend(): BackendContextValue {
  return useContext(BackendContext);
}

interface BackendProviderProps {
  children: ReactNode;
}

export function BackendProvider({ children }: BackendProviderProps) {
  const [installationId] = useState<string>(() => getInstallationId());
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatusResult | null>(null);

  const setConfig = useRemoteConfigStore((state) => state.setConfig);
  const setFlags = useFeatureFlagStore((state) => state.setFlags);

  const runStartupSequence = useCallback(async () => {
    try {
      // 1. Register device silently in background (non-blocking)
      registerDevice().catch((err) => {
        if (__DEV__) console.log('Silent device registration error (offline?):', err);
      });

      // 2. Check device status & lifecycle constraints
      const statusResult = await checkDeviceStatus(installationId);
      setDeviceStatus(statusResult);

      // 3. Fetch remote config, feature flags, and announcements in parallel
      const [configRes, flagsRes] = await Promise.allSettled([
        fetchRemoteConfig(),
        fetchFeatureFlags(),
        fetchAnnouncements(),
      ]);

      if (configRes.status === 'fulfilled' && configRes.value) {
        setConfig(configRes.value);
      }
      if (flagsRes.status === 'fulfilled' && flagsRes.value) {
        setFlags(flagsRes.value);
      }
    } catch (error) {
      if (__DEV__) {
        console.warn('⚠️ [BackendProvider] Startup sequence encountered an error, falling back to offline mode:', error);
      }
      // Offline resilience: allow normal app usage
      setDeviceStatus({
        allowed: true,
        blocked: false,
        maintenanceMode: false,
        forceUpdate: false,
        minimumVersion: '1.0.0',
        status: 'ACTIVE',
      });
    }
  }, [installationId, setConfig, setFlags]);

  useEffect(() => {
    runStartupSequence();
  }, [runStartupSequence]);

  // Gate app access if device is explicitly blocked
  if (deviceStatus?.blocked) {
    return <FullScreenBlockedScreen />;
  }

  // Gate app access if backend is under maintenance
  if (deviceStatus?.maintenanceMode) {
    return <MaintenanceScreen onRetry={runStartupSequence} />;
  }

  // Gate app access if app version is below mandatory minimum version
  if (deviceStatus?.forceUpdate) {
    return <ForceUpdateScreen minimumVersion={deviceStatus.minimumVersion} />;
  }

  return (
    <BackendContext.Provider
      value={{
        installationId,
        deviceStatus,
        refreshStatus: runStartupSequence,
      }}
    >
      {children}
    </BackendContext.Provider>
  );
}

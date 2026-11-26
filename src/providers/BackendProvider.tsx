import { ForceUpdateScreen } from '@/components/backend/ForceUpdateScreen';
import { FullScreenBlockedScreen } from '@/components/backend/FullScreenBlockedScreen';
import { MaintenanceScreen } from '@/components/backend/MaintenanceScreen';
import { SplitwiseSyncService } from '@/modules/splitwise/services/SplitwiseSyncService';
import { fetchAnnouncements } from '@/services/api/announcement.api';
import { fetchRemoteConfig } from '@/services/api/config.api';
import { checkDeviceStatus, registerDevice } from '@/services/api/device.api';
import { fetchFeatureFlags } from '@/services/api/feature.api';
import { DeviceStatusResult } from '@/services/api/types';
import { useFeatureFlagStore } from '@/store/featureFlag.store';
import { useRemoteConfigStore } from '@/store/remoteConfig.store';
import { initNetworkMonitoring } from '@/store/use-network-store';
import { getInstallationId } from '@/utils/installationId';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { AppState, type AppStateStatus, StyleSheet, View } from 'react-native';

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
      registerDevice().catch(() => {});

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

      // 4. Trigger silent Splitwise sync in background
      SplitwiseSyncService.getInstance().syncWithCloud().catch(() => {});
    } catch {
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
    const cleanupNetwork = initNetworkMonitoring();
    runStartupSequence();

    // Automatically re-evaluate device status when user returns to app (e.g. from admin portal)
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        runStartupSequence();
      }
    });

    return () => {
      subscription.remove();
      cleanupNetwork();
    };
  }, [runStartupSequence]);

  return (
    <BackendContext.Provider
      value={{
        installationId,
        deviceStatus,
        refreshStatus: runStartupSequence,
      }}
    >
      <View style={styles.container}>
        {children}
        {deviceStatus?.blocked && <FullScreenBlockedScreen onRetry={runStartupSequence} />}
        {!deviceStatus?.blocked && deviceStatus?.maintenanceMode && (
          <MaintenanceScreen onRetry={runStartupSequence} />
        )}
        {!deviceStatus?.blocked && !deviceStatus?.maintenanceMode && deviceStatus?.forceUpdate && (
          <ForceUpdateScreen minimumVersion={deviceStatus.minimumVersion} />
        )}
      </View>
    </BackendContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

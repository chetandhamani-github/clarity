import { apiClient } from './client';
import { SplitSyncPayload, SplitSyncResponse } from './types';
import { getInstallationId } from '@/utils/installationId';

/**
 * Sends bidirectional synchronization payload to the Clarity Spring Boot backend.
 */
export async function syncSplitwiseData(
  payload: Omit<SplitSyncPayload, 'installationId'>
): Promise<SplitSyncResponse> {
  const installationId = getInstallationId();

  const fullPayload: SplitSyncPayload = {
    installationId,
    ...payload,
  };

  return apiClient.post<SplitSyncResponse>('/api/v1/splitwise/sync', fullPayload, {
    headers: {
      'X-Installation-Id': installationId,
    },
  });
}

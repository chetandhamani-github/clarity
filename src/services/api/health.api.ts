import { apiClient } from './client';
import { HealthStatus } from './types';

/**
 * Checks backend health status
 */
export async function checkBackendHealth(): Promise<HealthStatus> {
  return apiClient.get<HealthStatus>('/api/v1/health');
}

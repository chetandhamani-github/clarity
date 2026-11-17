import { apiClient } from './client';
import { AuthResponse, GoogleAuthPayload, UserDTO } from './types';

/**
 * Sends Google authentication payload to backend to register or login.
 */
export async function loginWithGoogleApi(payload: GoogleAuthPayload): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>('/api/v1/auth/google', payload);
}

/**
 * Fetches the currently authenticated user profile from backend.
 */
export async function fetchCurrentUserApi(): Promise<UserDTO> {
  return apiClient.get<UserDTO>('/api/v1/auth/me');
}

/**
 * Informs backend to invalidate the current session token.
 */
export async function logoutApi(): Promise<void> {
  try {
    await apiClient.post<void>('/api/v1/auth/logout', {});
  } catch {
    // Ignore network failure on logout
  }
}

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { loginWithGoogleApi, fetchCurrentUserApi, logoutApi } from '@/services/api/auth.api';
import { apiClient } from '@/services/api/client';
import { UserDTO } from '@/services/api/types';

const SECURE_AUTH_TOKEN_KEY = 'clarity_auth_session_token';
const SECURE_AUTH_USER_KEY = 'clarity_auth_session_user';

let isGoogleConfigured = false;
function ensureGoogleConfigured(): void {
  if (isGoogleConfigured) return;
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
  GoogleSignin.configure({
    webClientId: webClientId || undefined,
    offlineAccess: true,
    forceCodeForRefreshToken: true,
  });
  isGoogleConfigured = true;
}

interface AuthState {
  user: UserDTO | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  initializeAuth: () => Promise<void>;
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  setUser: (user: UserDTO | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  setUser: (user) => set({ user, isAuthenticated: !!user }),

  initializeAuth: async () => {
    try {
      const [token, userJson] = await Promise.all([
        SecureStore.getItemAsync(SECURE_AUTH_TOKEN_KEY),
        SecureStore.getItemAsync(SECURE_AUTH_USER_KEY),
      ]);

      if (token && userJson) {
        const user = JSON.parse(userJson) as UserDTO;
        apiClient.setAuthToken(token);
        set({ token, user, isAuthenticated: true });

        // Background validate session
        fetchCurrentUserApi()
          .then((freshUser) => {
            set({ user: freshUser });
            SecureStore.setItemAsync(SECURE_AUTH_USER_KEY, JSON.stringify(freshUser)).catch(() => {});
          })
          .catch(() => {
            // Keep existing cached session for offline resilience
          });
      }
    } catch {
      // Offline fallback: keep guest state
    }
  },

  signInWithGoogle: async () => {
    set({ isLoading: true, error: null });
    try {
      ensureGoogleConfigured();
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult.data?.idToken;
      const googleUser = signInResult.data?.user;

      if (!idToken && !googleUser?.email) {
        throw new Error('Google Sign-In did not return valid credentials');
      }

      // Exchange with Spring Boot backend
      const response = await loginWithGoogleApi({
        idToken: idToken || 'dev-token',
        email: googleUser?.email || undefined,
        name: googleUser?.name || undefined,
        avatarUrl: googleUser?.photo || undefined,
      });

      if (!response.token || !response.user) {
        throw new Error('Backend failed to issue a session token');
      }

      // Persist credentials in SecureStore per security guidelines
      await Promise.all([
        SecureStore.setItemAsync(SECURE_AUTH_TOKEN_KEY, response.token),
        SecureStore.setItemAsync(SECURE_AUTH_USER_KEY, JSON.stringify(response.user)),
      ]);

      apiClient.setAuthToken(response.token);
      set({
        token: response.token,
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });

      return { success: true };
    } catch (err: unknown) {
      let message = 'Google sign-in failed. Please try again.';
      if (typeof err === 'object' && err !== null && 'code' in err) {
        const code = (err as { code: string }).code;
        if (code === statusCodes.SIGN_IN_CANCELLED) {
          message = 'Sign-in was cancelled';
        } else if (code === statusCodes.IN_PROGRESS) {
          message = 'Sign-in is already in progress';
        } else if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
          message = 'Google Play Services is not available on this device';
        }
      } else if (err instanceof Error) {
        message = err.message;
      }

      set({ isLoading: false, error: message });
      return { success: false, error: message };
    }
  },

  signOut: async () => {
    set({ isLoading: true });
    try {
      await logoutApi();
      try {
        await GoogleSignin.signOut();
      } catch {
        // Ignore Google client sign-out failures
      }
      await Promise.all([
        SecureStore.deleteItemAsync(SECURE_AUTH_TOKEN_KEY),
        SecureStore.deleteItemAsync(SECURE_AUTH_USER_KEY),
      ]);
      apiClient.setAuthToken(null);
      set({ user: null, token: null, isAuthenticated: false, isLoading: false, error: null });
    } catch {
      set({ isLoading: false });
    }
  },
}));

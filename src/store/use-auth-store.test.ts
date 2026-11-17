import { useAuthStore } from './use-auth-store';
import * as SecureStore from 'expo-secure-store';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as authApi from '@/services/api/auth.api';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn().mockResolvedValue(true),
    signIn: jest.fn(),
    signOut: jest.fn().mockResolvedValue(undefined),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
}));

jest.mock('@/services/api/auth.api', () => ({
  loginWithGoogleApi: jest.fn(),
  fetchCurrentUserApi: jest.fn(),
  logoutApi: jest.fn().mockResolvedValue(undefined),
}));

describe('useAuthStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });

  it('initializes as unauthenticated when no stored token', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    await useAuthStore.getState().initializeAuth();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.token).toBeNull();
  });

  it('restores user and token when stored in SecureStore', async () => {
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      createdAt: '2026-11-17T00:00:00Z',
    };

    (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) => {
      if (key === 'clarity_auth_session_token') return Promise.resolve('clr_test_token');
      if (key === 'clarity_auth_session_user') return Promise.resolve(JSON.stringify(mockUser));
      return Promise.resolve(null);
    });

    (authApi.fetchCurrentUserApi as jest.Mock).mockResolvedValue(mockUser);

    await useAuthStore.getState().initializeAuth();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe('clr_test_token');
    expect(state.user?.email).toBe('test@example.com');
  });

  it('signs in with Google successfully', async () => {
    const mockGoogleData = {
      data: {
        idToken: 'google-token-xyz',
        user: {
          id: 'google-sub-1',
          email: 'googleuser@gmail.com',
          name: 'Google User',
          photo: 'https://example.com/avatar.jpg',
        },
      },
    };

    (GoogleSignin.signIn as jest.Mock).mockResolvedValue(mockGoogleData);

    const mockAuthResponse = {
      token: 'clr_token_123',
      user: {
        id: 'user-id-123',
        email: 'googleuser@gmail.com',
        name: 'Google User',
        avatarUrl: 'https://example.com/avatar.jpg',
        createdAt: '2026-11-17T00:00:00Z',
      },
    };

    (authApi.loginWithGoogleApi as jest.Mock).mockResolvedValue(mockAuthResponse);

    const result = await useAuthStore.getState().signInWithGoogle();

    expect(result.success).toBe(true);
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.token).toBe('clr_token_123');
    expect(state.user?.name).toBe('Google User');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'clarity_auth_session_token',
      'clr_token_123'
    );
  });

  it('signs out and clears secure tokens', async () => {
    useAuthStore.setState({
      user: { id: 'u1', email: 'a@b.com', name: 'A', createdAt: '2026-11-17T00:00:00Z' },
      token: 'clr_token',
      isAuthenticated: true,
    });

    await useAuthStore.getState().signOut();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('clarity_auth_session_token');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('clarity_auth_session_user');
  });
});

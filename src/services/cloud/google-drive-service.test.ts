import { findBackupFile, uploadBackup, downloadBackup, deleteAllBackups } from './google-drive-service';
import type { ClarityBackupPayload } from '@/services/database/backup-restore-service';

// Mock dependencies
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
    addScopes: jest.fn().mockResolvedValue(true),
    getTokens: jest.fn().mockResolvedValue({ accessToken: 'test-access-token' }),
    getCurrentUser: jest.fn().mockResolvedValue({ user: { email: 'user@example.com' } }),
    signInSilently: jest.fn(),
    signOut: jest.fn(),
    clearCachedAccessToken: jest.fn(),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
}));

describe('google-drive-service', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('finds existing backup in appDataFolder without sending invalid trashed parameter', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        files: [
          {
            id: 'file-abc-123',
            name: 'clarity_backup.json',
            modifiedTime: '2026-09-03T10:00:00Z',
            size: '1024',
          },
        ],
      }),
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const result = await findBackupFile('mock-token');

    expect(result).not.toBeNull();
    expect(result?.fileId).toBe('file-abc-123');
    expect(result?.name).toBe('clarity_backup.json');

    // Verify requested URL contains spaces=appDataFolder and DOES NOT contain trashed=false
    const requestedUrl = mockFetch.mock.calls[0][0];
    expect(requestedUrl).toContain('spaces=appDataFolder');
    expect(requestedUrl).not.toContain('trashed');
  });

  it('downloads backup successfully when file exists', async () => {
    const SecureStore = require('expo-secure-store');
    SecureStore.getItemAsync.mockImplementation((key: string) => {
      if (key === 'gdrive_access_token') return Promise.resolve('valid-token');
      if (key === 'gdrive_token_expires_at') return Promise.resolve(String(Date.now() + 3600000));
      return Promise.resolve(null);
    });

    const mockPayload: ClarityBackupPayload = {
      version: 1,
      appName: 'Clarity',
      exportedAt: '2026-09-03T10:00:00Z',
      data: {
        accounts: [{ id: '1', name: 'Savings' }],
        transactions: [],
        goals: [],
        goal_contributions: [],
        budget_plans: [],
        budget_categories: [],
        recurring_transactions: [],
        notifications: [],
      },
    };

    const mockFetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('alt=media')) {
        return Promise.resolve({
          status: 200,
          ok: true,
          text: async () => JSON.stringify(mockPayload),
        });
      }
      // files.list query
      return Promise.resolve({
        status: 200,
        ok: true,
        json: async () => ({
          files: [
            {
              id: 'file-123',
              name: 'clarity_backup.json',
              modifiedTime: '2026-09-03T10:00:00Z',
            },
          ],
        }),
      });
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const res = await downloadBackup();
    expect(res.success).toBe(true);
    expect(res.data?.appName).toBe('Clarity');
    expect(res.data?.data.accounts.length).toBe(1);
    expect(res.metadata?.fileId).toBe('file-123');
  });

  it('uploads backup using direct media PATCH when existing file is found', async () => {
    const SecureStore = require('expo-secure-store');
    SecureStore.getItemAsync.mockImplementation((key: string) => {
      if (key === 'gdrive_access_token') return Promise.resolve('valid-token');
      if (key === 'gdrive_token_expires_at') return Promise.resolve(String(Date.now() + 3600000));
      return Promise.resolve(null);
    });

    const mockPayload: ClarityBackupPayload = {
      version: 1,
      appName: 'Clarity',
      exportedAt: '2026-09-03T10:00:00Z',
      data: {
        accounts: [{ id: '1', name: 'Savings' } as any],
        transactions: [],
        goals: [],
        goal_contributions: [],
        budget_plans: [],
        budget_categories: [],
        recurring_transactions: [],
        notifications: [],
      },
    };

    const mockFetch = jest.fn().mockImplementation((url: string, options: any) => {
      if (options?.method === 'PATCH') {
        expect(url).toContain('/files/file-123?uploadType=media');
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({ modifiedTime: '2026-09-03T11:00:00Z' }),
        });
      }
      // files.list finding existing file
      return Promise.resolve({
        status: 200,
        ok: true,
        json: async () => ({
          files: [{ id: 'file-123', name: 'clarity_backup.json', modifiedTime: '2026-09-03T09:00:00Z' }],
        }),
      });
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const res = await uploadBackup(mockPayload);
    expect(res.success).toBe(true);
    expect(res.modifiedTime).toBe('2026-09-03T11:00:00Z');
  });

  it('prevents overwriting an existing cloud backup when current local database is empty', async () => {
    const SecureStore = require('expo-secure-store');
    SecureStore.getItemAsync.mockImplementation((key: string) => {
      if (key === 'gdrive_access_token') return Promise.resolve('valid-token');
      if (key === 'gdrive_token_expires_at') return Promise.resolve(String(Date.now() + 3600000));
      return Promise.resolve(null);
    });

    const emptySnapshot: ClarityBackupPayload = {
      version: 1,
      appName: 'Clarity',
      exportedAt: '2026-09-03T10:00:00Z',
      data: {
        accounts: [
          { id: '1', name: 'Primary Bank Account', balance: 0 },
          { id: '2', name: 'Borrowed / Loan', balance: 0 },
          { id: '3', name: 'Lent / Money Given', balance: 0 },
        ],
        transactions: [],
        goals: [],
        goal_contributions: [],
        budget_plans: [],
        budget_categories: [],
        recurring_transactions: [],
        notifications: [],
      },
    };

    const mockFetch = jest.fn().mockImplementation((url: string) => {
      // files.list finding existing file
      return Promise.resolve({
        status: 200,
        ok: true,
        json: async () => ({
          files: [{ id: 'file-123', name: 'clarity_backup.json', modifiedTime: '2026-09-03T09:00:00Z' }],
        }),
      });
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const res = await uploadBackup(emptySnapshot);
    expect(res.success).toBe(false);
    expect(res.error).toContain('Prevented accidental overwrite');
  });

  it('recovers data from previous revision when latest cloud backup is empty', async () => {
    const SecureStore = require('expo-secure-store');
    SecureStore.getItemAsync.mockImplementation((key: string) => {
      if (key === 'gdrive_access_token') return Promise.resolve('valid-token');
      if (key === 'gdrive_token_expires_at') return Promise.resolve(String(Date.now() + 3600000));
      return Promise.resolve(null);
    });

    const emptyHeadPayload: ClarityBackupPayload = {
      version: 1,
      appName: 'Clarity',
      exportedAt: '2026-09-03T12:00:00Z',
      data: {
        accounts: [{ id: '1', name: 'Primary Bank Account', balance: 0 }],
        transactions: [],
        goals: [],
        goal_contributions: [],
        budget_plans: [],
        budget_categories: [],
        recurring_transactions: [],
        notifications: [],
      },
    };

    const validRevisionPayload: ClarityBackupPayload = {
      version: 1,
      appName: 'Clarity',
      exportedAt: '2026-09-03T09:00:00Z',
      data: {
        accounts: [{ id: 'acc-1', name: 'HDFC Bank', balance: 50000 }],
        transactions: [{ id: 'tx-1', amount: 1200, merchant: 'Supermarket' }],
        goals: [],
        goal_contributions: [],
        budget_plans: [],
        budget_categories: [],
        recurring_transactions: [],
        notifications: [],
      },
    };

    const mockFetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/revisions/rev-1?alt=media')) {
        return Promise.resolve({
          status: 200,
          ok: true,
          text: async () => JSON.stringify(validRevisionPayload),
        });
      }
      if (url.includes('/revisions/rev-2?alt=media')) {
        return Promise.resolve({
          status: 200,
          ok: true,
          text: async () => JSON.stringify(emptyHeadPayload),
        });
      }
      if (url.includes('/revisions?fields=')) {
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({
            revisions: [
              { id: 'rev-1', modifiedTime: '2026-09-03T09:00:00Z', size: '2048' },
              { id: 'rev-2', modifiedTime: '2026-09-03T12:00:00Z', size: '512' },
            ],
          }),
        });
      }
      if (url.includes('/files/file-123?alt=media')) {
        return Promise.resolve({
          status: 200,
          ok: true,
          text: async () => JSON.stringify(emptyHeadPayload),
        });
      }
      // files.list finding existing file
      return Promise.resolve({
        status: 200,
        ok: true,
        json: async () => ({
          files: [{ id: 'file-123', name: 'clarity_backup.json', modifiedTime: '2026-09-03T12:00:00Z' }],
        }),
      });
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const res = await downloadBackup();
    expect(res.success).toBe(true);
    expect(res.isRecoveredFromRevision).toBe(true);
    expect(res.data?.data.transactions.length).toBe(1);
    expect(res.data?.data.accounts[0].name).toBe('HDFC Bank');
  });

  describe('deleteAllBackups', () => {
    it('deletes all Clarity backup files from Google Drive appDataFolder', async () => {
      const SecureStore = require('expo-secure-store');
      SecureStore.getItemAsync.mockImplementation((key: string) => {
        if (key === 'gdrive_access_token') return Promise.resolve('valid-token');
        if (key === 'gdrive_token_expires_at') return Promise.resolve(String(Date.now() + 3600000));
        return Promise.resolve(null);
      });

      const deletedUrls: string[] = [];
      const mockFetch = jest.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (options?.method === 'DELETE') {
          deletedUrls.push(url);
          return Promise.resolve({
            status: 204,
            ok: true,
          });
        }
        // Listing files in appDataFolder
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({
            files: [
              { id: 'backup-file-1', name: 'clarity_backup.json' },
              { id: 'backup-file-2', name: 'clarity_backup_old.json' },
              { id: 'other-file', name: 'unrelated.json' },
            ],
          }),
        });
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await deleteAllBackups();

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(deletedUrls).toHaveLength(2);
      expect(deletedUrls[0]).toContain('/backup-file-1');
      expect(deletedUrls[1]).toContain('/backup-file-2');
    });

    it('returns count 0 if no backup files exist in appDataFolder', async () => {
      const SecureStore = require('expo-secure-store');
      SecureStore.getItemAsync.mockImplementation((key: string) => {
        if (key === 'gdrive_access_token') return Promise.resolve('valid-token');
        if (key === 'gdrive_token_expires_at') return Promise.resolve(String(Date.now() + 3600000));
        return Promise.resolve(null);
      });

      const mockFetch = jest.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          files: [],
        }),
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const result = await deleteAllBackups();

      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
    });
  });

  describe('opt-in backup encryption', () => {
    const createSampleSnapshot = (): ClarityBackupPayload => ({
      version: 1,
      appName: 'Clarity',
      exportedAt: '2026-09-03T10:00:00Z',
      data: {
        accounts: [{ id: 'acc-1', name: 'Savings', balance: 25000 } as any],
        transactions: [{ id: 'tx-1', amount: 500, merchant: 'Cafe' } as any],
        goals: [],
        goal_contributions: [],
        budget_plans: [],
        budget_categories: [],
        recurring_transactions: [],
        notifications: [],
      },
    });

    it('uploads unencrypted JSON when no custom backup password is set', async () => {
      const SecureStore = require('expo-secure-store');
      const legacyDeviceKey = 'a'.repeat(64);
      SecureStore.getItemAsync.mockImplementation((key: string) => {
        if (key === 'gdrive_access_token') return Promise.resolve('valid-token');
        if (key === 'gdrive_token_expires_at') return Promise.resolve(String(Date.now() + 3600000));
        if (key === 'gdrive_backup_passphrase') return Promise.resolve(legacyDeviceKey);
        if (key === 'gdrive_has_custom_passphrase') return Promise.resolve('false');
        return Promise.resolve(null);
      });

      let uploadedBody = '';
      const mockFetch = jest.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (options?.method === 'POST') {
          uploadedBody = String(options.body || '');
          return Promise.resolve({
            status: 200,
            ok: true,
            json: async () => ({ id: 'file-new', modifiedTime: '2026-09-03T11:00:00Z' }),
          });
        }
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({ files: [] }),
        });
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const res = await uploadBackup(createSampleSnapshot());

      expect(res.success).toBe(true);
      expect(res.encrypted).toBe(false);
      expect(uploadedBody).toContain('"appName": "Clarity"');
      expect(uploadedBody).not.toContain('"algorithm": "AES-256-GCM"');
      expect(SecureStore.setItemAsync).not.toHaveBeenCalledWith('gdrive_backup_passphrase', expect.anything());
    });

    it('encrypts with AES-256-GCM and persists custom password on upload', async () => {
      const SecureStore = require('expo-secure-store');
      SecureStore.getItemAsync.mockImplementation((key: string) => {
        if (key === 'gdrive_access_token') return Promise.resolve('valid-token');
        if (key === 'gdrive_token_expires_at') return Promise.resolve(String(Date.now() + 3600000));
        return Promise.resolve(null);
      });

      let uploadedBody = '';
      const mockFetch = jest.fn().mockImplementation((_url: string, options?: RequestInit) => {
        if (options?.method === 'POST') {
          uploadedBody = String(options.body || '');
          return Promise.resolve({
            status: 200,
            ok: true,
            json: async () => ({ id: 'file-enc', modifiedTime: '2026-09-03T11:30:00Z' }),
          });
        }
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({ files: [] }),
        });
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const res = await uploadBackup(createSampleSnapshot(), { passphrase: 'my-secret-password' });

      expect(res.success).toBe(true);
      expect(res.encrypted).toBe(true);
      expect(uploadedBody).toContain('"encrypted": true');
      expect(uploadedBody).toContain('"algorithm": "AES-256-GCM"');
      expect(uploadedBody).not.toContain('Cafe');
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('gdrive_backup_passphrase', 'my-secret-password');
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('gdrive_has_custom_passphrase', 'true');
    });

    it('continues encrypting subsequent auto-backups when a custom password was previously set', async () => {
      const SecureStore = require('expo-secure-store');
      SecureStore.getItemAsync.mockImplementation((key: string) => {
        if (key === 'gdrive_access_token') return Promise.resolve('valid-token');
        if (key === 'gdrive_token_expires_at') return Promise.resolve(String(Date.now() + 3600000));
        if (key === 'gdrive_backup_passphrase') return Promise.resolve('my-secret-password');
        if (key === 'gdrive_has_custom_passphrase') return Promise.resolve('true');
        return Promise.resolve(null);
      });

      let patchedBody = '';
      const mockFetch = jest.fn().mockImplementation((_url: string, options?: RequestInit) => {
        if (options?.method === 'PATCH') {
          patchedBody = String(options.body || '');
          return Promise.resolve({
            status: 200,
            ok: true,
            json: async () => ({ modifiedTime: '2026-09-03T12:00:00Z' }),
          });
        }
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({
            files: [{ id: 'file-enc', name: 'clarity_backup.json', modifiedTime: '2026-09-03T11:30:00Z' }],
          }),
        });
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const res = await uploadBackup(createSampleSnapshot(), { allowInteractive: false });

      expect(res.success).toBe(true);
      expect(res.encrypted).toBe(true);
      const parsed = JSON.parse(patchedBody);
      expect(parsed.encrypted).toBe(true);
      expect(parsed.algorithm).toBe('AES-256-GCM');
    });

    it('clears stored password and uploads unencrypted when disableEncryption is true', async () => {
      const SecureStore = require('expo-secure-store');
      SecureStore.getItemAsync.mockImplementation((key: string) => {
        if (key === 'gdrive_access_token') return Promise.resolve('valid-token');
        if (key === 'gdrive_token_expires_at') return Promise.resolve(String(Date.now() + 3600000));
        if (key === 'gdrive_backup_passphrase') return Promise.resolve('my-secret-password');
        if (key === 'gdrive_has_custom_passphrase') return Promise.resolve('true');
        return Promise.resolve(null);
      });

      let patchedBody = '';
      const mockFetch = jest.fn().mockImplementation((_url: string, options?: RequestInit) => {
        if (options?.method === 'PATCH') {
          patchedBody = String(options.body || '');
          return Promise.resolve({
            status: 200,
            ok: true,
            json: async () => ({ modifiedTime: '2026-09-03T13:00:00Z' }),
          });
        }
        return Promise.resolve({
          status: 200,
          ok: true,
          json: async () => ({
            files: [{ id: 'file-enc', name: 'clarity_backup.json', modifiedTime: '2026-09-03T12:00:00Z' }],
          }),
        });
      });
      globalThis.fetch = mockFetch as unknown as typeof fetch;

      const res = await uploadBackup(createSampleSnapshot(), { disableEncryption: true });

      expect(res.success).toBe(true);
      expect(res.encrypted).toBe(false);
      const parsed = JSON.parse(patchedBody);
      expect(parsed.appName).toBe('Clarity');
      expect(parsed.encrypted).toBeUndefined();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('gdrive_backup_passphrase');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('gdrive_has_custom_passphrase');
    });
  });
});

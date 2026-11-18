import {
  encryptBackupPayload,
  decryptBackupPayload,
  isEncryptedBackup,
} from './backup-crypto';

describe('backup-crypto', () => {
  const samplePayload = {
    version: 1,
    appName: 'Clarity',
    exportedAt: '2026-11-18T10:00:00Z',
    data: {
      accounts: [{ id: 'acc-1', name: 'HDFC Bank', balance: 5000 }],
      transactions: [{ id: 'tx-1', amount: 250, merchant: 'Uber' }],
    },
  };

  it('encrypts and decrypts payload successfully with correct passphrase', async () => {
    const passphrase = 'SuperSecretPassphrase!';
    const encrypted = await encryptBackupPayload(samplePayload, passphrase);

    expect(isEncryptedBackup(encrypted)).toBe(true);
    expect(encrypted.encrypted).toBe(true);
    expect(encrypted.algorithm).toBe('AES-256-GCM');
    expect(encrypted.ciphertext).toBeTruthy();
    expect(encrypted.salt).toBeTruthy();
    expect(encrypted.iv).toBeTruthy();

    const decrypted = await decryptBackupPayload(encrypted, passphrase);
    expect(decrypted).toEqual(samplePayload);
  });

  it('fails decryption with incorrect passphrase', async () => {
    const encrypted = await encryptBackupPayload(samplePayload, 'CorrectPassword123');

    await expect(
      decryptBackupPayload(encrypted, 'WrongPassword456')
    ).rejects.toThrow('Incorrect passphrase or corrupted backup file.');
  });

  it('rejects short passphrase during encryption', async () => {
    await expect(encryptBackupPayload(samplePayload, '12')).rejects.toThrow(
      'Passphrase must be at least 4 characters long.'
    );
  });

  it('identifies unencrypted payload properly', () => {
    expect(isEncryptedBackup(samplePayload)).toBe(false);
    expect(isEncryptedBackup(null)).toBe(false);
    expect(isEncryptedBackup('string')).toBe(false);
  });
});


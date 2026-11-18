import forge from 'node-forge';

export interface EncryptedBackupEnvelope {
  encrypted: true;
  version: number;
  algorithm: 'AES-256-GCM';
  kdf: 'PBKDF2';
  iterations: number;
  salt: string; // Base64
  iv: string; // Base64
  ciphertext: string; // Base64 (includes 16-byte GCM authentication tag appended)
}

export function isEncryptedBackup(payload: any): payload is EncryptedBackupEnvelope {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    payload.encrypted === true &&
    payload.algorithm === 'AES-256-GCM' &&
    typeof payload.ciphertext === 'string' &&
    typeof payload.iv === 'string' &&
    typeof payload.salt === 'string'
  );
}

const ITERATIONS = 10000; // PBKDF2 iterations optimal for mobile responsiveness

/**
 * Generates a cryptographically strong 256-bit random passphrase formatted as hex.
 */
export function generateSecureDeviceKey(): string {
  const bytes = forge.random.getBytesSync(32);
  return forge.util.bytesToHex(bytes);
}

/**
 * Derives a 256-bit (32 bytes) AES key from the passphrase and salt using PBKDF2-HMAC-SHA256.
 */
function deriveKey(passphrase: string, saltBytes: string): string {
  return forge.pkcs5.pbkdf2(
    passphrase,
    saltBytes,
    ITERATIONS,
    32,
    forge.md.sha256.create()
  );
}

/**
 * Encrypts a JSON-serializable backup payload using AES-256-GCM.
 * Works natively in React Native Hermes, iOS, Android, and Node.js.
 */
export async function encryptBackupPayload(
  payload: object,
  passphrase: string
): Promise<EncryptedBackupEnvelope> {
  if (!passphrase || passphrase.trim().length < 4) {
    throw new Error('Passphrase must be at least 4 characters long.');
  }

  const saltBytes = forge.random.getBytesSync(16);
  const ivBytes = forge.random.getBytesSync(12);
  const keyBytes = deriveKey(passphrase.trim(), saltBytes);

  const jsonString = JSON.stringify(payload);
  const buffer = forge.util.createBuffer(jsonString, 'utf8');

  const cipher = forge.cipher.createCipher('AES-GCM', keyBytes);
  cipher.start({
    iv: ivBytes,
    tagLength: 128, // 16 bytes auth tag
  });
  cipher.update(buffer);
  cipher.finish();

  const ciphertextBytes = cipher.output.getBytes();
  const tagBytes = cipher.mode.tag.getBytes();

  // Combine ciphertext and tag (matching standard GCM envelope format)
  const fullCiphertext = ciphertextBytes + tagBytes;

  return {
    encrypted: true,
    version: 1,
    algorithm: 'AES-256-GCM',
    kdf: 'PBKDF2',
    iterations: ITERATIONS,
    salt: forge.util.encode64(saltBytes),
    iv: forge.util.encode64(ivBytes),
    ciphertext: forge.util.encode64(fullCiphertext),
  };
}

/**
 * Decrypts an encrypted backup envelope using the secret passphrase.
 * Authenticates data integrity via GCM auth tag.
 */
export async function decryptBackupPayload<T = any>(
  envelope: EncryptedBackupEnvelope,
  passphrase: string
): Promise<T> {
  if (!passphrase) {
    throw new Error('Passphrase is required to decrypt this backup.');
  }

  try {
    const saltBytes = forge.util.decode64(envelope.salt);
    const ivBytes = forge.util.decode64(envelope.iv);
    const fullCiphertextBytes = forge.util.decode64(envelope.ciphertext);

    if (fullCiphertextBytes.length < 16) {
      throw new Error('Invalid ciphertext length.');
    }

    // Split ciphertext and 16-byte tag
    const ciphertextBytes = fullCiphertextBytes.slice(0, -16);
    const tagBytes = fullCiphertextBytes.slice(-16);

    const keyBytes = deriveKey(passphrase.trim(), saltBytes);

    const decipher = forge.cipher.createDecipher('AES-GCM', keyBytes);
    decipher.start({
      iv: ivBytes,
      tagLength: 128,
      tag: forge.util.createBuffer(tagBytes),
    });
    decipher.update(forge.util.createBuffer(ciphertextBytes));
    const pass = decipher.finish();

    if (!pass) {
      throw new Error('Authentication tag mismatch');
    }

    const decryptedUtf8 = decipher.output.toString('utf8');
    return JSON.parse(decryptedUtf8) as T;
  } catch {
    throw new Error('Incorrect passphrase or corrupted backup file.');
  }
}

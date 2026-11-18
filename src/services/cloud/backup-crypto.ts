export interface EncryptedBackupEnvelope {
  encrypted: true;
  version: number;
  algorithm: 'AES-256-GCM';
  kdf: 'PBKDF2';
  iterations: number;
  salt: string; // Base64
  iv: string; // Base64
  ciphertext: string; // Base64
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

function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const ITERATIONS = 100000;

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  usage: KeyUsage[]
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    usage
  );
}

/**
 * Encrypts a JSON-serializable backup payload using AES-256-GCM
 * with a PBKDF2-derived key from the user's secret passphrase.
 */
export async function encryptBackupPayload(
  payload: object,
  passphrase: string
): Promise<EncryptedBackupEnvelope> {
  if (!passphrase || passphrase.trim().length < 4) {
    throw new Error('Passphrase must be at least 4 characters long.');
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, ['encrypt']);

  const enc = new TextEncoder();
  const encodedPlaintext = enc.encode(JSON.stringify(payload));

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    encodedPlaintext
  );

  return {
    encrypted: true,
    version: 1,
    algorithm: 'AES-256-GCM',
    kdf: 'PBKDF2',
    iterations: ITERATIONS,
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertextBuffer),
  };
}

/**
 * Decrypts an encrypted backup envelope using the user's secret passphrase.
 * Throws an error if the passphrase is incorrect or data was tampered with.
 */
export async function decryptBackupPayload<T = any>(
  envelope: EncryptedBackupEnvelope,
  passphrase: string
): Promise<T> {
  if (!passphrase) {
    throw new Error('Passphrase is required to decrypt this backup.');
  }

  const salt = base64ToBuffer(envelope.salt);
  const iv = base64ToBuffer(envelope.iv);
  const ciphertext = base64ToBuffer(envelope.ciphertext);

  const key = await deriveKey(passphrase, salt, ['decrypt']);

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );

    const dec = new TextDecoder();
    const jsonString = dec.decode(decryptedBuffer);
    return JSON.parse(jsonString) as T;
  } catch {
    throw new Error('Incorrect passphrase or corrupted backup file.');
  }
}

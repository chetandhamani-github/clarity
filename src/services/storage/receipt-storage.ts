import * as FileSystem from 'expo-file-system/legacy';

function getReceiptsDir(): string | null {
  return FileSystem.documentDirectory ? `${FileSystem.documentDirectory}receipts/` : null;
}

async function ensureDirectoryExists(dir: string): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

export async function persistReceiptImage(sourceUri: string, transactionId: string): Promise<string> {
  const dir = getReceiptsDir();
  if (!dir) return sourceUri;
  try {
    await ensureDirectoryExists(dir);
    const targetUri = `${dir}${transactionId}.jpg`;
    await FileSystem.copyAsync({
      from: sourceUri,
      to: targetUri,
    });
    return targetUri;
  } catch {
    return sourceUri;
  }
}

export async function clearAllReceiptImages(): Promise<void> {
  const dir = getReceiptsDir();
  if (!dir) return;
  try {
    const dirInfo = await FileSystem.getInfoAsync(dir);
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(dir, { idempotent: true });
    }
  } catch {
    // Ignore cleanup errors in headless/test environments
  }
}

export async function deleteReceiptImage(receiptUri?: string): Promise<void> {
  if (!receiptUri) return;
  try {
    const fileInfo = await FileSystem.getInfoAsync(receiptUri);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(receiptUri, { idempotent: true });
    }
  } catch {
    // Ignore delete failures
  }
}

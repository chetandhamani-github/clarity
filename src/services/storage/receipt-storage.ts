import * as FileSystem from 'expo-file-system/legacy';

const RECEIPTS_DIR = `${FileSystem.documentDirectory}receipts/`;

async function ensureDirectoryExists(): Promise<void> {
  const dirInfo = await FileSystem.getInfoAsync(RECEIPTS_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(RECEIPTS_DIR, { intermediates: true });
  }
}

export async function persistReceiptImage(sourceUri: string, transactionId: string): Promise<string> {
  try {
    await ensureDirectoryExists();
    const targetUri = `${RECEIPTS_DIR}${transactionId}.jpg`;
    await FileSystem.copyAsync({
      from: sourceUri,
      to: targetUri,
    });
    return targetUri;
  } catch (error) {
    console.error('Failed to persist receipt image:', error);
    return sourceUri;
  }
}

export async function deleteReceiptImage(receiptUri?: string): Promise<void> {
  if (!receiptUri) return;
  try {
    const fileInfo = await FileSystem.getInfoAsync(receiptUri);
    if (fileInfo.exists) {
      await FileSystem.deleteAsync(receiptUri, { idempotent: true });
    }
  } catch (error) {
    console.error('Failed to delete receipt image:', error);
  }
}

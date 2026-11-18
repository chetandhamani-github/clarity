import { apiClient } from './client';
import type {
  AiCategorizePayload,
  AiCategorizeResult,
  ReceiptScanPayload,
  ReceiptScanResult,
  AiChatPayload,
  AiChatResult,
  VoiceParsePayload,
  VoiceParseResult,
  MonthlyDigestPayload,
  MonthlyDigestResult,
} from './types';
import { getInstallationId } from '@/utils/installationId';

/**
 * Classifies a raw merchant or UPI string using backend AI.
 */
export async function categorizeTransactionWithAi(
  payload: AiCategorizePayload
): Promise<AiCategorizeResult> {
  const installationId = getInstallationId();
  return apiClient.post<AiCategorizeResult>('/api/v1/ai/categorize', payload, {
    headers: {
      'X-Installation-Id': installationId,
    },
  });
}

/**
 * Multimodal OCR receipt scanner: extracts merchant, date, total, tax, and line-item splits.
 */
export async function scanReceiptWithAi(
  payload: ReceiptScanPayload
): Promise<ReceiptScanResult> {
  const installationId = getInstallationId();
  return apiClient.post<ReceiptScanResult>('/api/v1/ai/receipt-scan', payload, {
    headers: {
      'X-Installation-Id': installationId,
    },
    timeoutMs: 45000,
  });
}

/**
 * Conversational financial copilot: answers queries using anonymized context.
 */
export async function chatWithFinancialCopilot(
  payload: AiChatPayload
): Promise<AiChatResult> {
  const installationId = getInstallationId();
  return apiClient.post<AiChatResult>('/api/v1/ai/chat', payload, {
    headers: {
      'X-Installation-Id': installationId,
    },
    timeoutMs: 15000,
  });
}

/**
 * Parses conversational voice transcript into structured transaction fields.
 */
export async function parseVoiceTransactionWithAi(
  payload: VoiceParsePayload
): Promise<VoiceParseResult> {
  const installationId = getInstallationId();
  return apiClient.post<VoiceParseResult>('/api/v1/ai/voice-parse', payload, {
    headers: {
      'X-Installation-Id': installationId,
    },
    timeoutMs: 15000,
  });
}

/**
 * Generates monthly financial health digest and 50/30/20 tips.
 */
export async function fetchMonthlyAiDigest(
  payload: MonthlyDigestPayload
): Promise<MonthlyDigestResult> {
  const installationId = getInstallationId();
  return apiClient.post<MonthlyDigestResult>('/api/v1/ai/digest', payload, {
    headers: {
      'X-Installation-Id': installationId,
    },
  });
}

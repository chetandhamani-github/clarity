import { apiClient } from './client';
import {
  categorizeTransactionWithAi,
  scanReceiptWithAi,
  chatWithFinancialCopilot,
  fetchMonthlyAiDigest,
} from './ai.api';
import type {
  AiCategorizeResult,
  ReceiptScanResult,
  AiChatResult,
  MonthlyDigestResult,
} from './types';

jest.mock('./client', () => ({
  apiClient: {
    post: jest.fn(),
  },
}));

jest.mock('@/utils/installationId', () => ({
  getInstallationId: jest.fn(() => 'mock-device-id-123'),
}));

describe('ai.api', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('categorizeTransactionWithAi', () => {
    it('calls /api/v1/ai/categorize with headers and payload', async () => {
      const mockResult: AiCategorizeResult = {
        category: 'Food & Dining',
        confidence: 0.95,
        suggestedBudgetBucket: 'wants',
        isRecurringSubscription: false,
        cleanMerchant: 'Starbucks',
      };
      (apiClient.post as jest.Mock).mockResolvedValueOnce(mockResult);

      const res = await categorizeTransactionWithAi({
        merchant: 'Starbucks',
        amount: 350,
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/ai/categorize',
        { merchant: 'Starbucks', amount: 350 },
        {
          headers: {
            'X-Installation-Id': 'mock-device-id-123',
          },
          timeoutMs: 30000,
        }
      );
      expect(res).toEqual(mockResult);
    });
  });

  describe('scanReceiptWithAi', () => {
    it('calls /api/v1/ai/receipt-scan with custom timeout', async () => {
      const mockResult: ReceiptScanResult = {
        merchant: 'Whole Foods',
        totalAmount: 1250,
        taxAmount: 62.5,
        date: '2026-11-18',
        category: 'Groceries',
        confidence: 0.92,
        items: [{ name: 'Milk', amount: 60, category: 'Groceries', quantity: 2 }],
      };
      (apiClient.post as jest.Mock).mockResolvedValueOnce(mockResult);

      const res = await scanReceiptWithAi({
        imageBase64: 'base64str',
        mimeType: 'image/jpeg',
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/ai/receipt-scan',
        { imageBase64: 'base64str', mimeType: 'image/jpeg' },
        {
          headers: {
            'X-Installation-Id': 'mock-device-id-123',
          },
          timeoutMs: 60000,
        }
      );
      expect(res).toEqual(mockResult);
    });
  });

  describe('chatWithFinancialCopilot', () => {
    it('calls /api/v1/ai/chat with query and context', async () => {
      const mockResult: AiChatResult = {
        reply: 'You spent ₹5,000 on dining this month.',
        suggestedAction: '/(app)/(tabs)/plan',
      };
      (apiClient.post as jest.Mock).mockResolvedValueOnce(mockResult);

      const res = await chatWithFinancialCopilot({
        message: 'How much did I spend on dining?',
        financialContextSummary: 'Dining: 5000',
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/ai/chat',
        {
          message: 'How much did I spend on dining?',
          financialContextSummary: 'Dining: 5000',
        },
        {
          headers: {
            'X-Installation-Id': 'mock-device-id-123',
          },
          timeoutMs: 60000,
        }
      );
      expect(res).toEqual(mockResult);
    });
  });

  describe('fetchMonthlyAiDigest', () => {
    it('calls /api/v1/ai/digest with monthly totals', async () => {
      const mockResult: MonthlyDigestResult = {
        headline: 'Great Progress: You saved 24% of your income!',
        savingsAssessment: 'Your savings rate exceeded your target.',
        insights: ['Dining out was your largest discretionary expense.'],
        actionableTips: ['Keep emergency fund updated'],
        financialHealthScore: 82,
      };
      (apiClient.post as jest.Mock).mockResolvedValueOnce(mockResult);

      const res = await fetchMonthlyAiDigest({
        month: 11,
        year: 2026,
        totalIncome: 80000,
        totalExpenses: 45000,
        topCategories: ['Rent: 20000', 'Groceries: 12000'],
      });

      expect(apiClient.post).toHaveBeenCalledWith(
        '/api/v1/ai/digest',
        {
          month: 11,
          year: 2026,
          totalIncome: 80000,
          totalExpenses: 45000,
          topCategories: ['Rent: 20000', 'Groceries: 12000'],
        },
        {
          headers: {
            'X-Installation-Id': 'mock-device-id-123',
          },
          timeoutMs: 45000,
        }
      );
      expect(res).toEqual(mockResult);
    });
  });
});

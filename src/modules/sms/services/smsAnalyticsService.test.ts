import { SmsAnalyticsService } from './smsAnalyticsService';
import { SmsDao } from '@/modules/sms/storage/smsDao';
import type { ParsedTransaction } from '@/modules/sms/types';

jest.mock('@/modules/sms/storage/smsDao', () => ({
  SmsDao: {
    getSmsStats: jest.fn(),
    getTransactionsForRecurringAnalysis: jest.fn(),
  },
}));

describe('SmsAnalyticsService', () => {
  it('aggregates transactions, subscriptions, bills, and salary credits accurately', async () => {
    (SmsDao.getSmsStats as jest.Mock).mockResolvedValue({
      totalSms: 50,
      totalParsed: 10,
      totalReview: 1,
      totalDuplicates: 1,
      totalDebits: 8,
      totalCredits: 2,
      totalDebitAmount: 15400,
      totalCreditAmount: 85000,
    });

    const mockTransactions: ParsedTransaction[] = [
      {
        id: '1',
        smsId: 's1',
        amount: 649,
        type: 'DEBIT',
        merchant: 'Netflix',
        category: 'Subscriptions',
        bank: 'HDFC Bank',
        accountMask: '1234',
        timestamp: Date.now(),
        confidence: 1,
        isDuplicate: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        smsId: 's2',
        amount: 1500,
        type: 'DEBIT',
        merchant: 'BESCOM',
        category: 'Bills & Utilities',
        bank: 'ICICI Bank',
        accountMask: '5678',
        timestamp: Date.now(),
        confidence: 1,
        isDuplicate: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: '3',
        smsId: 's3',
        amount: 85000,
        type: 'CREDIT',
        merchant: 'Infosys Salary',
        category: 'Salary',
        bank: 'HDFC Bank',
        accountMask: '1234',
        timestamp: Date.now(),
        confidence: 1,
        isDuplicate: false,
        createdAt: new Date().toISOString(),
      },
    ];

    (SmsDao.getTransactionsForRecurringAnalysis as jest.Mock).mockResolvedValue(mockTransactions);

    const report = await SmsAnalyticsService.getAnalytics();

    expect(report.totalTransactions).toBe(10);
    expect(report.totalDebits).toBe(8);
    expect(report.totalCredits).toBe(2);
    expect(report.detectedSubscriptions).toBe(1);
    expect(report.monthlySubscriptionSpend).toBe(649);
    expect(report.detectedBills).toBe(1);
    expect(report.totalBillSpend).toBe(1500);
    expect(report.detectedSalaryCredits).toBe(1);
    expect(report.averageSalary).toBe(85000);
    expect(report.bankBreakdown['HDFC Bank']).toBe(2);
    expect(report.bankBreakdown['ICICI Bank']).toBe(1);
    expect(report.categoryBreakdown['Subscriptions']).toBe(1);
    expect(report.parsingSuccessRate).toBeGreaterThan(90);
  });
});

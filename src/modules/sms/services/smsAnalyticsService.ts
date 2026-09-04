import type { SmsAnalytics } from '@/modules/sms/types';
import { SmsDao } from '@/modules/sms/storage/smsDao';

export class SmsAnalyticsService {
  /**
   * Generate complete SMS intelligence analytics report.
   */
  public static async getAnalytics(): Promise<SmsAnalytics> {
    const stats = await SmsDao.getSmsStats();
    const transactions = await SmsDao.getTransactionsForRecurringAnalysis();

    let detectedSubscriptions = 0;
    let monthlySubscriptionSpend = 0;
    let detectedBills = 0;
    let totalBillSpend = 0;
    let detectedSalaryCredits = 0;
    let totalSalaryAmount = 0;

    const bankBreakdown: Record<string, number> = {};
    const categoryBreakdown: Record<string, number> = {};

    for (const tx of transactions) {
      // Bank breakdown
      bankBreakdown[tx.bank] = (bankBreakdown[tx.bank] || 0) + 1;

      // Category breakdown
      categoryBreakdown[tx.category] = (categoryBreakdown[tx.category] || 0) + 1;

      // Subscriptions
      if (tx.category === 'Subscriptions') {
        detectedSubscriptions++;
        monthlySubscriptionSpend += tx.amount;
      }

      // Bills & Utilities
      if (tx.category === 'Bills & Utilities') {
        detectedBills++;
        totalBillSpend += tx.amount;
      }

      // Salary
      if (tx.category === 'Salary' || (tx.type === 'CREDIT' && tx.merchant.toLowerCase().includes('salary'))) {
        detectedSalaryCredits++;
        totalSalaryAmount += tx.amount;
      }
    }

    const averageSalary =
      detectedSalaryCredits > 0
        ? Math.round((totalSalaryAmount / detectedSalaryCredits) * 100) / 100
        : 0;

    const totalEvaluated = stats.totalParsed + stats.totalReview;
    const parsingSuccessRate =
      totalEvaluated > 0
        ? Math.round((stats.totalParsed / totalEvaluated) * 1000) / 10
        : 100.0;

    return {
      totalTransactions: stats.totalParsed,
      totalDebits: stats.totalDebits,
      totalCredits: stats.totalCredits,
      totalDebitAmount: stats.totalDebitAmount,
      totalCreditAmount: stats.totalCreditAmount,
      detectedSubscriptions,
      monthlySubscriptionSpend: Math.round(monthlySubscriptionSpend * 100) / 100,
      detectedBills,
      totalBillSpend: Math.round(totalBillSpend * 100) / 100,
      detectedSalaryCredits,
      averageSalary,
      parsingSuccessRate,
      bankBreakdown,
      categoryBreakdown,
    };
  }
}

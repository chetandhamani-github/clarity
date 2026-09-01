import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getDatabase } from '@/services/database';
import {
  getTransactions,
  getMonthlyTotals,
  getTopMerchants,
} from '@/services/database/transaction-dao';
import { getAllAccounts } from '@/services/database/account-dao';
import {
  getCurrentBudgetPlan,
  getAllCategories,
  getSpentByCategory,
} from '@/services/database/budget-dao';
import { getGoals } from '@/services/database/goal-dao';

export interface ExportStats {
  transactionCount: number;
  accountCount: number;
  goalCount: number;
}

export async function getExportStats(): Promise<ExportStats> {
  const db = getDatabase();
  const txRes = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM transactions'
  );
  const accRes = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM accounts'
  );
  const goalRes = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM goals');

  return {
    transactionCount: txRes?.count ?? 0,
    accountCount: accRes?.count ?? 0,
    goalCount: goalRes?.count ?? 0,
  };
}

export async function exportTransactionsToCSV(): Promise<{
  success: boolean;
  uri?: string;
  message?: string;
}> {
  try {
    const transactions = await getTransactions();

    // Build CSV header and rows
    const headers = [
      'ID',
      'Date',
      'Type',
      'Account',
      'Destination Account',
      'Category',
      'Merchant',
      'Amount',
      'Recurring',
      'Note',
    ];
    const rows = transactions.map((t) => {
      const escape = (val: string | number | undefined | null) => {
        if (val === undefined || val === null) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      return [
        escape(t.id),
        escape(t.date),
        escape(t.type),
        escape(t.accountName),
        escape(t.toAccountName || ''),
        escape(t.category),
        escape(t.merchant),
        t.amount,
        t.isRecurring ? 'Yes' : 'No',
        escape(t.note || ''),
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const filename = `clarity_transactions_${new Date().toISOString().split('T')[0]}.csv`;
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;

    await FileSystem.writeAsStringAsync(fileUri, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Clarity Transactions (CSV)',
        UTI: 'public.comma-separated-values-text',
      });
    }

    return { success: true, uri: fileUri };
  } catch (error: any) {
    console.error('Failed to export CSV:', error);
    return { success: false, message: error?.message || 'Failed to export CSV' };
  }
}

export async function exportFullBackupToJSON(): Promise<{
  success: boolean;
  uri?: string;
  message?: string;
}> {
  try {
    const db = getDatabase();
    const accounts = await getAllAccounts();
    const transactions = await getTransactions();
    const plan = await getCurrentBudgetPlan();
    const categories = await getAllCategories();
    const goals = await getGoals();
    const contributions = await db.getAllAsync<any>('SELECT * FROM goal_contributions');
    const recurring = await db.getAllAsync<any>('SELECT * FROM recurring_transactions');

    const backupData = {
      app: 'Clarity Personal Finance',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      data: {
        accounts,
        transactions,
        budgetPlan: plan,
        budgetCategories: categories,
        goals,
        goalContributions: contributions,
        recurringTransactions: recurring,
      },
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const filename = `clarity_full_backup_${new Date().toISOString().split('T')[0]}.json`;
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;

    await FileSystem.writeAsStringAsync(fileUri, jsonString, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: 'Export Clarity Backup (JSON)',
        UTI: 'public.json',
      });
    }

    return { success: true, uri: fileUri };
  } catch (error: any) {
    console.error('Failed to export JSON backup:', error);
    return { success: false, message: error?.message || 'Failed to export JSON' };
  }
}

export async function exportFinancialSummaryReport(
  month?: number,
  year?: number
): Promise<{ success: boolean; uri?: string; message?: string }> {
  try {
    const now = new Date();
    const m = month || now.getMonth() + 1;
    const y = year || now.getFullYear();
    const monthName = new Date(y, m - 1, 1).toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    });

    const accounts = await getAllAccounts();
    const totals = await getMonthlyTotals(m, y);
    const spending = await getSpentByCategory(m, y);
    const topMerchants = await getTopMerchants(m, y, 10);
    const goals = await getGoals();

    const netWorth = accounts.reduce((sum, a) => sum + a.balance, 0);
    const cashFlow = totals.income - totals.expenses;
    const savingsRate = totals.income > 0 ? ((cashFlow / totals.income) * 100).toFixed(1) : '0';

    let report = `=================================================\n`;
    report += `           CLARITY FINANCIAL REPORT              \n`;
    report += `               ${monthName}                      \n`;
    report += `=================================================\n\n`;

    report += `1. EXECUTIVE SNAPSHOT\n`;
    report += `-------------------------------------------------\n`;
    report += `Total Net Worth : ₹${netWorth.toLocaleString()}\n`;
    report += `Monthly Income  : ₹${totals.income.toLocaleString()}\n`;
    report += `Monthly Expenses: ₹${totals.expenses.toLocaleString()}\n`;
    report += `Net Cash Flow   : ${cashFlow >= 0 ? '+' : ''}₹${cashFlow.toLocaleString()}\n`;
    report += `Savings Rate    : ${savingsRate}%\n\n`;

    report += `2. ACCOUNTS SUMMARY\n`;
    report += `-------------------------------------------------\n`;
    for (const acc of accounts) {
      report += `- ${acc.name} (${acc.type}): ₹${acc.balance.toLocaleString()} ${acc.institution ? `[${acc.institution}]` : ''}\n`;
    }
    report += `\n`;

    report += `3. SPENDING BY CATEGORY\n`;
    report += `-------------------------------------------------\n`;
    const sortedCategories = Object.entries(spending).sort(([, a], [, b]) => b - a);
    if (sortedCategories.length === 0) {
      report += `No expense records for this month.\n`;
    } else {
      for (const [cat, amt] of sortedCategories) {
        report += `- ${cat.padEnd(20)}: ₹${amt.toLocaleString()}\n`;
      }
    }
    report += `\n`;

    report += `4. TOP MERCHANTS\n`;
    report += `-------------------------------------------------\n`;
    if (topMerchants.length === 0) {
      report += `No merchant records for this month.\n`;
    } else {
      for (const tm of topMerchants) {
        report += `- ${tm.merchant.padEnd(20)}: ₹${tm.total.toLocaleString()}\n`;
      }
    }
    report += `\n`;

    report += `5. SAVINGS GOALS STATUS\n`;
    report += `-------------------------------------------------\n`;
    for (const g of goals) {
      const pct = g.targetAmount > 0 ? ((g.currentAmount / g.targetAmount) * 100).toFixed(0) : '0';
      report += `- ${g.name}: ₹${g.currentAmount.toLocaleString()} / ₹${g.targetAmount.toLocaleString()} (${pct}%)\n`;
    }
    report += `\n=================================================\n`;
    report += `Generated on ${new Date().toLocaleString()} by Clarity\n`;

    const filename = `clarity_financial_report_${y}_${m}.txt`;
    const fileUri = `${FileSystem.cacheDirectory}${filename}`;

    await FileSystem.writeAsStringAsync(fileUri, report, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/plain',
        dialogTitle: `Export Financial Report (${monthName})`,
        UTI: 'public.plain-text',
      });
    }

    return { success: true, uri: fileUri };
  } catch (error: any) {
    console.error('Failed to export summary report:', error);
    return { success: false, message: error?.message || 'Failed to export report' };
  }
}

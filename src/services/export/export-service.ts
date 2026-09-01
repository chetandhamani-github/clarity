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
import { getCurrencySymbol } from '@/utils/format';

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
    const sym = getCurrencySymbol();

    const netWorth = accounts.reduce((sum, a) => sum + a.balance, 0);
    const cashFlow = totals.income - totals.expenses;
    const savingsRate = totals.income > 0 ? ((cashFlow / totals.income) * 100).toFixed(1) : '0';

    let report = `=================================================\n`;
    report += `           CLARITY FINANCIAL REPORT              \n`;
    report += `               ${monthName}                      \n`;
    report += `=================================================\n\n`;

    report += `1. EXECUTIVE SNAPSHOT\n`;
    report += `-------------------------------------------------\n`;
    report += `Total Net Worth : ${sym}${netWorth.toLocaleString()}\n`;
    report += `Monthly Income  : ${sym}${totals.income.toLocaleString()}\n`;
    report += `Monthly Expenses: ${sym}${totals.expenses.toLocaleString()}\n`;
    report += `Net Cash Flow   : ${cashFlow >= 0 ? '+' : ''}${sym}${cashFlow.toLocaleString()}\n`;
    report += `Savings Rate    : ${savingsRate}%\n\n`;

    report += `2. ACCOUNTS SUMMARY\n`;
    report += `-------------------------------------------------\n`;
    for (const acc of accounts) {
      report += `- ${acc.name} (${acc.type}): ${sym}${acc.balance.toLocaleString()} ${acc.institution ? `[${acc.institution}]` : ''}\n`;
    }
    report += `\n`;

    report += `3. SPENDING BY CATEGORY\n`;
    report += `-------------------------------------------------\n`;
    const sortedCategories = Object.entries(spending).sort(([, a], [, b]) => b - a);
    if (sortedCategories.length === 0) {
      report += `No expense records for this month.\n`;
    } else {
      for (const [cat, amt] of sortedCategories) {
        report += `- ${cat.padEnd(20)}: ${sym}${amt.toLocaleString()}\n`;
      }
    }
    report += `\n`;

    report += `4. TOP MERCHANTS\n`;
    report += `-------------------------------------------------\n`;
    if (topMerchants.length === 0) {
      report += `No merchant records for this month.\n`;
    } else {
      for (const tm of topMerchants) {
        report += `- ${tm.merchant.padEnd(20)}: ${sym}${tm.total.toLocaleString()}\n`;
      }
    }
    report += `\n`;

    report += `5. SAVINGS GOALS STATUS\n`;
    report += `-------------------------------------------------\n`;
    for (const g of goals) {
      const pct = g.targetAmount > 0 ? ((g.currentAmount / g.targetAmount) * 100).toFixed(0) : '0';
      report += `- ${g.name}: ${sym}${g.currentAmount.toLocaleString()} / ${sym}${g.targetAmount.toLocaleString()} (${pct}%)\n`;
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

import * as Print from 'expo-print';

export interface StatementExportOptions {
  format: 'pdf' | 'csv';
  dateFrom?: string;
  dateTo?: string;
  accountId?: string;
  category?: string;
  action?: 'share' | 'print';
}

export async function exportCustomStatement(options: StatementExportOptions): Promise<{
  success: boolean;
  uri?: string;
  message?: string;
}> {
  try {
    const transactions = await getTransactions({
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      accountId: options.accountId,
      category: options.category,
    });

    const accounts = await getAllAccounts();
    const selectedAccount = options.accountId
      ? accounts.find((a) => a.id === options.accountId)
      : null;

    const sym = getCurrencySymbol();
    const totalIncome = transactions
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = transactions
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    const netCashFlow = totalIncome - totalExpense;

    const dateRangeLabel =
      options.dateFrom && options.dateTo
        ? `${options.dateFrom} to ${options.dateTo}`
        : options.dateFrom
          ? `From ${options.dateFrom}`
          : options.dateTo
            ? `Up to ${options.dateTo}`
            : 'All Time';

    if (options.format === 'csv') {
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
      const filename = `clarity_statement_${new Date().toISOString().split('T')[0]}.csv`;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(fileUri, csvContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export Clarity Statement (CSV)',
          UTI: 'public.comma-separated-values-text',
        });
      }

      return { success: true, uri: fileUri };
    } else {
      // Formatted HTML/PDF Statement
      const rowsHtml = transactions
        .map((t) => {
          const isIncome = t.type === 'income';
          const sign = isIncome ? '+' : t.type === 'expense' ? '-' : '';
          const color = isIncome ? '#10B981' : '#111827';
          return `
            <tr>
              <td>${t.date}</td>
              <td>${t.type === 'transfer' ? 'Transfer' : t.merchant}</td>
              <td><span class="badge">${t.category}</span></td>
              <td>${t.accountName}${t.toAccountName ? ` → ${t.toAccountName}` : ''}</td>
              <td style="text-align: right; color: ${color}; font-weight: 600;">${sign}${sym}${t.amount.toFixed(2)}</td>
            </tr>
          `;
        })
        .join('');

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Clarity Financial Statement</title>
          <style>
            @page { margin: 20mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111827; margin: 0; padding: 24px; line-height: 1.5; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #E5E7EB; padding-bottom: 20px; margin-bottom: 25px; }
            .brand { font-size: 26px; font-weight: 800; color: #4F46E5; letter-spacing: -0.5px; }
            .title { font-size: 13px; text-transform: uppercase; color: #6B7280; letter-spacing: 0.8px; margin-top: 4px; font-weight: 600; }
            .meta { text-align: right; font-size: 13px; color: #4B5563; line-height: 1.6; }
            .summary-cards { display: flex; gap: 15px; margin-bottom: 25px; }
            .card { flex: 1; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 10px; padding: 15px; }
            .card-label { font-size: 11px; text-transform: uppercase; color: #6B7280; font-weight: 700; letter-spacing: 0.5px; }
            .card-value { font-size: 20px; font-weight: 700; margin-top: 5px; color: #111827; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
            th { text-align: left; background: #F3F4F6; padding: 10px 12px; color: #374151; font-weight: 600; border-bottom: 1px solid #E5E7EB; }
            td { padding: 10px 12px; border-bottom: 1px solid #F3F4F6; }
            .badge { background: #E0E7FF; color: #4338CA; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
            .footer { margin-top: 40px; font-size: 11px; color: #9CA3AF; text-align: center; border-top: 1px solid #E5E7EB; padding-top: 15px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="brand">CLARITY</div>
              <div class="title">Official Financial Statement</div>
            </div>
            <div class="meta">
              <div><strong>Period:</strong> ${dateRangeLabel}</div>
              <div><strong>Account:</strong> ${selectedAccount ? `${selectedAccount.name} (${selectedAccount.type})` : 'All Accounts'}</div>
              <div><strong>Generated:</strong> ${new Date().toLocaleDateString()}</div>
            </div>
          </div>

          <div class="summary-cards">
            <div class="card">
              <div class="card-label">Total Income</div>
              <div class="card-value" style="color: #10B981;">+${sym}${totalIncome.toFixed(2)}</div>
            </div>
            <div class="card">
              <div class="card-label">Total Expenses</div>
              <div class="card-value" style="color: #EF4444;">-${sym}${totalExpense.toFixed(2)}</div>
            </div>
            <div class="card">
              <div class="card-label">Net Cash Flow</div>
              <div class="card-value" style="color: ${netCashFlow >= 0 ? '#10B981' : '#EF4444'};">
                ${netCashFlow >= 0 ? '+' : ''}${sym}${netCashFlow.toFixed(2)}
              </div>
            </div>
          </div>

          <div style="font-weight: 700; font-size: 15px; margin-bottom: 5px; color: #374151;">Transaction History (${transactions.length})</div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description / Merchant</th>
                <th>Category</th>
                <th>Account</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="5" style="text-align: center; color: #9CA3AF;">No transactions in this period</td></tr>'}
            </tbody>
          </table>

          <div class="footer">
            Generated securely by Clarity Personal Finance App on ${new Date().toLocaleString()}
          </div>
        </body>
        </html>
      `;

      if (options.action === 'print') {
        await Print.printAsync({ html: htmlContent });
        return { success: true };
      }

      // Convert HTML into actual binary PDF file
      const { uri: pdfUri } = await Print.printToFileAsync({
        html: htmlContent,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Clarity Statement (PDF)',
          UTI: 'com.adobe.pdf',
        });
      }

      return { success: true, uri: pdfUri };
    }
  } catch (error: any) {
    console.error('Failed to export statement:', error);
    return { success: false, message: error?.message || 'Failed to export statement' };
  }
}

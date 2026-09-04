import { DeviceEventEmitter } from 'react-native';
import { getDatabase } from '@/services/database';
import { insertNotification } from '@/services/database/notification-dao';
import { getGoalById } from '@/services/database/goal-dao';
import { getMonthlyTotals } from '@/services/database/transaction-dao';
import { getSpentByCategory } from '@/services/database/budget-dao';
import { formatCurrency } from '@/utils/format';
import type { Transaction } from '@/types';

export async function evaluateTransactionBudgetAlerts(
  transaction: Omit<Transaction, 'id'> | Transaction
): Promise<void> {
  if (transaction.type !== 'expense') return;

  try {
    const db = getDatabase();

    // Safely extract year and month without timezone drift
    const dateParts = transaction.date.split('T')[0].split('-');
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10);
    const monthStr = month.toString().padStart(2, '0');
    const datePrefix = `${year}-${monthStr}`;

    // 1. Check category budget limit (case-insensitive & trimmed)
    const categoryRow = await db.getFirstAsync<{ id: string; name: string; budget_limit: number }>(
      'SELECT id, name, budget_limit FROM budget_categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))',
      [transaction.category]
    );

    if (categoryRow && categoryRow.budget_limit > 0) {
      // Calculate true category spent (including splits and exact month transactions)
      const spentDict = await getSpentByCategory(month, year);

      let totalSpent = 0;
      for (const [catName, spent] of Object.entries(spentDict)) {
        if (catName.trim().toLowerCase() === categoryRow.name.trim().toLowerCase()) {
          totalSpent += spent;
        }
      }

      const limit = categoryRow.budget_limit;
      const percentage = (totalSpent / limit) * 100;
      const categoryName = categoryRow.name;

      // Clean up previous budget alert notifications for this category in current month
      // so user always sees the up-to-date spent value rather than stale historical values
      await db.runAsync(
        `DELETE FROM notifications 
         WHERE type = 'alert' 
           AND (title = ? OR title = ?) 
           AND created_at >= ?`,
        [
          `Budget Exceeded: ${categoryName}`,
          `Budget Alert: ${categoryName}`,
          `${datePrefix}-01`,
        ]
      );

      if (percentage >= 100) {
        await insertNotification({
          title: `Budget Exceeded: ${categoryName}`,
          description: `You have spent ${formatCurrency(totalSpent)} which exceeds your ${formatCurrency(limit)} limit for ${categoryName}.`,
          type: 'alert',
          actionUrl: '/(app)/(tabs)/plan',
        });
        DeviceEventEmitter.emit('notificationsUpdated');
      } else if (percentage >= 80) {
        await insertNotification({
          title: `Budget Alert: ${categoryName}`,
          description: `You have spent ${formatCurrency(totalSpent)} (${Math.round(percentage)}% of your ${formatCurrency(limit)} budget for ${categoryName}).`,
          type: 'alert',
          actionUrl: '/(app)/(tabs)/plan',
        });
        DeviceEventEmitter.emit('notificationsUpdated');
      }
    }

    // 2. Check total income vs total expenses for this month
    const totals = await getMonthlyTotals(month, year);
    if (totals.income > 0 && totals.expenses > totals.income) {
      // Check if we already alerted this month for exceeding income
      const existingAlert = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM notifications 
         WHERE type = 'alert' AND title = 'Spending Exceeds Income' AND created_at >= ?`,
        [`${datePrefix}-01`]
      );

      if (!existingAlert) {
        await insertNotification({
          title: 'Spending Exceeds Income',
          description: `Total expenses this month (${formatCurrency(totals.expenses)}) have exceeded your income (${formatCurrency(totals.income)}).`,
          type: 'alert',
          actionUrl: '/(app)/(tabs)/plan',
        });
        DeviceEventEmitter.emit('notificationsUpdated');
      }
    }
  } catch (error) {
    console.error('Error evaluating budget alerts:', error);
  }
}

export async function evaluateGoalMilestoneAlerts(
  goalId: string,
  previousAmount: number,
  newAmount: number
): Promise<void> {
  try {
    const goal = await getGoalById(goalId);
    if (!goal || goal.targetAmount <= 0) return;

    const prevPct = (previousAmount / goal.targetAmount) * 100;
    const newPct = (newAmount / goal.targetAmount) * 100;

    if (prevPct < 100 && newPct >= 100) {
      await insertNotification({
        title: 'Goal Achieved! 🎉',
        description: `Congratulations! You reached your savings target of ${formatCurrency(goal.targetAmount)} for "${goal.name}".`,
        type: 'milestone',
        actionUrl: `/(app)/goal-details?id=${goal.id}`,
      });
      DeviceEventEmitter.emit('notificationsUpdated');
    } else if (prevPct < 75 && newPct >= 75) {
      await insertNotification({
        title: '75% Milestone Reached 🚀',
        description: `You are 75% of the way to "${goal.name}" (${formatCurrency(newAmount)} of ${formatCurrency(goal.targetAmount)}).`,
        type: 'milestone',
        actionUrl: `/(app)/goal-details?id=${goal.id}`,
      });
      DeviceEventEmitter.emit('notificationsUpdated');
    } else if (prevPct < 50 && newPct >= 50) {
      await insertNotification({
        title: 'Halfway There! 🎯',
        description: `You have reached 50% of your savings goal for "${goal.name}". Keep it up!`,
        type: 'milestone',
        actionUrl: `/(app)/goal-details?id=${goal.id}`,
      });
      DeviceEventEmitter.emit('notificationsUpdated');
    }
  } catch (error) {
    console.error('Error evaluating goal milestones:', error);
  }
}

export async function checkUpcomingBillReminders(): Promise<void> {
  try {
    const db = getDatabase();
    const today = new Date();
    const in3Days = new Date(today);
    in3Days.setDate(in3Days.getDate() + 3);

    const todayStr = today.toISOString().split('T')[0];
    const in3DaysStr = in3Days.toISOString().split('T')[0];

    const upcoming = await db.getAllAsync<{
      id: string;
      merchant: string;
      amount: number;
      next_process_date: string;
    }>(
      `SELECT id, merchant, amount, next_process_date 
       FROM recurring_transactions 
       WHERE is_active = 1 AND next_process_date > ? AND next_process_date <= ?`,
      [todayStr, in3DaysStr]
    );

    for (const bill of upcoming) {
      // Check if alert already sent in last 2 days
      const existing = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM notifications 
         WHERE title LIKE ? AND created_at >= date('now', '-2 days')`,
        [`%${bill.merchant}%`]
      );

      if (!existing) {
        await insertNotification({
          title: `Upcoming Bill: ${bill.merchant}`,
          description: `Scheduled ${formatCurrency(bill.amount)} due on ${bill.next_process_date}.`,
          type: 'default',
          actionUrl: '/(app)/(tabs)/transactions',
        });
        DeviceEventEmitter.emit('notificationsUpdated');
      }
    }
  } catch (error) {
    console.error('Error checking upcoming bill reminders:', error);
  }
}

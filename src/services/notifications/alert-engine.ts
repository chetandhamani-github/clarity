import { DeviceEventEmitter } from 'react-native';
import { getDatabase } from '@/services/database';
import { insertNotification } from '@/services/database/notification-dao';
import { getGoalById } from '@/services/database/goal-dao';
import { getMonthlyTotals } from '@/services/database/transaction-dao';
import type { Transaction } from '@/types';

export async function evaluateTransactionBudgetAlerts(
  transaction: Omit<Transaction, 'id'> | Transaction
): Promise<void> {
  if (transaction.type !== 'expense') return;

  try {
    const db = getDatabase();
    const txDate = new Date(transaction.date);
    const month = txDate.getMonth() + 1;
    const year = txDate.getFullYear();
    const monthStr = month.toString().padStart(2, '0');
    const datePrefix = `${year}-${monthStr}`;

    // 1. Check category budget limit
    const categoryRow = await db.getFirstAsync<{ budget_limit: number }>(
      'SELECT budget_limit FROM budget_categories WHERE name = ?',
      [transaction.category]
    );

    if (categoryRow && categoryRow.budget_limit > 0) {
      const spentRow = await db.getFirstAsync<{ total: number }>(
        `SELECT SUM(amount) as total FROM transactions 
         WHERE category = ? AND type = 'expense' AND date LIKE ?`,
        [transaction.category, `${datePrefix}%`]
      );

      const totalSpent = spentRow?.total ?? 0;
      const limit = categoryRow.budget_limit;
      const percentage = (totalSpent / limit) * 100;

      if (percentage >= 100) {
        await insertNotification({
          title: `Budget Exceeded: ${transaction.category}`,
          description: `You have spent ₹${Math.round(totalSpent)} which exceeds your ₹${limit} limit for ${transaction.category}.`,
          type: 'alert',
          actionUrl: '/(app)/(tabs)/plan',
        });
        DeviceEventEmitter.emit('notificationsUpdated');
      } else if (percentage >= 80) {
        await insertNotification({
          title: `Budget Alert: ${transaction.category}`,
          description: `You have used ${Math.round(percentage)}% of your ₹${limit} budget for ${transaction.category}.`,
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
          description: `Total expenses this month (₹${Math.round(totals.expenses)}) have exceeded your income (₹${Math.round(totals.income)}).`,
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
        description: `Congratulations! You reached your savings target of ₹${goal.targetAmount} for "${goal.name}".`,
        type: 'milestone',
        actionUrl: `/(app)/goal-details?id=${goal.id}`,
      });
      DeviceEventEmitter.emit('notificationsUpdated');
    } else if (prevPct < 75 && newPct >= 75) {
      await insertNotification({
        title: '75% Milestone Reached 🚀',
        description: `You are 75% of the way to "${goal.name}" (₹${Math.round(newAmount)} of ₹${goal.targetAmount}).`,
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
          description: `Scheduled ₹${bill.amount} due on ${bill.next_process_date}.`,
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

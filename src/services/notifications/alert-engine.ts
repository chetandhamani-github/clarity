import { DeviceEventEmitter } from 'react-native';
import { getDatabase } from '@/services/database';
import { insertNotification } from '@/services/database/notification-dao';
import { getGoalById } from '@/services/database/goal-dao';
import { getMonthlyTotals } from '@/services/database/transaction-dao';
import { getSpentByCategory } from '@/services/database/budget-dao';
import { formatCurrency } from '@/utils/format';
import type { Transaction } from '@/types';

export async function evaluateCategoryBudgetAlert(
  categoryNameInput: string,
  month: number,
  year: number
): Promise<void> {
  try {
    const db = getDatabase();
    const monthStr = month.toString().padStart(2, '0');
    const datePrefix = `${year}-${monthStr}`;

    const categoryRow = await db.getFirstAsync<{ id: string; name: string; budget_limit: number }>(
      'SELECT id, name, budget_limit FROM budget_categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))',
      [categoryNameInput]
    );

    if (categoryRow && categoryRow.budget_limit > 0) {
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
          type: 'budget',
          actionUrl: '/(app)/(tabs)/plan',
        });
        DeviceEventEmitter.emit('notificationsUpdated');
      }
    }
  } catch (error) {
    console.error('Error evaluating category budget alert:', error);
  }
}

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

    // 1. Check category budget limit
    await evaluateCategoryBudgetAlert(transaction.category, month, year);

    // 2. Check high-value transaction alert (e.g. single spend >= ₹15,000)
    if (transaction.amount >= 15000) {
      const existingHighAlert = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM notifications 
         WHERE type = 'budget' AND title = 'High Expense Recorded' AND created_at >= ?`,
        [`${datePrefix}-01`]
      );
      if (!existingHighAlert) {
        await insertNotification({
          title: 'High Expense Recorded',
          description: `A large spend of ${formatCurrency(transaction.amount)} was recorded for "${transaction.merchant || transaction.category}".`,
          type: 'budget',
          actionUrl: '/(app)/(tabs)/transactions',
        });
        DeviceEventEmitter.emit('notificationsUpdated');
      }
    }

    // 3. Check total income vs total expenses for this month
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
  } catch {
    // Error evaluating budget alerts
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
  } catch {
    // Error evaluating goal milestones
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
       WHERE is_active = 1 AND type = 'expense' AND next_process_date > ? AND next_process_date <= ?`,
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
          type: 'bill',
          actionUrl: '/(app)/(tabs)/transactions',
        });
        DeviceEventEmitter.emit('notificationsUpdated');
      }
    }

    // Evaluate dedicated legacy bill reminders
    const { BillAlertEngine } = await import('@/services/notifications/bill-alert-engine');
    await BillAlertEngine.evaluateUpcomingBillAlerts();

    // Evaluate modern bills repository reminders
    const { ReminderService } = await import('@/modules/bills/services/ReminderService');
    await ReminderService.evaluateAllBillReminders();

    // Evaluate upcoming subscription renewals
    const upcomingSubs = await db.getAllAsync<{
      id: string;
      name: string;
      amount: number;
      next_renewal_date: string;
    }>(
      `SELECT id, name, amount, next_renewal_date 
       FROM subscriptions 
       WHERE status = 'active' AND next_renewal_date > ? AND next_renewal_date <= ?`,
      [todayStr, in3DaysStr]
    );

    for (const sub of upcomingSubs) {
      const existing = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM notifications 
         WHERE title LIKE ? AND created_at >= date('now', '-2 days')`,
        [`%${sub.name}%`]
      );

      if (!existing) {
        await insertNotification({
          title: `Subscription Renewal: ${sub.name}`,
          description: `Your ${sub.name} subscription (${formatCurrency(sub.amount)}) is scheduled to renew on ${sub.next_renewal_date}.`,
          type: 'bill',
          actionUrl: '/(app)/bills',
        });
        DeviceEventEmitter.emit('notificationsUpdated');
      }
    }

    // Evaluate credit card utilization & due dates
    const creditAccounts = await db.getAllAsync<{
      id: string;
      name: string;
      type: string;
      balance: number;
      credit_limit: number | null;
      due_day: number | null;
    }>("SELECT id, name, type, balance, credit_limit, due_day FROM accounts WHERE type = 'credit'");

    for (const acc of creditAccounts) {
      await evaluateAccountBalanceAlerts({
        id: acc.id,
        name: acc.name,
        type: acc.type,
        balance: acc.balance,
        creditLimit: acc.credit_limit ?? undefined,
        dueDay: acc.due_day ?? undefined,
      });
    }
  } catch {
    // Error checking upcoming bill reminders
  }
}

export async function checkUpcomingGoalDeadlines(): Promise<void> {
  try {
    const db = getDatabase();
    const today = new Date();
    const in7Days = new Date(today);
    in7Days.setDate(in7Days.getDate() + 7);

    const todayStr = today.toISOString().split('T')[0];
    const in7DaysStr = in7Days.toISOString().split('T')[0];

    const upcomingGoals = await db.getAllAsync<{
      id: string;
      name: string;
      target_amount: number;
      current_amount: number;
      target_date: string;
    }>(
      `SELECT id, name, target_amount, current_amount, target_date 
       FROM goals 
       WHERE current_amount < target_amount AND target_date >= ? AND target_date <= ?`,
      [todayStr, in7DaysStr]
    );

    for (const g of upcomingGoals) {
      const existing = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM notifications 
         WHERE title LIKE ? AND created_at >= date('now', '-3 days')`,
        [`%${g.name}%`]
      );

      if (!existing) {
        const remaining = g.target_amount - g.current_amount;
        await insertNotification({
          title: `Goal Deadline Approaching: ${g.name}`,
          description: `Target date is ${g.target_date}. You are ${formatCurrency(remaining)} away from your target.`,
          type: 'milestone',
          actionUrl: `/(app)/goal-details?id=${g.id}`,
        });
        DeviceEventEmitter.emit('notificationsUpdated');
      }
    }
  } catch {
    // Error checking goal deadlines
  }
}

export async function evaluateAccountBalanceAlerts(account: {
  id: string;
  name: string;
  type: string;
  balance: number;
  creditLimit?: number;
  dueDay?: number;
}): Promise<void> {
  try {
    const db = getDatabase();

    if (account.type === 'credit') {
      let limit = account.creditLimit;
      let paymentDueDay = account.dueDay;
      if (limit === undefined || paymentDueDay === undefined) {
        const row = await db.getFirstAsync<{ credit_limit: number | null; due_day: number | null }>(
          'SELECT credit_limit, due_day FROM accounts WHERE id = ?',
          [account.id]
        );
        if (limit === undefined) limit = row?.credit_limit ?? undefined;
        if (paymentDueDay === undefined) paymentDueDay = row?.due_day ?? undefined;
      }

      // 1. Credit Card High Utilization Warning (>=80%)
      if (limit && limit > 0) {
        const spent = Math.abs(account.balance);
        const utilization = (spent / limit) * 100;

        if (utilization >= 80) {
          const existingAlert = await db.getFirstAsync<{ id: string }>(
            `SELECT id FROM notifications 
             WHERE type = 'alert' AND title LIKE ? AND created_at >= date('now', '-2 days')`,
            [`%High Credit Utilization: ${account.name}%`]
          );

          if (!existingAlert) {
            await insertNotification({
              title: `High Credit Utilization: ${account.name}`,
              description: `You have used ${Math.round(utilization)}% (${formatCurrency(spent)} of ${formatCurrency(limit)}) of your credit limit. Keep utilization under 30% to maintain a strong credit score.`,
              type: 'alert',
              actionUrl: '/(app)/(tabs)/accounts',
            });
            DeviceEventEmitter.emit('notificationsUpdated');
          }
        } else if (utilization >= 30) {
          const existingWarning = await db.getFirstAsync<{ id: string }>(
            `SELECT id FROM notifications 
             WHERE type = 'budget' AND title LIKE ? AND created_at >= date('now', '-5 days')`,
            [`%Credit Utilization Alert: ${account.name}%`]
          );

          if (!existingWarning) {
            await insertNotification({
              title: `Credit Utilization Alert: ${account.name}`,
              description: `You have used ${Math.round(utilization)}% (${formatCurrency(spent)} of ${formatCurrency(limit)}) of your credit limit on ${account.name}. Credit bureaus recommend keeping utilization under 30% to maintain a strong credit score.`,
              type: 'budget',
              actionUrl: '/(app)/(tabs)/accounts',
            });
            DeviceEventEmitter.emit('notificationsUpdated');
          }
        }
      }

      // 2. Credit Card Payment Due Warning
      if (paymentDueDay && account.balance < 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const year = today.getFullYear();
        const month = today.getMonth();
        let nextDueDate = new Date(year, month, paymentDueDay);
        if (nextDueDate < today) {
          nextDueDate = new Date(year, month + 1, paymentDueDay);
        }
        const daysUntilDue = Math.ceil((nextDueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilDue <= 3) {
          const existingDueAlert = await db.getFirstAsync<{ id: string }>(
            `SELECT id FROM notifications 
             WHERE type = 'alert' AND title LIKE ? AND created_at >= date('now', '-2 days')`,
            [`%Credit Card Due: ${account.name}%`]
          );

          if (!existingDueAlert) {
            await insertNotification({
              title: `Credit Card Due: ${account.name}`,
              description: `Payment of ${formatCurrency(Math.abs(account.balance))} is due ${daysUntilDue === 0 ? 'today' : `in ${daysUntilDue} day${daysUntilDue > 1 ? 's' : ''}`}.`,
              type: 'alert',
              actionUrl: '/(app)/(tabs)/accounts',
            });
            DeviceEventEmitter.emit('notificationsUpdated');
          }
        }
      }

      return;
    }

    if (account.balance < 0) {
      // Overdraft / negative balance alert
      const existingAlert = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM notifications 
         WHERE type = 'account' AND title LIKE ? AND created_at >= date('now', '-1 day')`,
        [`%Overdraft: ${account.name}%`]
      );

      if (!existingAlert) {
        await insertNotification({
          title: `Overdraft: ${account.name}`,
          description: `Your account balance is negative (${formatCurrency(account.balance)}). Please deposit funds immediately.`,
          type: 'account',
          actionUrl: '/(app)/(tabs)/accounts',
        });
        DeviceEventEmitter.emit('notificationsUpdated');
      }
    } else if (account.balance <= 1000) {
      // Low balance warning
      const existingAlert = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM notifications 
         WHERE type = 'account' AND title LIKE ? AND created_at >= date('now', '-2 days')`,
        [`%Low Balance: ${account.name}%`]
      );

      if (!existingAlert) {
        await insertNotification({
          title: `Low Balance: ${account.name}`,
          description: `Balance is down to ${formatCurrency(account.balance)}. Ensure you maintain any required minimum balance.`,
          type: 'account',
          actionUrl: '/(app)/(tabs)/accounts',
        });
        DeviceEventEmitter.emit('notificationsUpdated');
      }
    }
  } catch {
    // Error evaluating account balance alerts
  }
}

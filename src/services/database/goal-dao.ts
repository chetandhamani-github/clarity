import * as SQLite from 'expo-sqlite';
import { getDatabase } from './index';
import type { Goal, GoalContribution } from '@/types';

/**
 * GOALS
 */
export async function getGoals(): Promise<Goal[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<any>('SELECT * FROM goals ORDER BY target_date ASC;');
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    targetAmount: r.target_amount,
    currentAmount: r.current_amount,
    targetDate: r.target_date,
    autoSaveAmount: 0,
    category: r.category,
    createdAt: r.created_at,
  }));
}

export async function getGoalById(id: string): Promise<Goal | null> {
  const db = getDatabase();
  const r = await db.getFirstAsync<any>('SELECT * FROM goals WHERE id = ?;', [id]);
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    icon: r.icon,
    targetAmount: r.target_amount,
    currentAmount: r.current_amount,
    targetDate: r.target_date,
    autoSaveAmount: 0,
    category: r.category,
    createdAt: r.created_at,
  };
}

export async function createGoal(
  goal: Omit<Goal, 'id' | 'createdAt' | 'autoSaveAmount'>
): Promise<string> {
  const db = getDatabase();
  const id = Math.random().toString(36).substring(2, 9);
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO goals (
      id, name, icon, target_amount, current_amount, target_date,
      category, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      id,
      goal.name,
      goal.icon,
      goal.targetAmount,
      goal.currentAmount,
      goal.targetDate || '',
      goal.category,
      now,
    ]
  );

  return id;
}

export async function updateGoalAmount(id: string, newAmount: number): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  // We can also auto-update status to completed if current >= target, but for now we'll just update amount
  await db.runAsync('UPDATE goals SET current_amount = ? WHERE id = ?;', [newAmount, id]);
}

export async function deleteGoal(id: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM goals WHERE id = ?;', [id]);
}

/**
 * GOAL CONTRIBUTIONS
 */
export async function getGoalContributions(goalId: string): Promise<GoalContribution[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM goal_contributions WHERE goal_id = ? ORDER BY date DESC;',
    [goalId]
  );
  return rows.map((r) => ({
    id: r.id,
    goalId: r.goal_id,
    amount: r.amount,
    description: r.description || '',
    date: r.date,
  }));
}

export async function addGoalContribution(
  contribution: Omit<GoalContribution, 'id'>,
  accountId?: string
): Promise<string> {
  const db = getDatabase();
  const id = Math.random().toString(36).substring(2, 9);
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    const goal = await getGoalById(contribution.goalId);
    let transId = null;

    // Insert transaction if accountId is provided
    if (accountId && goal) {
      const account = await db.getFirstAsync<any>('SELECT balance FROM accounts WHERE id = ?;', [
        accountId,
      ]);
      if (account) {
        transId = Math.random().toString(36).substring(2, 9);
        await db.runAsync(
          `INSERT INTO transactions (id, account_id, amount, type, merchant, category, date, is_recurring, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            transId,
            accountId,
            contribution.amount,
            'expense',
            `Goal: ${goal.name}`,
            'Savings',
            contribution.date,
            0,
            contribution.description || 'Goal Contribution',
          ]
        );
        const newBalance = account.balance - contribution.amount;
        await db.runAsync('UPDATE accounts SET balance = ? WHERE id = ?', [newBalance, accountId]);
      }
    }

    // Insert contribution
    await db.runAsync(
      `INSERT INTO goal_contributions (id, goal_id, amount, date, description, transaction_id)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [
        id,
        contribution.goalId,
        contribution.amount,
        contribution.date,
        contribution.description || '',
        transId,
      ]
    );

    // Update goal amount
    if (goal) {
      const newAmount = goal.currentAmount + contribution.amount;
      await db.runAsync('UPDATE goals SET current_amount = ? WHERE id = ?;', [
        newAmount,
        contribution.goalId,
      ]);
    }
  });

  return id;
}

import * as SQLite from 'expo-sqlite';
import { getDatabase } from './index';
import type { Goal, GoalContribution } from '@/types';

/**
 * GOALS
 */
export async function getGoals(): Promise<Goal[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<any>('SELECT * FROM goals ORDER BY target_date ASC;');
  return rows.map(r => ({
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
  goal: Omit<Goal, 'id' | 'createdAt' | 'autoSaveAmount'>,
): Promise<string> {
  const db = getDatabase();
  const id = Math.random().toString(36).substring(2, 9);
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO goals (
      id, name, icon, target_amount, current_amount, target_date,
      category, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      id,
      goal.name,
      goal.icon,
      goal.targetAmount,
      goal.currentAmount,
      goal.targetDate || null,
      goal.category,
      'active',
      now,
      now,
    ],
  );

  return id;
}

export async function updateGoalAmount(id: string, newAmount: number): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  // We can also auto-update status to completed if current >= target, but for now we'll just update amount
  await db.runAsync(
    'UPDATE goals SET current_amount = ?, updated_at = ? WHERE id = ?;',
    [newAmount, now, id],
  );
}

/**
 * GOAL CONTRIBUTIONS
 */
export async function getGoalContributions(goalId: string): Promise<GoalContribution[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM goal_contributions WHERE goal_id = ? ORDER BY date DESC;',
    [goalId],
  );
  return rows.map(r => ({
    id: r.id,
    goalId: r.goal_id,
    amount: r.amount,
    description: r.notes || '',
    date: r.date,
  }));
}

export async function addGoalContribution(
  contribution: Omit<GoalContribution, 'id'>,
): Promise<string> {
  const db = getDatabase();
  const id = Math.random().toString(36).substring(2, 9);
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    // Insert contribution
    await db.runAsync(
      `INSERT INTO goal_contributions (id, goal_id, amount, date, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [id, contribution.goalId, contribution.amount, contribution.date, contribution.description || null, now],
    );

    // Update goal amount
    const goal = await getGoalById(contribution.goalId);
    if (goal) {
      const newAmount = goal.currentAmount + contribution.amount;
      const newStatus = newAmount >= goal.targetAmount ? 'completed' : 'active';
      await db.runAsync(
        'UPDATE goals SET current_amount = ?, status = ?, updated_at = ? WHERE id = ?;',
        [newAmount, newStatus, now, contribution.goalId],
      );
    }
  });

  return id;
}

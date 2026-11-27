import type { Goal, GoalContribution } from '@/types';
import { getDatabase } from './index';
import { deleteTransaction } from './transaction-dao';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r % 4) + 8;
    return v.toString(16);
  });
}

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
  const id = generateId();
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
  // We can also auto-update status to completed if current >= target, but for now we'll just update amount
  await db.runAsync('UPDATE goals SET current_amount = ? WHERE id = ?;', [newAmount, id]);
}

export async function updateGoal(
  id: string,
  goal: Partial<Pick<Goal, 'name' | 'icon' | 'targetAmount' | 'targetDate' | 'category' | 'currentAmount'>>
): Promise<void> {
  const db = getDatabase();
  const sets: string[] = [];
  const params: any[] = [];

  if (goal.name !== undefined) {
    sets.push('name = ?');
    params.push(goal.name);
  }
  if (goal.icon !== undefined) {
    sets.push('icon = ?');
    params.push(goal.icon);
  }
  if (goal.targetAmount !== undefined) {
    sets.push('target_amount = ?');
    params.push(goal.targetAmount);
  }
  if (goal.currentAmount !== undefined) {
    sets.push('current_amount = ?');
    params.push(goal.currentAmount);
  }
  if (goal.targetDate !== undefined) {
    sets.push('target_date = ?');
    params.push(goal.targetDate);
  }
  if (goal.category !== undefined) {
    sets.push('category = ?');
    params.push(goal.category);
  }

  if (sets.length === 0) return;
  params.push(id);

  await db.runAsync(`UPDATE goals SET ${sets.join(', ')} WHERE id = ?;`, params);
}

export async function deleteGoal(id: string): Promise<void> {
  const db = getDatabase();
  const linkedContributions =
    (await db.getAllAsync<{ transaction_id?: string | null }>(
      'SELECT transaction_id FROM goal_contributions WHERE goal_id = ? AND transaction_id IS NOT NULL;',
      [id]
    )) ?? [];

  for (const row of linkedContributions) {
    if (row.transaction_id) {
      await deleteTransaction(row.transaction_id);
    }
  }

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
    transactionId: r.transaction_id || undefined,
  }));
}

export async function addGoalContribution(
  contribution: Omit<GoalContribution, 'id'>,
  accountId?: string
): Promise<string> {
  const db = getDatabase();
  const id = Math.random().toString(36).substring(2, 9);

  await db.withTransactionAsync(async () => {
    const goal = await getGoalById(contribution.goalId);
    let transId = null;

    // Insert transaction if accountId is provided
    if (accountId && goal) {
      const account = await db.getFirstAsync<any>('SELECT id FROM accounts WHERE id = ?;', [
        accountId,
      ]);
      if (account) {
        transId = Math.random().toString(36).substring(2, 9);
        const nowIso = new Date().toISOString();
        await db.runAsync(
          `INSERT INTO transactions (id, account_id, amount, type, merchant, category, date, is_recurring, note, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            nowIso,
          ]
        );
        await db.runAsync(
          'UPDATE accounts SET balance = ROUND(COALESCE(balance, 0) - ?, 2) WHERE id = ?',
          [contribution.amount, accountId]
        );
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

export async function deleteGoalContribution(contributionId: string): Promise<void> {
  const db = getDatabase();
  const contrib = await db.getFirstAsync<any>(
    'SELECT * FROM goal_contributions WHERE id = ?;',
    [contributionId]
  );
  if (!contrib) return;

  if (contrib.transaction_id) {
    // deleteTransaction atomically reverts the account balance, goal current_amount,
    // goal_contributions row, linked bills, and parsed notification link.
    await deleteTransaction(contrib.transaction_id);
    return;
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE goals SET current_amount = MAX(0, current_amount - ?) WHERE id = ?;',
      [contrib.amount, contrib.goal_id]
    );
    await db.runAsync('DELETE FROM goal_contributions WHERE id = ?;', [contributionId]);
  });
}

import { getDatabase } from './index';
import type { BudgetPlan, BudgetCategory, BucketType } from '@/types';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface BudgetPlanRow {
  id: string;
  monthly_income: number;
  needs_percent: number;
  wants_percent: number;
  savings_percent: number;
  month: number;
  year: number;
}

function mapBudgetPlanRow(row: BudgetPlanRow): BudgetPlan {
  return {
    id: row.id,
    monthlyIncome: row.monthly_income,
    needsPercent: row.needs_percent,
    wantsPercent: row.wants_percent,
    savingsPercent: row.savings_percent,
    month: row.month,
    year: row.year,
  };
}

interface BudgetCategoryRow {
  id: string;
  name: string;
  icon: string;
  budget_limit: number;
  bucket_type: string;
  sort_order: number;
}

function mapBudgetCategoryRow(row: BudgetCategoryRow): BudgetCategory {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    limit: row.budget_limit,
    bucketType: row.bucket_type as BucketType,
    sortOrder: row.sort_order,
  };
}

export async function getCurrentBudgetPlan(): Promise<BudgetPlan | null> {
  const db = getDatabase();
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const row = await db.getFirstAsync<BudgetPlanRow>(
    'SELECT * FROM budget_plans WHERE month = ? AND year = ?',
    [month, year]
  );
  
  if (row) return mapBudgetPlanRow(row);

  // If no plan for this month, see if they had one in previous months to roll forward
  const lastRow = await db.getFirstAsync<BudgetPlanRow>(
    'SELECT * FROM budget_plans ORDER BY year DESC, month DESC LIMIT 1'
  );

  return lastRow ? mapBudgetPlanRow(lastRow) : null;
}

export async function upsertBudgetPlan(data: Omit<BudgetPlan, 'id'>): Promise<BudgetPlan> {
  const db = getDatabase();
  
  const existingRow = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM budget_plans WHERE month = ? AND year = ?',
    [data.month, data.year]
  );

  const id = existingRow ? existingRow.id : generateId();

  await db.runAsync(
    `INSERT INTO budget_plans (id, monthly_income, needs_percent, wants_percent, savings_percent, month, year)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(month, year) DO UPDATE SET 
       monthly_income = excluded.monthly_income,
       needs_percent = excluded.needs_percent,
       wants_percent = excluded.wants_percent,
       savings_percent = excluded.savings_percent`,
    [id, data.monthlyIncome, data.needsPercent, data.wantsPercent, data.savingsPercent, data.month, data.year]
  );

  return { id, ...data };
}

export async function getAllCategories(): Promise<BudgetCategory[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<BudgetCategoryRow>(
    'SELECT * FROM budget_categories ORDER BY bucket_type, sort_order'
  );
  return rows.map(mapBudgetCategoryRow);
}

export async function getCategoriesByBucket(bucket: BucketType): Promise<BudgetCategory[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<BudgetCategoryRow>(
    'SELECT * FROM budget_categories WHERE bucket_type = ? ORDER BY sort_order',
    [bucket]
  );
  return rows.map(mapBudgetCategoryRow);
}

export async function insertCategory(data: Omit<BudgetCategory, 'id'>): Promise<BudgetCategory> {
  const db = getDatabase();
  const id = generateId();

  await db.runAsync(
    `INSERT INTO budget_categories (id, name, icon, budget_limit, bucket_type, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, data.name, data.icon, data.limit, data.bucketType, data.sortOrder]
  );

  return { id, ...data };
}

export async function updateCategory(id: string, data: Partial<BudgetCategory>): Promise<void> {
  const db = getDatabase();
  
  const sets: string[] = [];
  const params: any[] = [];
  
  if (data.name !== undefined) { sets.push('name = ?'); params.push(data.name); }
  if (data.icon !== undefined) { sets.push('icon = ?'); params.push(data.icon); }
  if (data.limit !== undefined) { sets.push('budget_limit = ?'); params.push(data.limit); }
  if (data.bucketType !== undefined) { sets.push('bucket_type = ?'); params.push(data.bucketType); }
  if (data.sortOrder !== undefined) { sets.push('sort_order = ?'); params.push(data.sortOrder); }
  
  if (sets.length === 0) return;
  
  params.push(id);
  
  await db.runAsync(`UPDATE budget_categories SET ${sets.join(', ')} WHERE id = ?`, params);
}

export async function deleteCategory(id: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM budget_categories WHERE id = ?', [id]);
}

export async function getSpentByCategory(month: number, year: number): Promise<Record<string, number>> {
  const db = getDatabase();
  
  const monthStr = month.toString().padStart(2, '0');
  const datePrefix = `${year}-${monthStr}`;

  const rows = await db.getAllAsync<{ category: string, total: number }>(
    `SELECT category, SUM(amount) as total
     FROM transactions
     WHERE type = 'expense' AND date LIKE ?
     GROUP BY category`,
    [`${datePrefix}%`]
  );

  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.category] = row.total;
  }
  
  return result;
}

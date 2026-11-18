import { getDatabase } from './index';

export interface MerchantCategoryRule {
  id: string;
  merchantPattern: string;
  category: string;
  updatedAt: number;
}

interface MerchantRuleRow {
  id: string;
  merchant_pattern: string;
  category: string;
  updated_at: number;
}

/**
 * Fetch all persistent merchant category rules ordered by most recently updated.
 */
export async function getAllMerchantRules(): Promise<MerchantCategoryRule[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<MerchantRuleRow>(
    'SELECT id, merchant_pattern, category, updated_at FROM merchant_category_rules ORDER BY updated_at DESC'
  );

  return rows.map((r) => ({
    id: r.id,
    merchantPattern: r.merchant_pattern,
    category: r.category,
    updatedAt: r.updated_at,
  }));
}

/**
 * Save or update a merchant categorization rule.
 * Patterns are stored in lowercase for fast, case-insensitive substring matching.
 */
export async function saveMerchantRule(
  merchantPattern: string,
  category: string
): Promise<MerchantCategoryRule> {
  const db = getDatabase();
  const cleanPattern = merchantPattern.trim().toLowerCase();
  if (!cleanPattern || !category.trim()) {
    throw new Error('Merchant pattern and category cannot be empty');
  }

  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM merchant_category_rules WHERE merchant_pattern = ?',
    [cleanPattern]
  );

  const id = existing?.id || `rule_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = Date.now();

  await db.runAsync(
    `INSERT INTO merchant_category_rules (id, merchant_pattern, category, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(merchant_pattern) DO UPDATE SET
       category = excluded.category,
       updated_at = excluded.updated_at`,
    [id, cleanPattern, category.trim(), now]
  );

  return {
    id,
    merchantPattern: cleanPattern,
    category: category.trim(),
    updatedAt: now,
  };
}

/**
 * Delete a merchant categorization rule by ID.
 */
export async function deleteMerchantRule(id: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM merchant_category_rules WHERE id = ?', [id]);
}

/**
 * Find the matching category for a given merchant name against saved user rules.
 */
export async function findCategoryForMerchant(merchant: string): Promise<string | null> {
  if (!merchant || !merchant.trim()) return null;
  const db = getDatabase();
  const merchantLower = merchant.trim().toLowerCase();

  // 1. Direct exact or pattern match
  const directMatch = await db.getFirstAsync<{ category: string }>(
    'SELECT category FROM merchant_category_rules WHERE merchant_pattern = ? OR ? LIKE "%" || merchant_pattern || "%" ORDER BY length(merchant_pattern) DESC LIMIT 1',
    [merchantLower, merchantLower]
  );

  return directMatch ? directMatch.category : null;
}

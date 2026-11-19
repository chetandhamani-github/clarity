import { getDatabase } from './index';
import type { SmartRule, RuleCondition, RuleAction, RuleTrigger } from '@/types';

interface SmartRuleRow {
  id: string;
  name: string;
  is_enabled: number;
  trigger_source: string;
  match_type: string;
  conditions_json: string;
  actions_json: string;
  priority: number;
  match_count: number;
  last_matched_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: SmartRuleRow): SmartRule {
  let conditions: RuleCondition[] = [];
  let actions: RuleAction[] = [];

  try {
    conditions = JSON.parse(row.conditions_json);
  } catch {
    conditions = [];
  }

  try {
    actions = JSON.parse(row.actions_json);
  } catch {
    actions = [];
  }

  return {
    id: row.id,
    name: row.name,
    isEnabled: Boolean(row.is_enabled),
    trigger: (row.trigger_source as RuleTrigger) || 'any',
    matchType: row.match_type === 'ANY' ? 'ANY' : 'ALL',
    conditions,
    actions,
    priority: row.priority,
    matchCount: row.match_count,
    lastMatchedAt: row.last_matched_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getAllSmartRules(): Promise<SmartRule[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<SmartRuleRow>(
    'SELECT * FROM smart_rules ORDER BY priority ASC, created_at DESC'
  );
  return rows.map(mapRow);
}

export async function getActiveSmartRules(): Promise<SmartRule[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<SmartRuleRow>(
    'SELECT * FROM smart_rules WHERE is_enabled = 1 ORDER BY priority ASC, created_at DESC'
  );
  return rows.map(mapRow);
}

export async function getSmartRuleById(id: string): Promise<SmartRule | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<SmartRuleRow>(
    'SELECT * FROM smart_rules WHERE id = ?',
    [id]
  );
  return row ? mapRow(row) : null;
}

export async function saveSmartRule(
  rule: Omit<SmartRule, 'id' | 'createdAt' | 'updatedAt' | 'matchCount'> & { id?: string }
): Promise<SmartRule> {
  const db = getDatabase();
  const id = rule.id || `rule_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  // If this is a new rule without explicit priority, assign next highest priority
  let priority = rule.priority ?? 0;
  if (!rule.id) {
    const maxRow = await db.getFirstAsync<{ max_p: number | null }>(
      'SELECT MAX(priority) as max_p FROM smart_rules'
    );
    priority = (maxRow?.max_p ?? -1) + 1;
  }

  await db.runAsync(
    `INSERT INTO smart_rules (
      id, name, is_enabled, trigger_source, match_type,
      conditions_json, actions_json, priority, match_count,
      last_matched_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      is_enabled = excluded.is_enabled,
      trigger_source = excluded.trigger_source,
      match_type = excluded.match_type,
      conditions_json = excluded.conditions_json,
      actions_json = excluded.actions_json,
      priority = excluded.priority,
      updated_at = excluded.updated_at`,
    [
      id,
      rule.name.trim(),
      rule.isEnabled ? 1 : 0,
      rule.trigger,
      rule.matchType,
      JSON.stringify(rule.conditions),
      JSON.stringify(rule.actions),
      priority,
      now,
      now,
    ]
  );

  const saved = await getSmartRuleById(id);
  if (!saved) throw new Error('Failed to save smart rule');
  return saved;
}

export async function toggleSmartRule(id: string, isEnabled: boolean): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE smart_rules SET is_enabled = ?, updated_at = ? WHERE id = ?',
    [isEnabled ? 1 : 0, now, id]
  );
}

export async function deleteSmartRule(id: string): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM smart_rules WHERE id = ?', [id]);
}

export async function incrementRuleMatch(id: string): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE smart_rules SET match_count = match_count + 1, last_matched_at = ?, updated_at = ? WHERE id = ?',
    [now, now, id]
  );
}

export async function updateRulePriorities(orderedIds: string[]): Promise<void> {
  const db = getDatabase();
  const now = new Date().toISOString();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.runAsync(
      'UPDATE smart_rules SET priority = ?, updated_at = ? WHERE id = ?',
      [i, now, orderedIds[i]]
    );
  }
}

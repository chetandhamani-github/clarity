import { getActiveSmartRules, incrementRuleMatch } from '../database/smart-rules-dao';
import { getDatabase } from '../database/index';
import { setTransactionTags, getTagsForTransaction } from '../database/tag-dao';
import type { SmartRule, RuleCondition, RuleTrigger } from '@/types';

export interface EvaluatedRuleResult {
  category?: string;
  note?: string;
  status?: string;
  tagsToAdd: string[];
  appliedRuleIds: string[];
  appliedRuleNames: string[];
}

export function matchesCondition(
  condition: RuleCondition,
  tx: {
    merchant?: string;
    amount?: number;
    category?: string;
    accountId?: string;
    note?: string;
  }
): boolean {
  switch (condition.field) {
    case 'merchant': {
      const merchant = (tx.merchant || '').toLowerCase().trim();
      const val = String(condition.value || '').toLowerCase().trim();
      if (!val) return false;

      if (condition.operator === 'contains') return merchant.includes(val);
      if (condition.operator === 'equals') return merchant === val;
      if (condition.operator === 'starts_with') return merchant.startsWith(val);
      if (condition.operator === 'regex') {
        try {
          return new RegExp(val, 'i').test(tx.merchant || '');
        } catch {
          return false;
        }
      }
      return false;
    }

    case 'amount': {
      const amount = Number(tx.amount || 0);
      const target = Number(condition.value);
      if (isNaN(target)) return false;

      if (condition.operator === 'greater_than') return amount > target;
      if (condition.operator === 'less_than') return amount < target;
      if (condition.operator === 'equals') return amount === target;
      if (condition.operator === 'between') {
        const secondary = Number(condition.secondaryValue);
        if (isNaN(secondary)) return false;
        return amount >= target && amount <= secondary;
      }
      return false;
    }

    case 'category': {
      const category = (tx.category || '').toLowerCase().trim();
      const val = String(condition.value || '').toLowerCase().trim();
      if (!val) return false;

      if (condition.operator === 'equals') return category === val;
      if (condition.operator === 'contains') return category.includes(val);
      return false;
    }

    case 'account_id': {
      return tx.accountId === String(condition.value);
    }

    case 'note': {
      const note = (tx.note || '').toLowerCase().trim();
      const val = String(condition.value || '').toLowerCase().trim();
      if (!val) return false;

      if (condition.operator === 'contains') return note.includes(val);
      if (condition.operator === 'equals') return note === val;
      if (condition.operator === 'regex') {
        try {
          return new RegExp(val, 'i').test(tx.note || '');
        } catch {
          return false;
        }
      }
      return false;
    }

    default:
      return false;
  }
}

export function doesRuleMatch(
  rule: SmartRule,
  tx: {
    merchant?: string;
    amount?: number;
    category?: string;
    accountId?: string;
    note?: string;
    source?: string;
  },
  source: RuleTrigger = 'any'
): boolean {
  if (!rule.isEnabled) return false;

  // Source trigger check
  if (rule.trigger !== 'any') {
    const txSource = (source !== 'any' ? source : (tx.source || 'MANUAL')).toLowerCase();
    if (rule.trigger === 'sms' && txSource !== 'sms') return false;
    if (rule.trigger === 'statement' && txSource !== 'statement') return false;
    if (rule.trigger === 'manual' && txSource !== 'manual') return false;
  }

  if (!rule.conditions || rule.conditions.length === 0) return false;

  if (rule.matchType === 'ANY') {
    return rule.conditions.some((c) => matchesCondition(c, tx));
  } else {
    return rule.conditions.every((c) => matchesCondition(c, tx));
  }
}

/**
 * Evaluates active smart rules on a pending transaction and computes resulting modifications.
 */
export async function evaluateSmartRules(
  tx: {
    merchant: string;
    amount: number;
    category: string;
    accountId: string;
    note?: string;
    source?: string;
  },
  source: RuleTrigger = 'any'
): Promise<EvaluatedRuleResult> {
  const rules = await getActiveSmartRules();
  const tagsToAdd = new Set<string>();
  const appliedRuleIds: string[] = [];
  const appliedRuleNames: string[] = [];

  let currentCategory = tx.category;
  let currentNote = tx.note || '';
  let currentStatus: string | undefined;

  for (const rule of rules) {
    const isMatch = doesRuleMatch(
      rule,
      {
        merchant: tx.merchant,
        amount: tx.amount,
        category: currentCategory,
        accountId: tx.accountId,
        note: currentNote,
        source: tx.source,
      },
      source
    );

    if (isMatch) {
      appliedRuleIds.push(rule.id);
      appliedRuleNames.push(rule.name);

      // Asynchronously record match count & timestamp
      incrementRuleMatch(rule.id).catch(() => {});

      for (const action of rule.actions) {
        if (action.type === 'set_category' && action.value) {
          currentCategory = action.value;
        } else if (action.type === 'add_tag' && action.value) {
          // Normalize tag: ensure starts with '#'
          const tagName = action.value.startsWith('#') ? action.value : `#${action.value}`;
          tagsToAdd.add(tagName);
        } else if (action.type === 'set_note' && action.value) {
          currentNote = action.value;
        } else if (action.type === 'append_note' && action.value) {
          currentNote = currentNote ? `${currentNote} | ${action.value}` : action.value;
        } else if (action.type === 'mark_reviewed') {
          currentStatus = 'VERIFIED';
        }
      }
    }
  }

  return {
    category: currentCategory !== tx.category ? currentCategory : undefined,
    note: currentNote !== (tx.note || '') ? currentNote : undefined,
    status: currentStatus,
    tagsToAdd: Array.from(tagsToAdd),
    appliedRuleIds,
    appliedRuleNames,
  };
}

/**
 * Retroactively applies a rule across all past transactions.
 * Returns the count of affected transactions.
 */
export async function applyRuleToExistingTransactions(rule: SmartRule): Promise<number> {
  const db = getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    merchant: string;
    amount: number;
    category: string;
    account_id: string;
    note: string;
    source: string;
  }>('SELECT id, merchant, amount, category, account_id, note, source FROM transactions');

  let matchCount = 0;

  for (const row of rows) {
    const isMatch = doesRuleMatch(
      rule,
      {
        merchant: row.merchant,
        amount: row.amount,
        category: row.category,
        accountId: row.account_id,
        note: row.note,
        source: row.source,
      },
      'any'
    );

    if (isMatch) {
      matchCount++;
      let updatedCategory = row.category;
      let updatedNote = row.note || '';

      const tagsToAdd: string[] = [];

      for (const action of rule.actions) {
        if (action.type === 'set_category' && action.value) {
          updatedCategory = action.value;
        } else if (action.type === 'add_tag' && action.value) {
          const tagName = action.value.startsWith('#') ? action.value : `#${action.value}`;
          tagsToAdd.push(tagName);
        } else if (action.type === 'set_note' && action.value) {
          updatedNote = action.value;
        } else if (action.type === 'append_note' && action.value) {
          updatedNote = updatedNote ? `${updatedNote} | ${action.value}` : action.value;
        }
      }

      // Update transaction fields
      if (updatedCategory !== row.category || updatedNote !== (row.note || '')) {
        await db.runAsync(
          'UPDATE transactions SET category = ?, note = ? WHERE id = ?',
          [updatedCategory, updatedNote, row.id]
        );
      }

      // Update tags if any
      if (tagsToAdd.length > 0) {
        const currentTxTags = await getTagsForTransaction(row.id);
        const tagNamesSet = new Set(
          currentTxTags.map((t) => t.toLowerCase().replace(/^#/, ''))
        );

        for (const rawTag of tagsToAdd) {
          const cleanTag = rawTag.toLowerCase().replace(/^#/, '').trim();
          if (cleanTag) {
            tagNamesSet.add(cleanTag);
          }
        }

        await setTransactionTags(row.id, Array.from(tagNamesSet));
      }
    }
  }

  return matchCount;
}

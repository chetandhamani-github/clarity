import { LocalCategorizerEngine } from '@/modules/sms/categorizer/localCategorizerEngine';
import { parseVoiceTransactionWithAi } from '@/services/api/ai.api';

export interface ParsedVoiceTransaction {
  merchant: string;
  amount: number;
  category: string;
  accountId?: string;
  type: 'expense' | 'income' | 'transfer';
  note: string;
  source: 'local' | 'ai';
  confidence: number;
}

export interface UserAccountRef {
  id: string;
  name: string;
}

/**
 * Parses conversational voice transcript using hybrid on-device NLP + privacy-safe cloud AI.
 */
export async function parseVoiceTranscript(
  rawTranscript: string,
  userAccounts: UserAccountRef[] = [],
  forceLocalOnly = false
): Promise<ParsedVoiceTransaction> {
  const text = (rawTranscript || '').trim();
  if (!text) {
    return {
      merchant: '',
      amount: 0,
      category: 'General',
      type: 'expense',
      note: '',
      source: 'local',
      confidence: 0,
    };
  }

  // 1. Try on-device local extraction first (0ms, 100% private, works offline)
  const localResult = extractTransactionLocally(text, userAccounts);
  if (localResult && localResult.amount > 0 && localResult.merchant && localResult.confidence >= 0.8) {
    return {
      ...localResult,
      source: 'local',
    };
  }

  // If local parsing produced no clear amount or merchant, and AI is permitted, use AI
  if (!forceLocalOnly) {
    try {
      const sanitizedText = sanitizePrivateIdentifiers(text);
      const aiResult = await parseVoiceTransactionWithAi({
        transcript: sanitizedText,
        availableAccounts: userAccounts.map((a) => a.name),
      });

      if (aiResult && aiResult.amount > 0) {
        // Resolve account ID from account name if returned
        let matchedAccountId: string | undefined = undefined;
        if (aiResult.account) {
          const accLower = aiResult.account.toLowerCase();
          const found = userAccounts.find(
            (a) => a.name.toLowerCase().includes(accLower) || accLower.includes(a.name.toLowerCase())
          );
          if (found) matchedAccountId = found.id;
        }

        return {
          merchant: aiResult.merchant || localResult?.merchant || 'Unknown Merchant',
          amount: aiResult.amount,
          category: aiResult.category || 'General',
          accountId: matchedAccountId || localResult?.accountId,
          type: (aiResult.type as 'expense' | 'income' | 'transfer') || 'expense',
          note: aiResult.note || '',
          source: 'ai',
          confidence: aiResult.confidence || 0.95,
        };
      }
    } catch {
      // Fallback to best local attempt
    }
  }

  return {
    merchant: localResult?.merchant || text.substring(0, 30),
    amount: localResult?.amount || 0,
    category: localResult?.category || 'General',
    accountId: localResult?.accountId,
    type: localResult?.type || 'expense',
    note: text,
    source: 'local',
    confidence: localResult?.confidence || 0.3,
  };
}

/**
 * On-device regex & keyword extractor for instant offline processing.
 */
function extractTransactionLocally(
  text: string,
  userAccounts: UserAccountRef[]
): Omit<ParsedVoiceTransaction, 'source'> | null {
  const lower = text.toLowerCase();

  // 1. Detect Type
  let type: 'expense' | 'income' | 'transfer' = 'expense';
  if (/received|got|credited|salary|refund|earned/i.test(lower)) {
    type = 'income';
  } else if (/transferred|sent to/i.test(lower)) {
    type = 'transfer';
  }

  // 2. Extract Amount
  // Matches "350", "350.50", "rs 350", "350 rupees", "$50", "₹1,200", "₹1,50,000"
  let amount = 0;
  const amountMatch = lower.match(/(?:rs\.?|inr|₹|\$)?\s*([0-9]{1,3}(?:,[0-9]{2,3})+(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)\s*(?:rs\.?|inr|rupees|bucks)?/i);
  if (amountMatch && amountMatch[1]) {
    const parsed = parseFloat(amountMatch[1].replace(/,/g, ''));
    if (!isNaN(parsed) && parsed > 0) {
      amount = parsed;
    }
  }

  // 3. Extract Merchant / Intent
  let merchant = '';
  // Try matching phrases after "at", "for", "to", "on"
  const merchantAtMatch = lower.match(/(?:at|from|to)\s+([a-z0-9\s&'-]+?)(?:\s+(?:with|using|from|by|for|rs|rupees|₹|\$|[0-9]|$))/i);
  const merchantForMatch = lower.match(/(?:for|on)\s+([a-z0-9\s&'-]+?)(?:\s+(?:at|with|using|from|by|rs|rupees|₹|\$|[0-9]|$))/i);

  if (merchantAtMatch && merchantAtMatch[1] && merchantAtMatch[1].trim().length > 2) {
    merchant = cleanExtractedName(merchantAtMatch[1].trim());
  } else if (merchantForMatch && merchantForMatch[1] && merchantForMatch[1].trim().length > 2) {
    merchant = cleanExtractedName(merchantForMatch[1].trim());
  } else {
    // Look for first 2-3 words excluding stopwords
    const cleaned = lower.replace(/(?:paid|spent|bought|rs|rupees|₹|\$|[0-9]+)/gi, '').trim();
    if (cleaned.length > 2) {
      merchant = cleanExtractedName(cleaned.split(/\s+/).slice(0, 3).join(' '));
    }
  }

  // 4. Categorize using LocalCategorizerEngine
  const category = merchant
    ? LocalCategorizerEngine.categorize({
        merchant,
        type: type === 'income' ? 'CREDIT' : 'DEBIT',
      })
    : (type === 'income' ? 'Salary' : 'General');

  // 5. Match Account
  let matchedAccountId: string | undefined = undefined;
  for (const acc of userAccounts) {
    const accWords = acc.name.toLowerCase().split(/\s+/);
    for (const w of accWords) {
      if (w.length > 2 && lower.includes(w)) {
        matchedAccountId = acc.id;
        break;
      }
    }
    if (matchedAccountId) break;
  }

  const confidence = (amount > 0 && merchant.length > 2) ? 0.85 : (amount > 0 ? 0.5 : 0.2);

  return {
    merchant: capitalizeWords(merchant || 'General Expense'),
    amount,
    category,
    accountId: matchedAccountId,
    type,
    note: '',
    confidence,
  };
}

function cleanExtractedName(raw: string): string {
  return raw
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/\s+(credit|debit|card|account|bank|wallet)$/i, '')
    .trim();
}

function capitalizeWords(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Masks 10-digit phone numbers and email addresses on-device before external processing.
 */
function sanitizePrivateIdentifiers(str: string): string {
  return str
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]')
    .replace(/\b(?:\+?\d{1,3}[-.\s]?)?\d{10}\b/g, '[phone]');
}

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
  lastFour?: string;
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
        let matchedAccountId: string | undefined;
        if (aiResult.account) {
          matchedAccountId = matchAccountFromText(aiResult.account.toLowerCase(), userAccounts);
          if (!matchedAccountId) {
            const accLower = aiResult.account.toLowerCase();
            const found = userAccounts.find(
              (a) => a.name.toLowerCase().includes(accLower) || accLower.includes(a.name.toLowerCase())
            );
            if (found) matchedAccountId = found.id;
          }
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

const GENERIC_ACCOUNT_WORDS = new Set([
  'bank',
  'account',
  'acc',
  'savings',
  'salary',
  'current',
  'card',
  'wallet',
  'credit',
  'debit',
  'my',
  'the',
  'of',
  'and',
  'for',
  'in',
  'to',
  'from',
  'with',
  'by',
  'at',
  'on',
  'a',
  'an',
]);

/**
 * Robustly matches an account from conversational speech using scoring, word boundaries, and digit detection.
 */
export function matchAccountFromText(
  lowerText: string,
  userAccounts: UserAccountRef[]
): string | undefined {
  if (!userAccounts || userAccounts.length === 0) return undefined;

  let bestAccountId: string | undefined;
  let bestScore = 0;

  for (const acc of userAccounts) {
    const rawName = acc.name.toLowerCase().trim();
    if (!rawName) continue;

    let score = 0;

    // 0. Last four digits match (e.g. "ending in 4242", "card 4242", "4242")
    if (acc.lastFour && acc.lastFour.trim().length === 4) {
      const escapedLastFour = acc.lastFour.trim();
      if (new RegExp(`\\b${escapedLastFour}\\b`).test(lowerText)) {
        score += 150;
      }
    }

    // 1. Full name exact word boundary match (e.g. "hdfc bank")
    const escapedFullName = rawName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escapedFullName}\\b`, 'i').test(lowerText)) {
      score += 100;
    }

    // 2. Tokenize account name and extract distinctive words
    const words = rawName.split(/\s+/).filter((w) => w.length > 0);
    const distinctiveWords = words.filter((w) => !GENERIC_ACCOUNT_WORDS.has(w));
    const targetWords = distinctiveWords.length > 0 ? distinctiveWords : words;

    let distinctiveMatches = 0;
    for (const word of targetWords) {
      if (word.length < 2) continue;
      const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Preposition match (e.g. "in/into/to/from/with/using/via/through/by/se/me SBI")
      const prepRegex = new RegExp(
        `(?:\\b(?:in|into|to|from|with|using|via|through|by|on|se|me|mein|pe)\\s+(?:my\\s+)?(?:the\\s+)?)${escapedWord}\\b`,
        'i'
      );
      // Postposition match (e.g. "SBI se", "HDFC me", "ICICI mein")
      const postRegex = new RegExp(
        `\\b${escapedWord}\\s+(?:se|me|mein|pe|card|bank|account)\\b`,
        'i'
      );

      if (prepRegex.test(lowerText) || postRegex.test(lowerText)) {
        score += 80;
        distinctiveMatches++;
      } else if (new RegExp(`\\b${escapedWord}\\b`, 'i').test(lowerText)) {
        score += 40;
        distinctiveMatches++;
      }
    }

    // Bonus if all target words matched
    if (distinctiveMatches === targetWords.length && targetWords.length > 0) {
      score += 30;
    }

    if (score > bestScore) {
      bestScore = score;
      bestAccountId = acc.id;
    }
  }

  return bestScore > 0 ? bestAccountId : undefined;
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
  if (/(?:income|received|got|credited|salary|refund|earned|deposit|cashback|dividend|freelance|aayi|aaya|mila|mili)/i.test(lower)) {
    type = 'income';
  } else if (/transferred|sent to/i.test(lower)) {
    type = 'transfer';
  }

  // 2. Extract Amount
  // First try explicitly currency-tagged or payment-verb-anchored amounts (so "HDFC 4242 paid 500" picks 500, not 4242).
  let amount = 0;
  const numPattern = '([0-9]{1,3}(?:,[0-9]{2,3})+(?:\\.[0-9]{1,2})?|[0-9]+(?:\\.[0-9]{1,2})?)';
  const currencyPrefixRegex = new RegExp(`(?:rs\\.?|inr|₹|\\$)\\s*${numPattern}`, 'i');
  const currencySuffixRegex = new RegExp(`${numPattern}\\s*(?:rs\\.?|inr|rupees|bucks)\\b`, 'i');
  const strippedAccountRefs = lower.replace(
    /\b(?:hdfc|sbi|icici|axis|kotak|idfc|indusind|yes|bob|pnb|canara|card|account|acct|a\/c|xx+|ending|last)\s*(?:no\.?\s*)?\d{4}\b/gi,
    ' '
  );

  const amountMatch =
    lower.match(currencyPrefixRegex) ||
    lower.match(currencySuffixRegex) ||
    strippedAccountRefs.match(new RegExp(numPattern, 'i')) ||
    lower.match(
      new RegExp(`(?:rs\\.?|inr|₹|\\$)?\\s*${numPattern}\\s*(?:rs\\.?|inr|rupees|bucks)?`, 'i')
    );

  if (amountMatch && amountMatch[1]) {
    const parsed = parseFloat(amountMatch[1].replace(/,/g, ''));
    if (!isNaN(parsed) && parsed > 0) {
      amount = parsed;
    }
  }

  // 3. Match Account first so we don't accidentally treat account name as merchant
  const matchedAccountId = matchAccountFromText(lower, userAccounts);
  const matchedAccount = userAccounts.find((a) => a.id === matchedAccountId);

  // 4. Extract Merchant / Intent
  let merchant = '';
  // Try matching phrases after "at", "for", "to", "on"
  const merchantAtMatch = lower.match(/(?:at|from|to)\s+([a-z0-9\s&'-]+?)(?:\s+(?:with|using|from|by|for|in|into|via|through|se|me|mein|rs|rupees|₹|\$|[0-9]|$))/i);
  const merchantForMatch = lower.match(/(?:for|on)\s+([a-z0-9\s&'-]+?)(?:\s+(?:at|with|using|from|by|in|into|via|through|se|me|mein|rs|rupees|₹|\$|[0-9]|$))/i);

  if (merchantAtMatch && merchantAtMatch[1] && merchantAtMatch[1].trim().length > 2) {
    merchant = cleanExtractedName(merchantAtMatch[1].trim());
  } else if (merchantForMatch && merchantForMatch[1] && merchantForMatch[1].trim().length > 2) {
    merchant = cleanExtractedName(merchantForMatch[1].trim());
  } else {
    // Look for first 2-3 words excluding stopwords
    const cleaned = lower.replace(/(?:paid|spent|bought|income|expense|rs|rupees|₹|\$|[0-9]+)/gi, '').trim();
    if (cleaned.length > 2) {
      merchant = cleanExtractedName(cleaned.split(/\s+/).slice(0, 3).join(' '));
    }
  }

  // If merchant matched an account name or is invalid for income, sanitize it
  if (matchedAccount) {
    const accNameLower = matchedAccount.name.toLowerCase();
    if (merchant && (accNameLower.includes(merchant.toLowerCase()) || merchant.toLowerCase().includes(accNameLower))) {
      merchant = '';
    }
  }

  if (!merchant) {
    if (type === 'income') {
      merchant = lower.includes('salary') ? 'Salary' : 'Income';
    } else {
      merchant = 'General Expense';
    }
  }

  // 5. Categorize using LocalCategorizerEngine
  const category = merchant
    ? LocalCategorizerEngine.categorize({
        merchant,
        type: type === 'income' ? 'CREDIT' : 'DEBIT',
      })
    : (type === 'income' ? 'Salary' : 'Other');

  const confidence = (amount > 0 && merchant.length > 2) ? (matchedAccountId ? 0.9 : 0.85) : (amount > 0 ? 0.5 : 0.2);

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

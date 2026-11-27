import { TransactionExtractor } from '@/modules/sms/extractor/transactionExtractor';
import type {
  ClassificationResult,
  ExtractedTransaction,
  TransactionDirection,
} from '@/modules/sms/types';
import { getTargetAppConfig } from '../constants';
import type { RawNotificationPayload } from '../types';

const GENERIC_TITLE_REGEX =
  /(?:₹|rs\.?|inr|\$|€|£|\bpaid\b|\breceived\b|\bdebited\b|\bcredited\b|\btransaction\b|\bpayment\b|\balert\b|\bnotification\b|\bbill\b|\botp\b|\breminder\b|\bstatement\b|\bsuccess(?:ful)?\b|\bfailed\b|\bdeclined\b|\baccount\b|\ba\/?c\b)/i;

const ACTION_ONLY_TEXT_REGEX =
  /^(?:you\s+)?(?:paid|sent|received)\s+(?:you\s+)?(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d{1,2})?(?:\s|$)/i;

const INCOMING_YOU_REGEX = /^(?:paid|sent|transferred)\s+you\b|^you\s+received\b/i;

const NOTIFICATION_NOISE_PATTERNS: RegExp[] = [
  /\b(?:scratch\s*card|spin\s+and\s+win|better\s+luck\s+next\s+time|refer\s+and\s+earn|invite\s+friends)\b/i,
  /\b(?:upi\s*pin\s*(?:set|changed|reset)|upi\s*lite\s*(?:activated|enabled)|logged\s*in|login\s*alert)\b/i,
  /\b(?:rate\s+your\s+experience|share\s+feedback|complete\s+your\s+kyc)\b/i,
  /\b(?:pay\s+(?:₹|rs\.?|inr)?\s*[\d,]+(?:\.\d{1,2})?\s+more\s+to\s+unlock|unlock\s+(?:cashback|reward|offer))\b/i,
];

const EXECUTED_PAYMENT_REGEX =
  /\b(?:upi\s+)?payment\s+(?:of\s+[\s\S]{0,40}?)?(?:is\s+|was\s+)?(?:successful|completed|done|processed)\b/i;

const BANK_KEYWORD_RULES: Array<{ pattern: RegExp; canonical: string }> = [
  { pattern: /\bhdfc\b/i, canonical: 'HDFC Bank' },
  { pattern: /\bicici\b/i, canonical: 'ICICI Bank' },
  { pattern: /\b(?:sbi|state\s+bank(?:\s+of\s+india)?)\b/i, canonical: 'State Bank of India' },
  { pattern: /\baxis\b/i, canonical: 'Axis Bank' },
  { pattern: /\bkotak(?:\s+mahindra)?\b/i, canonical: 'Kotak Mahindra Bank' },
  { pattern: /\bidfc(?:\s+first)?\b/i, canonical: 'IDFC FIRST Bank' },
  { pattern: /\b(?:au\s+small(?:\s+finance)?|au\s+bank|aubank|ausfb)\b/i, canonical: 'AU Small Finance Bank' },
  { pattern: /\b(?:federal(?:\s+bank)?|scapia)\b/i, canonical: 'Federal Bank' },
  { pattern: /\bindusind\b/i, canonical: 'IndusInd Bank' },
  { pattern: /\bcanara\b/i, canonical: 'Canara Bank' },
  { pattern: /\b(?:bank\s+of\s+baroda|baroda|bobcard|bob)\b/i, canonical: 'Bank of Baroda' },
  { pattern: /\b(?:pnb|punjab\s+national)\b/i, canonical: 'Punjab National Bank' },
  { pattern: /\b(?:bank\s+of\s+india|boi)\b/i, canonical: 'Bank of India' },
  { pattern: /\b(?:union\s+bank(?:\s+of\s+india)?|ubi)\b/i, canonical: 'Union Bank of India' },
  { pattern: /\b(?:central\s+bank(?:\s+of\s+india)?|cbi)\b/i, canonical: 'Central Bank of India' },
  { pattern: /\b(?:indian\s+overseas(?:\s+bank)?|iob)\b/i, canonical: 'Indian Overseas Bank' },
  { pattern: /\bindian\s+bank\b/i, canonical: 'Indian Bank' },
  { pattern: /\b(?:bank\s+of\s+maharashtra|mahabank)\b/i, canonical: 'Bank of Maharashtra' },
  { pattern: /\bidbi\b/i, canonical: 'IDBI Bank' },
  { pattern: /\buco(?:\s+bank)?\b/i, canonical: 'UCO Bank' },
  { pattern: /\byes\s*bank\b/i, canonical: 'YES Bank' },
  { pattern: /\brbl\b/i, canonical: 'RBL Bank' },
  { pattern: /\b(?:standard\s+chartered|scb)\b/i, canonical: 'Standard Chartered Bank' },
  { pattern: /\b(?:citibank|citi)\b/i, canonical: 'Citibank' },
  { pattern: /\bhsbc\b/i, canonical: 'HSBC Bank' },
  { pattern: /\bdbs\b/i, canonical: 'DBS Bank' },
  { pattern: /\bbandhan\b/i, canonical: 'Bandhan Bank' },
  { pattern: /\b(?:karur\s+vysya|kvb)\b/i, canonical: 'Karur Vysya Bank' },
  { pattern: /\bcsb(?:\s+bank)?\b/i, canonical: 'CSB Bank' },
  { pattern: /\bsouth\s+indian(?:\s+bank)?\b/i, canonical: 'South Indian Bank' },
  { pattern: /\b(?:jana\s+small|jsfb)\b/i, canonical: 'Jana Small Finance Bank' },
  { pattern: /\besaf\b/i, canonical: 'ESAF Small Finance Bank' },
  { pattern: /\bequitas\b/i, canonical: 'Equitas Small Finance Bank' },
  { pattern: /\bujjivan\b/i, canonical: 'Ujjivan Small Finance Bank' },
  { pattern: /\bpaytm\s+payments\s+bank\b/i, canonical: 'Paytm Payments Bank' },
  { pattern: /\bairtel\s+payments\s+bank\b/i, canonical: 'Airtel Payments Bank' },
  { pattern: /\bindia\s+post\s+payments\s+bank\b/i, canonical: 'India Post Payments Bank' },
  { pattern: /\bjio\s+payments\s+bank\b/i, canonical: 'Jio Payments Bank' },
  { pattern: /\bone\s*card\b|\bonecard\b/i, canonical: 'OneCard' },
  { pattern: /\b(?:amex|american\s+express)\b/i, canonical: 'American Express' },
  { pattern: /\bjupiter\b/i, canonical: 'Jupiter Money' },
  { pattern: /\bfi\s*money\b/i, canonical: 'Fi Money' },
  { pattern: /\bslice\b/i, canonical: 'Slice' },
];

const SOURCE_BANK_SPAN_REGEX =
  /\b(?:debited\s+from|deducted\s+from|withdrawn\s+from|paid\s+from|sent\s+from|transferred\s+from|drawn\s+on|charged\s+(?:to|on)|spent\s+on|used\s+on|completed\s+(?:via|using)|paid\s+(?:via|using)|via|using|from|credited\s+to|deposited\s+(?:in|to)|transferred\s+to\s+your|remitted\s+to\s+your|refunded\s+to)\s+(?:your\s+)?([^\n.;|]{1,60})/gi;

const OWN_ACCOUNT_BANK_SPAN_REGEX =
  /(?:^|\n|[.,;|]\s*|\byour\s+)([A-Za-z][A-Za-z0-9\s&.-]{1,40}?)\s*(?:a\/?c|acct?\.?|account|credit\s*card|debit\s*card|card|upi|:|-)/gi;

const PAYEE_OR_ACTION_SPAN_REGEX =
  /\b(?:to|towards|for|at|by|paid|sent|received|transferred)\b/i;

const PAYEE_CLAUSE_SPLIT_REGEX = /\b(?:to|towards|at|for|against)\b/i;

const SOURCE_MASK_CONTEXT_REGEX =
  /(?:debited\s+from|deducted\s+from|withdrawn\s+from|paid\s+from|drawn\s+on|charged\s+(?:to|on)|spent\s+on|using|via|from|credited\s+to(?:\s+your)?|deposited\s+(?:in|to)(?:\s+your)?|transferred\s+to\s+your|remitted\s+to\s+your|refunded\s+to(?:\s+your)?)\s+(?:your\s+)?(?:[A-Za-z]+\s+){0,4}?(?:a\/?c|acct?\.?|account|credit\s*card|debit\s*card|card)\s*(?:no\.?|number)?\s*(?:ending(?:\s+(?:with|in))?)?\s*(?:[:#-]\s*|(?:\.{2,}\s*)|\s+)([xX*•#-]*\d{3,18})\b/gi;

const BANK_SEPARATOR_MASK_REGEX =
  /\b(?:debited\s+from|deducted\s+from|paid\s+from|completed\s+(?:via|using)|paid\s+(?:via|using)|via|using|from|credited\s+to(?:\s+your)?)\s+(?:your\s+)?([A-Za-z][A-Za-z\s]{1,30}?)\s*(?:-\s*|:\s*|\.{2,}\s*|[xX*•]+\s*)(\d{3,4})\b/gi;

const GENERIC_ACCOUNT_MERCHANT_REGEX =
  /^(?:your\s+)?(?:a\/?c|acct?\.?|account|card|bank(?:\s+account)?)(?:\s+(?:no\.?|number|ending(?:\s+(?:with|in))?)?\s*[xX*•#.-]*\d*)?$/i;

const ACCOUNT_PREFIX_MASK_REGEX =
  /(?:a\/?c(?:count)?|acct?\.?|account|card)\s*(?:no\.?|number)?\s*(?:ending(?:\s+(?:with|in))?)?\s*(?:[:#-]\s*|(?:\.{2,}\s*)|\s+)([xX*•#-]*\d{3,18})\b/gi;

const ENDING_MASK_REGEX =
  /\bending(?:\s+(?:with|in))?\s*(?:[:#-]\s*|\s+)([xX*•#-]*\d{3,4})\b/gi;

const GENERIC_MASKED_DIGITS_REGEX = /(?:[xX*•]{2,}\s*)+(\d{3,4})\b/gi;

export function matchCanonicalBankName(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  for (const rule of BANK_KEYWORD_RULES) {
    if (rule.pattern.test(trimmed)) {
      return rule.canonical;
    }
  }
  return null;
}

function isLikelyCounterpartyTitle(
  title: string,
  appName?: string,
  packageName?: string
): boolean {
  const appConfig = getTargetAppConfig(packageName);
  if (appConfig?.appRole === 'bank') return false;

  const clean = title.trim();
  if (clean.length < 2 || clean.length > 60) return false;
  if (appName && clean.toLowerCase() === appName.trim().toLowerCase()) return false;
  if (GENERIC_TITLE_REGEX.test(clean)) return false;
  if (/^\d+$/.test(clean)) return false;
  return true;
}

function appendUniquePart(parts: string[], candidate: string, appName?: string): void {
  const clean = candidate.trim();
  if (!clean) return;
  if (appName && clean.toLowerCase() === appName.trim().toLowerCase()) return;

  const lower = clean.toLowerCase();
  const alreadyPresent = parts.some((existing) => existing.toLowerCase().includes(lower));
  if (!alreadyPresent) {
    parts.push(clean);
  }
}

export function buildNotificationBody(notification: RawNotificationPayload): string {
  const title = (notification.title || '').trim();
  const text = (notification.text || '').trim();
  const bigText = (notification.bigText || '').trim();
  const subText = (notification.subText || '').trim();
  const primaryText = bigText.length >= text.length ? bigText : text;

  // Handle common UPI notification pattern where title is counterparty name ("Chai Point")
  // and text omits "to/from" ("You paid ₹450" or "Paid you ₹500").
  if (
    title &&
    primaryText &&
    isLikelyCounterpartyTitle(title, notification.appName, notification.packageName) &&
    ACTION_ONLY_TEXT_REGEX.test(primaryText) &&
    !/\b(?:to|from|at|towards)\b/i.test(primaryText)
  ) {
    const isIncoming = INCOMING_YOU_REGEX.test(primaryText);
    const enrichedLine = isIncoming
      ? `${primaryText} from ${title}`
      : `${primaryText} to ${title}`;
    const parts = [enrichedLine];
    const secondary = bigText.length >= text.length ? text : bigText;
    appendUniquePart(parts, secondary, notification.appName);
    appendUniquePart(parts, subText, notification.appName);
    return parts.join('\n').trim();
  }

  const parts: string[] = [];
  if (title) parts.push(title);
  if (text && !parts.includes(text)) parts.push(text);
  if (bigText && !parts.includes(bigText)) parts.push(bigText);
  appendUniquePart(parts, subText, notification.appName);
  return parts.join('\n').trim();
}

function isValidAccountMaskCandidate(
  rawMatch: string,
  digits: string,
  beforeText: string,
  afterText: string
): boolean {
  if (digits.length < 3 || digits.length > 18) return false;

  // Reject amounts or currency values (e.g., "Rs. 500.00" or "500/-")
  if (/(?:₹|rs\.?|inr|usd|eur|gbp|\$|€|£|amt\.?|amount)\s*$/i.test(beforeText)) {
    return false;
  }
  if (/^\.\d{1,2}\b/.test(afterText) || /^\s*(?:\/-|rs\.?|inr|₹)\b/i.test(afterText)) {
    return false;
  }

  // Reject phone numbers, UPI handles, or transaction reference IDs
  if (/\b(?:mob(?:ile)?|phone|ph|tel|call|ref|utr|rrn|txn|order|id)\s*[:#-]*\s*$/i.test(beforeText)) {
    return false;
  }
  if (/\+\d{1,3}\s*$/.test(beforeText)) return false;
  if (/^@/.test(afterText)) return false;
  if (digits.length >= 10 && !/[xX*•]/.test(rawMatch)) {
    // Unmasked 10+ digit number could still be a full bank account number if prefixed with A/c,
    // which is allowed when digits.length >= 11; 10 digits starting with 6-9 is usually a phone.
    if (digits.length === 10 && /^[6-9]/.test(digits)) {
      return false;
    }
  }

  return true;
}

function formatMaskDigits(digits: string): string {
  return digits.length > 4 ? digits.slice(-4) : digits;
}

export class NotificationExtractor {
  public static isPushNoise(body: string): boolean {
    return NOTIFICATION_NOISE_PATTERNS.some((pattern) => pattern.test(body));
  }

  public static isExecutedPaymentAlert(body: string): boolean {
    return EXECUTED_PAYMENT_REGEX.test(body);
  }

  /**
   * Context-aware bank resolution that prevents payee/merchant bank names
   * (e.g. "Paid to HDFC Bank Credit Card") from overriding the funding account bank.
   */
  public static resolveBank(notification: RawNotificationPayload, body: string): string {
    // 1. Source/own-account preposition phrases ("via HDFC Bank XX1234", "from SBI A/c XX5678")
    for (const match of body.matchAll(SOURCE_BANK_SPAN_REGEX)) {
      const full = match[0];
      const span = match[1];
      if (!span) continue;

      // Ignore "from <person>" unless "from" was preceded by a debit verb or contains account/card cues
      const isPlainFrom = /^from\b/i.test(full);
      const hasAccountCue = /\b(?:a\/?c|acct?\.?|account|card|bank|upi|xx|\*+\d)\b/i.test(span);
      if (isPlainFrom && !hasAccountCue) {
        continue;
      }

      const sourceOnlySpan = span.split(PAYEE_CLAUSE_SPLIT_REGEX)[0] ?? span;
      const bank = matchCanonicalBankName(sourceOnlySpan);
      if (bank) return bank;
    }

    // 2. Direct account/card ownership prefix ("HDFC Bank: ...", "Your ICICI Credit Card...")
    for (const match of body.matchAll(OWN_ACCOUNT_BANK_SPAN_REGEX)) {
      const span = match[1];
      if (!span) continue;
      if (PAYEE_OR_ACTION_SPAN_REGEX.test(span)) continue;
      const bank = matchCanonicalBankName(span);
      if (bank) return bank;
    }

    // 3. Package-level resolution from known banking/hybrid apps
    const appConfig = getTargetAppConfig(notification.packageName);
    if (appConfig) {
      if (appConfig.appRole === 'bank' && appConfig.institution) {
        return appConfig.institution;
      }
      if (appConfig.appRole === 'hybrid' && appConfig.institution) {
        return appConfig.institution;
      }
      // For pure UPI aggregators (Google Pay, PhonePe, Paytm, CRED, BHIM, Amazon Pay, etc.),
      // only resolve a wallet/bank if the body explicitly mentions their own wallet/payments bank.
      if (notification.packageName === 'net.one97.paytm' && /\bpaytm\s+wallet\b/i.test(body)) {
        return 'Paytm Wallet';
      }
      if (
        notification.packageName === 'in.amazon.mShop.android.shopping' &&
        /\bamazon\s+pay\s+(?:balance|wallet)\b/i.test(body)
      ) {
        return 'Amazon Pay Wallet';
      }
      return 'Bank / UPI';
    }

    // 4. Fallback when packageName is unknown (e.g., unit tests or custom bank app)
    const appBank = matchCanonicalBankName(notification.appName || '');
    if (appBank) return appBank;

    return 'Bank / UPI';
  }

  /**
   * Extract source account/card last digits while ignoring amounts, phone masks, and destination cards.
   */
  public static extractAccountMask(body: string): string | null {
    // 1. Prioritize explicit source/own-account context
    for (const match of body.matchAll(SOURCE_MASK_CONTEXT_REGEX)) {
      if (match.index === undefined || !match[1]) continue;
      const fullSpan = match[0];
      //Strip leading preposition ("credited to", "charged to", "from", etc.) before checking payee words
      const innerSpan = fullSpan.replace(
        /^(?:debited\s+from|deducted\s+from|withdrawn\s+from|paid\s+from|drawn\s+on|charged\s+(?:to|on)|spent\s+on|using|via|from|credited\s+to|deposited\s+(?:in|to)|transferred\s+to(?:\s+your)?|remitted\s+to(?:\s+your)?|refunded\s+to(?:\s+your)?)\s+/i,
        ''
      );
      if (/\b(?:to|towards|for|at|against)\b/i.test(innerSpan)) {
        continue;
      }
      const digits = match[1].replace(/[^0-9]/g, '');
      const beforeText = body.slice(Math.max(0, match.index - 20), match.index);
      const afterText = body.slice(match.index + match[0].length, match.index + match[0].length + 12);
      if (isValidAccountMaskCandidate(match[1], digits, beforeText, afterText)) {
        return formatMaskDigits(digits);
      }
    }

    // 1.5 Source bank + separator + digits without "A/c" keyword (e.g. "via HDFC Bank - 1234", "from SBI ••5678")
    for (const match of body.matchAll(BANK_SEPARATOR_MASK_REGEX)) {
      if (match.index === undefined || !match[1] || !match[2]) continue;
      const bankPhrase = match[1];
      if (/\b(?:to|towards|for|at|against)\b/i.test(bankPhrase)) continue;
      if (!matchCanonicalBankName(bankPhrase)) continue;
      const digits = match[2].replace(/[^0-9]/g, '');
      const beforeText = body.slice(Math.max(0, match.index - 20), match.index);
      const afterText = body.slice(match.index + match[0].length, match.index + match[0].length + 12);
      if (isValidAccountMaskCandidate(match[2], digits, beforeText, afterText)) {
        return formatMaskDigits(digits);
      }
    }

    // If the message names an unmasked source account ("from your bank A/c") alongside a destination
    // card/account ("towards Credit Card ending 5678"), do not steal the destination mask.
    const hasUnmaskedSource =
      /\b(?:from|debited\s+from|paid\s+from|deducted\s+from)\s+(?:your\s+)?(?:[A-Za-z]+\s+){0,3}?(?:a\/?c|acct?\.?|account)\b(?!\s*(?:no\.?|number)?\s*(?:[:#-]\s*|(?:\.{2,}\s*)|\s+)[xX*•#-]*\d{3,})/i.test(
        body
      );

    // 2. Standard account/card mask prefixes
    const fallbackRegexes = [ACCOUNT_PREFIX_MASK_REGEX, ENDING_MASK_REGEX, GENERIC_MASKED_DIGITS_REGEX];
    for (const regex of fallbackRegexes) {
      for (const match of body.matchAll(regex)) {
        if (match.index === undefined || !match[1]) continue;
        const prefixWindow = body.slice(Math.max(0, match.index - 65), match.index);
        const clausePrefix = prefixWindow.split(/[\n.;|]/).pop() ?? prefixWindow;
        const payeeMatch = clausePrefix.match(/\b(?:to|towards|beneficiary|payee)\b(.*)$/i);
        if (
          payeeMatch &&
          !/\b(?:from|via|using|debited\s+from|paid\s+from|on)\b/i.test(payeeMatch[1] || '')
        ) {
          continue;
        }
        if (hasUnmaskedSource && /\b(?:to|towards|for)\b[\s\S]{0,60}$/i.test(clausePrefix)) {
          continue;
        }
        const digits = match[1].replace(/[^0-9]/g, '');
        const afterText = body.slice(match.index + match[0].length, match.index + match[0].length + 12);
        if (isValidAccountMaskCandidate(match[1], digits, prefixWindow, afterText)) {
          return formatMaskDigits(digits);
        }
      }
    }

    return null;
  }

  /**
   * Determine whether the transaction was charged to a credit card rather than debited from a bank account.
   */
  public static isCreditCard(body: string, bank?: string): boolean {
    if (bank && /\b(?:credit\s*card|onecard)\b/i.test(bank)) {
      return true;
    }

    // Explicit debit/ATM card transactions belong to savings/current accounts
    if (
      /\b(?:debit\s*card|atm\s*card|prepaid\s*card)\b/i.test(body) &&
      !/\bcredit\s*card\b/i.test(body)
    ) {
      return false;
    }

    // Bank account debit paying off a credit card bill is a bank-account debit, not a credit card spend
    if (
      /\b(?:from|debited\s+from|paid\s+from)\s+(?:your\s+)?(?:[A-Za-z]+\s+){0,3}?(?:a\/?c|acct?\.?|account)\b[\s\S]{0,80}?\b(?:to|towards|for)\s+[\s\S]{0,40}?\b(?:credit\s*card|card)\b/i.test(
        body
      )
    ) {
      return false;
    }

    // Paying towards a credit card via UPI without naming a credit card as source
    if (
      /\b(?:paid|sent|transferred)\s+[\s\S]{0,30}?\b(?:to|towards|for)\s+[\s\S]{0,40}?\b(?:credit\s*card|sbi\s+card|hdfc\s+card|icici\s+card|axis\s+card|kotak\s+card)\b/i.test(
        body
      ) &&
      !/\b(?:spent\s+on|charged\s+to|used\s+on|avl\s*lmt|avail(?:able)?\s*limit|credit\s*limit)\b/i.test(
        body
      )
    ) {
      return false;
    }

    return (
      /\b(?:credit\s*card|creditcard|credit\s*a\/?c|c-card|cardmember|onecard|bobcard|scapia)\b/i.test(
        body
      ) ||
      /\b(?:avl\s*lmt|avail(?:able)?\s*(?:credit\s*)?limit|credit\s*limit|bal(?:ance)?\s*limit|total\s*limit|total\s*due|min\s*due|total\s*outstanding)\b/i.test(
        body
      ) ||
      /\b(?:sbi|hdfc|icici|axis|kotak|rbl|idfc|bob|indusind|federal|citi|scb|au|one)\s+card\b/i.test(
        body
      ) ||
      /\bcard\s+(?:ending(?:\s+(?:with|in))?\s*)?[xX*•#-]*\d{3,4}\b/i.test(body)
    );
  }

  /**
   * Extract a normalized transaction from a raw Android notification payload.
   */
  public static extract(
    notification: RawNotificationPayload,
    body: string,
    classification?: ClassificationResult
  ): ExtractedTransaction | null {
    if (classification?.classification === 'PRE_DEBIT_NOTIFICATION' || this.isPushNoise(body)) {
      return null;
    }

    const isFutureDebitAlert =
      /\b(?:will\s+be|is\s+scheduled\s+to\s+be|scheduled\s+for|is\s+set\s+to\s+be)\s+(?:debited|deducted|auto[- ]debited)\b/i.test(
        body
      ) || /\bpre[- ]debit\s+notification\b/i.test(body);
    if (isFutureDebitAlert) {
      return null;
    }

    const amount = TransactionExtractor.extractAmount(body);
    if (!amount) {
      return null;
    }

    let direction: TransactionDirection | null = TransactionExtractor.extractDirection(body);
    if (!direction && EXECUTED_PAYMENT_REGEX.test(body)) {
      direction = 'DEBIT';
    }
    if (!direction && classification) {
      if (
        classification.classification === 'TRANSACTION_DEBIT' ||
        classification.classification === 'ATM_WITHDRAWAL' ||
        classification.classification === 'EMI' ||
        classification.classification === 'SUBSCRIPTION' ||
        classification.classification === 'BILL'
      ) {
        direction = 'DEBIT';
      } else if (classification.classification === 'SALARY_CREDIT') {
        direction = 'CREDIT';
      }
    }

    if (!direction) {
      return null;
    }

    const bank = this.resolveBank(notification, body);
    const accountMask = this.extractAccountMask(body) || 'XXXX';
    const referenceNumber = TransactionExtractor.extractReferenceNumber(body) || undefined;
    const isCard = this.isCreditCard(body, bank);
    const availableBalance = !isCard
      ? (TransactionExtractor.extractAvailableBalance(body) ?? undefined)
      : undefined;
    const rawMerchant = TransactionExtractor.extractMerchant(body, bank)
      .replace(/\s+(?:was\s+|is\s+)?(?:successful|completed|done|processed)$/i, '')
      .trim();
    const merchant = GENERIC_ACCOUNT_MERCHANT_REGEX.test(rawMerchant) ? '' : rawMerchant;

    return {
      amount,
      type: direction,
      merchant,
      bank,
      accountMask,
      referenceNumber,
      availableBalance,
      timestamp: notification.postTime || Date.now(),
    };
  }
}

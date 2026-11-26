import { getLocalTodayYmd } from '@/utils/date';

export interface ParsedPaymentIntent {
  amount: number;
  merchant: string;
  upiRef?: string;
  category?: string;
  dateStr: string;
  rawText: string;
  contentHash: string;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `clip_${Math.abs(hash)}`;
}

/**
 * Parses clipboard text to detect if the user recently copied a UPI or banking payment confirmation.
 */
export function parsePaymentClipboard(text: string): ParsedPaymentIntent | null {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed.length < 5 || trimmed.length > 500) return null;

  // 1. Check for UPI deep links: upi://pay?pa=...&pn=...&am=...
  if (trimmed.startsWith('upi://pay')) {
    try {
      const urlParams = new URLSearchParams(trimmed.replace(/^upi:\/\/pay\?/, ''));
      const am = parseFloat(urlParams.get('am') || '');
      const pn = urlParams.get('pn') || urlParams.get('pa') || 'UPI Merchant';
      const ref = urlParams.get('tr') || urlParams.get('ref') || undefined;

      if (!isNaN(am) && am > 0) {
        return {
          amount: am,
          merchant: decodeURIComponent(pn).replace(/\+/g, ' ').trim(),
          upiRef: ref || undefined,
          dateStr: getLocalTodayYmd(),
          rawText: trimmed,
          contentHash: simpleHash(trimmed),
        };
      }
    } catch {
      // Fallback to regex
    }
  }

  // 2. Must contain payment intent indicator keywords
  const lower = trimmed.toLowerCase();
  const paymentKeywords = [
    'paid',
    'sent',
    'debited',
    'transferred',
    'successful',
    'spent',
    'payment to',
    'upi ref',
    'utr',
    'vpa',
  ];

  const hasPaymentKeyword = paymentKeywords.some((kw) => lower.includes(kw));
  if (!hasPaymentKeyword) return null;

  // Reject OTP or verification messages
  if (lower.includes('otp') || lower.includes('verification code') || lower.includes('secret pin')) {
    return null;
  }

  // 3. Extract Amount (handles ₹, Rs., Rs, INR, followed or preceded by numbers)
  let amount: number | null = null;
  const amountRegex = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i;
  const amountMatch = trimmed.match(amountRegex);

  if (amountMatch && amountMatch[1]) {
    amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  } else {
    // Check reverse: e.g. "450.00 Rs" or "450 INR"
    const reverseAmountRegex = /([\d,]+(?:\.\d{1,2})?)\s*(?:₹|rs\.?|inr)/i;
    const revMatch = trimmed.match(reverseAmountRegex);
    if (revMatch && revMatch[1]) {
      amount = parseFloat(revMatch[1].replace(/,/g, ''));
    }
  }

  if (!amount || isNaN(amount) || amount <= 0) return null;

  // 4. Extract Merchant
  let merchant = 'Unknown Merchant';
  const merchantPatterns = [
    /(?:paid\s+to|sent\s+to|to|at)\s+([A-Za-z0-9\s&'.-]{2,32}?)(?:\s+(?:via|using|on|ref|for|upi|\.|$))/i,
    /(?:transfer\s+to|transferred\s+to)\s+([A-Za-z0-9\s&'.-]{2,32}?)(?:\s+(?:on|ref|upi|\.|$))/i,
    /(?:debited.*to)\s+([A-Za-z0-9\s&'.-]{2,32}?)(?:\s+(?:on|ref|\.|$))/i,
  ];

  for (const pat of merchantPatterns) {
    const match = trimmed.match(pat);
    if (match && match[1]) {
      const candidate = match[1].trim();
      // Filter out common false positives
      if (!['account', 'ac', 'a/c', 'vpa', 'upi', 'bank'].includes(candidate.toLowerCase())) {
        merchant = candidate;
        break;
      }
    }
  }

  // 5. Extract UPI Reference / UTR if present
  let upiRef: string | undefined = undefined;
  const refMatch = trimmed.match(/(?:upi\s*ref(?:\s*no\.?)?|utr|rrn|txn\s*id)[:\s]*([0-9]{10,16})/i);
  if (refMatch && refMatch[1]) {
    upiRef = refMatch[1];
  }

  return {
    amount: Math.round(amount * 100) / 100,
    merchant,
    upiRef,
    dateStr: getLocalTodayYmd(),
    rawText: trimmed,
    contentHash: simpleHash(trimmed),
  };
}

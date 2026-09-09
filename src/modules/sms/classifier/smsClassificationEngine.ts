import type {
  RawSmsMessage,
  ClassificationResult,
  SmsClassification,
} from '@/modules/sms/types';

export class SmsClassificationEngine {
  // Regex patterns for OTP & Authentication
  private static readonly OTP_PATTERNS = [
    /\b(?:otp|one[- ]time[- ]password|verification[- ]code|security[- ]code|login[- ]code|auth[- ]code)\b/i,
    /\b(?:do not share|never share|valid for \d+ (?:min|minute|sec)|secret code)\b/i,
    /\bis your verification code\b/i,
    /\buse code \d{4,8} to verify\b/i,
  ];

  // Regex patterns for Promotional / Marketing
  private static readonly PROMO_PATTERNS = [
    /\b(?:use code|apply coupon|discount of|flat \d+% off|cashback up to|special offer|hurry!|exclusive offer)\b/i,
    /\b(?:congratulations! you are eligible|pre[- ]approved loan|get personal loan|instant loan|apply now)\b/i,
    /\b(?:check your credit score for free|free cibil score|click here to apply|download app now)\b/i,
    /\b(?:shop now|order now|sale ends|limited period offer|win up to|claim your reward)\b/i,
  ];

  // Regex patterns for Spam / Malicious links
  private static readonly SPAM_PATTERNS = [
    /\b(?:rummy|casino|lottery|jackpot|win cash daily|earn from home)\b/i,
    /\b(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|rb\.gy)\/[a-zA-Z0-9]+/i,
    /\b(?:account blocked|kyc expired|pan not linked|update kyc immediately|click link to prevent deactivation)\b/i,
  ];

  // Financial verbs & currency check
  private static readonly AMOUNT_PATTERNS = [
    /(?:rs\.?|inr|₹)\s*[\d,]+(?:\.\d{1,2})?/i,
    /[\d,]+(?:\.\d{1,2})?\s*(?:rs\.?|inr|₹)/i,
  ];

  private static readonly DEBIT_VERBS = [
    /\bdebited\b/i,
    /\bdebit\b/i,
    /\bauto[- ]debit\b/i,
    /\bspent\b/i,
    /\bpaid\b/i,
    /\bwithdraw(?:n|al)?\b/i,
    /\btransferred?\b/i,
    /\bdeducted\b/i,
    /\bsent\b/i,
    /\bdr\b/i,
    /\bpurchas(?:e|ed)\b/i,
    /\bcharged\b/i,
    /\b(?:card|debit card)\s+(?:was\s+)?used\b/i,
    /\b(?:transaction|txn)\s+(?:was\s+)?(?:done|made|successful)\b/i,
  ];

  private static readonly CREDIT_VERBS = [
    /\bcredited\b/i,
    /\breceived\b/i,
    /\bdeposited\b/i,
    /\badded\b/i,
    /\brefunded?\b/i,
    /\bcr\b/i,
    /\bcashback\b/i,
  ];

  // Domain-specific classifications
  private static readonly SALARY_PATTERNS = [
    /\b(?:salary|payroll|stipend|monthly salary|sal for|salary for)\b/i,
    /\bcredited towards salary\b/i,
  ];

  private static readonly ATM_PATTERNS = [
    /\b(?:atm|cash withdrawal|cash wdl|wdl at atm|withdrawn from atm|atm cash)\b/i,
  ];

  private static readonly EMI_PATTERNS = [
    /\b(?:emi|equated monthly|installment|loan account|loan emi|towards loan|auto emi)\b/i,
  ];

  private static readonly SUBSCRIPTION_PATTERNS = [
    /\b(?:auto[- ]debit|standing instruction|e[- ]mandate|autopay|mandate executed|recurring payment|subscription)\b/i,
    /\b(?:netflix|spotify|prime video|amazon prime|disney|hotstar|youtube premium|apple\.com\/bill)\b/i,
  ];

  private static readonly BILL_PATTERNS = [
    /\b(?:electricity bill|broadband bill|water bill|postpaid bill|dth recharge|utility bill|biller|bill payment|bescom|tata power|adani electricity)\b/i,
    /\b(?:bill of (?:rs|inr|₹)|paid towards bill|mobile recharge of)\b/i,
  ];

  private static readonly UPI_PATTERNS = [
    /\b(?:upi|vpa|google pay|gpay|phonepe|paytm|bhim|cred upi)\b/i,
    /\b(?:upi-ref|upi ref|rrn|utr|credited via upi|debited via upi)\b/i,
    /[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}/i, // VPA handle
  ];

  private static readonly CARD_PATTERNS = [
    /\b(?:credit card|debit card|card ending|card no\.?|card xx|card \d{4})\b/i,
    /\b(?:pos purchase|pos swipe|swiped at|spent on card)\b/i,
  ];

  /**
   * Fast check to see if text can possibly be a financial transaction.
   */
  public static isPotentiallyFinancial(body: string): boolean {
    const hasAmount = this.AMOUNT_PATTERNS.some((p) => p.test(body));
    if (!hasAmount) return false;

    const hasVerb =
      this.DEBIT_VERBS.some((p) => p.test(body)) ||
      this.CREDIT_VERBS.some((p) => p.test(body)) ||
      /\b(?:transferred?|remitted)\s+to\s+your\s+(?:a\/?c|account)\b/i.test(body);

    return hasVerb;
  }

  /**
   * Classify message into one of 13 types and calculate confidence.
   */
  public static classify(message: RawSmsMessage): ClassificationResult {
    const body = message.body;
    const reasons: string[] = [];

    // 1. Check Spam first
    if (this.SPAM_PATTERNS.some((p) => p.test(body))) {
      reasons.push('Matched spam/phishing patterns');
      return {
        classification: 'SPAM',
        confidence: 0.95,
        isFinancial: false,
        reasons,
      };
    }

    // 2. Check OTP
    if (this.OTP_PATTERNS.some((p) => p.test(body))) {
      reasons.push('Matched one-time password / authentication patterns');
      return {
        classification: 'OTP',
        confidence: 0.98,
        isFinancial: false,
        reasons,
      };
    }

    // 3. Check Promotional / Marketing
    if (this.PROMO_PATTERNS.some((p) => p.test(body))) {
      reasons.push('Matched promotional marketing patterns');
      return {
        classification: 'PROMOTIONAL',
        confidence: 0.9,
        isFinancial: false,
        reasons,
      };
    }

    // 4. Financial content check
    const hasAmount = this.AMOUNT_PATTERNS.some((p) => p.test(body));
    const isTransferToOwnAccount =
      /\b(?:transferred?|remitted)\s+to\s+your\s+(?:a\/?c|account)\b/i.test(body);
    const isDebit = !isTransferToOwnAccount && this.DEBIT_VERBS.some((p) => p.test(body));
    const isCredit = isTransferToOwnAccount || this.CREDIT_VERBS.some((p) => p.test(body));

    if (!hasAmount || (!isDebit && !isCredit)) {
      reasons.push('Missing transaction amount or financial debit/credit verb');
      return {
        classification: 'UNKNOWN',
        confidence: 0.2,
        isFinancial: false,
        reasons,
      };
    }

    // 5. Specialized classification hierarchy
    // Salary Credit check
    if (isCredit && this.SALARY_PATTERNS.some((p) => p.test(body))) {
      reasons.push('Credit transaction with salary/payroll keywords');
      return {
        classification: 'SALARY_CREDIT',
        confidence: 0.95,
        isFinancial: true,
        reasons,
      };
    }

    // ATM Withdrawal check
    if (isDebit && this.ATM_PATTERNS.some((p) => p.test(body))) {
      reasons.push('Debit transaction with ATM cash withdrawal markers');
      return {
        classification: 'ATM_WITHDRAWAL',
        confidence: 0.95,
        isFinancial: true,
        reasons,
      };
    }

    // EMI check
    if (isDebit && this.EMI_PATTERNS.some((p) => p.test(body))) {
      reasons.push('Debit transaction matching EMI/loan installment markers');
      return {
        classification: 'EMI',
        confidence: 0.92,
        isFinancial: true,
        reasons,
      };
    }

    // Subscription check
    if (isDebit && this.SUBSCRIPTION_PATTERNS.some((p) => p.test(body))) {
      reasons.push('Transaction matching recurring mandate/subscription markers');
      return {
        classification: 'SUBSCRIPTION',
        confidence: 0.9,
        isFinancial: true,
        reasons,
      };
    }

    // Bill Payment check
    if (isDebit && this.BILL_PATTERNS.some((p) => p.test(body))) {
      reasons.push('Transaction matching utility/bill payment markers');
      return {
        classification: 'BILL',
        confidence: 0.9,
        isFinancial: true,
        reasons,
      };
    }

    // UPI Payment check
    if (this.UPI_PATTERNS.some((p) => p.test(body))) {
      reasons.push('Transaction contains UPI / VPA / reference markers');
      return {
        classification: 'UPI_PAYMENT',
        confidence: 0.9,
        isFinancial: true,
        reasons,
      };
    }

    // Card Payment check
    if (this.CARD_PATTERNS.some((p) => p.test(body))) {
      reasons.push('Transaction contains card ending or POS swipe markers');
      return {
        classification: 'CARD_PAYMENT',
        confidence: 0.88,
        isFinancial: true,
        reasons,
      };
    }

    // Generic Debit
    if (isDebit) {
      reasons.push('Standard financial debit transaction');
      return {
        classification: 'TRANSACTION_DEBIT',
        confidence: 0.85,
        isFinancial: true,
        reasons,
      };
    }

    // Generic Credit
    if (isCredit) {
      reasons.push('Standard financial credit transaction');
      return {
        classification: 'TRANSACTION_CREDIT',
        confidence: 0.85,
        isFinancial: true,
        reasons,
      };
    }

    return {
      classification: 'UNKNOWN',
      confidence: 0.3,
      isFinancial: false,
      reasons: ['Unable to categorize financial type'],
    };
  }
}

import type { RawSmsMessage, BillerCategory } from '@/types';

export interface ExtractedBill {
  billerName: string;
  billerCategory: BillerCategory;
  amountDue: number;
  minAmountDue?: number;
  dueDate: string; // YYYY-MM-DD
  accountReference?: string;
  paymentUrl?: string;
  confidence: number;
}

const MONTH_MAP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export class BillExtractor {
  // Negative filters: ignore OTPs, promo spam, or receipts of already completed payments
  private static readonly IGNORE_PATTERNS = [
    /\b(?:otp|one[- ]time[- ]password|verification[- ]code|security[- ]code)\b/i,
    /\b(?:congratulations! you are eligible|pre[- ]approved|apply now|win up to)\b/i,
    /\b(?:rummy|casino|lottery|earn from home)\b/i,
    /\b(?:has been received with thanks|payment received for|thank you for paying|payment of rs.*was successful)\b/i,
  ];

  // Bill indicator triggers
  private static readonly BILL_TRIGGER_PATTERNS = [
    /\b(?:due date|due on|pay by|bill due|payment due|payable by|valid till|expiry date)\b/i,
    /\b(?:total due|amount due|bill amount|min(?:imum)? due|bill generated|e-bill|statement generated)\b/i,
    /\b(?:electricity bill|broadband bill|water bill|piped gas bill|postpaid bill|dth recharge|premium due|loan emi)\b/i,
    /\b(?:credit card statement|card ending \d{4} due)\b/i,
  ];

  /**
   * Fast check to see if an SMS is likely a bill reminder.
   */
  public static isLikelyBillReminder(body: string): boolean {
    for (const pattern of this.IGNORE_PATTERNS) {
      if (pattern.test(body)) return false;
    }
    return this.BILL_TRIGGER_PATTERNS.some((p) => p.test(body));
  }

  /**
   * Main extractor: parses an SMS and returns extracted bill information if it represents a bill reminder.
   */
  public static extractBill(message: RawSmsMessage): ExtractedBill | null {
    const body = message.body;

    if (!this.isLikelyBillReminder(body)) {
      return null;
    }

    // 1. Extract Due Date
    const dueDate = this.extractDueDate(body, message.date);
    if (!dueDate) {
      return null;
    }

    // 2. Extract Total Amount Due & Min Amount Due
    const amounts = this.extractAmounts(body);
    if (!amounts || amounts.totalDue <= 0) {
      return null;
    }

    // 3. Extract Category and Biller Name
    const classification = this.detectBillerAndCategory(body, message.address);

    // 4. Extract Account / Consumer Reference
    const accountReference = this.extractAccountReference(body);

    // 5. Extract Payment Link
    const paymentUrl = this.extractPaymentUrl(body);

    return {
      billerName: classification.billerName,
      billerCategory: classification.category,
      amountDue: amounts.totalDue,
      minAmountDue: amounts.minDue,
      dueDate,
      accountReference,
      paymentUrl,
      confidence: classification.confidence,
    };
  }

  /**
   * Extracts total due and optional minimum amount due.
   */
  public static extractAmounts(body: string): { totalDue: number; minDue?: number } | null {
    let totalDue = 0;
    let minDue: number | undefined;

    // Pattern 1: Explicit "Total Due: Rs. 1,234.00" & "Min Due: Rs. 500"
    const totalDueMatch = body.match(
      /(?:total(?:\s+amount)?\s+due|bill\s+amount|amount\s+payable|total\s+payable|due\s+amount|bill\s+of|amount\s+due)\s*(?:is|:)?\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i
    );
    if (totalDueMatch) {
      totalDue = parseFloat(totalDueMatch[1].replace(/,/g, ''));
    }

    const minDueMatch = body.match(
      /(?:min(?:imum)?(?:\s+amount)?\s+due|min\s+due|mad)\s*(?:is|:)?\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i
    );
    if (minDueMatch) {
      minDue = parseFloat(minDueMatch[1].replace(/,/g, ''));
    }

    // Pattern 2: Generic currency match if specific total due keyword wasn't explicit
    if (totalDue <= 0) {
      const genericMatch = body.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
      if (genericMatch) {
        totalDue = parseFloat(genericMatch[1].replace(/,/g, ''));
      }
    }

    if (totalDue <= 0) return null;

    return {
      totalDue,
      minDue: minDue && minDue < totalDue ? minDue : undefined,
    };
  }

  /**
   * Extracts due date from text in Indian SMS formats and returns ISO YYYY-MM-DD.
   */
  public static extractDueDate(body: string, smsTimestamp?: number): string | null {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const referenceYear = smsTimestamp ? new Date(smsTimestamp).getFullYear() : new Date().getFullYear();

    // 1. "due on / due date is / pay by / by DD-MMM-YYYY" (e.g. 25-Sep-2026, 25 Sep 2026, 25-SEP-26, 25th Sep 2026)
    const dateTextMatch = body.match(
      /(?:due\s+(?:on|date|by)|pay\s+by|payable\s+by|valid\s+till|by|before)(?:\s+is|\s*:|:)?\s*(\d{1,2})(?:st|nd|rd|th)?[\s\-\/]([a-zA-Z]{3,9})(?:[\s\-\/](\d{2,4}))?/i
    );
    if (dateTextMatch) {
      const day = parseInt(dateTextMatch[1], 10);
      const monthStr = dateTextMatch[2].toLowerCase();
      const month = MONTH_MAP[monthStr];
      let year = dateTextMatch[3] ? parseInt(dateTextMatch[3], 10) : referenceYear;
      if (year < 100) year += 2000;

      if (month && day >= 1 && day <= 31) {
        return `${year}-${pad(month)}-${pad(day)}`;
      }
    }

    // 2. "DD-MM-YYYY" or "DD/MM/YYYY" or "DD-MM-YY"
    const numericDateMatch = body.match(
      /(?:due\s+(?:on|date|by)|pay\s+by|payable\s+by|valid\s+till|by|before)(?:\s+is|\s*:|:)?\s*(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{2,4})/i
    );
    if (numericDateMatch) {
      const day = parseInt(numericDateMatch[1], 10);
      const month = parseInt(numericDateMatch[2], 10);
      let year = parseInt(numericDateMatch[3], 10);
      if (year < 100) year += 2000;

      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${pad(month)}-${pad(day)}`;
      }
    }

    // 3. Fallback: Any standalone date format (e.g., 25-Sep-2026 or 25/09/2026) anywhere after "due" or "bill"
    const standaloneMatch = body.match(
      /(\d{1,2})(?:st|nd|rd|th)?[\s\-\/]([a-zA-Z]{3,9})[\s\-\/](\d{2,4})/i
    );
    if (standaloneMatch) {
      const day = parseInt(standaloneMatch[1], 10);
      const monthStr = standaloneMatch[2].toLowerCase();
      const month = MONTH_MAP[monthStr];
      let year = parseInt(standaloneMatch[3], 10);
      if (year < 100) year += 2000;

      if (month && day >= 1 && day <= 31) {
        return `${year}-${pad(month)}-${pad(day)}`;
      }
    }

    return null;
  }

  /**
   * Detects category and specific biller name.
   */
  public static detectBillerAndCategory(
    body: string,
    sender: string
  ): { category: BillerCategory; billerName: string; confidence: number } {
    const text = (body + ' ' + sender).toLowerCase();

    // 1. Electricity
    if (
      text.includes('bescom') ||
      text.includes('tata power') ||
      text.includes('adani electricity') ||
      text.includes('bses') ||
      text.includes('cesc') ||
      text.includes('mseb') ||
      text.includes('pspcl') ||
      text.includes('torrent power') ||
      text.includes('electricity bill') ||
      text.includes('power distribution')
    ) {
      let name = 'Electricity Bill';
      if (text.includes('bescom')) name = 'BESCOM';
      else if (text.includes('tata power')) name = 'Tata Power';
      else if (text.includes('adani electricity')) name = 'Adani Electricity';
      else if (text.includes('bses')) name = 'BSES';
      else if (text.includes('cesc')) name = 'CESC';
      return { category: 'electricity', billerName: name, confidence: 0.95 };
    }

    // 2. Broadband / Wi-Fi
    if (
      text.includes('airtel broadband') ||
      text.includes('airtel xstream') ||
      text.includes('jiofiber') ||
      text.includes('jio fiber') ||
      text.includes('act fibernet') ||
      text.includes('act broadband') ||
      text.includes('hathway') ||
      text.includes('you broadband') ||
      text.includes('broadband bill')
    ) {
      let name = 'Broadband';
      if (text.includes('airtel')) name = 'Airtel Xstream Fiber';
      else if (text.includes('jio')) name = 'JioFiber';
      else if (text.includes('act')) name = 'ACT Fibernet';
      return { category: 'broadband', billerName: name, confidence: 0.95 };
    }

    // 3. Mobile Postpaid
    if (
      text.includes('postpaid') ||
      text.includes('airtel bill') ||
      text.includes('jio postpaid') ||
      text.includes('vodafone') ||
      text.includes('vi bill') ||
      text.includes('mobile bill')
    ) {
      let name = 'Mobile Postpaid';
      if (text.includes('airtel')) name = 'Airtel Postpaid';
      else if (text.includes('jio')) name = 'Jio Postpaid';
      else if (text.includes('vi') || text.includes('vodafone')) name = 'Vi Postpaid';
      return { category: 'mobile_postpaid', billerName: name, confidence: 0.9 };
    }

    // 4. Credit Card Statement / Due
    if (
      text.includes('credit card') ||
      text.includes('card ending') ||
      text.includes('card statement') ||
      text.includes('total due') ||
      text.includes('min due') ||
      text.includes('hdfcbk') ||
      text.includes('sbicrd') ||
      text.includes('icicib') ||
      text.includes('axisbk')
    ) {
      let name = 'Credit Card';
      if (text.includes('hdfc')) name = 'HDFC Bank Credit Card';
      else if (text.includes('sbi') || text.includes('sbicrd')) name = 'SBI Credit Card';
      else if (text.includes('icici')) name = 'ICICI Bank Credit Card';
      else if (text.includes('axis')) name = 'Axis Bank Credit Card';
      else if (text.includes('kotak')) name = 'Kotak Credit Card';
      else if (text.includes('amex') || text.includes('american express')) name = 'Amex Card';
      return { category: 'credit_card', billerName: name, confidence: 0.95 };
    }

    // 5. Piped Gas / LPG
    if (
      text.includes('igl') ||
      text.includes('mgl') ||
      text.includes('mahanagar gas') ||
      text.includes('indraprastha gas') ||
      text.includes('adani gas') ||
      text.includes('piped gas') ||
      text.includes('gas bill')
    ) {
      let name = 'Piped Gas';
      if (text.includes('igl') || text.includes('indraprastha')) name = 'IGL Gas';
      else if (text.includes('mgl') || text.includes('mahanagar')) name = 'Mahanagar Gas';
      else if (text.includes('adani')) name = 'Adani Total Gas';
      return { category: 'gas', billerName: name, confidence: 0.95 };
    }

    // 6. Water
    if (text.includes('water bill') || text.includes('bwssb') || text.includes('delhi jal board') || text.includes('djb')) {
      let name = 'Water Bill';
      if (text.includes('bwssb')) name = 'BWSSB Water';
      else if (text.includes('delhi jal board') || text.includes('djb')) name = 'Delhi Jal Board';
      return { category: 'water', billerName: name, confidence: 0.9 };
    }

    // 7. Loan EMI
    if (text.includes('emi') || text.includes('loan account') || text.includes('loan emi') || text.includes('installment')) {
      return { category: 'loan_emi', billerName: 'Loan EMI', confidence: 0.9 };
    }

    // 8. DTH
    if (
      text.includes('tata play') ||
      text.includes('tata sky') ||
      text.includes('dish tv') ||
      text.includes('dth') ||
      text.includes('airtel digital tv') ||
      text.includes('sun direct')
    ) {
      let name = 'DTH Recharge';
      if (text.includes('tata')) name = 'Tata Play';
      else if (text.includes('dish')) name = 'Dish TV';
      else if (text.includes('airtel')) name = 'Airtel Digital TV';
      return { category: 'dth', billerName: name, confidence: 0.9 };
    }

    // 9. Insurance
    if (text.includes('insurance') || text.includes('lic') || text.includes('policy') || text.includes('premium')) {
      let name = 'Insurance Premium';
      if (text.includes('lic')) name = 'LIC Insurance';
      else if (text.includes('hdfc life')) name = 'HDFC Life';
      else if (text.includes('icici pru')) name = 'ICICI Prudential';
      else if (text.includes('max life')) name = 'Max Life Insurance';
      return { category: 'insurance', billerName: name, confidence: 0.85 };
    }

    return { category: 'other', billerName: 'Utility Bill', confidence: 0.7 };
  }

  /**
   * Extracts account reference number, CA No, Sub ID, or Card Last 4 digits.
   */
  public static extractAccountReference(body: string): string | undefined {
    // 1. CA / Consumer / Sub ID / Account No
    const refMatch = body.match(
      /(?:ca\s*no\.?|consumer\s*no\.?|sub(?:scriber)?\s*id|a\/c\s*no\.?|account\s*no\.?|policy\s*no\.?|landline\s*no\.?)\s*(?:is|:)?\s*([a-zA-Z0-9]{4,16})/i
    );
    if (refMatch) {
      return refMatch[1].trim();
    }

    // 2. Card ending XX1234
    const cardMatch = body.match(/(?:card\s*(?:ending|xx|\.\.)\s*(\d{4}))/i);
    if (cardMatch) {
      return `Card ..${cardMatch[1]}`;
    }

    return undefined;
  }

  /**
   * Extracts payment link / URL if available in the SMS.
   */
  public static extractPaymentUrl(body: string): string | undefined {
    const urlMatch = body.match(
      /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&//=]*)/i
    );
    return urlMatch ? urlMatch[0] : undefined;
  }
}

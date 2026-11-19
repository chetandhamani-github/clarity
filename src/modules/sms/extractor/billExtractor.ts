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
    // Completed transactions or debit alerts (handled as ledger transactions, not pending bills)
    /\b(?:debited|debited by|debited from|withdrawn|charged to|spent on)\b/i,
    /\b(?:has been debited|was debited|is debited|account debited)\b/i,
    /\b(?:paid successfully|successfully paid|payment successful|transaction successful)\b/i,
    /\b(?:payment received|received with thanks|thanks for payment|thank you for paying)\b/i,
    /\b(?:credited to|deposited in)\b/i,
  ];

  // Bill indicator triggers
  private static readonly BILL_TRIGGER_PATTERNS = [
    /\b(?:due date|due on|pay by|bill due|payment due|payable by|valid till|expiry date)\b/i,
    /\b(?:total due|amount due|bill amount|min(?:imum)? due|bill generated|e-bill|statement generated|total amt due|amt due|tad)\b/i,
    /\b(?:electricity bill|broadband bill|water bill|piped gas bill|gas bill|postpaid bill|dth recharge|premium due|loan emi)\b/i,
    /\b(?:credit card statement|card ending(?:\s*(?:in|with|:|-))?\s*\d{4}\s*due)\b/i,
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
   * Extracts total due and optional minimum amount due, protecting against credit limit confusion.
   */
  public static extractAmounts(body: string): { totalDue: number; minDue?: number } | null {
    let totalDue = 0;
    let minDue: number | undefined;

    // Pattern 1: Explicit "Total Due: Rs. 1,234.00", "Min Amt Due: Rs. 500", "EMI of Rs. 4,500", "Premium of Rs. 12,000"
    const totalDueMatch = body.match(
      /(?:total(?:\s+(?:amount|amt))?\s+due|bill\s+amount|amount\s+payable|total\s+payable|due\s+amount|bill\s+of|amount\s+due|amt\s+due|tad|emi\s+of|premium\s+of|installment\s+of|recharge\s+of)\s*(?:is|:)?\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i
    );
    if (totalDueMatch) {
      totalDue = parseFloat(totalDueMatch[1].replace(/,/g, ''));
    }

    const minDueMatch = body.match(
      /(?:min(?:imum)?(?:\s+(?:amount|amt))?\s+due|min\s+due|mad)\s*(?:is|:)?\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i
    );
    if (minDueMatch) {
      minDue = parseFloat(minDueMatch[1].replace(/,/g, ''));
    }

    // Extract credit limit or available balance figures to avoid false matches in contextual search
    const limitMatches = Array.from(
      body.matchAll(
        /(?:credit\s+limit|avail(?:able)?\s+(?:limit|bal(?:ance)?)|avl\s+(?:lmt|bal)|card\s+limit)\s*(?:is|:)?\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/gi
      )
    ).map((m) => parseFloat(m[1].replace(/,/g, '')));

    // Pattern 2: Contextual currency match near bill, due, emi, or premium keywords
    if (totalDue <= 0) {
      const contextualMatches = Array.from(
        body.matchAll(
          /(?:(?:bill|due|payable|pay|amount|emi|premium|installment)[^\d\n\r]{0,45}(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)|(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)[^\d\n\r]{0,45}(?:due|bill|payable|emi|premium|installment))/gi
        )
      );

      for (const m of contextualMatches) {
        const valStr = m[1] || m[2];
        if (!valStr) continue;
        const val = parseFloat(valStr.replace(/,/g, ''));
        // Reject amounts matching credit limits or available balance
        if (limitMatches.includes(val)) continue;
        if (val > 0) {
          totalDue = val;
          break;
        }
      }
    }

    if (totalDue <= 0) return null;

    return {
      totalDue,
      minDue: minDue && minDue < totalDue ? minDue : undefined,
    };
  }

  /**
   * Extracts due date from text in Indian SMS formats (DD-MMM-YYYY, DD.MM.YYYY, MMM DD)
   * with cross-year rollover handling.
   */
  public static extractDueDate(body: string, smsTimestamp?: number): string | null {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const refDate = smsTimestamp ? new Date(smsTimestamp) : new Date();
    const refYear = refDate.getFullYear();
    const refMonth = refDate.getMonth() + 1; // 1-12

    const resolveYear = (explicitYearStr: string | undefined, month: number): number => {
      if (explicitYearStr) {
        let y = parseInt(explicitYearStr, 10);
        if (y < 100) y += 2000;
        return y;
      }
      // Year Rollover: If SMS arrives in Nov/Dec and due month is Jan/Feb, it rolls over to next year
      if (refMonth >= 11 && month <= 2) {
        return refYear + 1;
      }
      // If SMS is Jan/Feb and due date was Nov/Dec, it refers to previous year
      if (refMonth <= 2 && month >= 11) {
        return refYear - 1;
      }
      return refYear;
    };

    // 1. Day-first textual: "due on 25-Sep-2026", "25 Sep 2026", "25.Sep.2026", "25th Sep 2026"
    const dayFirstTextMatch = body.match(
      /(?:due\s+(?:on|date|by)|pay\s+by|payable\s+by|valid\s+till|by|before)(?:\s+is|\s*:|:)?\s*(\d{1,2})(?:st|nd|rd|th)?[\s\-\/\.]([a-zA-Z]{3,9})(?:[\s\-\/\.](\d{2,4}))?/i
    );
    if (dayFirstTextMatch) {
      const day = parseInt(dayFirstTextMatch[1], 10);
      const monthStr = dayFirstTextMatch[2].toLowerCase();
      const month = MONTH_MAP[monthStr];
      if (month && day >= 1 && day <= 31) {
        const year = resolveYear(dayFirstTextMatch[3], month);
        return `${year}-${pad(month)}-${pad(day)}`;
      }
    }

    // 2. Month-first textual: "due by Oct 25, 2026", "due date: October 25"
    const monthFirstTextMatch = body.match(
      /(?:due\s+(?:on|date|by)|pay\s+by|payable\s+by|valid\s+till|by|before)(?:\s+is|\s*:|:)?\s*([a-zA-Z]{3,9})[\s\-\/\.](\d{1,2})(?:st|nd|rd|th)?(?:[\s\-\/\.,]+(\d{2,4}))?/i
    );
    if (monthFirstTextMatch) {
      const monthStr = monthFirstTextMatch[1].toLowerCase();
      const month = MONTH_MAP[monthStr];
      const day = parseInt(monthFirstTextMatch[2], 10);
      if (month && day >= 1 && day <= 31) {
        const year = resolveYear(monthFirstTextMatch[3], month);
        return `${year}-${pad(month)}-${pad(day)}`;
      }
    }

    // 3. Numeric date: "DD-MM-YYYY", "DD/MM/YYYY", "DD.MM.YYYY", "DD-MM-YY", "DD/MM/YY", "DD.MM.YY"
    const numericDateMatch = body.match(
      /(?:due\s+(?:on|date|by)|pay\s+by|payable\s+by|valid\s+till|by|before)(?:\s+is|\s*:|:)?\s*(\d{1,2})[\-\/\.](\d{1,2})[\-\/\.](\d{2,4})/i
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

    // 4. Fallback contextual date near due/pay/bill
    const contextualDateMatch = body.match(
      /(?:due|pay|bill|before|till)[^\d\n\r]{0,30}(\d{1,2})(?:st|nd|rd|th)?[\s\-\/\.]([a-zA-Z]{3,9})(?:[\s\-\/\.](\d{2,4}))?/i
    );
    if (contextualDateMatch) {
      const day = parseInt(contextualDateMatch[1], 10);
      const monthStr = contextualDateMatch[2].toLowerCase();
      const month = MONTH_MAP[monthStr];
      if (month && day >= 1 && day <= 31) {
        const year = resolveYear(contextualDateMatch[3], month);
        return `${year}-${pad(month)}-${pad(day)}`;
      }
    }

    return null;
  }

  /**
   * Detects category and specific biller name across Indian utility boards, banks, and telcos.
   */
  public static detectBillerAndCategory(
    body: string,
    sender: string
  ): { category: BillerCategory; billerName: string; confidence: number } {
    const text = (body + ' ' + sender).toLowerCase();

    // 1. Electricity (National & State Discoms)
    if (
      text.includes('bescom') ||
      text.includes('mescom') ||
      text.includes('hescom') ||
      text.includes('tata power') ||
      text.includes('adani electricity') ||
      text.includes('bses') ||
      text.includes('cesc') ||
      text.includes('mseb') ||
      text.includes('mahavitaran') ||
      text.includes('msedcl') ||
      text.includes('pspcl') ||
      text.includes('uppcl') ||
      text.includes('tangedco') ||
      text.includes('tsspdcl') ||
      text.includes('tsnpdcl') ||
      text.includes('apspdcl') ||
      text.includes('apepdcl') ||
      text.includes('kseb') ||
      text.includes('wbsedcl') ||
      text.includes('dhbvn') ||
      text.includes('uhbvn') ||
      text.includes('sbpdcl') ||
      text.includes('nbpdcl') ||
      text.includes('dgvcl') ||
      text.includes('mgvcl') ||
      text.includes('pgvcl') ||
      text.includes('ugvcl') ||
      text.includes('tpcodl') ||
      text.includes('torrent power') ||
      text.includes('electricity bill') ||
      text.includes('power distribution') ||
      text.includes('electric bill')
    ) {
      let name = 'Electricity Bill';
      if (text.includes('bescom')) name = 'BESCOM';
      else if (text.includes('uppcl')) name = 'UPPCL Electricity';
      else if (text.includes('tangedco')) name = 'TANGEDCO Electricity';
      else if (text.includes('tsspdcl')) name = 'TSSPDCL Electricity';
      else if (text.includes('tsnpdcl')) name = 'TSNPDCL Electricity';
      else if (text.includes('apspdcl') || text.includes('apepdcl')) name = 'APSPDCL Electricity';
      else if (text.includes('kseb')) name = 'KSEB Electricity';
      else if (text.includes('wbsedcl')) name = 'WBSEDCL Electricity';
      else if (text.includes('pspcl')) name = 'PSPCL Electricity';
      else if (text.includes('dhbvn') || text.includes('uhbvn')) name = 'DHBVN Electricity';
      else if (text.includes('sbpdcl') || text.includes('nbpdcl')) name = 'SBPDCL Electricity';
      else if (text.includes('tata power')) name = 'Tata Power';
      else if (text.includes('adani electricity')) name = 'Adani Electricity';
      else if (text.includes('bses')) name = 'BSES';
      else if (text.includes('cesc')) name = 'CESC';
      else if (text.includes('mseb') || text.includes('mahavitaran') || text.includes('msedcl'))
        name = 'MSEB Mahavitaran';
      else if (text.includes('torrent power')) name = 'Torrent Power';
      return { category: 'electricity', billerName: name, confidence: 0.95 };
    }

    // 2. Broadband / Wi-Fi
    if (
      text.includes('airtel broadband') ||
      text.includes('airtel xstream') ||
      text.includes('jiofiber') ||
      text.includes('jio fiber') ||
      text.includes('jio airfiber') ||
      text.includes('act fibernet') ||
      text.includes('act broadband') ||
      text.includes('bsnl fiber') ||
      text.includes('bsnl broadband') ||
      text.includes('tata play fiber') ||
      text.includes('excitel') ||
      text.includes('alliance broadband') ||
      text.includes('hathway') ||
      text.includes('you broadband') ||
      text.includes('broadband bill')
    ) {
      let name = 'Broadband';
      if (text.includes('airtel')) name = 'Airtel Xstream Fiber';
      else if (text.includes('jio')) name = 'JioFiber';
      else if (text.includes('act')) name = 'ACT Fibernet';
      else if (text.includes('bsnl')) name = 'BSNL Bharat Fiber';
      else if (text.includes('tata play')) name = 'Tata Play Fiber';
      else if (text.includes('excitel')) name = 'Excitel Broadband';
      else if (text.includes('hathway')) name = 'Hathway Broadband';
      return { category: 'broadband', billerName: name, confidence: 0.95 };
    }

    // 3. Mobile Postpaid
    if (
      text.includes('postpaid') ||
      text.includes('airtel bill') ||
      text.includes('jio postpaid') ||
      text.includes('vodafone') ||
      text.includes('vi bill') ||
      text.includes('bsnl postpaid') ||
      text.includes('mobile bill')
    ) {
      let name = 'Mobile Postpaid';
      if (text.includes('airtel')) name = 'Airtel Postpaid';
      else if (text.includes('jio')) name = 'Jio Postpaid';
      else if (text.includes('vi') || text.includes('vodafone')) name = 'Vi Postpaid';
      else if (text.includes('bsnl')) name = 'BSNL Postpaid';
      return { category: 'mobile_postpaid', billerName: name, confidence: 0.9 };
    }

    // 4. Credit Card Statement / Due
    if (
      text.includes('credit card') ||
      text.includes('card statement') ||
      text.includes('sbicrd') ||
      text.includes('onecard') ||
      text.includes('scapia') ||
      (text.includes('card ending') &&
        (text.includes('statement') ||
          text.includes('due') ||
          text.includes('total due') ||
          text.includes('min due') ||
          text.includes('amt due') ||
          text.includes('tad'))) ||
      ((text.includes('total due') || text.includes('min due') || text.includes('amt due')) &&
        (text.includes('card') || text.includes('statement')))
    ) {
      let name = 'Credit Card';
      if (text.includes('hdfc')) name = 'HDFC Bank Credit Card';
      else if (text.includes('sbi') || text.includes('sbicrd')) name = 'SBI Credit Card';
      else if (text.includes('icici')) name = 'ICICI Bank Credit Card';
      else if (text.includes('axis')) name = 'Axis Bank Credit Card';
      else if (text.includes('kotak')) name = 'Kotak Credit Card';
      else if (text.includes('onecard')) name = 'OneCard Credit Card';
      else if (text.includes('scapia')) name = 'Scapia Federal Card';
      else if (text.includes('rbl')) name = 'RBL Bank Credit Card';
      else if (text.includes('indusind')) name = 'IndusInd Bank Credit Card';
      else if (text.includes('federal')) name = 'Federal Bank Credit Card';
      else if (text.includes('au small') || text.includes('aubank')) name = 'AU Bank Credit Card';
      else if (text.includes('idfc')) name = 'IDFC FIRST Bank Credit Card';
      else if (text.includes('bob') || text.includes('bank of baroda')) name = 'BOB Credit Card';
      else if (text.includes('standard chartered') || text.includes('scb')) name = 'Standard Chartered Card';
      else if (text.includes('amex') || text.includes('american express')) name = 'Amex Card';
      return { category: 'credit_card', billerName: name, confidence: 0.95 };
    }

    // 5. Piped Gas / LPG
    if (
      /\bigl\b/i.test(text) ||
      /\bmgl\b/i.test(text) ||
      text.includes('mahanagar gas') ||
      text.includes('indraprastha gas') ||
      text.includes('adani gas') ||
      text.includes('adani total gas') ||
      text.includes('gujarat gas') ||
      text.includes('hp gas') ||
      text.includes('bharat gas') ||
      text.includes('indane') ||
      text.includes('piped gas') ||
      text.includes('gas bill')
    ) {
      let name = 'Piped Gas';
      if (/\bigl\b/i.test(text) || text.includes('indraprastha')) name = 'IGL Gas';
      else if (/\bmgl\b/i.test(text) || text.includes('mahanagar')) name = 'Mahanagar Gas';
      else if (text.includes('adani')) name = 'Adani Total Gas';
      else if (text.includes('gujarat gas')) name = 'Gujarat Gas';
      else if (text.includes('hp gas')) name = 'HP Gas';
      else if (text.includes('bharat gas')) name = 'Bharat Gas';
      else if (text.includes('indane')) name = 'Indane Gas';
      return { category: 'gas', billerName: name, confidence: 0.95 };
    }

    // 6. Water
    if (
      text.includes('water bill') ||
      text.includes('bwssb') ||
      text.includes('delhi jal board') ||
      text.includes('djb') ||
      text.includes('hmwssb') ||
      text.includes('cmwssb') ||
      text.includes('mcgm') ||
      text.includes('bmc water')
    ) {
      let name = 'Water Bill';
      if (text.includes('bwssb')) name = 'BWSSB Water';
      else if (text.includes('delhi jal board') || text.includes('djb')) name = 'Delhi Jal Board';
      else if (text.includes('hmwssb')) name = 'HMWSSB Water';
      else if (text.includes('cmwssb')) name = 'CMWSSB Water';
      return { category: 'water', billerName: name, confidence: 0.9 };
    }

    // 7. Loan EMI (avoiding matching inside 'premium' by checking word boundary)
    if (
      /\bemi\b/i.test(text) ||
      text.includes('loan account') ||
      text.includes('loan emi') ||
      text.includes('installment') ||
      text.includes('bajaj finserv') ||
      text.includes('hdb') ||
      text.includes('tata capital') ||
      text.includes('home credit') ||
      text.includes('muthoot') ||
      text.includes('chola') ||
      text.includes('tvs credit') ||
      text.includes('hero fincorp')
    ) {
      let name = 'Loan EMI';
      if (text.includes('bajaj')) name = 'Bajaj Finserv EMI';
      else if (text.includes('hdb')) name = 'HDB Financial EMI';
      else if (text.includes('tata capital')) name = 'Tata Capital EMI';
      else if (text.includes('home credit')) name = 'Home Credit EMI';
      else if (text.includes('muthoot')) name = 'Muthoot Finance EMI';
      else if (text.includes('tvs credit')) name = 'TVS Credit EMI';
      else if (text.includes('hero fincorp')) name = 'Hero Fincorp EMI';
      return { category: 'loan_emi', billerName: name, confidence: 0.9 };
    }

    // 8. DTH
    if (
      text.includes('tata play') ||
      text.includes('tata sky') ||
      text.includes('dish tv') ||
      /\bdth\b/i.test(text) ||
      text.includes('airtel digital tv') ||
      text.includes('sun direct') ||
      text.includes('d2h') ||
      text.includes('videocon d2h')
    ) {
      let name = 'DTH Recharge';
      if (text.includes('tata')) name = 'Tata Play';
      else if (text.includes('dish')) name = 'Dish TV';
      else if (text.includes('airtel')) name = 'Airtel Digital TV';
      else if (text.includes('sun direct')) name = 'Sun Direct';
      else if (text.includes('d2h')) name = 'Videocon d2h';
      return { category: 'dth', billerName: name, confidence: 0.9 };
    }

    // 9. Insurance
    if (
      text.includes('insurance') ||
      /\blic\b/i.test(text) ||
      text.includes('policy') ||
      text.includes('premium') ||
      text.includes('hdfc life') ||
      text.includes('icici pru') ||
      text.includes('max life') ||
      text.includes('sbi life') ||
      text.includes('tata aia') ||
      text.includes('bajaj allianz') ||
      text.includes('star health') ||
      text.includes('care health') ||
      text.includes('niva bupa')
    ) {
      let name = 'Insurance Premium';
      if (/\blic\b/i.test(text)) name = 'LIC Insurance';
      else if (text.includes('hdfc life')) name = 'HDFC Life';
      else if (text.includes('icici pru')) name = 'ICICI Prudential';
      else if (text.includes('max life')) name = 'Max Life Insurance';
      else if (text.includes('sbi life')) name = 'SBI Life Insurance';
      else if (text.includes('tata aia')) name = 'Tata AIA Life';
      else if (text.includes('bajaj allianz')) name = 'Bajaj Allianz';
      else if (text.includes('star health')) name = 'Star Health Insurance';
      else if (text.includes('care health')) name = 'Care Health Insurance';
      else if (text.includes('niva bupa')) name = 'Niva Bupa Health';
      return { category: 'insurance', billerName: name, confidence: 0.85 };
    }

    return { category: 'other', billerName: 'Utility Bill', confidence: 0.7 };
  }

  /**
   * Extracts account reference number, CA No, BP No, K No, Sub ID, or Card Last 4 digits.
   */
  public static extractAccountReference(body: string): string | undefined {
    // 1. CA / Consumer / Sub ID / Account No / BP No / K No / Service No / Connection No
    const refMatch = body.match(
      /(?:ca\s*no\.?|consumer\s*(?:no\.?|id)|sub(?:scriber)?\s*id|a\/c\s*no\.?|account\s*no\.?|policy\s*no\.?|landline\s*no\.?|bp\s*no\.?|k\s*no\.?|service\s*no\.?|connection\s*no\.?)\s*(?:is|:)?\s*([a-zA-Z0-9]{4,16})/i
    );
    if (refMatch) {
      return refMatch[1].trim();
    }

    // 2. Card ending XX1234 or ending in/with/: 1234
    const cardMatch = body.match(
      /(?:card\s*(?:ending|xx|\.\.)(?:\s*(?:in|with|:|-))?\s*(\d{4}))/i
    );
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

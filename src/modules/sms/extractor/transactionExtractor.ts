import type {
  RawSmsMessage,
  ExtractedTransaction,
  ClassificationResult,
  TransactionDirection,
} from '@/modules/sms/types';

export class TransactionExtractor {
  private static readonly MONEY_AMOUNT_REGEX =
    /(?:(?:₹|(?:rs|inr)\.?)\s*([\d][\d,]*(?:\.\d{1,2})?)|([\d][\d,]*(?:\.\d{1,2})?)\s*(?:₹|(?:rs|inr)\.?))/gi;

  private static readonly TRANSACTION_CONTEXT_REGEX =
    /\b(?:debited?|credited?|spent|paid|withdraw(?:n|al)?|transferred?|deducted|sent|purchas(?:e|ed)|charged|used|received|deposited|refunded?|cashback|added|reversed?|disbursed)\b/i;

  private static readonly BALANCE_CONTEXT_REGEX =
    /\b(?:avl\.?\s*bal(?:ance)?|available\s*bal(?:ance)?|current\s*bal(?:ance)?|clear\s*bal(?:ance)?|closing\s*bal(?:ance)?|(?:account\s*)?bal(?:ance)?)\b/i;

  private static readonly NON_TRANSACTION_AMOUNT_REGEX =
    /\b(?:credit\s+limit|cash\s+limit|minimum\s+(?:amount|due)|amount\s+due|total\s+due)\b/i;

  private static readonly ACCOUNT_MASK_REGEXES = [
    /(?:a\/?c(?:count)?|acct?\.?|account|card)\s*(?:no\.?|number)?\s*(?:ending(?:\s+(?:with|in))?)?\s*[:#-]?\s*(?:[xX*•#-]\s*)*(\d{3,18})\b/i,
    /\b(?:ending|ending with|ending in)\s*(\d{3,18})\b/i,
    /(?:[xX*•]{2,}\s*)+(\d{3,18})\b/,
  ];

  private static readonly REF_NUMBER_REGEXES = [
    /(?:upi\s*ref(?:\s*no\.?)?|ref(?:\s*no\.?)?|rrn|utr|txn\s*(?:id|no\.?)?)\s*[:\s-]*([a-zA-Z0-9]{6,25})/i,
    /(?:reference\s*no\.?)\s*[:\s-]*([a-zA-Z0-9]{6,25})/i,
  ];

  private static readonly AVAIL_BAL_REGEXES = [
    /(?:avl\.?\s*bal(?:ance)?|avail(?:able)?\s*bal(?:ance)?|current\s*bal(?:ance)?|clear\s*bal(?:ance)?|closing\s*bal(?:ance)?|(?:account\s*)?balance)\s*(?:is|:|-)?\s*(?:rs\.?|inr|₹)?\s*([\d][\d,]*(?:\.\d{1,2})?)/i,
    /(?:rs\.?|inr|₹)\s*([\d][\d,]*(?:\.\d{1,2})?)\s*(?:is\s*)?(?:your\s*)?(?:avl\.?\s*bal(?:ance)?|available\s*balance|current\s*balance|clear\s*balance|closing\s*balance)/i,
  ];

  private static readonly MERCHANT_PATTERNS = [
    /\b(?:credited|received|deposited)\b[\s\S]{0,80}?\b(?:from|by)\s+([A-Za-z0-9@*.\-&_\s]{2,80}?)(?:\s+(?:on|upi\s+ref|ref|rrn|utr|avl\.?\s*bal|available\s+bal(?:ance)?|bal(?:ance)?)|[.;\n]|$)/i,
    /(?:at|to|towards|vpa|paid to|transferred to|trf to|info\/)\s+([A-Za-z0-9*.\-&_\s]{2,35}?)(?:\s+on|\s+upi\s+ref|\s+ref|\s+avl|\s+not you|\s+via|\s+using|\.|$|\n)/i,
    /(?:info[:\s]+)([A-Za-z0-9*.\-&_\s]{2,35}?)(?:\s+on|\s+upi\s+ref|\s+ref|\s+avl|\.|$|\n)/i,
  ];

  private static readonly BANK_MAPPINGS: Record<string, string> = {
    HDFC: 'HDFC Bank',
    HDFCBK: 'HDFC Bank',
    ICICI: 'ICICI Bank',
    ICICIB: 'ICICI Bank',
    SBI: 'State Bank of India',
    SBIINB: 'State Bank of India',
    SBIPSG: 'State Bank of India',
    SBIUPI: 'State Bank of India',
    SBMSMS: 'State Bank of India',
    AXIS: 'Axis Bank',
    AXISBK: 'Axis Bank',
    KOTAK: 'Kotak Mahindra Bank',
    KOTAKB: 'Kotak Mahindra Bank',
    IDFC: 'IDFC FIRST Bank',
    IDFCFB: 'IDFC FIRST Bank',
    AUBANK: 'AU Small Finance Bank',
    AUSFB: 'AU Small Finance Bank',
    FEDBNK: 'Federal Bank',
    FEDRL: 'Federal Bank',
    INDBNK: 'IndusInd Bank',
    INDUSB: 'IndusInd Bank',
    CANBNK: 'Canara Bank',
    CANARA: 'Canara Bank',
    BOBTXN: 'Bank of Baroda',
    BARODA: 'Bank of Baroda',
    PNBSMS: 'Punjab National Bank',
    PUNJAB: 'Punjab National Bank',
    BOISMS: 'Bank of India',
    BOIND: 'Bank of India',
    UNIONB: 'Union Bank of India',
    UBISMS: 'Union Bank of India',
    CBISMS: 'Central Bank of India',
    CBSSMS: 'Central Bank of India',
    YESBNK: 'YES Bank',
    YESB: 'YES Bank',
    RBLBNK: 'RBL Bank',
    RBLCRD: 'RBL Bank',
    PAYTMB: 'Paytm Payments Bank',
    PAYTM: 'Paytm Payments Bank',
    PYTMBK: 'Paytm Payments Bank',
    AIRTEL: 'Airtel Payments Bank',
    ATLPAY: 'Airtel Payments Bank',
    JIOPAY: 'Jio Payments Bank',
    SCISMS: 'Standard Chartered Bank',
    SCBL: 'Standard Chartered Bank',
    CITIBK: 'Citibank',
    CITI: 'Citibank',
    HSBCBK: 'HSBC Bank',
    HSBC: 'HSBC Bank',
    DBSBNK: 'DBS Bank',
    DBS: 'DBS Bank',
    IOBSMS: 'Indian Overseas Bank',
    INDIANB: 'Indian Bank',
    MAHABK: 'Bank of Maharashtra',
    UCOBNK: 'UCO Bank',
  };

  /**
   * Extract amount from SMS text.
   */
  public static extractAmount(body: string): number | null {
    let bestMatch: { amount: number; score: number } | null = null;

    for (const match of body.matchAll(this.MONEY_AMOUNT_REGEX)) {
      const rawAmount = match[1] ?? match[2];
      if (!rawAmount || match.index === undefined) continue;

      const amount = Number.parseFloat(rawAmount.replace(/,/g, ''));
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const start = match.index;
      const end = start + match[0].length;
      const nearbyText = body.slice(Math.max(0, start - 80), Math.min(body.length, end + 80));
      const precedingText = body.slice(Math.max(0, start - 48), start);
      const followingText = body.slice(end, Math.min(body.length, end + 48));
      const isBalanceAmount =
        /(?:avl\.?\s*bal(?:ance)?|avail(?:able)?\s*bal(?:ance)?|current\s*bal(?:ance)?|clear\s*bal(?:ance)?|closing\s*bal(?:ance)?|(?:account\s*)?balance)\s*(?:is|:|-)?\s*(?:rs\.?|inr|₹)?\s*$/i.test(
          precedingText
        ) ||
        /^\s*(?:is\s*)?(?:your\s*)?(?:avl\.?\s*bal(?:ance)?|available\s*balance|current\s*balance|clear\s*balance|closing\s*balance)\b/i.test(
          followingText
        );

      let score = -start / 100000;
      if (this.TRANSACTION_CONTEXT_REGEX.test(nearbyText)) score += 10;
      if (isBalanceAmount) score -= 20;
      if (this.NON_TRANSACTION_AMOUNT_REGEX.test(nearbyText)) score -= 12;
      if (this.TRANSACTION_CONTEXT_REGEX.test(precedingText)) score += 8;
      if (this.TRANSACTION_CONTEXT_REGEX.test(followingText)) score += 8;

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { amount, score };
      }
    }

    if (bestMatch) {
      return bestMatch.amount;
    }

    const directionalAmount = body.match(
      /\b(?:debited?|credited?|spent|paid|withdraw(?:n|al)?|transferred?|deducted|sent|purchas(?:e|ed)|charged|used|received|deposited|refunded?|cashback|added|reversed?|disbursed)\b(?:\s+\w+){0,3}?\s*(?:by|of|for|with)?\s*(?:rs\.?|inr|₹)?\s*([\d][\d,]*(?:\.\d{1,2})?)/i
    );
    if (directionalAmount?.[1]) {
      const amount = Number.parseFloat(directionalAmount[1].replace(/,/g, ''));
      return Number.isFinite(amount) && amount > 0 ? amount : null;
    }

    return null;
  }

  /**
   * Extract transaction direction (DEBIT or CREDIT).
   */
  public static extractDirection(body: string): TransactionDirection | null {
    const isTransferToOwnAccount =
      /\b(?:transferred?|remitted)\s+to\s+your\s+(?:a\/?c|account)\b/i.test(body);
    const debitPattern =
      /\b(?:debited?|auto[- ]debit|spent|paid|withdraw(?:n|al)?|deducted|sent|purchas(?:e|ed)|charged|used|dr)\b/i;
    const creditPattern =
      /\b(?:credited?|received|deposited|refunded?|cashback|added|reversed?|disbursed|cr)\b/i;

    const debitIndex = isTransferToOwnAccount ? -1 : body.search(debitPattern);
    const creditIndex = isTransferToOwnAccount
      ? body.search(/\b(?:transferred?|remitted)\b/i)
      : body.search(creditPattern);

    if (debitIndex !== -1 && creditIndex === -1) return 'DEBIT';
    if (creditIndex !== -1 && debitIndex === -1) return 'CREDIT';
    if (debitIndex !== -1 && creditIndex !== -1) {
      return debitIndex < creditIndex ? 'DEBIT' : 'CREDIT';
    }
    return null;
  }

  /**
   * Extract account mask (last digits of card or account).
   */
  public static extractAccountMask(body: string): string | null {
    for (const regex of this.ACCOUNT_MASK_REGEXES) {
      const match = body.match(regex);
      if (match && match[1]) {
        const raw = match[1].trim();
        // Standardize account masks after the full number has been captured.
        return raw.length > 4 ? raw.slice(-4) : raw;
      }
    }
    return null;
  }

  /**
   * Extract reference number (UPI Ref, UTR, Txn ID, RRN).
   */
  public static extractReferenceNumber(body: string): string | null {
    for (const regex of this.REF_NUMBER_REGEXES) {
      const match = body.match(regex);
      if (match && match[1]) {
        const ref = match[1].trim();
        if (ref.length >= 6) {
          return ref;
        }
      }
    }
    return null;
  }

  /**
   * Extract available balance.
   */
  public static extractAvailableBalance(body: string): number | null {
    for (const regex of this.AVAIL_BAL_REGEXES) {
      const match = body.match(regex);
      if (match && match[1]) {
        const raw = match[1].replace(/,/g, '');
        const parsed = parseFloat(raw);
        if (!isNaN(parsed) && parsed >= 0) {
          return parsed;
        }
      }
    }
    return null;
  }

  /**
   * Resolve bank name from SMS address (e.g. AX-HDFCBK) or message text.
   */
  public static resolveBank(address: string, body: string): string {
    const cleanAddress = address.toUpperCase();

    // Check sender address (typically XX-BANKBK)
    for (const [key, bankName] of Object.entries(this.BANK_MAPPINGS)) {
      if (cleanAddress.includes(key)) {
        return bankName;
      }
    }

    // Check body text for bank mentions
    if (/hdfc/i.test(body)) return 'HDFC Bank';
    if (/icici/i.test(body)) return 'ICICI Bank';
    if (/sbi|state bank/i.test(body)) return 'State Bank of India';
    if (/axis bank/i.test(body)) return 'Axis Bank';
    if (/kotak/i.test(body)) return 'Kotak Mahindra Bank';
    if (/idfc/i.test(body)) return 'IDFC FIRST Bank';
    if (/au bank|au small/i.test(body)) return 'AU Small Finance Bank';
    if (/federal bank/i.test(body)) return 'Federal Bank';
    if (/indusind/i.test(body)) return 'IndusInd Bank';
    if (/canara/i.test(body)) return 'Canara Bank';
    if (/\bbank of baroda\b|\bbob\s*:/i.test(body)) return 'Bank of Baroda';
    if (/pnb|punjab national/i.test(body)) return 'Punjab National Bank';
    if (/bank of india\b/i.test(body)) return 'Bank of India';
    if (/union bank/i.test(body)) return 'Union Bank of India';
    if (/central bank/i.test(body)) return 'Central Bank of India';
    if (/yes bank/i.test(body)) return 'YES Bank';
    if (/rbl bank/i.test(body)) return 'RBL Bank';
    if (/\bpaytm payments bank\b/i.test(body)) return 'Paytm Payments Bank';
    if (/\bairtel payments bank\b/i.test(body)) return 'Airtel Payments Bank';
    if (/standard chartered/i.test(body)) return 'Standard Chartered Bank';
    if (/citibank/i.test(body)) return 'Citibank';
    if (/hsbc/i.test(body)) return 'HSBC Bank';
    if (/dbs bank/i.test(body)) return 'DBS Bank';
    if (/indian overseas/i.test(body)) return 'Indian Overseas Bank';
    if (/indian bank/i.test(body)) return 'Indian Bank';
    if (/bank of maharashtra/i.test(body)) return 'Bank of Maharashtra';
    if (/uco bank/i.test(body)) return 'UCO Bank';

    // Heuristic for DLT bank sender suffix (e.g. XX-XYZBNK -> XYZ Bank)
    const senderMatch = cleanAddress.match(/^[A-Z]{2}-([A-Z0-9]{3,8})$/);
    if (senderMatch && senderMatch[1]) {
      const code = senderMatch[1];
      if (code.endsWith('BNK') || code.endsWith('BK')) {
        const prefix = code.replace(/(?:BNK|BK)$/, '');
        if (prefix.length >= 2) {
          return `${prefix} Bank`;
        }
      }
    }

    return 'Other Bank';
  }

  /**
   * Check if transaction text indicates a credit card.
   */
  public static isCreditCard(body: string): boolean {
    return (
      /\b(?:credit card|card ending|credit a\/?c|c-card|cardmember|bank card)\b/i.test(body) ||
      /\bcard\s+[xX*]*\d{3,4}\b/i.test(body)
    );
  }

  /**
   * Extract and clean merchant / counterparty name.
   */
  public static extractMerchant(body: string, bank: string): string {
    let merchant = '';

    for (const pattern of this.MERCHANT_PATTERNS) {
      const match = body.match(pattern);
      if (match && match[1]) {
        merchant = match[1].trim();
        break;
      }
    }

    if (!merchant) {
      // Special check for ATM withdrawals
      if (/\b(?:atm|cash wdl|cash withdrawal)\b/i.test(body)) {
        return 'ATM Cash Withdrawal';
      }
      // Special check for Salary
      if (/\b(?:salary|payroll|stipend)\b/i.test(body)) {
        return 'Salary Credit';
      }
      return `${bank} Transaction`;
    }

    // Sanitize merchant string
    merchant = merchant
      .replace(/^(?:info[- ]|vps\*|bil\/|upi\/|payment to\s+|(?:upi|vpa)\s+)/i, '')
      .replace(/(?:\s+vpa\b.*|\s+on\s+\d{1,2}.*|\s+upi\s+ref.*|\s+ref\s+no.*|\s+upi$)/i, '')
      .replace(/[^\w\s@&.-]/g, '')
      .trim();

    // If cleaned merchant is empty or just generic keywords
    if (!merchant || /^(?:your|the|account|card|bank)$/i.test(merchant)) {
      return `${bank} Transaction`;
    }

    return merchant;
  }

  /**
   * Main extraction pipeline for standard messages.
   */
  public static extract(
    message: RawSmsMessage,
    classification?: ClassificationResult
  ): ExtractedTransaction | null {
    const amount = this.extractAmount(message.body);
    if (!amount) {
      return null;
    }

    let direction = this.extractDirection(message.body);
    if (!direction && classification) {
      if (
        classification.classification === 'TRANSACTION_DEBIT' ||
        classification.classification === 'ATM_WITHDRAWAL' ||
        classification.classification === 'EMI' ||
        classification.classification === 'SUBSCRIPTION' ||
        classification.classification === 'BILL'
      ) {
        direction = 'DEBIT';
      } else if (
        classification.classification === 'TRANSACTION_CREDIT' ||
        classification.classification === 'SALARY_CREDIT'
      ) {
        direction = 'CREDIT';
      }
    }

    if (!direction) {
      return null;
    }

    const bank = this.resolveBank(message.address, message.body);
    const accountMask = this.extractAccountMask(message.body) || 'XXXX';
    const referenceNumber = this.extractReferenceNumber(message.body) || undefined;
    const availableBalance = this.extractAvailableBalance(message.body) ?? undefined;
    const merchant = this.extractMerchant(message.body, bank);

    return {
      amount,
      type: direction,
      merchant,
      bank,
      accountMask,
      referenceNumber,
      availableBalance,
      timestamp: message.date,
    };
  }
}

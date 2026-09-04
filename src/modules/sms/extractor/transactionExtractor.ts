import type {
  RawSmsMessage,
  ExtractedTransaction,
  ClassificationResult,
  TransactionDirection,
} from '@/modules/sms/types';

export class TransactionExtractor {
  private static readonly AMOUNT_REGEXES = [
    /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|inr|₹)/i,
    /(?:debited|credited|spent|paid|withdrawn)\s*(?:by|of)?\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  ];

  private static readonly ACCOUNT_MASK_REGEXES = [
    /(?:a\/c|acct|account|card)\s*(?:no\.?)?\s*(?:ending)?\s*[*xX]*(\d{3,6})/i,
    /[*xX]{2,}(\d{3,6})/,
    /\b(?:ending|ending with|ending in)\s*(\d{3,6})\b/i,
    /\ba\/c\s*(\d{3,6})\b/i,
  ];

  private static readonly REF_NUMBER_REGEXES = [
    /(?:upi\s*ref(?:\s*no\.?)?|ref(?:\s*no\.?)?|rrn|utr|txn\s*(?:id|no\.?)?)\s*[:\s-]*([a-zA-Z0-9]{6,25})/i,
    /(?:reference\s*no\.?)\s*[:\s-]*([a-zA-Z0-9]{6,25})/i,
  ];

  private static readonly AVAIL_BAL_REGEXES = [
    /(?:avl\s*bal|avail(?:able)?\s*bal(?:ance)?|bal|clear\s*bal)\s*(?:is|:)?\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:is\s*)?(?:your\s*)?(?:avl\s*bal|available\s*balance)/i,
  ];

  private static readonly MERCHANT_PATTERNS = [
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
    AXIS: 'Axis Bank',
    AXISBK: 'Axis Bank',
    KOTAK: 'Kotak Mahindra Bank',
    KOTAKB: 'Kotak Mahindra Bank',
    IDFC: 'IDFC FIRST Bank',
    IDFCFB: 'IDFC FIRST Bank',
    AUBANK: 'AU Small Finance Bank',
    FEDBNK: 'Federal Bank',
    FEDRL: 'Federal Bank',
    INDBNK: 'IndusInd Bank',
    INDUSB: 'IndusInd Bank',
    CANBNK: 'Canara Bank',
    CANARA: 'Canara Bank',
    BOBTXN: 'Bank of Baroda',
    BARODA: 'Bank of Baroda',
  };

  /**
   * Extract amount from SMS text.
   */
  public static extractAmount(body: string): number | null {
    for (const regex of this.AMOUNT_REGEXES) {
      const match = body.match(regex);
      if (match && match[1]) {
        const raw = match[1].replace(/,/g, '');
        const parsed = parseFloat(raw);
        if (!isNaN(parsed) && parsed > 0) {
          return parsed;
        }
      }
    }
    return null;
  }

  /**
   * Extract transaction direction (DEBIT or CREDIT).
   */
  public static extractDirection(body: string): TransactionDirection | null {
    const isDebit = /\b(?:debited|debit|auto[- ]debit|spent|paid|withdrawn|transferred|deducted|sent|purchase|dr)\b/i.test(body);
    const isCredit = /\b(?:credited|received|deposited|refunded?|cashback|added|cr)\b/i.test(body);

    if (isDebit && !isCredit) return 'DEBIT';
    if (isCredit && !isDebit) return 'CREDIT';
    if (isDebit && isCredit) {
      // Prioritize primary verb appearing first
      const debitIndex = body.search(/\b(?:debited|spent|paid|withdrawn)\b/i);
      const creditIndex = body.search(/\b(?:credited|received|deposited)\b/i);
      if (debitIndex !== -1 && (creditIndex === -1 || debitIndex < creditIndex)) {
        return 'DEBIT';
      }
      if (creditIndex !== -1) {
        return 'CREDIT';
      }
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
        return match[1].trim();
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
        if (!isNaN(parsed)) {
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
    if (/bob|bank of baroda/i.test(body)) return 'Bank of Baroda';

    return 'Other Bank';
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
      .replace(/^(?:info[- ]|vps\*|bil\/|upi\/|payment to\s+)/i, '')
      .replace(/(?:\s+vpa\b.*|\s+on\s+\d{1,2}.*|\s+upi\s+ref.*|\s+ref\s+no.*|\s+upi$)/i, '')
      .replace(/[^\w\s&.-]/g, '')
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
    const availableBalance = this.extractAvailableBalance(message.body) || undefined;
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

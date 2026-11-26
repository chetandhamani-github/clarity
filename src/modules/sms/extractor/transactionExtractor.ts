import type {
  RawSmsMessage,
  ExtractedTransaction,
  ClassificationResult,
  TransactionDirection,
} from '@/modules/sms/types';

export class TransactionExtractor {
  private static readonly MONEY_AMOUNT_REGEX =
    /(?:(?:₹|\$|€|£|(?:rs|inr|usd|eur|gbp)\.?|amt\.?|amount)\s*[:.-]?\s*([\d][\d,]*(?:\.\d{1,2})?)|([\d][\d,]*(?:\.\d{1,2})?)\s*(?:\/-\s*)?(?:₹|\$|€|£|(?:rs|inr|usd|eur|gbp)\.?|\/-))/gi;

  private static readonly TRANSACTION_CONTEXT_REGEX =
    /\b(?:debited?|credited?|spent|paid|withdraw(?:n|al)?|transferred?|deducted|sent|purchas(?:e|ed)?|charged|used|using|use|swiped|received|deposited|refunded?|refund|cashback|added|reversed?|disbursed|transaction|txn)\b/i;

  private static readonly AMOUNT_BEFORE_TRANSACTION_REGEX =
    /(?:\b(?:debited?|credited?|spent|paid|withdraw(?:n|al)?|transferred?|deducted|sent|purchas(?:e|ed)?|charged|used|using|use|swiped|received|deposited|refunded?|refund|cashback|added|reversed?|disbursed|transaction|txn|payment|done)\b)[\s\S]{0,100}?\s*(?:by|of|for|with|at|to|in|worth|value)?\s*$/i;

  private static readonly AMOUNT_AFTER_TRANSACTION_REGEX =
    /^\s*(?:(?:has\s+been|was|is)\s+)?(?:debited?|credited?|spent|paid|withdraw(?:n|al)?|transferred?|deducted|sent|purchas(?:e|ed)?|charged|used|swiped|received|deposited|refunded?|cashback|added|reversed?|disbursed|done)\b|^\s*(?:on|from|towards|for)\s+[\s\S]{0,60}?\b(?:debited?|credited?|spent|paid|charged|used|swiped|deducted|done)\b/i;

  private static readonly BALANCE_BEFORE_AMOUNT_REGEX =
    /(?:(?:total\s+)?(?:avl\.?|avail(?:able)?|current|clear|closing|account|acct|remaining)?\s*(?:bal(?:ance)?(?:\s*\/\s*(?:lmt|limit))?|lmt|limit|credit\s*limit|bal\s*limit|bal\s*lmt)|limit\s*(?:available|avl)|card\s*limit\s*available)\s*(?:is|was|:|-)?\s*(?:rs\.?|inr|usd|eur|gbp|₹|\$|€|£)?\s*$/i;

  private static readonly BALANCE_AFTER_AMOUNT_REGEX =
    /^\s*(?:is|was)?\s*(?:your\s*)?(?:(?:total\s+)?(?:avl\.?|avail(?:able)?|current|clear|closing)?\s*(?:bal(?:ance)?|lmt|limit|credit\s*limit|bal\s*limit)|remaining\s*limit|limit\s*available)\b/i;

  private static readonly NON_TRANSACTION_BEFORE_AMOUNT_REGEX =
    /\b(?:credit\s*limit|total\s*(?:credit\s*)?limit|total\s*lmt|tot\s*lmt|card\s*limit|cash\s*limit|minimum\s+(?:amount\s+)?due|min\s*(?:amount\s*)?due|min\s*amt\s*due|min\s*due|mad\b|total\s+(?:amount\s+)?due|total\s*due|tot\s*due|tad\b|amount\s+due|amt\s+due|past\s*due|overdue|outstanding\s*(?:bal(?:ance)?|amount|amt)?|outstanding|credit\s*line)\s*(?:is|was|:|-|of)?\s*(?:rs\.?|inr|usd|eur|gbp|₹|\$|€|£)?\s*$/i;

  private static readonly NON_TRANSACTION_AFTER_AMOUNT_REGEX =
    /^\s*(?:is|was)?\s*(?:the\s*|your\s*)?(?:credit\s*limit|total\s*(?:credit\s*)?limit|total\s*lmt|card\s*limit|cash\s*limit|minimum\s+(?:amount\s+)?due|min\s*due|min\s*amt\s*due|total\s+(?:amount\s+)?due|total\s*due|amount\s+due|outstanding)\b/i;

  private static readonly ACCOUNT_MASK_REGEXES = [
    /(?:a\/?c(?:count)?|acct?\.?|account|card)\s*(?:no\.?|number)?\s*(?:ending(?:\s+(?:with|in))?)?\s*[:#.\s-]*([xX*•#.-]*\d{3,18})\b/i,
    /\b(?:ending|ending with|ending in)\s*[:#.\s-]*([xX*•#.-]*\d{3,18})\b/i,
    /(?:[xX*•]{2,}\s*)+(\d{3,18})\b/,
  ];

  private static readonly REF_NUMBER_REGEXES = [
    /(?:upi\s*ref(?:\s*no\.?)?|ref(?:\s*no\.?)?|rrn|utr|txn\s*(?:id|no\.?)?)\s*[:\s-]*([a-zA-Z0-9]{6,25})/i,
    /(?:reference\s*no\.?)\s*[:\s-]*([a-zA-Z0-9]{6,25})/i,
  ];

  private static readonly AVAIL_BAL_REGEXES = [
    // 1. Intervening account/date patterns: "Bal in A/c 1234 is Rs. 100", "Balance for account XX1234 as of 15-Nov is INR 500", "Balance in your A/c on 19-Nov is Rs 100"
    /(?:(?:total\s+)?(?:avl\.?|avail(?:able)?)\s+bal(?:ance)?|bal(?:ance)?)\s+(?:in|for|of|on)\s+[\s\S]{0,50}?\b(?:is|was|:|-)?\s*(?:rs\.?|inr|usd|eur|gbp|₹|\$|€|£)\.?\s*([\d][\d,]*(?:\.\d{1,2})?)/i,
    // 2. Account before balance: "Your A/c 1234 balance as on 19-Nov is Rs 45,000.00"
    /(?:a\/?c(?:count)?|acct?\.?)\s*[\s\S]{0,30}?\b(?:bal(?:ance)?)\s*(?:as\s*on|as\s*of|on)?\s*[\s\S]{0,30}?\b(?:is|was|:|-)?\s*(?:rs\.?|inr|usd|eur|gbp|₹|\$|€|£)\.?\s*([\d][\d,]*(?:\.\d{1,2})?)/i,
    // 3. Standard keywords immediately before amount: "Avl Bal Rs 10,250", "Closing Balance: Rs 52,100"
    /(?:(?:total\s+)?(?:avl\.?|avail(?:able)?)\s*(?:bal(?:ance)?(?:\s*\/\s*(?:lmt|limit))?|lmt|limit|credit\s*limit)|(?:current|clear|closing|account|acct)?\s*bal(?:ance)?|bal\s*(?:lmt|limit)|remaining\s*(?:limit|credit\s*limit)|limit\s*(?:available|avl)|card\s*limit\s*available)\s*(?:is|was|:|-)?\s*(?:rs\.?|inr|usd|eur|gbp|₹|\$|€|£)?\s*([\d][\d,]*(?:\.\d{1,2})?)/i,
    // 4. Currency amount before balance keyword: "Rs 10,250 is your available balance"
    /(?:rs\.?|inr|usd|eur|gbp|₹|\$|€|£)\s*([\d][\d,]*(?:\.\d{1,2})?)\s*(?:is|was)?\s*(?:your\s*)?(?:(?:total\s+)?(?:avl\.?|avail(?:able)?)\s*(?:bal(?:ance)?|lmt|limit|credit\s*limit)|(?:current|clear|closing)?\s*bal(?:ance)?|bal\s*limit|remaining\s*limit|limit\s*available)/i,
  ];

  private static readonly MERCHANT_PATTERNS = [
    /\b(?:credited|received|deposited|(?:paid|sent|transferred)\s+you)\b[\s\S]{0,80}?\b(?:from|by)\s+([A-Za-z0-9@*.\-'&_\s]{2,80}?)(?:\s+(?:on|via|using|completed|credited|debited|upi\s+ref|ref|rrn|utr|avl\.?\s*bal|available\s+bal(?:ance)?|bal(?:ance)?)|[.;\n|]|$)/i,
    /(?:at|to|towards|vpa|paid to|transferred to|trf to|info\/)\s+([A-Za-z0-9@*.\-'&_\s]{2,40}?)(?:\s+on\b|\s+for\b|\s+from\b|\s+dated\b|\s+completed\b|\s+credited\b|\s+debited\b|\s+upi\s+ref|\s+ref|\s+avl|\s+not you|\s+via|\s+using|[.;\n|]|$)/i,
    /(?:info[:\s]+)([A-Za-z0-9@*.\-'&_\s]{2,40}?)(?:\s+on\b|\s+for\b|\s+from\b|\s+upi\s+ref|\s+ref|\s+avl|[.;\n|]|$)/i,
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
    const hasMultipleCurrencies =
      /(?:rs\.?|inr|₹)/i.test(body) && /(?:usd|eur|gbp|\$|€|£)/i.test(body);

    for (const match of body.matchAll(this.MONEY_AMOUNT_REGEX)) {
      const rawAmount = match[1] ?? match[2];
      if (!rawAmount || match.index === undefined) continue;

      const amount = Number.parseFloat(rawAmount.replace(/,/g, ''));
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const start = match.index;
      const end = start + match[0].length;
      const before = body.slice(Math.max(0, start - 120), start);
      const after = body.slice(end, Math.min(body.length, end + 120));
      const isBalanceAmount =
        this.BALANCE_BEFORE_AMOUNT_REGEX.test(before) ||
        this.BALANCE_AFTER_AMOUNT_REGEX.test(after);
      const isNonTransactionAmount =
        this.NON_TRANSACTION_BEFORE_AMOUNT_REGEX.test(before) ||
        this.NON_TRANSACTION_AFTER_AMOUNT_REGEX.test(after);
      const isDirectTransactionAmount =
        this.AMOUNT_BEFORE_TRANSACTION_REGEX.test(before) ||
        this.AMOUNT_AFTER_TRANSACTION_REGEX.test(after);

      const matchedText = match[0].toLowerCase();
      const isDomesticCurrency = /(?:₹|rs\.?|inr)/.test(matchedText);

      let score = 1 - start / 100000;
      if (isDirectTransactionAmount) score += 100;
      if (this.TRANSACTION_CONTEXT_REGEX.test(before) || this.TRANSACTION_CONTEXT_REGEX.test(after)) {
        score += 10;
      }
      if (isBalanceAmount) score -= 100;
      if (isNonTransactionAmount) score -= 80;

      // When message contains both foreign currency and domestic amount (e.g. approx/equivalent INR),
      // give preference to the domestic amount because the bank account ledger is debited in domestic currency.
      if (hasMultipleCurrencies && isDomesticCurrency) {
        score += 40;
      }

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { amount, score };
      }
    }

    if (bestMatch && bestMatch.score > 0) {
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
    // Check for pre-debit alerts or scheduled mandate notifications
    const isFutureDebitAlert =
      /\b(?:will\s+be|is\s+scheduled\s+to\s+be|scheduled\s+for|is\s+set\s+to\s+be)\s+(?:debited|deducted|auto[- ]debited)\b/i.test(body) ||
      /\bpre[- ]debit\s+notification\b/i.test(body);
    if (isFutureDebitAlert) {
      return null;
    }

    const isIncomingP2P = /\b(?:paid|sent|transferred)\s+you\b/i.test(body);
    if (isIncomingP2P) {
      return 'CREDIT';
    }

    const isTransferToOwnAccount =
      /\b(?:transferred?|remitted)\s+to\s+your\s+(?:a\/?c|account)\b/i.test(body);
    const debitPattern =
      /\b(?:debited?|auto[- ]debit|spent|paid|withdraw(?:n|al)?|deducted|sent|purchas(?:e|ed)|charged|used|using|use|swiped|dr)\b/i;
    const creditPattern =
      /\b(?:credited?|received|deposited|refunded?|cashback|added|reversed?|disbursed|cr)\b/i;

    const debitIndex = isTransferToOwnAccount ? -1 : body.search(debitPattern);
    const creditIndex = isTransferToOwnAccount
      ? body.search(/\b(?:transferred?|remitted)\b/i)
      : body.search(creditPattern);

    // Reversals, refunds, and cashback credits always represent money credited back into account
    const isReversalOrRefund =
      /\b(?:revers(?:ed|al)|refund(?:ed)?|cashback|credited\s+back)\b/i.test(body);
    if (isReversalOrRefund) {
      return 'CREDIT';
    }

    const isDebitedFromAccount =
      /\b(?:debited\s+from|auto[- ]debit\s+from|deducted\s+from|paid\s+from)\b/i.test(body);
    if (isDebitedFromAccount && !/\bcredited\s+to\b/i.test(body)) {
      return 'DEBIT';
    }

    if (debitIndex !== -1 && creditIndex === -1) return 'DEBIT';
    if (creditIndex !== -1 && debitIndex === -1) return 'CREDIT';
    if (debitIndex !== -1 && creditIndex !== -1) {
      return debitIndex < creditIndex ? 'DEBIT' : 'CREDIT';
    }
    return null;
  }

  /**
   * Extract account mask (last digits of card or account).
   * Contextually prioritizes source/debited account over destination cards/accounts.
   */
  public static extractAccountMask(body: string): string | null {
    // 1. Contextual match: prioritize source/debited or primary account
    const sourceContextMatch = body.match(
      /(?:from|debited\s+from|drawn\s+on|charged\s+to|credited\s+to|deposited\s+in)\s+(?:your\s+)?(?:a\/?c|acct|account|card)\s*(?:no\.?)?\s*[:#.\s-]*([xX*•#.-]*\d{3,18})\b/i
    );
    if (sourceContextMatch && sourceContextMatch[1]) {
      const digits = sourceContextMatch[1].replace(/[^0-9]/g, '');
      if (digits.length >= 3) {
        return digits.length > 4 ? digits.slice(-4) : digits;
      }
    }

    // 2. Standard account mask regexes fallback
    for (const regex of this.ACCOUNT_MASK_REGEXES) {
      const match = body.match(regex);
      if (match && match[1]) {
        const digits = match[1].replace(/[^0-9]/g, '');
        if (digits.length >= 3) {
          return digits.length > 4 ? digits.slice(-4) : digits;
        }
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
    const cleanAddress = address.toUpperCase().trim();
    const senderTokens = cleanAddress.split(/[^A-Z0-9]+/).filter(Boolean);

    // 1. Check DLT sender tokens for known bank signatures
    for (const token of senderTokens) {
      if (/^HDFC/i.test(token)) return 'HDFC Bank';
      if (/^(?:SBI|SBM)/i.test(token)) return 'State Bank of India';
      if (/^ICICI/i.test(token)) return 'ICICI Bank';
      if (/^AXIS/i.test(token)) return 'Axis Bank';
      if (/^(?:KOTAK|KMB)/i.test(token)) return 'Kotak Mahindra Bank';
      if (/^IDFC/i.test(token)) return 'IDFC FIRST Bank';
      if (/^(?:AUBANK|AUSFB)/i.test(token)) return 'AU Small Finance Bank';
      if (/^(?:FEDBNK|FEDRL|FEDBN|FEDERAL)/i.test(token)) return 'Federal Bank';
      if (/^(?:INDBNK|INDUSB|INDUS)/i.test(token)) return 'IndusInd Bank';
      if (/^(?:CANBNK|CANARA|CANSMS|CANBN)/i.test(token)) return 'Canara Bank';
      if (/^(?:BOBTXN|BOBSMS|BOBALT|BOBCRD|BARODA|BOBBNK)/i.test(token)) return 'Bank of Baroda';
      if (/^(?:PNBSMS|PNBBNK|PNBALT|PNBNET|PUNJAB)/i.test(token)) return 'Punjab National Bank';
      if (/^(?:BOISMS|BOIND|BOIBNK)/i.test(token)) return 'Bank of India';
      if (/^(?:UNIONB|UBISMS|UBIAUT|UNIONS)/i.test(token)) return 'Union Bank of India';
      if (/^(?:CBISMS|CBSSMS|CBIBNK)/i.test(token)) return 'Central Bank of India';
      if (/^(?:YESBNK|YESB|YESPAY|YESCRD)/i.test(token)) return 'YES Bank';
      if (/^(?:RBLBNK|RBLCRD|RBLSMS)/i.test(token)) return 'RBL Bank';
      if (/^(?:SCISMS|SCBL|STAN)/i.test(token)) return 'Standard Chartered Bank';
      if (/^(?:CITIBK|CITI)/i.test(token)) return 'Citibank';
      if (/^HSBC/i.test(token)) return 'HSBC Bank';
      if (/^DBS/i.test(token)) return 'DBS Bank';
      if (/^(?:IOBSMS|IOBTXN|IOB)/i.test(token)) return 'Indian Overseas Bank';
      if (/^IDBI/i.test(token)) return 'IDBI Bank';
      if (/^(?:MAHABK|BOMAH)/i.test(token)) return 'Bank of Maharashtra';
      if (/^(?:UCOBNK|UCO)/i.test(token)) return 'UCO Bank';
      if (/^BANDHN/i.test(token)) return 'Bandhan Bank';
      if (/^KVB/i.test(token)) return 'Karur Vysya Bank';
      if (/^CSB/i.test(token)) return 'CSB Bank';
      if (/^(?:SOUTHB|SIBLTD)/i.test(token)) return 'South Indian Bank';
      if (/^(?:JSFB|JANA)/i.test(token)) return 'Jana Small Finance Bank';
      if (/^ESAF/i.test(token)) return 'ESAF Small Finance Bank';
      if (/^(?:EQUITAS|EQITAS)/i.test(token)) return 'Equitas Small Finance Bank';
      if (/^(?:UJJIVAN|UJJIVN)/i.test(token)) return 'Ujjivan Small Finance Bank';
      if (/^INDIANB/i.test(token)) return 'Indian Bank';
      if (/^(?:PAYTMB|PAYTMBNK)/i.test(token)) return 'Paytm Payments Bank';
      if (/^(?:AIRTELB|AIRTELBK)/i.test(token)) return 'Airtel Payments Bank';
      if (/^(?:IPPB|IPPBNK)/i.test(token)) return 'India Post Payments Bank';
      if (/^(?:FIBANK|FIMONEY)/i.test(token)) return 'Fi Money';
      if (/^JUPITR/i.test(token)) return 'Jupiter Money';
      if (/^SLICE/i.test(token)) return 'Slice';
      if (/^CRED/i.test(token)) return 'CRED';
      if (/^AMEX/i.test(token)) return 'American Express';
      if (/^SCAPIA/i.test(token)) return 'Scapia Federal Bank';
      if (/^ONECRD/i.test(token)) return 'OneCard';
      if (/^KARNAT/i.test(token)) return 'Karnataka Bank';
      if (/^SVCBNK/i.test(token)) return 'SVC Co-operative Bank';
      if (/^SARASW/i.test(token)) return 'Saraswat Bank';
      if (/^COSMOS/i.test(token)) return 'Cosmos Bank';
    }

    // 1.5 Check full app / bank display names (e.g. from Android NotificationListenerService)
    const ADDRESS_NAME_MAPPINGS: Array<[RegExp, string]> = [
      [/\bhdfc\b/i, 'HDFC Bank'],
      [/\bicici\b/i, 'ICICI Bank'],
      [/\b(?:sbi|state bank)\b/i, 'State Bank of India'],
      [/\baxis\b/i, 'Axis Bank'],
      [/\bkotak\b/i, 'Kotak Mahindra Bank'],
      [/\bidfc\b/i, 'IDFC FIRST Bank'],
      [/\bau\s*small\b|\baubank\b/i, 'AU Small Finance Bank'],
      [/\bfederal\b/i, 'Federal Bank'],
      [/\bindusind\b/i, 'IndusInd Bank'],
      [/\bcanara\b/i, 'Canara Bank'],
      [/\bbank\s+of\s+baroda\b|\bbaroda\b/i, 'Bank of Baroda'],
      [/\bpunjab\s+national\b|\bpnb\b/i, 'Punjab National Bank'],
      [/\bbank\s+of\s+india\b/i, 'Bank of India'],
      [/\bunion\s+bank\b/i, 'Union Bank of India'],
      [/\bcentral\s+bank\b/i, 'Central Bank of India'],
      [/\bindian\s+overseas\b/i, 'Indian Overseas Bank'],
      [/\bindian\s+bank\b/i, 'Indian Bank'],
      [/\bbank\s+of\s+maharashtra\b/i, 'Bank of Maharashtra'],
      [/\bidbi\b/i, 'IDBI Bank'],
      [/\buco\b/i, 'UCO Bank'],
      [/\byes\s*bank\b/i, 'YES Bank'],
      [/\brbl\b/i, 'RBL Bank'],
      [/\bstandard\s+chartered\b/i, 'Standard Chartered Bank'],
      [/\bcitibank\b/i, 'Citibank'],
      [/\bhsbc\b/i, 'HSBC Bank'],
      [/\bdbs\b/i, 'DBS Bank'],
      [/\bairtel\s+payments\b/i, 'Airtel Payments Bank'],
      [/\bindia\s+post\s+payments\b/i, 'India Post Payments Bank'],
      [/\bjupiter\b/i, 'Jupiter Money'],
      [/\bfi\s*money\b/i, 'Fi Money'],
      [/\bslice\b/i, 'Slice'],
    ];

    for (const [pattern, bankName] of ADDRESS_NAME_MAPPINGS) {
      if (pattern.test(cleanAddress)) {
        return bankName;
      }
    }

    // Direct mapping lookup fallback
    for (const [key, bankName] of Object.entries(this.BANK_MAPPINGS)) {
      if (senderTokens.includes(key) || cleanAddress.includes(key)) {
        return bankName;
      }
    }

    // 2. Check body text for bank mentions
    if (/\bhdfc\b/i.test(body)) return 'HDFC Bank';
    if (/\bicici\b/i.test(body)) return 'ICICI Bank';
    if (/\b(?:sbi|state bank)\b/i.test(body)) return 'State Bank of India';
    if (/\baxis\b/i.test(body)) return 'Axis Bank';
    if (/\bkotak\b/i.test(body)) return 'Kotak Mahindra Bank';
    if (/\bidfc\b/i.test(body)) return 'IDFC FIRST Bank';
    if (/\b(?:au bank|au small|aubank)\b/i.test(body)) return 'AU Small Finance Bank';
    if (/\bfederal bank\b|\bfederal\s+a\/?c/i.test(body)) return 'Federal Bank';
    if (/\bindusind\b/i.test(body)) return 'IndusInd Bank';
    if (/\bcanara\b/i.test(body)) return 'Canara Bank';
    if (/\b(?:bank of baroda|baroda(?:\s+bank|\s+a\/?c)?|bob(?:\s+a\/?c|\s*:|\s+card|\s+bank|\s+upi))\b/i.test(body)) return 'Bank of Baroda';
    if (/\b(?:pnb|punjab national)\b/i.test(body)) return 'Punjab National Bank';
    if (/\bbank of india\b/i.test(body)) return 'Bank of India';
    if (/\b(?:union bank|ubi)\b/i.test(body)) return 'Union Bank of India';
    if (/\bcentral bank\b/i.test(body)) return 'Central Bank of India';
    if (/\byes bank\b/i.test(body)) return 'YES Bank';
    if (/\brbl\b/i.test(body)) return 'RBL Bank';
    if (/\bpaytm payments bank\b/i.test(body)) return 'Paytm Payments Bank';
    if (/\bairtel payments bank\b/i.test(body)) return 'Airtel Payments Bank';
    if (/\bjio payments bank\b/i.test(body)) return 'Jio Payments Bank';
    if (/\bstandard chartered\b/i.test(body)) return 'Standard Chartered Bank';
    if (/\bcitibank\b/i.test(body)) return 'Citibank';
    if (/\bhsbc\b/i.test(body)) return 'HSBC Bank';
    if (/\bdbs\b/i.test(body)) return 'DBS Bank';
    if (/\bindian overseas\b|\biob\b/i.test(body)) return 'Indian Overseas Bank';
    if (/\bindian bank\b/i.test(body)) return 'Indian Bank';
    if (/\bbank of maharashtra\b/i.test(body)) return 'Bank of Maharashtra';
    if (/\buco bank\b|\buco\b/i.test(body)) return 'UCO Bank';
    if (/\bbandhan bank\b/i.test(body)) return 'Bandhan Bank';
    if (/\bkarur vysya\b|\bkvb\b/i.test(body)) return 'Karur Vysya Bank';
    if (/\bcsb bank\b/i.test(body)) return 'CSB Bank';
    if (/\bsouth indian bank\b/i.test(body)) return 'South Indian Bank';
    if (/\bjana small\b|\bjsfb\b/i.test(body)) return 'Jana Small Finance Bank';
    if (/\besaf\b/i.test(body)) return 'ESAF Small Finance Bank';
    if (/\bequitas\b/i.test(body)) return 'Equitas Small Finance Bank';
    if (/\bujjivan\b/i.test(body)) return 'Ujjivan Small Finance Bank';

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
   * Check if transaction text or sender address indicates a credit card.
   */
  public static isCreditCard(body: string, address?: string): boolean {
    if (address) {
      const cleanAddress = address.toUpperCase();
      if (
        /(?:CRD|CC|CARD|ONECRD|AMEX)/i.test(cleanAddress) ||
        cleanAddress.includes('SBICRD') ||
        cleanAddress.includes('BOBCRD') ||
        cleanAddress.includes('RBLCRD')
      ) {
        return true;
      }
    }
    return (
      /\b(?:credit card|creditcard|card ending|credit a\/?c|c-card|cardmember|bank card|onecard|bobcard|scapia)\b/i.test(body) ||
      /\bcard\s+[xX*•#-]*\d{3,4}\b/i.test(body) ||
      /\b(?:sbi card|sbi credit card|hdfc card|icici card|axis card|kotak card|rbl card|idfc card|bob card|indusind card|federal card|citi card|scb card|au card|one card)\b/i.test(body) ||
      /\b(?:avl\s*lmt|avail\s*limit|credit\s*limit|bal\s*limit|total\s*limit|total\s*due|min\s*due|total\s*outstanding)\b/i.test(body)
    );
  }

  private static readonly MONTH_MAP: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };

  /**
   * Extracts the actual transaction date from SMS text if explicitly mentioned,
   * falling back to the SMS delivery timestamp on device.
   */
  public static extractDate(body: string, fallbackTimestamp: number): number {
    try {
      // "on DD-Mon-YY" or "on DD-Mon-YYYY" or "on DDMonYY" (e.g. "on 15-Jan-25", "on 12Jan26")
      const dMonMatch = body.match(
        /\b(?:on|dated)\s+(\d{1,2})[-/ ]?([A-Za-z]{3})[-/ ]?(\d{2,4})\b/i
      );
      if (dMonMatch) {
        const day = parseInt(dMonMatch[1], 10);
        const monKey = dMonMatch[2].toLowerCase();
        const rawYear = parseInt(dMonMatch[3], 10);
        const year = rawYear < 100 ? 2000 + rawYear : rawYear;
        const month = this.MONTH_MAP[monKey];

        if (month !== undefined && day >= 1 && day <= 31 && year >= 2020 && year <= 2035) {
          const fallbackDate = new Date(fallbackTimestamp);
          const parsed = new Date(year, month, day, fallbackDate.getHours(), fallbackDate.getMinutes());
          const time = parsed.getTime();
          if (!isNaN(time)) return time;
        }
      }

      // "on DD/MM/YYYY" or "on DD-MM-YYYY" or "on DD/MM/YY"
      const dNumMatch = body.match(
        /\b(?:on|dated)\s+(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/i
      );
      if (dNumMatch) {
        const day = parseInt(dNumMatch[1], 10);
        const month = parseInt(dNumMatch[2], 10) - 1;
        const rawYear = parseInt(dNumMatch[3], 10);
        const year = rawYear < 100 ? 2000 + rawYear : rawYear;

        if (month >= 0 && month <= 11 && day >= 1 && day <= 31 && year >= 2020 && year <= 2035) {
          const fallbackDate = new Date(fallbackTimestamp);
          const parsed = new Date(year, month, day, fallbackDate.getHours(), fallbackDate.getMinutes());
          const time = parsed.getTime();
          if (!isNaN(time)) return time;
        }
      }
    } catch {
      // Fallback gracefully
    }

    return fallbackTimestamp;
  }

  /**
   * Extract and clean merchant / counterparty name.
   */
  public static extractMerchant(body: string, _bank: string): string {
    let merchant = '';

    // 0. Check NPCI standard UPI format: UPI/P2M/... or UPI/P2P/... or UPI/DR/...
    const upiTokenMatch = body.match(/UPI\/(?:P2M|P2P|DR|CR)\/\d+\/([^/;\n]+)/i);
    if (upiTokenMatch && upiTokenMatch[1]) {
      const candidate = upiTokenMatch[1].replace(/[-_.]/g, ' ').trim();
      if (candidate.length >= 2 && !/^\d+$/.test(candidate)) {
        merchant = candidate;
      }
    }

    if (!merchant) {
      for (const pattern of this.MERCHANT_PATTERNS) {
        const match = body.match(pattern);
        if (match && match[1]) {
          merchant = match[1].trim();
          break;
        }
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
      return '';
    }

    // 1. Unmask payment aggregators and payment gateway prefixes
    merchant = merchant
      .replace(
        /^(?:RAZORPAY|RZP|BILLDESK|BIL|PAYU|CASHFREE|CCAVENUE|BHARATPE|PHONEPE(?:QR)?|GOOGLEPAY|GPAY|PAYTM(?:QR)?|CRED(?:_CLUB)?|PINELABS|AIRPAY|PAYGNXT|SETU|MSWIPE|EZECLICK|AMZN|MOBIKWIK|FREECHARGE)[*:\s_/-]*/i,
        ''
      )
      .trim();

    // 2. Sanitize merchant string
    merchant = merchant
      .replace(/^(?:UPI\/\d+\/|info[-:]\s*|vps\*|bil\/|upi\/|payment to\s+|(?:upi|vpa)\s+|to\s+vpa\s+|vpa\s+to\s+)/i, '')
      .replace(/(?:\s+vpa\b.*|\s+via\s+upi\b.*|\s+using\s+upi\b.*|\s+on\s+\d{1,2}.*|\s+for\s+(?:rs\.?|inr|₹|\$|€|£).*|\s+upi\s+ref.*|\s+ref\s+no.*|\s+upi$)/i, '')
      .replace(/[^\w\s@&.'-]/g, '')
      .trim();

    // 3. If merchant is a raw UPI VPA (e.g. "zomato@hdfcbank" or "user@okaxis" or "9876543210@paytm")
    if (merchant.includes('@')) {
      const parts = merchant.split('@');
      const handle = parts[0]?.trim() || '';

      // Check if handle is a 10-digit Indian mobile number (e.g. 9876543210@paytm)
      if (/^[6-9]\d{9}$/.test(handle)) {
        merchant = `+91 ${handle.slice(0, 5)} ${handle.slice(5)}`;
      } else {
        const nameMatch = handle.replace(/[-_.]/g, ' ').replace(/\d+$/, '').trim();
        if (nameMatch.length >= 3 && !/^\d+$/.test(nameMatch)) {
          merchant = nameMatch;
        } else if (handle.length >= 3) {
          merchant = handle;
        }
      }
    }

    // Clean trailing/leading symbols
    merchant = merchant.replace(/^[^\w+]+|[^\w]+$/g, '').trim();

    // If cleaned merchant is empty or just generic keywords
    if (!merchant || /^(?:your|the|account|card|bank)$/i.test(merchant)) {
      return '';
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
    if (classification?.classification === 'PRE_DEBIT_NOTIFICATION') {
      return null;
    }

    const isFutureDebitAlert =
      /\b(?:will\s+be|is\s+scheduled\s+to\s+be|scheduled\s+for|is\s+set\s+to\s+be)\s+(?:debited|deducted|auto[- ]debited)\b/i.test(message.body) ||
      /\bpre[- ]debit\s+notification\b/i.test(message.body);
    if (isFutureDebitAlert) {
      return null;
    }

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
    const isCard = this.isCreditCard(message.body, message.address);
    const availableBalance = !isCard ? (this.extractAvailableBalance(message.body) ?? undefined) : undefined;
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

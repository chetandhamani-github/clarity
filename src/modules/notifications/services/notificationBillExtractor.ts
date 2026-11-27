import type { BillFrequency } from '@/modules/bills/types/bill.types';
import type { BillerCategory } from '@/types';
import { getTargetAppConfig } from '../constants';
import type { RawNotificationPayload } from '../types';
import { buildNotificationBody, matchCanonicalBankName } from './notificationExtractor';

export interface ExtractedBill {
  billerName: string;
  billerCategory: BillerCategory;
  amountDue: number;
  minAmountDue?: number;
  dueDate: string; // YYYY-MM-DD
  accountReference?: string;
  paymentUrl?: string;
  frequency?: BillFrequency;
  isRecurring?: boolean;
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

interface BillerRule {
  pattern: RegExp;
  name: string;
  category: BillerCategory;
  defaultFrequency?: BillFrequency;
  isRecurring?: boolean;
}

const KNOWN_BILLER_RULES: BillerRule[] = [
  // Subscriptions & OTT
  { pattern: /\bnetflix\b/i, name: 'Netflix', category: 'subscription', defaultFrequency: 'monthly' },
  { pattern: /\bspotify\b/i, name: 'Spotify', category: 'subscription', defaultFrequency: 'monthly' },
  {
    pattern: /\b(?:amazon\s+prime|prime\s+video|prime\s+membership)\b/i,
    name: 'Amazon Prime',
    category: 'subscription',
    defaultFrequency: 'yearly',
  },
  {
    pattern: /\b(?:jiohotstar|disney\s*\+?\s*hotstar|hotstar)\b/i,
    name: 'JioHotstar',
    category: 'subscription',
    defaultFrequency: 'monthly',
  },
  {
    pattern: /\byoutube\s+premium\b/i,
    name: 'YouTube Premium',
    category: 'subscription',
    defaultFrequency: 'monthly',
  },
  { pattern: /\bapple\s+one\b/i, name: 'Apple One', category: 'subscription', defaultFrequency: 'monthly' },
  { pattern: /\bapple\s+music\b/i, name: 'Apple Music', category: 'subscription', defaultFrequency: 'monthly' },
  { pattern: /\bicloud\+?\b/i, name: 'iCloud+', category: 'subscription', defaultFrequency: 'monthly' },
  { pattern: /\bgoogle\s+one\b/i, name: 'Google One', category: 'subscription', defaultFrequency: 'monthly' },
  { pattern: /\bsonyliv\b/i, name: 'SonyLIV', category: 'subscription', defaultFrequency: 'monthly' },
  { pattern: /\bzee5\b/i, name: 'ZEE5', category: 'subscription', defaultFrequency: 'monthly' },
  { pattern: /\bjiosaavn\b/i, name: 'JioSaavn', category: 'subscription', defaultFrequency: 'monthly' },
  { pattern: /\b(?:chatgpt|openai)\b/i, name: 'ChatGPT', category: 'subscription', defaultFrequency: 'monthly' },
  { pattern: /\b(?:claude|anthropic)\b/i, name: 'Claude', category: 'subscription', defaultFrequency: 'monthly' },
  { pattern: /\bmicrosoft\s+365\b/i, name: 'Microsoft 365', category: 'subscription', defaultFrequency: 'yearly' },
  { pattern: /\badobe(?:\s+creative)?\b/i, name: 'Adobe', category: 'subscription', defaultFrequency: 'monthly' },
  { pattern: /\blinkedin\s+premium\b/i, name: 'LinkedIn Premium', category: 'subscription', defaultFrequency: 'monthly' },
  { pattern: /\bswiggy\s+one\b/i, name: 'Swiggy One', category: 'subscription', defaultFrequency: 'quarterly' },
  { pattern: /\bzomato\s+gold\b/i, name: 'Zomato Gold', category: 'subscription', defaultFrequency: 'quarterly' },
  { pattern: /\bcanva\b/i, name: 'Canva', category: 'subscription', defaultFrequency: 'monthly' },

  // Gym & Fitness
  { pattern: /\bcult\.?fit\b/i, name: 'Cult.fit', category: 'gym', defaultFrequency: 'monthly' },
  { pattern: /\b(?:gold'?s\s*gym|anytime\s*fitness|gym\s+membership)\b/i, name: 'Gym Membership', category: 'gym', defaultFrequency: 'monthly' },

  // Electricity Boards & Discoms
  { pattern: /\bbescom\b/i, name: 'BESCOM Electricity', category: 'electricity' },
  { pattern: /\btata\s*power(?:\s*ddl)?\b|\btpddl\b|\btpcodl\b|\btpnodl\b|\btpwodl\b|\btpsodl\b/i, name: 'Tata Power', category: 'electricity' },
  { pattern: /\badani\s*electricity\b/i, name: 'Adani Electricity', category: 'electricity' },
  { pattern: /\b(?:msedcl|mahavitaran|mahadiscom)\b/i, name: 'MSEDCL Mahavitaran', category: 'electricity' },
  { pattern: /\bbses\s+rajdhani\b/i, name: 'BSES Rajdhani', category: 'electricity' },
  { pattern: /\bbses\s+yamuna\b/i, name: 'BSES Yamuna', category: 'electricity' },
  { pattern: /\bbses\b/i, name: 'BSES Power', category: 'electricity' },
  { pattern: /\btangedco\b/i, name: 'TANGEDCO Electricity', category: 'electricity' },
  { pattern: /\bkseb\b/i, name: 'KSEB Electricity', category: 'electricity' },
  { pattern: /\bcesc\b/i, name: 'CESC Electricity', category: 'electricity' },
  { pattern: /\btorrent\s*power\b/i, name: 'Torrent Power', category: 'electricity' },
  { pattern: /\b(?:noida\s*power|npcl)\b/i, name: 'Noida Power (NPCL)', category: 'electricity' },
  { pattern: /\buppcl\b|\bmvvnl\b|\bpvvnl\b|\bdvvnl\b|\bpuvvnl\b/i, name: 'UPPCL Electricity', category: 'electricity' },
  { pattern: /\bpspcl\b/i, name: 'PSPCL Electricity', category: 'electricity' },
  { pattern: /\bdhbvn\b/i, name: 'DHBVN Electricity', category: 'electricity' },
  { pattern: /\buhbvn\b/i, name: 'UHBVN Electricity', category: 'electricity' },
  { pattern: /\bwbsedcl\b/i, name: 'WBSEDCL Electricity', category: 'electricity' },
  { pattern: /\bapspdcl\b|\bapepdcl\b/i, name: 'APSPDCL Electricity', category: 'electricity' },
  { pattern: /\btsspdcl\b|\btsnpdcl\b/i, name: 'TSSPDCL Electricity', category: 'electricity' },
  { pattern: /\b(?:jvvnl|avvnl|jdvvnl)\b/i, name: 'Rajasthan Discom', category: 'electricity' },
  { pattern: /\b(?:hescom|mescom|gescom|cescom)\b/i, name: 'Karnataka Electricity', category: 'electricity' },
  { pattern: /\b(?:sbpdcl|nbpdcl)\b/i, name: 'Bihar Electricity', category: 'electricity' },
  { pattern: /\b(?:dgvcl|mgvcl|pgvcl|ugvcl)\b/i, name: 'Gujarat Electricity', category: 'electricity' },
  { pattern: /\b(?:mpmkvvcl|mppkvvcl)\b/i, name: 'MP Electricity', category: 'electricity' },
  { pattern: /\bcspdcl\b/i, name: 'CSPDCL Electricity', category: 'electricity' },
  { pattern: /\bbest\s+(?:electricity|undertaking|power|bill)\b/i, name: 'BEST Electricity', category: 'electricity' },

  // Gas Utilities
  { pattern: /\b(?:igl|indraprastha\s*gas)\b/i, name: 'IGL Piped Gas', category: 'gas' },
  { pattern: /\b(?:mgl|mahanagar\s*gas)\b/i, name: 'Mahanagar Gas (MGL)', category: 'gas' },
  { pattern: /\badani\s*(?:total\s*)?gas\b/i, name: 'Adani Total Gas', category: 'gas' },
  { pattern: /\bgujarat\s*gas\b/i, name: 'Gujarat Gas', category: 'gas' },
  { pattern: /\bmngl\b/i, name: 'MNGL Gas', category: 'gas' },
  { pattern: /\bhp\s*gas\b/i, name: 'HP Gas', category: 'gas' },
  { pattern: /\bindane\b/i, name: 'Indane Gas', category: 'gas' },
  { pattern: /\bbharat\s*gas\b/i, name: 'Bharat Gas', category: 'gas' },

  // Water Utilities
  { pattern: /\bbwssb\b/i, name: 'BWSSB Water', category: 'water' },
  { pattern: /\b(?:delhi\s*jal\s*board|djb)\b/i, name: 'Delhi Jal Board', category: 'water' },
  { pattern: /\bhmwssb\b/i, name: 'HMWSSB Water', category: 'water' },
  { pattern: /\bcmwssb\b/i, name: 'CMWSSB Water', category: 'water' },
  { pattern: /\bbmc\s*water\b/i, name: 'BMC Water', category: 'water' },

  // DTH / Cable TV (before generic Airtel/Tata)
  { pattern: /\b(?:tata\s*play|tata\s*sky)\b/i, name: 'Tata Play DTH', category: 'dth' },
  { pattern: /\bairtel\s*(?:digital\s*tv|dth)\b/i, name: 'Airtel Digital TV', category: 'dth' },
  { pattern: /\bdish\s*tv\b/i, name: 'Dish TV', category: 'dth' },
  { pattern: /\b(?:videocon\s*d2h|d2h)\b/i, name: 'Videocon d2h', category: 'dth' },
  { pattern: /\bsun\s*direct\b/i, name: 'Sun Direct DTH', category: 'dth' },

  // Broadband / Fiber (before generic Airtel/Jio mobile)
  { pattern: /\bairtel\s*black\b/i, name: 'Airtel Black', category: 'broadband' },
  { pattern: /\bairtel\s*(?:xstream|fiber|broadband)\b/i, name: 'Airtel Xstream Fiber', category: 'broadband' },
  { pattern: /\bjio\s*(?:air)?fiber\b/i, name: 'JioFiber', category: 'broadband' },
  { pattern: /\bact\s*fibernet\b|\bact\s*broadband\b/i, name: 'ACT Fibernet', category: 'broadband' },
  { pattern: /\bhathway\b/i, name: 'Hathway Broadband', category: 'broadband' },
  { pattern: /\bexcitel\b/i, name: 'Excitel Broadband', category: 'broadband' },
  { pattern: /\byou\s*broadband\b/i, name: 'YOU Broadband', category: 'broadband' },
  { pattern: /\btikona\b/i, name: 'Tikona Broadband', category: 'broadband' },
  { pattern: /\bbsnl\s*(?:bharat\s*fiber|broadband|ftth)\b/i, name: 'BSNL Fiber', category: 'broadband' },
  { pattern: /\brailwire\b/i, name: 'RailWire Broadband', category: 'broadband' },

  // Mobile Postpaid & Recharges
  { pattern: /\bairtel\b/i, name: 'Airtel', category: 'mobile_postpaid' },
  { pattern: /\bjio\b/i, name: 'Jio', category: 'mobile_postpaid' },
  {
    pattern: /\b(?:vodafone\s*idea|vi\s+(?:postpaid|prepaid|plan|pack|bill|recharge|number))\b/i,
    name: 'Vi',
    category: 'mobile_postpaid',
  },
  { pattern: /\bbsnl\b/i, name: 'BSNL', category: 'mobile_postpaid' },

  // Society Maintenance & Rent
  { pattern: /\bmygate\b/i, name: 'MyGate Maintenance', category: 'maintenance' },
  { pattern: /\bnobrokerhood\b/i, name: 'NoBrokerHood Maintenance', category: 'maintenance' },
  { pattern: /\bapnacomplex\b/i, name: 'ApnaComplex Maintenance', category: 'maintenance' },

  // Insurance Providers
  { pattern: /\blic\b/i, name: 'LIC Insurance', category: 'insurance', defaultFrequency: 'yearly' },
  { pattern: /\bhdfc\s*(?:life|ergo)\b/i, name: 'HDFC Insurance', category: 'insurance', defaultFrequency: 'yearly' },
  { pattern: /\bicici\s*(?:prudential|lombard)\b/i, name: 'ICICI Insurance', category: 'insurance', defaultFrequency: 'yearly' },
  { pattern: /\bsbi\s*(?:life|general)\b/i, name: 'SBI Insurance', category: 'insurance', defaultFrequency: 'yearly' },
  { pattern: /\b(?:axis\s*)?max\s*life\b/i, name: 'Max Life Insurance', category: 'insurance', defaultFrequency: 'yearly' },
  { pattern: /\bbajaj\s*allianz\b/i, name: 'Bajaj Allianz', category: 'insurance', defaultFrequency: 'yearly' },
  { pattern: /\bstar\s*health\b/i, name: 'Star Health Insurance', category: 'insurance', defaultFrequency: 'yearly' },
  { pattern: /\bcare\s*health\b/i, name: 'Care Health Insurance', category: 'insurance', defaultFrequency: 'yearly' },
  { pattern: /\bniva\s*bupa\b/i, name: 'Niva Bupa Health', category: 'insurance', defaultFrequency: 'yearly' },
  { pattern: /\b(?:acko|go\s*digit|digit\s*insurance)\b/i, name: 'Insurance Renewal', category: 'insurance', defaultFrequency: 'yearly' },

  // NBFC / Loan Providers
  { pattern: /\bbajaj\s*(?:finserv|finance)\b/i, name: 'Bajaj Finserv EMI', category: 'loan_emi' },
  { pattern: /\btata\s*capital\b/i, name: 'Tata Capital EMI', category: 'loan_emi' },
  { pattern: /\bhome\s*credit\b/i, name: 'Home Credit EMI', category: 'loan_emi' },
  { pattern: /\baditya\s*birla\s*finance\b/i, name: 'Aditya Birla Finance', category: 'loan_emi' },
  { pattern: /\bl\s*&\s*t\s*finance\b/i, name: 'L&T Finance EMI', category: 'loan_emi' },
  { pattern: /\b(?:muthoot|manappuram)\b/i, name: 'Gold Loan EMI', category: 'loan_emi' },
];

const PAYMENT_APP_NAME_SET = new Set([
  'cred',
  'google pay',
  'gpay',
  'phonepe',
  'paytm',
  'amazon pay',
  'bhim',
  'mobikwik',
  'freecharge',
  'fampay',
  'super.money',
  'supermoney',
  'navi',
  'kiwi',
  'jupiter',
  'fi money',
  'slice',
]);

const GENERIC_TITLE_REGEX =
  /^(?:bill|due|bill\s+(?:due|alert|reminder)|upcoming\s+(?:bill|payment|autopay|mandate|debit)|payment\s+(?:due|reminder|alert)|pre-?debit(?:\s+notification)?|reminder|alert|notification|statement\s+(?:ready|generated|alert)|utility(?:\s+bill)?|credit\s+card(?:\s+bill)?|autopay(?:\s+(?:alert|reminder|mandate))?|e-?mandate(?:\s+alert)?|recharge(?:\s+reminder)?|plan\s+expiring|electricity|power|water|gas|piped\s+gas|broadband|wi-?fi|internet|mobile|postpaid|dth|insurance|loan|emi|rent|maintenance|tuition|school\s+fee)$/i;

const FUTURE_DEBIT_REGEX =
  /\b(?:will\s+be|would\s+be|is\s+scheduled\s+to\s+be|scheduled\s+to\s+be|set\s+to\s+be|due\s+to\s+be)\s+(?:auto[\s-]*)?(?:debited|deducted|charged)\b|\bupcoming\s+(?:autopay|e-?mandate|mandate|si)\b|\b(?:e-?mandate|autopay|standing\s+instruction)\s+(?:due|scheduled|alert|of)\b|\brenews?\s+(?:automatically\s+)?on\b/i;

const EXECUTED_PAYMENT_OR_NOISE_PATTERNS: RegExp[] = [
  /\b(?:otp|one[\s-]*time[\s-]*password|verification\s*code|cvv|mpin)\b/i,
  /\b(?:failed|declined|unsuccessful|rejected|bounced|cancelled|canceled|reversed)\b/i,
  /\b(?:refund(?:ed)?|cashback\s+credited)\b/i,
  /\b(?:offer|discount|cashback|win\s+up\s+to|reward\s+points?|voucher|coupon|pre-approved|apply\s+now|refer\s+and\s+earn|scratch\s+card|spin\s+and\s+win|save\s+up\s+to)\b/i,
  /\b(?:thank\s+you\s+for\s+(?:your\s+)?payment|thanks\s+for\s+paying|payment\s+(?:was\s+)?(?:received|successful)|paid\s+successfully|successfully\s+paid|bill\s+paid)\b/i,
  /\b(?:you\s+paid|paid\s+(?:rs\.?|inr|₹)|sent\s+(?:rs\.?|inr|₹))\b/i,
  /\b(?:credited\s+to\s+(?:your\s+)?a\/c|deposited\s+in)\b/i,
  /\b(?:has\s+requested|requested\s+(?:money|rs\.?|inr|₹)|collect\s+request)\b/i,
];

const EXECUTED_DEBIT_REGEX =
  /\b(?:was|has\s+been)\s+(?:auto[\s-]*)?(?:debited|deducted|charged)\b|(?<!will\s+be\s)(?<!would\s+be\s)(?<!to\s+be\s)\bdebited\s+(?:by|with)\b|(?<!will\s+be\s)(?<!would\s+be\s)(?<!to\s+be\s)\b(?:rs\.?|inr|₹)\s*\d+(?:,\d+)*(?:\.\d{1,2})?\s+debited\b/i;

const STRONG_BILL_TRIGGER_PATTERNS: RegExp[] = [
  /\btotal\s+(?:amt|amount)?\s*due\b/i,
  /\bmin(?:imum)?\s+(?:amt|amount)?\s*due\b/i,
  /\b(?:statement|bill)\s+(?:is\s+)?(?:generated|ready|issued)\b/i,
  /\bamount\s+(?:due|payable)\b|\bamt\s+payable\b|\bnet\s+payable\b/i,
  /\b(?:is|are)\s+due\s+(?:on|by|today|tomorrow|in\s+\d+)\b/i,
  /\bdue\s+(?:date|on|by|today|tomorrow|in\s+\d+)\b/i,
  /\bpay\s+(?:on\s+or\s+)?before\b|\bpay\s+by\b/i,
  /\bover\s*due\b/i,
  /\bemi\s+(?:is\s+)?due\b|\bloan\s+emi\b|\bemi\s+of\b/i,
  /\bpremium\s+due\b|\bpolicy\s+renewal\b|\bpolicy\s+expires?\b/i,
  /\b(?:plan|pack|validity|subscription|membership)(?:\s+(?:of|for)\s+[^\n.]{1,24})?\s+(?:is\s+|will\s+)?(?:expir(?:es|ing)|ends?|renews?|due)\b/i,
  /\brecharge\s+(?:due|reminder|required|before)\b/i,
  /\b(?:electricity|power|water|piped\s*gas|gas|broadband|wifi|wi-fi|internet|postpaid|dth|cable|credit\s*card|utility|maintenance|rent|tuition|school\s*fee|fastag)\s+bill\b/i,
  /\b(?:monthly\s+rent|rent\s+due|society\s+maintenance|maintenance\s+(?:due|charges?)|tuition\s+fee\s+due)\b/i,
  FUTURE_DEBIT_REGEX,
];

const LOW_BALANCE_ONLY_REGEX =
  /\blow\s+balance\b(?![\s\S]*(?:due|schedule|mandate|autopay|auto[\s-]*recharge\s+of|pay\s+by))/i;

const TOTAL_DUE_REGEX =
  /(?:total\s+(?:amt|amount)?\s*due|total\s+outstanding|bill\s+(?:amt|amount)|amount\s+due|amt\s+payable|amount\s+payable|net\s+payable|due\s+amount|emi\s+(?:amt|amount)|premium\s+(?:amt|amount)|monthly\s+rent|maintenance\s+(?:due|charges?)|fee\s+(?:due|amount))\s*(?:[:=-]|\bis\b)?\s*(?:(?:rs\.?|inr|₹)\s*)?(\d+(?:,\d+)*(?:\.\d{1,2})?)(?!\d|,\d|\.\d)/i;

const MIN_DUE_REGEX =
  /(?:min(?:imum)?\s*(?:amt|amount)?\s*due|mad)\s*(?:[:=-]|\bis\b)?\s*(?:(?:rs\.?|inr|₹)\s*)?(\d+(?:,\d+)*(?:\.\d{1,2})?)(?!\d|,\d|\.\d)/i;

const FUTURE_DEBIT_AMOUNT_REGEX =
  /(?:(?:rs\.?|inr|₹)\s*)?(\d+(?:,\d+)*(?:\.\d{1,2})?)(?!\d|,\d|\.\d)\s+(?:will\s+be|would\s+be|is\s+scheduled\s+to\s+be|scheduled\s+to\s+be|set\s+to\s+be|is\s+due\s+to\s+be)\s+(?:auto[\s-]*)?(?:debited|deducted|charged)/i;

const LABELED_BILL_AMOUNT_REGEX =
  /(?:(?:bill|statement|emi|premium|rent|invoice|mandate|autopay|renewal|subscription|recharge|plan|pack|maintenance|fee)\s+(?:of|for|amount|amt|is)?\s*(?:rs\.?|inr|₹)\s*|(?:\brs\.?|\binr|₹)\s*)(\d+(?:,\d+)*(?:\.\d{1,2})?)(?!\d|,\d|\.\d)(?=\s*(?:is\s+)?(?:due|payable|expir|schedule|will\s+be|to\s+|for\s+|bill|plan|pack|emi|rent|premium|mandate|autopay|recharge|maintenance|fee|on\s+|by\s+|before\s+|today|tomorrow|\n|,|\.|$))/i;

const GENERIC_CURRENCY_REGEX = /(?:rs\.?|inr|₹)\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)(?!\d|,\d|\.\d)/i;

const STRIP_NON_DUE_AMOUNTS_REGEX =
  /(?:credit\s+limit|avl\s+limit|available\s+limit|avl\s*bal(?:ance)?|available\s+balance|late\s+fee|penalty|fine|cashback|reward\s+points?|save\s+up\s+to|up\s+to)\s*(?:[:=-]|\bis\b|\bof\b)?\s*(?:rs\.?|inr|₹)?\s*\d+(?:,\d+)*(?:\.\d{1,2})?/gi;

const ACCOUNT_REF_PATTERNS: RegExp[] = [
  /(?:consumer\s*(?:no\.?|number|id)|ca\s*(?:no\.?|number)|service\s*(?:no\.?|number)|customer\s*id|subscriber\s*id|policy\s*(?:no\.?|number)|loan\s*(?:a\/c|acc(?:ount)?|no\.?)|agreement\s*(?:no\.?|id))\s*[:\-#is]*\s*([a-z0-9\-/]{4,20})/i,
  /(?:card|a\/c|account)\s*(?:no\.?|ending(?:\s+with|\s+in)?|number)?\s*[:\-#is]*\s*((?:x+|\*+)\d{3,6}|\d{4,12})/i,
  /(?:xx+|x{2,}|\*{2,})(\d{3,4})\b/i,
  /\b(?:ending|ends)\s+(?:with|in)\s+(\d{4})\b/i,
];

const URL_REGEX = /(https?:\/\/[^\s]+|upi:\/\/pay\?[^\s]+)/i;

function formatYmd(year: number, month: number, day: number): string {
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(year, month - 1, day);
  return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day;
}

function addDaysYmd(base: Date, days: number): string {
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return formatYmd(next.getFullYear(), next.getMonth() + 1, next.getDate());
}

function parseNumericAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  const num = parseFloat(raw.replace(/,/g, ''));
  if (!Number.isFinite(num) || num <= 0 || num >= 10_000_000) return null;
  return num;
}

function extractAmounts(body: string): { total: number; minDue?: number } | null {
  let minDue: number | undefined;
  const minMatch = body.match(MIN_DUE_REGEX);
  if (minMatch) {
    minDue = parseNumericAmount(minMatch[1]) ?? undefined;
  }

  const sanitized = body.replace(STRIP_NON_DUE_AMOUNTS_REGEX, ' ');

  const totalMatch = sanitized.match(TOTAL_DUE_REGEX);
  if (totalMatch) {
    const val = parseNumericAmount(totalMatch[1]);
    if (val !== null) return { total: val, minDue };
  }

  const futureDebitMatch = sanitized.match(FUTURE_DEBIT_AMOUNT_REGEX);
  if (futureDebitMatch) {
    const val = parseNumericAmount(futureDebitMatch[1]);
    if (val !== null) return { total: val, minDue };
  }

  const labeledMatch = sanitized.match(LABELED_BILL_AMOUNT_REGEX);
  if (labeledMatch) {
    const val = parseNumericAmount(labeledMatch[1]);
    if (val !== null) return { total: val, minDue };
  }

  const genericMatch = sanitized.match(GENERIC_CURRENCY_REGEX);
  if (genericMatch) {
    const val = parseNumericAmount(genericMatch[1]);
    if (val !== null) return { total: val, minDue };
  }

  return null;
}

function resolveYearForMonthDay(month: number, day: number, refDate: Date): number {
  const refYear = refDate.getFullYear();
  const candidate = new Date(refYear, month - 1, day);
  const diffDays = (candidate.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < -45) return refYear + 1;
  if (diffDays > 320) return refYear - 1;
  return refYear;
}

const MONTH_NAME_PATTERN =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

function matchTextualDate(
  body: string,
  regex: RegExp,
  localRef: Date,
  requireModalGuard: boolean
): string | null {
  const globalRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  for (const m of body.matchAll(globalRegex)) {
    const day = parseInt(m[1], 10);
    const monthRaw = m[2].toLowerCase();
    const month = MONTH_MAP[monthRaw];
    if (!month || day < 1 || day > 31) continue;

    if (requireModalGuard && monthRaw === 'may' && m.index !== undefined) {
      const afterMonth = body.slice(m.index + m[0].length);
      if (/^\s*(?:be|have|not|apply|change|expire|take|occur|get|need|also)\b/i.test(afterMonth)) {
        continue;
      }
    }

    let year = m[3] ? parseInt(m[3], 10) : resolveYearForMonthDay(month, day, localRef);
    if (year < 100) year += 2000;
    if (isValidYmd(year, month, day)) {
      return formatYmd(year, month, day);
    }
  }
  return null;
}

function matchMonthFirstDate(body: string, regex: RegExp, localRef: Date): string | null {
  const globalRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  for (const m of body.matchAll(globalRegex)) {
    const month = MONTH_MAP[m[1].toLowerCase()];
    const day = parseInt(m[2], 10);
    if (!month || day < 1 || day > 31) continue;
    let year = m[3] ? parseInt(m[3], 10) : resolveYearForMonthDay(month, day, localRef);
    if (year < 100) year += 2000;
    if (isValidYmd(year, month, day)) {
      return formatYmd(year, month, day);
    }
  }
  return null;
}

function matchNumericDate(body: string, regex: RegExp, localRef: Date): string | null {
  const globalRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  for (const m of body.matchAll(globalRegex)) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    let year = m[3] ? parseInt(m[3], 10) : resolveYearForMonthDay(month, day, localRef);
    if (year < 100) year += 2000;
    if (isValidYmd(year, month, day)) {
      return formatYmd(year, month, day);
    }
  }
  return null;
}

function matchIsoDate(body: string, regex: RegExp): string | null {
  const globalRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  for (const m of body.matchAll(globalRegex)) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    if (year >= 2020 && year <= 2099 && isValidYmd(year, month, day)) {
      return formatYmd(year, month, day);
    }
  }
  return null;
}

function extractDueDate(body: string, referenceTimestamp: number): { date: string; explicit: boolean } {
  const refDate = new Date(referenceTimestamp || Date.now());
  const localRef = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());

  // 1. Relative due phrases
  if (/\b(?:due|expir(?:es|ing)|scheduled|debit(?:ed)?|payable|renew(?:s|ing)?|ends?)\s+today\b/i.test(body)) {
    return { date: addDaysYmd(localRef, 0), explicit: true };
  }
  if (/\b(?:due|expir(?:es|ing)|scheduled|debit(?:ed)?|payable|renew(?:s|ing)?|ends?)\s+tomorrow\b/i.test(body)) {
    return { date: addDaysYmd(localRef, 1), explicit: true };
  }
  const inDaysMatch = body.match(
    /\b(?:due|expir(?:es|ing)|scheduled|debit(?:ed)?|payable|renew(?:s|ing)?|ends?)\s+(?:within|in)\s+(\d{1,2})\s+days?\b/i
  );
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1], 10);
    if (days >= 0 && days <= 90) {
      return { date: addDaysYmd(localRef, days), explicit: true };
    }
  }

  const DUE_CONTEXT =
    '(?:due\\s*(?:date|by|on)?|pay\\s*(?:on\\s+or\\s+)?by|on\\s+or\\s+before|before|last\\s+date(?:\\s+of\\s+payment)?|expir(?:es|ing)?\\s+on|renews?\\s+on|will\\s+be\\s+(?:auto[\\s-]*)?debited\\s+on|scheduled\\s+(?:for|on))\\s*(?:[:=-]|\\bis\\b)?\\s*';

  // 2. Prioritize all DUE_CONTEXT-anchored date formats before unanchored dates (prevents picking statement generation dates)
  const anchoredIso = matchIsoDate(body, new RegExp(`${DUE_CONTEXT}(\\d{4})[-/](\\d{1,2})[-/](\\d{1,2})`, 'i'));
  if (anchoredIso) return { date: anchoredIso, explicit: true };

  const anchoredTextual = matchTextualDate(
    body,
    new RegExp(`${DUE_CONTEXT}(\\d{1,2})(?:st|nd|rd|th)?[\\s\\-,]+(${MONTH_NAME_PATTERN})[\\s\\-,']*(\\d{2,4})?`, 'i'),
    localRef,
    false
  );
  if (anchoredTextual) return { date: anchoredTextual, explicit: true };

  const anchoredMonthFirst = matchMonthFirstDate(
    body,
    new RegExp(`${DUE_CONTEXT}(${MONTH_NAME_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[,\\s']+(\\d{2,4}))?`, 'i'),
    localRef
  );
  if (anchoredMonthFirst) return { date: anchoredMonthFirst, explicit: true };

  const anchoredNumeric = matchNumericDate(
    body,
    new RegExp(`${DUE_CONTEXT}(\\d{1,2})[./-](\\d{1,2})(?:[./-](\\d{2,4}))?`, 'i'),
    localRef
  );
  if (anchoredNumeric) return { date: anchoredNumeric, explicit: true };

  // 3. Unanchored absolute date fallbacks
  const unanchoredIso = matchIsoDate(body, /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (unanchoredIso) return { date: unanchoredIso, explicit: true };

  const unanchoredTextual = matchTextualDate(
    body,
    new RegExp(`(?<!\\d\\.)\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s\\-,]+(${MONTH_NAME_PATTERN})[\\s\\-,']*(\\d{2,4})?\\b`, 'i'),
    localRef,
    true
  );
  if (unanchoredTextual) return { date: unanchoredTextual, explicit: true };

  const unanchoredMonthFirst = matchMonthFirstDate(
    body,
    new RegExp(`\\b(${MONTH_NAME_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[,\\s']+(\\d{2,4}))?\\b`, 'i'),
    localRef
  );
  if (unanchoredMonthFirst) return { date: unanchoredMonthFirst, explicit: true };

  const unanchoredNumeric = matchNumericDate(body, /(?<!\d\.)\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/, localRef);
  if (unanchoredNumeric) return { date: unanchoredNumeric, explicit: true };

  // 4. Day-of-month shorthand ("due on 5th", "by the 10th")
  const dayOnlyMatch = body.match(
    /\b(?:due|pay|renews?|debited)\s+(?:on|by)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/i
  );
  if (dayOnlyMatch) {
    const day = parseInt(dayOnlyMatch[1], 10);
    if (day >= 1 && day <= 31) {
      let month = localRef.getMonth() + 1;
      let year = localRef.getFullYear();
      if (day < localRef.getDate() - 5) {
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
      const clampedDay = Math.min(day, new Date(year, month, 0).getDate());
      return { date: formatYmd(year, month, clampedDay), explicit: true };
    }
  }

  // Default fallback: 7 days from notification timestamp
  return { date: addDaysYmd(localRef, 7), explicit: false };
}

function detectBankInstitution(text: string, notification: RawNotificationPayload): string | null {
  const fromText = matchCanonicalBankName(text);
  if (fromText) return fromText;

  const appConfig = getTargetAppConfig(notification.packageName);
  if (appConfig?.appRole === 'bank' && appConfig.institution) {
    return appConfig.institution;
  }

  return null;
}

function formatCreditCardBillerName(bank: string): string {
  if (bank === 'State Bank of India') return 'SBI Card';
  if (bank === 'OneCard') return 'OneCard';
  if (bank === 'Slice') return 'Slice Card';
  if (bank === 'American Express') return 'American Express Card';
  return `${bank} Credit Card`;
}

function inferFrequency(
  body: string,
  defaultFrequency: BillFrequency = 'monthly',
  defaultRecurring: boolean = true
): { frequency: BillFrequency; isRecurring: boolean } {
  if (/\b(?:annual(?:ly)?|yearly|per\s+year|\/\s*yr|1\s*year)\b/i.test(body)) {
    return { frequency: 'yearly', isRecurring: true };
  }
  if (/\b(?:quarterly|every\s+3\s+months?|84\s*days?)\b/i.test(body)) {
    return { frequency: 'quarterly', isRecurring: true };
  }
  if (/\b(?:weekly|every\s+week)\b/i.test(body)) {
    return { frequency: 'weekly', isRecurring: true };
  }
  if (/\b(?:monthly|every\s+month|per\s+month|\/\s*mo)\b/i.test(body)) {
    return { frequency: 'monthly', isRecurring: true };
  }
  if (/\b(?:prepaid|pack\s+expir(?:es|ing)|validity\s+expir(?:es|ing)|one[\s-]*time)\b/i.test(body)) {
    return { frequency: 'one_time', isRecurring: false };
  }
  return { frequency: defaultFrequency, isRecurring: defaultRecurring };
}

function cleanDynamicTitle(rawTitle: string): string | null {
  let cleaned = rawTitle
    .replace(/^(?:bill\s+due|upcoming\s+bill|payment\s+due|payment\s+reminder|reminder|autopay|e-?mandate|pay)\s*[:-]\s*/i, '')
    .replace(/\b(?:bill\s+of|of\s+(?:rs\.?|inr|₹)|is\s+due|due\s+on).*$/i, '')
    .replace(/\b(?:rs\.?|inr|₹)\s*\d+(?:,\d+)*(?:\.\d{1,2})?\b.*$/i, '')
    .replace(/^(?:your|pay)\s+/i, '')
    .replace(/\s+(?:bill|reminder|alert|due)$/i, '')
    .trim();

  cleaned = cleaned.replace(/^[:\s-]+|[:\s-]+$/g, '').trim();
  if (cleaned.length < 3 || cleaned.length > 48) return null;

  const lower = cleaned.toLowerCase();
  if (PAYMENT_APP_NAME_SET.has(lower) || GENERIC_TITLE_REGEX.test(cleaned)) {
    return null;
  }
  return cleaned;
}

function extractProviderFromBody(body: string): string | null {
  const fromBillPhrase = body.match(
    /(?:[Yy]our|[Pp]ay|[Pp]ending|[Uu]pcoming)\s+([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,3})\s+(?:[Ee]lectricity|[Ww]ater|[Pp]iped\s*[Gg]as|[Gg]as|[Bb]roadband|[Ff]iber|[Ww]i-?[Ff]i|[Pp]ostpaid|[Dd][Tt][Hh]|[Cc]redit\s*[Cc]ard|[Ll]oan|[Ee][Mm][Ii]|[Ii]nsurance|[Mm]aintenance|[Rr]ent|[Uu]tility|[Bb]ill|[Ss]tatement)\b/
  );
  if (fromBillPhrase?.[1]) {
    const candidate = fromBillPhrase[1].trim();
    if (
      candidate.length >= 3 &&
      !PAYMENT_APP_NAME_SET.has(candidate.toLowerCase()) &&
      !GENERIC_TITLE_REGEX.test(candidate)
    ) {
      return candidate;
    }
  }

  const fromMandatePhrase = body.match(
    /(?:[Mm]andate|[Aa]utopay|[Rr]enewal|[Ss]ubscription)\s+(?:[Ff]or|[Ww]ith|[Aa]t|[Tt]o)\s+([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,2}?)(?=\s+(?:on|due|of|for|is|has|will|before|mandate|autopay|,|\.)|$)/
  );
  if (fromMandatePhrase?.[1]) {
    const candidate = fromMandatePhrase[1].trim();
    if (
      candidate.length >= 3 &&
      !PAYMENT_APP_NAME_SET.has(candidate.toLowerCase()) &&
      !GENERIC_TITLE_REGEX.test(candidate)
    ) {
      return candidate;
    }
  }

  return null;
}

function detectBillerAndCategory(
  body: string,
  notification: RawNotificationPayload
): {
  category: BillerCategory;
  billerName: string;
  frequency: BillFrequency;
  isRecurring: boolean;
  confidence: number;
} | null {
  const combined = `${notification.title || ''} ${body}`.trim();

  // 1. Explicit Credit Cards (avoid matching generic utility "total amt due" here)
  if (
    /\b(?:credit\s*card|sbi\s*card|bobcard|one\s*card|onecard|card\s+(?:bill|statement|ending)|min(?:imum)?\s*(?:amt|amount)?\s*due)\b/i.test(
      combined
    )
  ) {
    const bank = detectBankInstitution(combined, notification);
    const freq = inferFrequency(combined, 'monthly', true);
    if (bank) {
      return {
        category: 'credit_card',
        billerName: formatCreditCardBillerName(bank),
        ...freq,
        confidence: 0.96,
      };
    }
    return { category: 'credit_card', billerName: 'Credit Card', ...freq, confidence: 0.85 };
  }

  // 2. Known Billers, Discoms, Telecoms, OTTs, Insurers, NBFCs
  for (const rule of KNOWN_BILLER_RULES) {
    if (rule.pattern.test(combined)) {
      const freq = inferFrequency(
        combined,
        rule.defaultFrequency ?? 'monthly',
        rule.isRecurring ?? true
      );
      return {
        category: rule.category,
        billerName: rule.name,
        ...freq,
        confidence: 0.94,
      };
    }
  }

  // 3. Loan EMI
  if (/\b(?:loan\s+emi|emi\s+due|emi\s+of|home\s+loan|car\s+loan|personal\s+loan|auto\s+loan|education\s+loan|instal?lment\s+due)\b/i.test(combined)) {
    const bank = detectBankInstitution(combined, notification);
    const dynamicName = extractProviderFromBody(combined);
    const billerName = bank ? `${bank} Loan EMI` : dynamicName || 'Loan EMI';
    const freq = inferFrequency(combined, 'monthly', true);
    return { category: 'loan_emi', billerName, ...freq, confidence: 0.9 };
  }

  // 4. Generic category keywords + dynamic provider resolution
  const dynamicProvider =
    extractProviderFromBody(body) || cleanDynamicTitle(notification.title || '');

  if (/\b(?:electricity|power\s+bill|discom)\b/i.test(combined)) {
    return {
      category: 'electricity',
      billerName: dynamicProvider ? `${dynamicProvider}` : 'Electricity Bill',
      ...inferFrequency(combined, 'monthly', true),
      confidence: 0.88,
    };
  }
  if (/\b(?:piped\s*gas|lpg|gas\s+bill)\b/i.test(combined)) {
    return {
      category: 'gas',
      billerName: dynamicProvider || 'Gas Utility Bill',
      ...inferFrequency(combined, 'monthly', true),
      confidence: 0.88,
    };
  }
  if (/\b(?:water\s+bill|water\s+charges?|water\s+board)\b/i.test(combined)) {
    return {
      category: 'water',
      billerName: dynamicProvider || 'Water Bill',
      ...inferFrequency(combined, 'monthly', true),
      confidence: 0.88,
    };
  }
  if (/\b(?:broadband|wi-?fi|fibernet|internet\s+bill|fiber\s+plan)\b/i.test(combined)) {
    return {
      category: 'broadband',
      billerName: dynamicProvider || 'Broadband Internet',
      ...inferFrequency(combined, 'monthly', true),
      confidence: 0.87,
    };
  }
  if (/\b(?:dth|cable\s*tv|set\s*top\s*box)\b/i.test(combined)) {
    return {
      category: 'dth',
      billerName: dynamicProvider || 'DTH Subscription',
      ...inferFrequency(combined, 'monthly', true),
      confidence: 0.87,
    };
  }
  if (/\b(?:mobile\s+postpaid|postpaid\s+bill|mobile\s+recharge|plan\s+expir(?:es|ing)|pack\s+expir(?:es|ing))\b/i.test(combined)) {
    return {
      category: 'mobile_postpaid',
      billerName: dynamicProvider || 'Mobile Bill',
      ...inferFrequency(combined, 'monthly', true),
      confidence: 0.85,
    };
  }
  if (/\b(?:insurance|policy\s+(?:due|renewal)|premium\s+due)\b/i.test(combined)) {
    return {
      category: 'insurance',
      billerName: dynamicProvider || 'Insurance Premium',
      ...inferFrequency(combined, 'yearly', true),
      confidence: 0.88,
    };
  }
  if (/\b(?:society\s+maintenance|maintenance\s+(?:due|bill|charges?))\b/i.test(combined)) {
    return {
      category: 'maintenance',
      billerName: dynamicProvider || 'Society Maintenance',
      ...inferFrequency(combined, 'monthly', true),
      confidence: 0.88,
    };
  }
  if (/\b(?:house\s+rent|monthly\s+rent|rent\s+(?:due|bill|payment))\b/i.test(combined)) {
    return {
      category: 'rent',
      billerName: dynamicProvider || 'House Rent',
      ...inferFrequency(combined, 'monthly', true),
      confidence: 0.88,
    };
  }
  if (/\b(?:tuition\s+fee|school\s+fee|college\s+fee|semester\s+fee)\b/i.test(combined)) {
    return {
      category: 'tuition',
      billerName: dynamicProvider || 'School / Tuition Fee',
      ...inferFrequency(combined, 'monthly', true),
      confidence: 0.86,
    };
  }
  if (/\bfastag\b/i.test(combined)) {
    const bank = detectBankInstitution(combined, notification);
    return {
      category: 'other',
      billerName: bank ? `${bank} FASTag` : 'FASTag Recharge',
      ...inferFrequency(combined, 'one_time', false),
      confidence: 0.84,
    };
  }
  if (/\b(?:subscription|e-?mandate|mandate|autopay|standing\s+instruction)\b/i.test(combined)) {
    return {
      category: 'subscription',
      billerName: dynamicProvider || 'Recurring Subscription',
      ...inferFrequency(combined, 'monthly', true),
      confidence: 0.82,
    };
  }

  return {
    category: 'other',
    billerName: dynamicProvider || 'Utility Bill',
    ...inferFrequency(combined, 'monthly', true),
    confidence: 0.72,
  };
}

function extractAccountReference(body: string): string | undefined {
  for (const regex of ACCOUNT_REF_PATTERNS) {
    const m = body.match(regex);
    if (m?.[1]) {
      const ref = m[1].trim();
      if (ref.length >= 4 && !/^(?:rs|inr|due|date|amt|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i.test(ref)) {
        return ref.toUpperCase();
      }
    }
  }
  return undefined;
}

function extractPaymentUrl(body: string): string | undefined {
  const m = body.match(URL_REGEX);
  if (!m?.[1]) return undefined;
  return m[1].replace(/[.,;)\]]+$/, '');
}

export class NotificationBillExtractor {
  /**
   * Extract a pending bill, utility due alert, plan expiration, or future autopay/mandate reminder
   * from a push notification payload.
   */
  public static extractBill(
    notification: RawNotificationPayload,
    prebuiltBody?: string
  ): ExtractedBill | null {
    const body = (prebuiltBody ?? buildNotificationBody(notification)).trim();
    if (!body || body.length < 10) return null;

    // Normalize away advisory disclaimers like "Please ignore if already paid" before noise filtering
    const cleanForFilter = body
      .replace(/\b(?:please\s+)?(?:ignore|disregard)\s+(?:this\s+(?:message|alert|reminder)\s+)?if\s+(?:you\s+have\s+)?already\s+paid\.?/gi, '')
      .trim();

    if (LOW_BALANCE_ONLY_REGEX.test(cleanForFilter)) {
      return null;
    }

    for (const pattern of EXECUTED_PAYMENT_OR_NOISE_PATTERNS) {
      if (pattern.test(cleanForFilter)) {
        return null;
      }
    }

    const isFutureMandate = FUTURE_DEBIT_REGEX.test(cleanForFilter);
    if (!isFutureMandate && EXECUTED_DEBIT_REGEX.test(cleanForFilter)) {
      return null;
    }

    // Must match at least one clear bill, statement, utility, expiry, or mandate trigger
    const hasTrigger = STRONG_BILL_TRIGGER_PATTERNS.some((pattern) => pattern.test(cleanForFilter));
    if (!hasTrigger) {
      return null;
    }

    const amounts = extractAmounts(cleanForFilter);
    if (!amounts || amounts.total <= 0) {
      return null;
    }

    const { date: dueDate, explicit: hasExplicitDate } = extractDueDate(
      cleanForFilter,
      notification.postTime || Date.now()
    );

    // Require an explicit due date when the message lacks an unmistakable statement/mandate trigger
    if (
      !hasExplicitDate &&
      !/\b(?:statement\s+(?:is\s+)?generated|bill\s+(?:is\s+)?generated|total\s+(?:amt|amount)?\s*due|emi\s+(?:is\s+)?due|autopay|e-?mandate)\b/i.test(
        cleanForFilter
      )
    ) {
      return null;
    }

    const detected = detectBillerAndCategory(cleanForFilter, notification);
    if (!detected) return null;

    return {
      billerName: detected.billerName,
      billerCategory: detected.category,
      amountDue: amounts.total,
      minAmountDue: amounts.minDue,
      dueDate,
      accountReference: extractAccountReference(cleanForFilter),
      paymentUrl: extractPaymentUrl(body),
      frequency: detected.frequency,
      isRecurring: detected.isRecurring,
      confidence: hasExplicitDate ? detected.confidence : Math.min(detected.confidence, 0.8),
    };
  }
}

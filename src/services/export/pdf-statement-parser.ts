import type { TransactionType } from '@/types';
import * as FileSystem from 'expo-file-system/legacy';

export interface ParsedPdfTransaction {
  date: string; // YYYY-MM-DD
  merchant: string;
  amount: number;
  type: TransactionType;
  category: string;
  referenceNumber?: string;
  note?: string;
  balance?: number;
}

export interface BankProfile {
  id: string;
  name: string;
  passwordHint: string;
}

export const SUPPORTED_BANK_PROFILES: BankProfile[] = [
  {
    id: 'auto',
    name: 'Auto-Detect',
    passwordHint: 'Enter your statement password (usually PAN, DOB, or Mobile digits)',
  },
  {
    id: 'hdfc',
    name: 'HDFC Bank',
    passwordHint: 'Customer ID (all caps) or PAN in uppercase',
  },
  {
    id: 'sbi',
    name: 'State Bank of India (SBI)',
    passwordHint: 'Last 5 digits of registered mobile + DOB (DDMM)',
  },
  {
    id: 'icici',
    name: 'ICICI Bank',
    passwordHint: 'First 4 letters of name (lowercase) + DOB (DDMM)',
  },
  {
    id: 'axis',
    name: 'Axis Bank',
    passwordHint: 'First 4 letters of name (uppercase) + Last 4 digits of account',
  },
  {
    id: 'kotak',
    name: 'Kotak Mahindra',
    passwordHint: 'Customer Relationship Number (CRN) or DOB (DDMMYYYY)',
  },
  {
    id: 'generic',
    name: 'Other Bank',
    passwordHint: 'Enter your statement unlock password',
  },
];

/**
 * Checks if a PDF buffer/content contains an /Encrypt dictionary.
 */
export function checkIsPdfEncrypted(rawContent: string): boolean {
  if (!rawContent) return false;
  const encryptionPatterns = [
    /\/encrypt\b/i,
    /\/filter\s*\/\s*(?:standard|adobe\.pubsec|stdcf)/i,
    /\/type\s*\/encrypt\b/i,
    /\/stdcf\b/i,
    /\/aesv[23]\b/i,
    /\/o\s*(?:<|\()/i,
    /\/u\s*(?:<|\()/i,
    /\/p\s+-[0-9]+/i,
    /\/perms\b/i,
    /\/standard\b/i,
  ];
  return encryptionPatterns.some((pattern) => pattern.test(rawContent));
}

/**
 * Infers category from narration text.
 */
function inferCategory(narration: string): string {
  const lower = narration.toLowerCase();
  if (lower.includes('swiggy') || lower.includes('zomato') || lower.includes('food') || lower.includes('restaurant') || lower.includes('cafe')) {
    return 'Dining';
  }
  if (lower.includes('blinkit') || lower.includes('zepto') || lower.includes('instamart') || lower.includes('grocery') || lower.includes('supermarket')) {
    return 'Groceries';
  }
  if (lower.includes('uber') || lower.includes('ola') || lower.includes('fuel') || lower.includes('petrol') || lower.includes('metro')) {
    return 'Transport';
  }
  if (lower.includes('amazon') || lower.includes('flipkart') || lower.includes('myntra') || lower.includes('store')) {
    return 'Shopping';
  }
  if (lower.includes('netflix') || lower.includes('spotify') || lower.includes('prime') || lower.includes('hotstar')) {
    return 'Subscriptions';
  }
  if (lower.includes('electricity') || lower.includes('water') || lower.includes('broadband') || lower.includes('recharge') || lower.includes('airtel') || lower.includes('jio')) {
    return 'Utilities';
  }
  if (lower.includes('hospital') || lower.includes('pharmacy') || lower.includes('apollo') || lower.includes('medical') || lower.includes('doctor')) {
    return 'Health';
  }
  if (lower.includes('salary') || lower.includes('payroll') || lower.includes('stipend')) {
    return 'Salary';
  }
  if (lower.includes('rent') || lower.includes('landlord')) {
    return 'Rent';
  }
  return 'Other';
}

/**
 * Standardizes DD/MM/YYYY, DD-MM-YYYY, or YYYY-MM-DD into YYYY-MM-DD.
 */
function normalizeDate(rawDate: string): string | null {
  const trimmed = rawDate.trim();
  // Match DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    let year = dmyMatch[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  // Match YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Match DD Mon YYYY (e.g. 15 Oct 2024 or 15-Oct-2024)
  const monMatch = trimmed.match(/^(\d{1,2})[ -]([a-zA-Z]{3})[ -](\d{2,4})$/);
  if (monMatch) {
    const day = monMatch[1].padStart(2, '0');
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const month = months[monMatch[2].toLowerCase()] || '01';
    let year = monMatch[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  return null;
}

export interface PdfParseResult {
  success: boolean;
  isEncrypted: boolean;
  transactions: ParsedPdfTransaction[];
  errors: string[];
  closingBalance?: number;
  statementDate?: string;
}

/**
 * Parses raw text content extracted from a bank statement PDF.
 */
export function parseBankStatementPdfText(text: string): PdfParseResult {
  const transactions: ParsedPdfTransaction[] = [];
  const errors: string[] = [];

  const lines = text.split(/\r?\n/);
  // Regex to match a line that starts with a date followed by narration and amounts
  const dateRegex = /(\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{1,2}[ -][a-zA-Z]{3}[ -]\d{2,4}\b)/;
  // Regex to match monetary amounts with optional commas
  const amountRegex = /(\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?)/g;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 10) continue;

    const dateMatch = trimmed.match(dateRegex);
    if (!dateMatch) continue;

    const rawDate = dateMatch[0];
    const normalizedDate = normalizeDate(rawDate);
    if (!normalizedDate) continue;

    // Remove the date from the line to inspect rest
    const remaining = trimmed.replace(rawDate, '').trim();

    // Look for amounts in remaining text
    const amounts = remaining.match(amountRegex);
    if (!amounts || amounts.length < 1) continue;

    // Pick out candidate numbers (filter out short integer transaction IDs / dates)
    const validAmounts = amounts
      .map((a) => parseFloat(a.replace(/,/g, '')))
      .filter((n) => !isNaN(n) && n > 0 && n < 10000000);

    if (validAmounts.length === 0) continue;

    // Determine type: check keywords like DR, CR, Debit, Credit, Withdrawal, Deposit
    const lower = remaining.toLowerCase();
    let type: TransactionType = 'expense';
    if (
      lower.includes(' cr') ||
      lower.includes('credit') ||
      lower.includes('deposit') ||
      lower.includes('salary') ||
      lower.includes('refund')
    ) {
      type = 'income';
    }

    // In most statements, the transaction amount is the first valid monetary amount
    const amount = validAmounts[0];
    // If a second valid amount is present on the transaction line, it represents the running balance
    const rowBalance = validAmounts.length >= 2 ? validAmounts[1] : undefined;

    // Narration: strip out the amount numbers
    let narration = remaining;
    for (const amt of amounts) {
      narration = narration.replace(amt, '');
    }
    narration = narration
      .replace(/\b(cr|dr|credit|debit|neft|rtgs|upi|imps|chq|pos)\b/gi, '')
      .replace(/[\/\\|:_\-\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!narration) narration = 'Bank Transaction';

    // Merchant cleaning
    const merchantParts = narration.split(' ');
    const merchant = merchantParts.slice(0, 4).join(' ');

    transactions.push({
      date: normalizedDate,
      merchant,
      amount,
      type,
      category: inferCategory(narration),
      note: narration,
      ...(rowBalance !== undefined ? { balance: rowBalance } : {}),
    });
  }

  // Extract closing balance: check for summary pattern in document text
  let closingBalance: number | undefined;
  let statementDate: string | undefined;

  const summaryBalanceMatch = text.match(
    /(?:closing\s*bal(?:ance)?|available\s*bal(?:ance)?|clear\s*bal(?:ance)?|total\s*bal(?:ance)?|net\s*bal(?:ance)?)\s*(?:is|was|:|-)?\s*(?:rs\.?|inr|usd|eur|gbp|₹|\$|€|£)?\s*([\d,]+(?:\.\d{1,2})?)/i
  );
  if (summaryBalanceMatch && summaryBalanceMatch[1]) {
    const parsed = parseFloat(summaryBalanceMatch[1].replace(/,/g, ''));
    if (!isNaN(parsed)) closingBalance = parsed;
  }

  if (closingBalance === undefined) {
    const txsWithBalance = transactions.filter((t) => t.balance !== undefined);
    if (txsWithBalance.length > 0) {
      const sortedByDateDesc = [...txsWithBalance].sort((a, b) => b.date.localeCompare(a.date));
      closingBalance = sortedByDateDesc[0].balance;
      statementDate = sortedByDateDesc[0].date;
    }
  }

  const summaryDateMatch = text.match(
    /(?:statement\s*(?:date|as\s*on|period)|as\s*on\s*date)\s*(?:is|:|-)?\s*(\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{1,2}[ -][a-zA-Z]{3}[ -]\d{2,4}\b)/i
  );
  if (summaryDateMatch && summaryDateMatch[1]) {
    statementDate = normalizeDate(summaryDateMatch[1]) || statementDate;
  }

  return {
    success: transactions.length > 0,
    isEncrypted: false,
    transactions,
    errors,
    closingBalance,
    statementDate,
  };
}

/**
 * Main entry point for reading and parsing a Bank Statement PDF file.
 */
export async function parseBankStatementPdf(
  fileUri: string,
  options?: { password?: string }
): Promise<PdfParseResult> {
  try {
    // Read the file header and content (fallback to Base64 decode if binary)
    let rawContent = '';
    try {
      rawContent = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch {
      try {
        const base64Content = await FileSystem.readAsStringAsync(fileUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        rawContent = typeof atob !== 'undefined' ? atob(base64Content) : base64Content;
      } catch {
        rawContent = '';
      }
    }

    const isEncrypted = checkIsPdfEncrypted(rawContent);

    if (isEncrypted && !options?.password) {
      return {
        success: false,
        isEncrypted: true,
        transactions: [],
        errors: ['Password required: This PDF statement is encrypted with a password.'],
      };
    }

    // Extract text from uncompressed text chunks or PDF streams
    const textChunks: string[] = [];

    // Match all text operators inside PDF text blocks (BT ... ET)
    const textBlockRegex = /BT[\s\S]*?ET/g;
    const matches = rawContent.match(textBlockRegex);

    if (matches && matches.length > 0) {
      for (const block of matches) {
        // Extract string arguments from (Text) Tj or [(T)(e)(x)(t)] TJ
        const stringRegex = /\(([^)]+)\)/g;
        let strMatch: RegExpExecArray | null;
        let blockText = '';
        while ((strMatch = stringRegex.exec(block)) !== null) {
          blockText += strMatch[1] + ' ';
        }
        if (blockText.trim()) {
          textChunks.push(blockText.trim());
        }
      }
    }

    // If PDF header exists but no text operators found, check if it is an encrypted stream
    const isEncryptedStream =
      !isEncrypted &&
      rawContent.includes('%PDF-') &&
      textChunks.length === 0 &&
      (rawContent.includes('/Filter') || rawContent.includes('/ObjStm') || rawContent.includes('/XRef'));

    if (isEncryptedStream && !options?.password) {
      return {
        success: false,
        isEncrypted: true,
        transactions: [],
        errors: ['Password required: This PDF statement is encrypted or protected.'],
      };
    }

    const combinedText = textChunks.length > 0 ? textChunks.join('\n') : rawContent;
    const parsed = parseBankStatementPdfText(combinedText);

    if (parsed.transactions.length === 0 && (isEncrypted || isEncryptedStream)) {
      return {
        success: false,
        isEncrypted: true,
        transactions: [],
        errors: [
          options?.password
            ? 'Incorrect password or unsupported encrypted PDF format. Please export an unlocked PDF or CSV from your bank portal.'
            : 'Password required: This bank statement is encrypted with a password.',
        ],
      };
    }

    return parsed;
  } catch (error: any) {
    return {
      success: false,
      isEncrypted: false,
      transactions: [],
      errors: [error?.message || 'Failed to read PDF statement.'],
    };
  }
}

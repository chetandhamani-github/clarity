import { LocalCategorizerEngine } from '@/modules/sms/categorizer/localCategorizerEngine';
import type { TransactionType } from '@/types';

export interface ParsedCsvTransaction {
  date: string; // YYYY-MM-DD
  amount: number;
  type: TransactionType;
  merchant: string;
  category: string;
  note: string;
  balance?: number;
}

export interface CsvParseResult {
  transactions: ParsedCsvTransaction[];
  totalRows: number;
  ignoredRows: number;
  errors: string[];
  closingBalance?: number;
  statementDate?: string;
}

/**
 * Parses raw CSV content into an array of rows, properly handling
 * quoted strings with commas and escaped quotes.
 */
export function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    const values: string[] = [];
    let insideQuotes = false;
    let currentValue = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          currentValue += '"';
          i++; // skip next quote
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.trim());
    rows.push(values);
  }

  return rows;
}

/**
 * Normalizes varied date formats into YYYY-MM-DD
 * Supports: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD Mon YYYY, etc.
 */
export function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  const clean = dateStr.trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // DD/MM/YY
  const dmyShortMatch = clean.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$/);
  if (dmyShortMatch) {
    const day = dmyShortMatch[1].padStart(2, '0');
    const month = dmyShortMatch[2].padStart(2, '0');
    const year = `20${dmyShortMatch[3]}`;
    return `${year}-${month}-${day}`;
  }

  // DD Mon YYYY (e.g., 15 Nov 2026 or 15-Nov-2026)
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const dMonYMatch = clean.match(/^(\d{1,2})[/\-\s]([A-Za-z]{3})[/\-\s](\d{4})$/);
  if (dMonYMatch) {
    const day = dMonYMatch[1].padStart(2, '0');
    const mon = dMonYMatch[2].toLowerCase();
    const month = months[mon];
    const year = dMonYMatch[3];
    if (month) {
      return `${year}-${month}-${day}`;
    }
  }

  // Fallback to JS Date parse
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = (parsed.getMonth() + 1).toString().padStart(2, '0');
    const d = parsed.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

/**
 * Cleans monetary amounts by removing currency symbols, spaces, commas.
 */
function cleanAmount(raw: string): number {
  if (!raw) return 0;
  const numStr = raw.replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(numStr);
  return isNaN(parsed) ? 0 : Math.abs(parsed);
}

/**
 * Cleans balance amounts, supporting negative signs and Dr/Cr indicators.
 */
function cleanBalance(raw: string): number | undefined {
  if (!raw) return undefined;
  const clean = raw.trim();
  if (!clean) return undefined;
  const isDr = /\b(?:dr|debit)\b/i.test(clean) || clean.includes('-');
  const numStr = clean.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(numStr);
  if (isNaN(parsed)) return undefined;
  return isDr ? -parsed : parsed;
}

/**
 * Extracts a clean merchant name from raw bank narration/remarks.
 */
function cleanMerchantName(narration: string): string {
  if (!narration) return 'Statement Transaction';

  // Common Indian Bank narration formats (UPI/xxxx/Name, POS/xxxx, NEFT-xxxx-Name)
  let clean = narration.trim();

  // UPI/CR/123456/MERCHANT/BANK -> MERCHANT
  if (clean.toUpperCase().includes('UPI')) {
    const parts = clean.split(/[/_-]/).map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      // Pick part that is non-numeric, > 2 chars, and not generic tags
      if (
        part.length > 2 &&
        !/^\d+$/.test(part) &&
        !['UPI', 'CR', 'DR', 'P2M', 'P2A', 'PAYMENT', 'REV'].includes(part.toUpperCase())
      ) {
        return part;
      }
    }
  }

  // POS 123456 MERCHANT NAME
  clean = clean.replace(/^(POS|NEFT|RTGS|IMPS|ATM|ACH|INB|BILLDESK|RAZORPAY|BHARATPE|PHONEPE|PAYU|CCAVENUE|AIRPAY|PINELABS)[*\s:/-]+/i, '');

  // Truncate trailing numbers/account references
  clean = clean.replace(/[/_-]\d+$/, '').trim();

  return clean.slice(0, 50) || 'Statement Transaction';
}

/**
 * Analyzes CSV header columns and parses statements into normalized transactions.
 */
export function parseBankStatementCsv(csvText: string): CsvParseResult {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    return { transactions: [], totalRows: 0, ignoredRows: 0, errors: ['CSV contains no data rows'] };
  }

  // Find header row (usually row 0, but some bank statements have intro text)
  let headerIndex = -1;
  let colDate = -1;
  let colDesc = -1;
  let colDebit = -1;
  let colCredit = -1;
  let colAmount = -1;
  let colType = -1;
  let colBalance = -1;

  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const headers = rows[r].map((h) => h.toLowerCase().trim());

    for (let c = 0; c < headers.length; c++) {
      const h = headers[c];
      if (/date|value\s*date|txn\s*date/.test(h) && colDate === -1) colDate = c;
      if (/narration|description|particulars|remarks|details|merchant/.test(h) && colDesc === -1) colDesc = c;
      if (/withdrawal|debit|dr(\.|\b)|dr\s*amount/.test(h) && colDebit === -1) colDebit = c;
      if (/deposit|credit|cr(\.|\b)|cr\s*amount/.test(h) && colCredit === -1) colCredit = c;
      if (/^amount$|^txn\s*amount$/.test(h) && colAmount === -1) colAmount = c;
      if (/^type$|cr\/dr|d\/c/.test(h) && colType === -1) colType = c;
      if (/(?:closing\s*bal(?:ance)?|available\s*bal(?:ance)?|clear\s*bal(?:ance)?|net\s*bal(?:ance)?|^balance$|^bal\.?$)/.test(h) && colBalance === -1) {
        colBalance = c;
      }
    }

    if (colDate !== -1 && (colDesc !== -1 || colDebit !== -1 || colAmount !== -1)) {
      headerIndex = r;
      break;
    }
  }

  if (headerIndex === -1 || colDate === -1) {
    return {
      transactions: [],
      totalRows: rows.length,
      ignoredRows: rows.length,
      errors: ['Could not detect date and transaction columns in CSV header'],
    };
  }

  const transactions: ParsedCsvTransaction[] = [];
  let ignoredRows = 0;
  const errors: string[] = [];

  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length <= colDate) {
      ignoredRows++;
      continue;
    }

    const rawDate = row[colDate];
    const normalizedDate = parseDate(rawDate);
    if (!normalizedDate) {
      ignoredRows++;
      continue;
    }

    const rawDesc = colDesc !== -1 ? row[colDesc] : 'Statement Transaction';
    let amount = 0;
    let type: TransactionType = 'expense';

    if (colDebit !== -1 && colCredit !== -1) {
      const debitVal = cleanAmount(row[colDebit]);
      const creditVal = cleanAmount(row[colCredit]);

      if (debitVal > 0) {
        amount = debitVal;
        type = 'expense';
      } else if (creditVal > 0) {
        amount = creditVal;
        type = 'income';
      } else {
        ignoredRows++;
        continue;
      }
    } else if (colAmount !== -1) {
      const rawAmtStr = (row[colAmount] || '').trim();
      const isNegativeOrParen = rawAmtStr.includes('-') || /^\(.*\)$/.test(rawAmtStr);
      const val = cleanAmount(rawAmtStr);
      if (val === 0) {
        ignoredRows++;
        continue;
      }
      amount = val;

      if (colType !== -1) {
        const typeStr = (row[colType] || '').toUpperCase();
        if (typeStr.includes('CR') || typeStr.includes('CREDIT') || typeStr.includes('DEP')) {
          type = 'income';
        } else {
          type = 'expense';
        }
      } else if (isNegativeOrParen) {
        type = 'expense';
      } else if (rawAmtStr.includes('+')) {
        type = 'income';
      } else {
        type = 'expense';
      }
    } else {
      ignoredRows++;
      continue;
    }

    const merchant = cleanMerchantName(rawDesc);
    const category = LocalCategorizerEngine.categorize({
      merchant,
      type: type === 'income' ? 'CREDIT' : 'DEBIT',
    });

    const rowBalance = colBalance !== -1 ? cleanBalance(row[colBalance]) : undefined;

    transactions.push({
      date: normalizedDate,
      amount,
      type,
      merchant,
      category,
      note: rawDesc,
      ...(rowBalance !== undefined ? { balance: rowBalance } : {}),
    });
  }

  // Determine closing balance from transactions:
  // Sort candidates by date descending to find the balance corresponding to the newest entry
  let closingBalance: number | undefined;
  let statementDate: string | undefined;

  const txsWithBalance = transactions.filter((t) => t.balance !== undefined);
  if (txsWithBalance.length > 0) {
    // If chronological (typical), last row is latest; if reverse chronological, first row is latest.
    // Explicitly pick the transaction with the most recent date.
    const sortedByDateDesc = [...txsWithBalance].sort((a, b) => b.date.localeCompare(a.date));
    closingBalance = sortedByDateDesc[0].balance;
    statementDate = sortedByDateDesc[0].date;
  }

  return {
    transactions,
    totalRows: rows.length - (headerIndex + 1),
    ignoredRows,
    errors,
    closingBalance,
    statementDate,
  };
}

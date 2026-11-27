import { LocalCategorizerEngine } from '@/modules/sms/categorizer/localCategorizerEngine';
import type { TransactionType } from '@/types';
import {
  extractOpeningBalanceFromText,
  inferDirectionFromNarration,
  resolveDirectionByRunningBalance,
  type DirectionConfidence,
} from './statement-direction-helper';

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

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeHtmlText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&([a-zA-Z]+);/g, (_, name: string) => HTML_ENTITIES[name.toLowerCase()] ?? ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 10)))
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseHtmlTableRows(html: string): string[][] {
  const rows: string[][] = [];
  const trMatches = html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi);
  for (const tr of trMatches) {
    const cells: string[] = [];
    const tdMatches = tr[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi);
    for (const td of tdMatches) {
      cells.push(decodeHtmlText(td[1]));
    }
    if (cells.some((c) => c.length > 0)) {
      rows.push(cells);
    }
  }
  return rows;
}

function detectCsvDelimiter(text: string): string {
  const candidates = [',', '\t', ';', '|'];
  const sampleLines = text
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .slice(0, 30);

  let bestDelimiter = ',';
  let bestScore = -1;

  for (const delim of candidates) {
    let multiColLines = 0;
    let totalSplits = 0;
    for (const line of sampleLines) {
      let inQuotes = false;
      let count = 0;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') i++;
          else inQuotes = !inQuotes;
        } else if (ch === delim && !inQuotes) {
          count++;
        }
      }
      if (count >= 2) {
        multiColLines++;
        totalSplits += count;
      }
    }
    const score = multiColLines * 100 + totalSplits;
    if (multiColLines > 0 && score > bestScore) {
      bestScore = score;
      bestDelimiter = delim;
    }
  }

  return bestDelimiter;
}

/**
 * Parses raw CSV/TSV/HTML-table content into an array of rows, properly handling
 * UTF-8 BOM, quoted delimiters, multiline quoted fields, and escaped quotes.
 */
export function parseCsvRows(csvText: string): string[][] {
  const normalized = csvText
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const trimmed = normalized.trimStart();
  if (trimmed.startsWith('<') && /<tr\b/i.test(trimmed) && /<t[dh]\b/i.test(trimmed)) {
    const htmlRows = parseHtmlTableRows(normalized);
    if (htmlRows.length > 0) {
      return htmlRows;
    }
  }

  const delimiter = detectCsvDelimiter(normalized);
  const rows: string[][] = [];
  let values: string[] = [];
  let currentValue = '';
  let insideQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (char === '"') {
      if (insideQuotes && normalized[i + 1] === '"') {
        currentValue += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === delimiter && !insideQuotes) {
      values.push(currentValue.trim());
      currentValue = '';
    } else if (char === '\n' && !insideQuotes) {
      values.push(currentValue.trim());
      if (values.some((v) => v.length > 0)) {
        rows.push(values);
      }
      values = [];
      currentValue = '';
    } else {
      currentValue += char;
    }
  }

  if (currentValue.length > 0 || values.length > 0) {
    values.push(currentValue.trim());
    if (values.some((v) => v.length > 0)) {
      rows.push(values);
    }
  }

  return rows;
}

/**
 * Normalizes varied date formats into YYYY-MM-DD
 * Supports: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD Mon YYYY, etc.
 */
export function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  const clean = dateStr
    .trim()
    .replace(/(?:T|\s+)\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?(?:\s*[AP]M)?$/i, '')
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = clean.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (ymdMatch) {
    const m = parseInt(ymdMatch[2], 10);
    const d = parseInt(ymdMatch[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
    }
    return null;
  }

  // DD/MM/YYYY (or unambiguous MM/DD/YYYY when second component > 12)
  const dmyMatch = clean.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmyMatch) {
    const firstNum = parseInt(dmyMatch[1], 10);
    const secondNum = parseInt(dmyMatch[2], 10);
    const year = dmyMatch[3];
    if (firstNum >= 1 && firstNum <= 12 && secondNum >= 13 && secondNum <= 31) {
      return `${year}-${dmyMatch[1].padStart(2, '0')}-${dmyMatch[2].padStart(2, '0')}`;
    }
    if (firstNum < 1 || firstNum > 31 || secondNum < 1 || secondNum > 12) return null;
    return `${year}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }

  // DD/MM/YY (or unambiguous MM/DD/YY)
  const dmyShortMatch = clean.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$/);
  if (dmyShortMatch) {
    const firstNum = parseInt(dmyShortMatch[1], 10);
    const secondNum = parseInt(dmyShortMatch[2], 10);
    const year = `20${dmyShortMatch[3]}`;
    if (firstNum >= 1 && firstNum <= 12 && secondNum >= 13 && secondNum <= 31) {
      return `${year}-${dmyShortMatch[1].padStart(2, '0')}-${dmyShortMatch[2].padStart(2, '0')}`;
    }
    if (firstNum < 1 || firstNum > 31 || secondNum < 1 || secondNum > 12) return null;
    return `${year}-${dmyShortMatch[2].padStart(2, '0')}-${dmyShortMatch[1].padStart(2, '0')}`;
  }

  // DD Mon YYYY / DD-Mon-YY (e.g., 15 Nov 2026, 15-Nov-26, 01 September 2026)
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const dMonYMatch = clean.match(/^(\d{1,2})[/\-\s]([A-Za-z]{3,9})[/\-\s](\d{2,4})$/);
  if (dMonYMatch) {
    const dayNum = parseInt(dMonYMatch[1], 10);
    const mon = dMonYMatch[2].toLowerCase().substring(0, 3);
    const month = months[mon];
    let year = dMonYMatch[3];
    if (year.length === 2) year = `20${year}`;
    if (month && dayNum >= 1 && dayNum <= 31) {
      return `${year}-${month}-${dMonYMatch[1].padStart(2, '0')}`;
    }
  }

  // Mon DD YYYY (e.g., Nov 27 2026)
  const monDYMatch = clean.match(/^([A-Za-z]{3,9})[/\-\s](\d{1,2})[/\-\s](\d{2,4})$/);
  if (monDYMatch) {
    const dayNum = parseInt(monDYMatch[2], 10);
    const mon = monDYMatch[1].toLowerCase().substring(0, 3);
    const month = months[mon];
    let year = monDYMatch[3];
    if (year.length === 2) year = `20${year}`;
    if (month && dayNum >= 1 && dayNum <= 31) {
      return `${year}-${month}-${monDYMatch[2].padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Cleans monetary amounts by removing currency symbols, spaces, commas.
 */
function cleanAmount(raw: string): number {
  if (!raw) return 0;
  const numMatch = raw.match(/\d[\d,]*(?:\.\d+)?|\.\d+/);
  if (!numMatch) return 0;
  const parsed = parseFloat(numMatch[0].replace(/,/g, ''));
  return isNaN(parsed) ? 0 : Math.abs(parsed);
}

/**
 * Cleans balance amounts, supporting negative signs and Dr/Cr indicators.
 */
function cleanBalance(raw: string): number | undefined {
  if (!raw) return undefined;
  const clean = raw.trim();
  if (!clean) return undefined;
  const isDr = /\b(?:dr|debit)\b/i.test(clean) || /(?:^|\s)-/.test(clean);
  const numMatch = clean.match(/\d[\d,]*(?:\.\d+)?|\.\d+/);
  if (!numMatch) return undefined;
  const parsed = parseFloat(numMatch[0].replace(/,/g, ''));
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

interface CsvColumnMap {
  headerIndex: number;
  colDate: number;
  colDesc: number;
  colDebit: number;
  colCredit: number;
  colAmount: number;
  colType: number;
  colBalance: number;
}

function detectHeaderColumns(rows: string[][]): CsvColumnMap | null {
  let fallbackCandidate: CsvColumnMap | null = null;
  const maxScanRows = Math.min(rows.length, 100);

  for (let r = 0; r < maxScanRows; r++) {
    const headers = rows[r].map((h) =>
      h
        .replace(/[\uFEFF\s_]+/g, ' ')
        .replace(/[:*#]+$/g, '')
        .trim()
        .toLowerCase()
    );

    let colDate = -1;
    let colValueDate = -1;
    let colDesc = -1;
    let colDebit = -1;
    let colCredit = -1;
    let colAmount = -1;
    let colType = -1;
    let colBalance = -1;

    for (let c = 0; c < headers.length; c++) {
      const h = headers[c];
      if (!h) continue;

      if (/\b(?:txn|trans(?:action)?|tran|posting|post|book|entry)\s*(?:date|dt\.?)\b/.test(h)) {
        if (colDate === -1) colDate = c;
      } else if (/\b(?:value|val)\s*(?:date|dt\.?)\b/.test(h)) {
        if (colValueDate === -1) colValueDate = c;
      } else if (/(?:^|\b)(?:date|dt\.?)(?:\b|$)/.test(h) && colDate === -1) {
        colDate = c;
      }

      if (
        /narration|description|particulars|remarks|details|merchant|summary|memo|payee|recipient/.test(
          h
        ) &&
        colDesc === -1
      ) {
        colDesc = c;
      }
      const isAmountLikeHeader = /\b(?:amount|amt\.?|balance|bal\.?)\b/.test(h);
      const matchesDebitWord =
        /withdraw(?:al|n)?s?|debits?|\bdr\.?\b|dr\s*amt|dr\s*amount|debit\s*amt|paid\s*out|outflow|money\s*out/.test(
          h
        );
      const matchesCreditWord =
        /deposits?|credits?|\bcr\.?\b|cr\s*amt|cr\s*amount|credit\s*amt|paid\s*in|inflow|money\s*in|received/.test(
          h
        );
      const isDualDirectionHeader = matchesDebitWord && matchesCreditWord;
      const isTypeHeader =
        !isAmountLikeHeader &&
        (/^(?:txn\s*|trans(?:action)?\s*|tx\s*|entry\s*)?type(?:\s*\(.*\))?$|^(?:cr\s*\/\s*dr|dr\s*\/\s*cr|d\s*\/\s*c|c\s*\/\s*d|debit\s*\/\s*credit|credit\s*\/\s*debit)(?:\s*(?:flag|indicator|ind\.?|type))?$/.test(
          h
        ) ||
          isDualDirectionHeader);
      if (isTypeHeader) {
        if (colType === -1) colType = c;
        continue;
      }

      if (!isDualDirectionHeader && matchesDebitWord && colDebit === -1) {
        colDebit = c;
      }
      if (!isDualDirectionHeader && matchesCreditWord && colCredit === -1) {
        colCredit = c;
      }
      if (
        (/^(?:txn\s*|trans(?:action)?\s*|tran\s*|net\s*|tx\s*)?(?:amount|amt\.?)(?:\s*(?:in\s*)?(?:rs\.?|inr|usd|eur|gbp|₹|\$|€|£))?(?:\s*\(.*\))?$/.test(
          h
        ) ||
          (isAmountLikeHeader && isDualDirectionHeader && !/\bbal(?:ance)?\b/.test(h))) &&
        colAmount === -1
      ) {
        colAmount = c;
      }
      if (
        /(?:closing|available|clear|net|running|led(?:ger)?)\s*bal(?:ance)?(?:\s*\(.*\))?\.?$|^bal(?:ance)?(?:\s*\(.*\))?\.?$/.test(
          h
        ) &&
        colBalance === -1
      ) {
        colBalance = c;
      }
    }

    const resolvedDate = colDate !== -1 ? colDate : colValueDate;
    if (resolvedDate === -1) continue;

    const hasAmountCol =
      (colDebit !== -1 && colDebit !== resolvedDate) ||
      (colCredit !== -1 && colCredit !== resolvedDate) ||
      (colAmount !== -1 && colAmount !== resolvedDate);

    if (hasAmountCol) {
      return {
        headerIndex: r,
        colDate: resolvedDate,
        colDesc: colDesc === resolvedDate ? -1 : colDesc,
        colDebit,
        colCredit,
        colAmount,
        colType,
        colBalance,
      };
    }

    if (!fallbackCandidate && colDesc !== -1 && colDesc !== resolvedDate && rows[r].length >= 3) {
      fallbackCandidate = {
        headerIndex: r,
        colDate: resolvedDate,
        colDesc,
        colDebit,
        colCredit,
        colAmount,
        colType,
        colBalance,
      };
    }
  }

  return fallbackCandidate;
}

/**
 * Analyzes CSV header columns and parses statements into normalized transactions.
 */
export function parseBankStatementCsv(csvText: string): CsvParseResult {
  const rows = parseCsvRows(csvText);
  if (rows.length < 2) {
    return { transactions: [], totalRows: 0, ignoredRows: 0, errors: ['CSV contains no data rows'] };
  }

  const columnMap = detectHeaderColumns(rows);
  if (!columnMap) {
    return {
      transactions: [],
      totalRows: rows.length,
      ignoredRows: rows.length,
      errors: [
        `Could not detect date and transaction columns in CSV header (rows=${rows.length}, maxCols=${Math.max(...rows.map((r) => r.length))})`,
      ],
    };
  }

  const { headerIndex, colDate, colDesc, colDebit, colCredit, colAmount, colType, colBalance } =
    columnMap;

  const transactions: ParsedCsvTransaction[] = [];
  const confidences: DirectionConfidence[] = [];
  let ignoredRows = 0;
  const errors: string[] = [];

  const hasSignedNegativeAmounts =
    colAmount !== -1 &&
    rows.slice(headerIndex + 1).some((r) => {
      const s = (r[colAmount] || '').trim();
      return (
        /^-\s*(?:₹|rs\.?|inr|\$|\d)/i.test(s) ||
        /^\(.*\)$/.test(s) ||
        /\b(?:DR|DEBIT)\b/i.test(s)
      );
    });

  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length <= colDate) {
      ignoredRows++;
      continue;
    }

    const rawDate = row[colDate];
    const normalizedDate = parseDate(rawDate);
    if (!normalizedDate) {
      if (
        !rawDate?.trim() &&
        colDesc !== -1 &&
        row[colDesc]?.trim() &&
        transactions.length > 0 &&
        (colDebit === -1 || cleanAmount(row[colDebit]) === 0) &&
        (colCredit === -1 || cleanAmount(row[colCredit]) === 0) &&
        (colAmount === -1 || cleanAmount(row[colAmount]) === 0)
      ) {
        const lastTx = transactions[transactions.length - 1];
        lastTx.note = `${lastTx.note} ${row[colDesc].trim()}`.trim();
      } else {
        ignoredRows++;
      }
      continue;
    }

    const rawDesc = colDesc !== -1 ? row[colDesc] : 'Statement Transaction';
    let amount = 0;
    let type: TransactionType = 'expense';
    let confidence: DirectionConfidence = 'default';

    if (colDebit !== -1 && colCredit !== -1 && colDebit !== colCredit) {
      const debitVal = cleanAmount(row[colDebit]);
      const creditVal = cleanAmount(row[colCredit]);

      if (debitVal > 0 && creditVal === 0) {
        amount = debitVal;
        type = 'expense';
        confidence = 'explicit';
      } else if (creditVal > 0 && debitVal === 0) {
        amount = creditVal;
        type = 'income';
        confidence = 'explicit';
      } else if (debitVal > 0 && creditVal > 0) {
        const narrDir = inferDirectionFromNarration(rawDesc);
        type = narrDir ?? 'expense';
        amount = type === 'income' ? creditVal : debitVal;
        confidence = narrDir ? 'inferred' : 'default';
      } else {
        ignoredRows++;
        continue;
      }
    } else if (colDebit !== -1 && colDebit !== colCredit) {
      const debitVal = cleanAmount(row[colDebit]);
      if (debitVal === 0) {
        ignoredRows++;
        continue;
      }
      amount = debitVal;
      type = 'expense';
      confidence = 'explicit';
    } else if (colCredit !== -1 && colCredit !== colDebit) {
      const creditVal = cleanAmount(row[colCredit]);
      if (creditVal === 0) {
        ignoredRows++;
        continue;
      }
      amount = creditVal;
      type = 'income';
      confidence = 'explicit';
    } else if (colAmount !== -1) {
      const rawAmtStr = (row[colAmount] || '').trim();
      const isNegativeOrParen =
        /^-\s*(?:₹|rs\.?|inr|\$|\d)/i.test(rawAmtStr) ||
        /\d\s*-$/.test(rawAmtStr) ||
        /^\(.*\)$/.test(rawAmtStr);
      const val = cleanAmount(rawAmtStr);
      if (val === 0) {
        ignoredRows++;
        continue;
      }
      amount = val;

      let resolvedFromTypeCol = false;
      if (colType !== -1) {
        const typeStr = (row[colType] || '').trim().toUpperCase();
        if (
          /\b(?:CR|CREDIT|CREDITED|DEP|DEPOSIT|DEPOSITED|IN|INFLOW|RECEIPT|RECEIVED|INCOME|REFUND|CASHBACK|C)\b/.test(
            typeStr
          ) ||
          typeStr === '+'
        ) {
          type = 'income';
          confidence = 'explicit';
          resolvedFromTypeCol = true;
        } else if (
          /\b(?:DR|DEBIT|DEBITED|WDL|WITHDRAWAL|WITHDRAWN|OUT|OUTFLOW|EXPENSE|SPENT|PAYMENT|PAID|D)\b/.test(
            typeStr
          ) ||
          typeStr === '-'
        ) {
          type = 'expense';
          confidence = 'explicit';
          resolvedFromTypeCol = true;
        }
      }

      if (!resolvedFromTypeCol) {
        if (
          /\b(?:CR|CREDIT|C)\.?\s*\)?$/i.test(rawAmtStr) ||
          /^(?:CR|CREDIT)\b/i.test(rawAmtStr) ||
          rawAmtStr.includes('+')
        ) {
          type = 'income';
          confidence = 'explicit';
        } else if (
          /\b(?:DR|DEBIT|D)\.?\s*\)?$/i.test(rawAmtStr) ||
          /^(?:DR|DEBIT)\b/i.test(rawAmtStr) ||
          isNegativeOrParen
        ) {
          type = 'expense';
          confidence = 'explicit';
        } else if (hasSignedNegativeAmounts) {
          // Signed single-amount column: negative rows are expenses, unsigned positive rows are credits/income.
          type = 'income';
          confidence = colBalance !== -1 ? 'inferred' : 'explicit';
        } else {
          const narrDir = inferDirectionFromNarration(rawDesc);
          type = narrDir ?? 'expense';
          confidence = narrDir ? 'inferred' : 'default';
        }
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
    confidences.push(confidence);
  }

  const introText = rows
    .slice(0, headerIndex)
    .map((r) => r.join(' '))
    .join('\n');
  const openingBalance = extractOpeningBalanceFromText(introText);
  const resolvedByBalance = resolveDirectionByRunningBalance(
    transactions,
    confidences,
    openingBalance
  );
  for (let i = 0; i < transactions.length; i++) {
    if (resolvedByBalance[i]) {
      transactions[i].category = LocalCategorizerEngine.categorize({
        merchant: transactions[i].merchant,
        type: transactions[i].type === 'income' ? 'CREDIT' : 'DEBIT',
      });
    }
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

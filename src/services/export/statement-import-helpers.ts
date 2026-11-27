import type { AccountType, Transaction, TransactionType } from '@/types';
import {
  areMerchantsCompatible,
  extractReferenceToken,
  normalizeMerchantTokens,
} from '@/modules/sms/duplicate/duplicateDetectionEngine';
import { SUPPORTED_BANK_PROFILES, type BankProfile } from './pdf-statement-parser';

export interface StatementImportItem {
  date: string;
  merchant: string;
  amount: number;
  type: TransactionType;
  category: string;
  note: string;
}

const STATEMENT_IMPORT_ACCOUNT_TYPES: ReadonlySet<AccountType> = new Set([
  'savings',
  'current',
  'checking',
  'credit',
  'loan',
  'investment',
  'other',
]);

const LIABILITY_ACCOUNT_TYPES: ReadonlySet<AccountType> = new Set([
  'credit',
  'loan',
  'borrowed',
]);

const UNSUPPORTED_STATEMENT_EXTENSIONS = new Set([
  'xls',
  'xlsx',
  'xlsm',
  'ods',
  'doc',
  'docx',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'heic',
  'json',
  'zip',
]);

/**
 * Returns true for account types that commonly have bank, card, or financial statements.
 */
export function supportsStatementImport(accountType: AccountType): boolean {
  return STATEMENT_IMPORT_ACCOUNT_TYPES.has(accountType);
}

/**
 * Returns true for liability account types whose balances are stored as negative debt.
 */
export function isLiabilityAccountType(accountType?: AccountType): boolean {
  return accountType ? LIABILITY_ACCOUNT_TYPES.has(accountType) : false;
}

/**
 * Infers the best matching bank password-hint profile from account metadata.
 */
export function inferBankProfileForAccount(
  institution?: string,
  accountName?: string
): BankProfile {
  const combined = `${institution || ''} ${accountName || ''}`.toLowerCase();
  if (!combined.trim()) {
    return SUPPORTED_BANK_PROFILES[0];
  }

  const profileMatchers: { id: string; keywords: string[] }[] = [
    { id: 'hdfc', keywords: ['hdfc'] },
    { id: 'sbi', keywords: ['sbi', 'state bank'] },
    { id: 'icici', keywords: ['icici'] },
    { id: 'axis', keywords: ['axis'] },
    { id: 'kotak', keywords: ['kotak'] },
  ];

  for (const matcher of profileMatchers) {
    if (matcher.keywords.some((kw) => combined.includes(kw))) {
      const found = SUPPORTED_BANK_PROFILES.find((profile) => profile.id === matcher.id);
      if (found) return found;
    }
  }

  return SUPPORTED_BANK_PROFILES[0];
}

/**
 * Classifies a picked document as PDF, CSV, or unsupported before reading/parsing.
 */
export function getStatementFileKind(
  fileName: string,
  mimeType?: string | null
): 'pdf' | 'csv' | 'unsupported' {
  const lowerName = fileName.trim().toLowerCase();
  const lowerMime = (mimeType || '').trim().toLowerCase();

  if (lowerName.endsWith('.pdf') || lowerMime === 'application/pdf') {
    return 'pdf';
  }

  if (
    lowerName.endsWith('.csv') ||
    lowerName.endsWith('.txt') ||
    lowerMime === 'text/csv' ||
    lowerMime === 'text/comma-separated-values' ||
    lowerMime === 'application/csv' ||
    lowerMime === 'text/plain'
  ) {
    return 'csv';
  }

  const extMatch = lowerName.match(/\.([a-z0-9]+)$/);
  if (extMatch && UNSUPPORTED_STATEMENT_EXTENSIONS.has(extMatch[1])) {
    return 'unsupported';
  }

  if (lowerMime.startsWith('image/') || lowerMime.startsWith('video/') || lowerMime.startsWith('audio/')) {
    return 'unsupported';
  }

  // Fallback for Android providers that omit MIME/extension on CSV files
  if (lowerMime === 'application/vnd.ms-excel' && !/\.[a-z][a-z0-9]{1,5}$/.test(lowerName)) {
    return 'csv';
  }

  return /\.[a-z][a-z0-9]{1,5}$/.test(lowerName) ? 'unsupported' : 'csv';
}

function toDateKey(value: string): string {
  const trimmed = value.trim();
  return trimmed.includes('T') ? trimmed.split('T')[0] : trimmed.slice(0, 10);
}

/**
 * Filters parsed statement entries against existing account transactions to avoid duplicates.
 */
export function deduplicateStatementTransactions(
  items: StatementImportItem[],
  existingTransactions: Transaction[]
): {
  newTransactions: StatementImportItem[];
  duplicateTransactions: StatementImportItem[];
  duplicateCount: number;
} {
  const nonDuplicates: StatementImportItem[] = [];
  const duplicateTransactions: StatementImportItem[] = [];
  let duplicateCount = 0;
  const matchedExistingIds = new Set<string>();
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

  for (const tx of items) {
    const txDateKey = toDateKey(tx.date);
    const txDateMs = new Date(`${txDateKey}T00:00:00Z`).getTime();
    const txRef = extractReferenceToken(`${tx.merchant} ${tx.note}`);
    const txTokens = normalizeMerchantTokens(tx.merchant);

    const matchedItem = existingTransactions.find((existing) => {
      if (matchedExistingIds.has(existing.id)) return false;
      if (existing.type !== tx.type || Math.abs(existing.amount - tx.amount) >= 0.01) {
        return false;
      }

      const existingRef = extractReferenceToken(`${existing.merchant} ${existing.note}`);
      if (txRef && existingRef && txRef === existingRef) {
        return true;
      }

      const existingDateKey = toDateKey(existing.date);
      if (existingDateKey === txDateKey) {
        return areMerchantsCompatible(existing.merchant, tx.merchant);
      }

      const existingDateMs = new Date(`${existingDateKey}T00:00:00Z`).getTime();
      if (
        Number.isFinite(txDateMs) &&
        Number.isFinite(existingDateMs) &&
        Math.abs(existingDateMs - txDateMs) <= TWO_DAYS_MS
      ) {
        const existingTokens = normalizeMerchantTokens(existing.merchant);
        if (txTokens.length === 0 || existingTokens.length === 0) {
          return false;
        }
        return areMerchantsCompatible(existing.merchant, tx.merchant);
      }

      return false;
    });

    if (matchedItem) {
      matchedExistingIds.add(matchedItem.id);
      duplicateTransactions.push(tx);
      duplicateCount++;
    } else {
      nonDuplicates.push(tx);
    }
  }

  return { newTransactions: nonDuplicates, duplicateTransactions, duplicateCount };
}

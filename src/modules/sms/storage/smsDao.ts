import { getDatabase } from '@/services/database';
import type {
  RawSmsMessage,
  ParsedTransaction,
  ReviewQueueItem,
  ReviewQueueStatus,
  ExtractedTransaction,
} from '@/modules/sms/types';

interface SmsMessageRow {
  id: string;
  address: string;
  body: string;
  date: number;
  date_sent: number | null;
  status: string;
  created_at: string;
}

interface ParsedTransactionRow {
  id: string;
  sms_id: string | null;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  merchant: string;
  category: string;
  bank: string;
  account_mask: string;
  reference_number: string | null;
  available_balance: number | null;
  transaction_date: string;
  confidence: number;
  is_duplicate: number;
  duplicate_of: string | null;
  transaction_id: string | null;
  raw_body: string | null;
  created_at: string;
}

interface ReviewQueueRow {
  id: string;
  sms_id: string;
  sender: string;
  body: string;
  reason: string;
  confidence: number;
  extracted_data: string | null;
  status: ReviewQueueStatus;
  created_at: string;
}

function mapParsedRow(row: ParsedTransactionRow): ParsedTransaction {
  return {
    id: row.id,
    smsId: row.sms_id ?? '',
    amount: row.amount,
    type: row.type,
    merchant: row.merchant,
    category: row.category,
    bank: row.bank,
    accountMask: row.account_mask,
    referenceNumber: row.reference_number ?? undefined,
    availableBalance: row.available_balance ?? undefined,
    timestamp: new Date(row.transaction_date).getTime(),
    confidence: row.confidence,
    isDuplicate: Boolean(row.is_duplicate),
    duplicateOf: row.duplicate_of ?? undefined,
    transactionId: row.transaction_id ?? undefined,
    rawBody: row.raw_body ?? undefined,
    createdAt: row.created_at,
  };
}

function mapReviewRow(row: ReviewQueueRow): ReviewQueueItem {
  let extractedData: Partial<ExtractedTransaction> | undefined;
  if (row.extracted_data) {
    try {
      extractedData = JSON.parse(row.extracted_data);
    } catch {
      extractedData = undefined;
    }
  }

  return {
    id: row.id,
    smsId: row.sms_id,
    sender: row.sender,
    body: row.body,
    reason: row.reason as ReviewQueueItem['reason'],
    confidence: row.confidence,
    extractedData,
    status: row.status,
    createdAt: row.created_at,
  };
}

export class SmsDao {
  /**
   * Save a chunk of raw SMS messages in a single SQLite transaction.
   */
  public static async saveSmsBatch(messages: RawSmsMessage[]): Promise<void> {
    if (messages.length === 0) return;
    const db = getDatabase();

    await db.execAsync('BEGIN TRANSACTION');
    try {
      for (const msg of messages) {
        await db.runAsync(
          `INSERT OR IGNORE INTO sms_messages (id, address, body, date, date_sent, status)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [msg.id, msg.address, msg.body, msg.date, msg.dateSent ?? null, 'read']
        );
      }
      await db.execAsync('COMMIT');
    } catch (err) {
      await db.execAsync('ROLLBACK');
      throw err;
    }
  }

  /**
   * Get existing message IDs from a list of incoming IDs to skip re-reading.
   */
  public static async getExistingSmsIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const db = getDatabase();
    const existing = new Set<string>();

    // Chunk queries to stay well within SQLite variable limits (max 999)
    const chunkSize = 400;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => '?').join(',');
      const rows = await db.getAllAsync<{ id: string }>(
        `SELECT id FROM sms_messages WHERE id IN (${placeholders})`,
        chunk
      );
      for (const row of rows) {
        existing.add(row.id);
      }
    }

    return existing;
  }

  /**
   * Get the maximum date timestamp among stored SMS messages.
   */
  public static async getLatestSmsTimestamp(): Promise<number | null> {
    const db = getDatabase();
    const row = await db.getFirstAsync<{ max_date: number | null }>(
      'SELECT MAX(date) as max_date FROM sms_messages'
    );
    return row?.max_date ?? null;
  }

  /**
   * Save parsed transactions in a single transaction.
   */
  public static async saveParsedTransactionsBatch(
    transactions: ParsedTransaction[]
  ): Promise<void> {
    if (transactions.length === 0) return;
    const db = getDatabase();

    await db.execAsync('BEGIN TRANSACTION');
    try {
      for (const tx of transactions) {
        const txDate = new Date(tx.timestamp).toISOString();
        await db.runAsync(
          `INSERT OR REPLACE INTO parsed_transactions 
           (id, sms_id, amount, type, merchant, category, bank, account_mask, reference_number, available_balance, transaction_date, confidence, is_duplicate, duplicate_of, transaction_id, raw_body, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tx.id,
            tx.smsId,
            tx.amount,
            tx.type,
            tx.merchant,
            tx.category,
            tx.bank,
            tx.accountMask,
            tx.referenceNumber ?? null,
            tx.availableBalance ?? null,
            txDate,
            tx.confidence,
            tx.isDuplicate ? 1 : 0,
            tx.duplicateOf ?? null,
            tx.transactionId ?? null,
            tx.rawBody ?? null,
            tx.createdAt || new Date().toISOString(),
          ]
        );
      }
      await db.execAsync('COMMIT');
    } catch (err) {
      await db.execAsync('ROLLBACK');
      throw err;
    }
  }

  /**
   * Find candidate transactions for duplicate matching.
   */
  public static async findPotentialDuplicates(
    amount: number,
    accountMask: string,
    type: 'DEBIT' | 'CREDIT',
    merchant: string,
    windowStart: string,
    windowEnd: string,
    refNumber?: string
  ): Promise<ParsedTransaction[]> {
    const db = getDatabase();

    if (refNumber && refNumber.trim().length > 3) {
      // Check exact reference number first across the database
      const refMatches = await db.getAllAsync<ParsedTransactionRow>(
        'SELECT * FROM parsed_transactions WHERE reference_number = ? LIMIT 5',
        [refNumber.trim()]
      );
      if (refMatches.length > 0) {
        return refMatches.map(mapParsedRow);
      }
    }

    const normalizedMerchant = merchant.trim().toLowerCase();
    if (
      !normalizedMerchant ||
      /^(?:.+\s+)?(?:bank\s+)?transaction$/.test(normalizedMerchant)
    ) {
      return [];
    }

    // A matching amount alone is common, so use direction and merchant too.
    const rows = await db.getAllAsync<ParsedTransactionRow>(
      `SELECT * FROM parsed_transactions
       WHERE amount = ?
         AND account_mask = ?
         AND type = ?
         AND LOWER(TRIM(merchant)) = ?
         AND transaction_date BETWEEN ? AND ?
       LIMIT 10`,
      [amount, accountMask, type, normalizedMerchant, windowStart, windowEnd]
    );

    return rows.map(mapParsedRow);
  }

  /**
   * Save items to review queue in a single transaction.
   */
  public static async saveReviewQueueBatch(items: ReviewQueueItem[]): Promise<void> {
    if (items.length === 0) return;
    const db = getDatabase();

    await db.execAsync('BEGIN TRANSACTION');
    try {
      for (const item of items) {
        await db.runAsync(
          `INSERT OR REPLACE INTO sms_review_queue 
           (id, sms_id, sender, body, reason, confidence, extracted_data, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            item.smsId,
            item.sender,
            item.body,
            item.reason,
            item.confidence,
            item.extractedData ? JSON.stringify(item.extractedData) : null,
            item.status,
            item.createdAt,
          ]
        );
      }
      await db.execAsync('COMMIT');
    } catch (err) {
      await db.execAsync('ROLLBACK');
      throw err;
    }
  }

  /**
   * Get review queue items.
   */
  public static async getReviewQueueItems(
    status: ReviewQueueStatus = 'pending',
    limit: number = 50,
    offset: number = 0
  ): Promise<ReviewQueueItem[]> {
    const db = getDatabase();
    const rows = await db.getAllAsync<ReviewQueueRow>(
      `SELECT * FROM sms_review_queue 
       WHERE status = ? 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [status, limit, offset]
    );
    return rows.map(mapReviewRow);
  }

  /**
   * Update review queue item status.
   */
  public static async updateReviewQueueStatus(
    id: string,
    status: ReviewQueueStatus
  ): Promise<void> {
    const db = getDatabase();
    await db.runAsync('UPDATE sms_review_queue SET status = ? WHERE id = ?', [status, id]);
  }

  /**
   * Get parsed transactions with optional limit and offset.
   */
  public static async getParsedTransactions(
    limit: number = 100,
    offset: number = 0
  ): Promise<ParsedTransaction[]> {
    const db = getDatabase();
    const rows = await db.getAllAsync<ParsedTransactionRow>(
      `SELECT * FROM parsed_transactions 
       ORDER BY transaction_date DESC 
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    return rows.map(mapParsedRow);
  }

  /**
   * Get parsed transactions that were saved but not yet linked to a Clarity transaction.
   */
  public static async getUnlinkedParsedTransactions(
    limit: number = 500
  ): Promise<ParsedTransaction[]> {
    const db = getDatabase();
    const rows = await db.getAllAsync<ParsedTransactionRow>(
      `SELECT * FROM parsed_transactions
       WHERE is_duplicate = 0
         AND transaction_id IS NULL
       ORDER BY transaction_date ASC
       LIMIT ?`,
      [limit]
    );
    return rows.map(mapParsedRow);
  }

  /**
   * Get all non-duplicate parsed transactions for recurring pattern analysis.
   */
  public static async getTransactionsForRecurringAnalysis(): Promise<ParsedTransaction[]> {
    const db = getDatabase();
    const rows = await db.getAllAsync<ParsedTransactionRow>(
      `SELECT * FROM parsed_transactions 
       WHERE is_duplicate = 0 
       ORDER BY transaction_date ASC`
    );
    return rows.map(mapParsedRow);
  }

  /**
   * Get aggregate counts and stats for SMS intelligence.
   */
  public static async getSmsStats(): Promise<{
    totalSms: number;
    totalParsed: number;
    totalReview: number;
    totalDuplicates: number;
    totalDebits: number;
    totalCredits: number;
    totalDebitAmount: number;
    totalCreditAmount: number;
  }> {
    const db = getDatabase();

    const smsCountRow = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM sms_messages'
    );
    const parsedStatsRow = await db.getFirstAsync<{
      total: number;
      duplicates: number;
      debits: number;
      credits: number;
      debit_amount: number | null;
      credit_amount: number | null;
    }>(
      `SELECT 
         COUNT(*) as total,
         SUM(CASE WHEN is_duplicate = 1 THEN 1 ELSE 0 END) as duplicates,
         SUM(CASE WHEN type = 'DEBIT' AND is_duplicate = 0 THEN 1 ELSE 0 END) as debits,
         SUM(CASE WHEN type = 'CREDIT' AND is_duplicate = 0 THEN 1 ELSE 0 END) as credits,
         SUM(CASE WHEN type = 'DEBIT' AND is_duplicate = 0 THEN amount ELSE 0 END) as debit_amount,
         SUM(CASE WHEN type = 'CREDIT' AND is_duplicate = 0 THEN amount ELSE 0 END) as credit_amount
       FROM parsed_transactions`
    );

    const reviewCountRow = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM sms_review_queue WHERE status = 'pending'`
    );

    return {
      totalSms: smsCountRow?.count ?? 0,
      totalParsed: parsedStatsRow?.total ?? 0,
      totalReview: reviewCountRow?.count ?? 0,
      totalDuplicates: parsedStatsRow?.duplicates ?? 0,
      totalDebits: parsedStatsRow?.debits ?? 0,
      totalCredits: parsedStatsRow?.credits ?? 0,
      totalDebitAmount: parsedStatsRow?.debit_amount ?? 0,
      totalCreditAmount: parsedStatsRow?.credit_amount ?? 0,
    };
  }

  /**
   * Link a parsed transaction to a created Clarity financial transaction.
   */
  public static async linkClarityTransaction(
    parsedTxId: string,
    clarityTxId: string
  ): Promise<void> {
    const db = getDatabase();
    await db.runAsync('UPDATE parsed_transactions SET transaction_id = ? WHERE id = ?', [
      clarityTxId,
      parsedTxId,
    ]);
  }
}

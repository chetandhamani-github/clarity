export type SmsClassification =
  | 'TRANSACTION_DEBIT'
  | 'TRANSACTION_CREDIT'
  | 'UPI_PAYMENT'
  | 'CARD_PAYMENT'
  | 'ATM_WITHDRAWAL'
  | 'SALARY_CREDIT'
  | 'EMI'
  | 'SUBSCRIPTION'
  | 'BILL'
  | 'OTP'
  | 'PROMOTIONAL'
  | 'SPAM'
  | 'UNKNOWN';

export type SmsPermissionStatus =
  | 'granted'
  | 'denied'
  | 'permanently_denied'
  | 'unavailable';

export interface RawSmsMessage {
  id: string;
  address: string;
  body: string;
  date: number; // Unix epoch millisecond timestamp
  dateSent?: number;
  read?: number;
  threadId?: number;
}

export type TransactionDirection = 'DEBIT' | 'CREDIT';

export interface ExtractedTransaction {
  amount: number;
  type: TransactionDirection;
  merchant: string;
  bank: string;
  accountMask: string;
  referenceNumber?: string;
  availableBalance?: number;
  timestamp: number;
}

export interface ParsedTransaction extends ExtractedTransaction {
  id: string;
  smsId: string;
  category: string;
  confidence: number;
  isDuplicate: boolean;
  duplicateOf?: string;
  transactionId?: string; // Linked Clarity transaction ID if created
  rawBody?: string;
  createdAt: string;
}

export interface ClassificationResult {
  classification: SmsClassification;
  confidence: number;
  isFinancial: boolean;
  reasons: string[];
}

export type ReviewReason =
  | 'LOW_CONFIDENCE'
  | 'MISSING_AMOUNT'
  | 'MISSING_ACCOUNT'
  | 'UNKNOWN_MERCHANT'
  | 'AMBIGUOUS_TYPE'
  | 'UNRECOGNIZED_FORMAT';

export type ReviewQueueStatus = 'pending' | 'resolved' | 'dismissed';

export interface ReviewQueueItem {
  id: string;
  smsId: string;
  sender: string;
  body: string;
  reason: ReviewReason;
  confidence: number;
  extractedData?: Partial<ExtractedTransaction>;
  status: ReviewQueueStatus;
  createdAt: string;
}

export interface RecurringCandidate {
  id?: string;
  merchant: string;
  accountMask: string;
  amount: number;
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  intervalDays: number;
  confidence: number;
  transactionCount: number;
  lastDate: string;
  nextPredictedDate: string;
  category: string;
}

export interface SmsAnalytics {
  totalTransactions: number;
  totalDebits: number;
  totalCredits: number;
  totalDebitAmount: number;
  totalCreditAmount: number;
  detectedSubscriptions: number;
  monthlySubscriptionSpend: number;
  detectedBills: number;
  totalBillSpend: number;
  detectedSalaryCredits: number;
  averageSalary: number;
  parsingSuccessRate: number; // percentage e.g. 96.5
  bankBreakdown: Record<string, number>;
  categoryBreakdown: Record<string, number>;
}

export type SyncPhase =
  | 'idle'
  | 'fetching'
  | 'classifying'
  | 'parsing'
  | 'deduplicating'
  | 'saving'
  | 'complete'
  | 'error';

export interface SmsSyncProgress {
  total: number;
  processed: number;
  batchIndex: number;
  totalBatches: number;
  phase: SyncPhase;
  error?: string;
}

export interface IBankParser {
  readonly bankId: string;
  readonly bankName: string;
  canHandle(message: RawSmsMessage): boolean;
  parse(message: RawSmsMessage, classification?: ClassificationResult): ExtractedTransaction | null;
}

export interface SmsReadOptions {
  limit?: number;
  offset?: number;
  sinceTimestamp?: number;
  startDate?: number;
  endDate?: number;
  address?: string;
}

export interface ISmsReaderAdapter {
  isAvailable(): Promise<boolean>;
  getSms(options?: SmsReadOptions): Promise<RawSmsMessage[]>;
  getSmsSince(timestamp: number, limit?: number): Promise<RawSmsMessage[]>;
}

export type TransactionSourceType = 'SMS' | 'EMAIL' | 'STATEMENT_PDF' | 'STATEMENT_CSV';

export interface BaseFinancialDocument {
  sourceType: TransactionSourceType;
  sourceId: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

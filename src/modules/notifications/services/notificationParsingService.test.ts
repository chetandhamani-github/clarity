import { NotificationParsingService } from './notificationParsingService';
import { BillExtractor } from '@/modules/sms/extractor/billExtractor';
import { SmsPipelineService } from '@/modules/sms/services/smsPipelineService';
import { SmsSyncService } from '@/modules/sms/services/smsSyncService';
import { SmsDao } from '@/modules/sms/storage/smsDao';
import { BillService } from '@/modules/bills/services/BillService';
import { BillAlertEngine } from '@/services/notifications/bill-alert-engine';
import type { RawNotificationPayload } from '../types';

jest.mock('@/modules/sms/extractor/billExtractor', () => ({
  BillExtractor: {
    extractBill: jest.fn(),
  },
}));

jest.mock('@/modules/sms/services/smsPipelineService', () => ({
  SmsPipelineService: {
    processMessage: jest.fn(),
  },
}));

jest.mock('@/modules/sms/services/smsSyncService', () => ({
  SmsSyncService: {
    importParsedTransactions: jest.fn(),
  },
}));

jest.mock('@/modules/sms/storage/smsDao', () => ({
  SmsDao: {
    saveSmsBatch: jest.fn().mockResolvedValue(undefined),
    saveParsedTransactionsBatch: jest.fn().mockResolvedValue(undefined),
    saveReviewQueueBatch: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/modules/bills/services/BillService', () => ({
  BillService: {
    mergeOrInsertExternalBill: jest.fn(),
  },
}));

jest.mock('@/services/notifications/bill-alert-engine', () => ({
  BillAlertEngine: {
    scheduleNativeBillReminder: jest.fn().mockResolvedValue(undefined),
    snoozeNativeBillReminder: jest.fn().mockResolvedValue(new Date()),
  },
}));

jest.mock('@/services/database/bill-dao', () => ({
  mergeOrInsertSmsBill: jest.fn().mockResolvedValue(undefined),
}));

describe('NotificationParsingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const sampleTransactionNotification: RawNotificationPayload = {
    id: 'notif_gpay_1001',
    packageName: 'com.google.android.apps.nbu.paisa.user',
    appName: 'Google Pay',
    title: 'Paid ₹450 to Chai Point',
    text: 'Completed using HDFC Bank A/c XX1234. UPI Ref 412345678901',
    postTime: 1732000000000,
  };

  const sampleBillNotification: RawNotificationPayload = {
    id: 'notif_cred_2001',
    packageName: 'com.dreamplug.androidapp',
    appName: 'CRED',
    title: 'Bill Due: Electricity Bill of ₹1,420',
    text: 'Your Adani Electricity bill is due on 2026-11-28. Pay before due date.',
    postTime: 1732000000000,
  };

  it('ignores empty notification bodies', async () => {
    const result = await NotificationParsingService.processNotification({
      id: 'empty_1',
      packageName: 'com.phonepe.app',
      appName: 'PhonePe',
      title: '',
      text: '',
      postTime: 1732000000000,
    });

    expect(result.type).toBe('IGNORED');
    expect((result as { reason: string }).reason).toBe('EMPTY_NOTIFICATION_BODY');
  });

  it('correctly processes and schedules a detected bill notification', async () => {
    (BillExtractor.extractBill as jest.Mock).mockReturnValue({
      billerName: 'Adani Electricity',
      billerCategory: 'electricity',
      amountDue: 1420,
      dueDate: '2026-11-28',
      accountReference: '102938475',
    });

    (BillService.mergeOrInsertExternalBill as jest.Mock).mockResolvedValue({
      bill: {
        id: 'bill_123',
        title: 'Adani Electricity',
        category: 'electricity',
        amount: 1420,
        dueDate: '2026-11-28',
        status: 'upcoming',
        reminderDays: 3,
      },
      isNew: true,
    });

    const result = await NotificationParsingService.processNotification(sampleBillNotification);

    expect(result.type).toBe('BILL');
    if (result.type === 'BILL') {
      expect(result.bill.billerName).toBe('Adani Electricity');
      expect(result.bill.amountDue).toBe(1420);
    }

    expect(BillService.mergeOrInsertExternalBill).toHaveBeenCalledTimes(1);
    expect(BillAlertEngine.scheduleNativeBillReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'bill_123',
        billerName: 'Adani Electricity',
        amountDue: 1420,
        dueDate: '2026-11-28',
      })
    );
  });

  it('correctly extracts, saves, and imports a non-duplicate transaction notification', async () => {
    (BillExtractor.extractBill as jest.Mock).mockReturnValue(null);

    const mockParsedTransaction = {
      id: 'tx_uuid_1',
      smsId: sampleTransactionNotification.id,
      amount: 450,
      type: 'DEBIT' as const,
      merchant: 'Chai Point',
      category: 'Food & Dining',
      bank: 'HDFC Bank',
      accountMask: '1234',
      referenceNumber: '412345678901',
      timestamp: sampleTransactionNotification.postTime,
      confidence: 0.95,
      isDuplicate: false,
    };

    (SmsPipelineService.processMessage as jest.Mock).mockResolvedValue({
      type: 'PARSED',
      transaction: mockParsedTransaction,
    });

    const result = await NotificationParsingService.processNotification(
      sampleTransactionNotification
    );

    expect(result.type).toBe('TRANSACTION');
    if (result.type === 'TRANSACTION') {
      expect(result.isDuplicate).toBe(false);
      expect(result.transaction.amount).toBe(450);
      expect(result.transaction.merchant).toBe('Chai Point');
    }

    expect(SmsDao.saveSmsBatch).toHaveBeenCalledTimes(1);
    expect(SmsDao.saveParsedTransactionsBatch).toHaveBeenCalledWith([mockParsedTransaction]);
    expect(SmsSyncService.importParsedTransactions).toHaveBeenCalledWith([mockParsedTransaction]);
  });

  it('handles duplicates gracefully without double-importing into ledger', async () => {
    (BillExtractor.extractBill as jest.Mock).mockReturnValue(null);

    const mockDuplicateTx = {
      id: 'tx_uuid_dup',
      smsId: sampleTransactionNotification.id,
      amount: 450,
      type: 'DEBIT' as const,
      merchant: 'Chai Point',
      category: 'Food & Dining',
      bank: 'HDFC Bank',
      accountMask: '1234',
      referenceNumber: '412345678901',
      timestamp: sampleTransactionNotification.postTime,
      confidence: 0.95,
      isDuplicate: true,
      duplicateOf: 'existing_tx_id',
    };

    (SmsPipelineService.processMessage as jest.Mock).mockResolvedValue({
      type: 'PARSED',
      transaction: mockDuplicateTx,
    });

    const result = await NotificationParsingService.processNotification(
      sampleTransactionNotification
    );

    expect(result.type).toBe('TRANSACTION');
    if (result.type === 'TRANSACTION') {
      expect(result.isDuplicate).toBe(true);
    }

    // Should save record to DB for audit/history but NOT import into active ledger
    expect(SmsDao.saveParsedTransactionsBatch).toHaveBeenCalledWith([mockDuplicateTx]);
    expect(SmsSyncService.importParsedTransactions).not.toHaveBeenCalled();
  });
});


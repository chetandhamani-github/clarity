import { NotificationParsingService, buildNotificationBody } from './notificationParsingService';
import { NotificationBillExtractor } from './notificationBillExtractor';
import { DuplicateDetectionEngine } from '@/modules/sms/duplicate/duplicateDetectionEngine';
import { SmsDao } from '@/modules/sms/storage/smsDao';
import { BillService } from '@/modules/bills/services/BillService';
import { BillAlertEngine } from '@/services/notifications/bill-alert-engine';
import { NotificationLedgerService } from './notificationLedgerService';
import type { RawNotificationPayload } from '../types';

jest.mock('./notificationBillExtractor', () => ({
  NotificationBillExtractor: {
    extractBill: jest.fn(),
  },
}));

jest.mock('./notificationLedgerService', () => ({
  NotificationLedgerService: {
    importParsedTransactions: jest.fn(),
    enrichDuplicateTransaction: jest.fn().mockResolvedValue(false),
  },
}));

jest.mock('@/modules/sms/storage/smsDao', () => ({
  SmsDao: {
    getExistingSmsIds: jest.fn().mockResolvedValue(new Set()),
    saveSmsBatch: jest.fn().mockResolvedValue(undefined),
    saveParsedTransactionsBatch: jest.fn().mockResolvedValue(undefined),
    saveReviewQueueBatch: jest.fn().mockResolvedValue(undefined),
    getUnlinkedParsedTransactions: jest.fn().mockResolvedValue([]),
    findPotentialDuplicates: jest.fn().mockResolvedValue([]),
    findCrossAppDuplicates: jest.fn().mockResolvedValue([]),
  },
}));

const mockSetPendingTransactions = jest.fn();
const mockOpenTransactionPrompt = jest.fn();
jest.mock('@/store/useSmsStore', () => ({
  useSmsStore: {
    getState: () => ({
      setPendingTransactions: mockSetPendingTransactions,
      openTransactionPrompt: mockOpenTransactionPrompt,
      refreshReviewQueueCount: jest.fn().mockResolvedValue(undefined),
    }),
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
    DuplicateDetectionEngine.clearCache();
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
    (NotificationBillExtractor.extractBill as jest.Mock).mockReturnValue({
      billerName: 'Adani Electricity',
      billerCategory: 'electricity',
      amountDue: 1420,
      dueDate: '2026-11-28',
      accountReference: '102938475',
      frequency: 'monthly',
      isRecurring: true,
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
      expect(result.isNew).toBe(true);
    }

    expect(BillService.mergeOrInsertExternalBill).toHaveBeenCalledTimes(1);
    expect(SmsDao.saveSmsBatch).toHaveBeenCalledTimes(1);
    expect(BillAlertEngine.scheduleNativeBillReminder).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'bill_123',
        billerName: 'Adani Electricity',
        amountDue: 1420,
        dueDate: '2026-11-28',
      })
    );
  });

  it('suppresses modal prompt (isNew: false) if merged bill was already auto-marked as paid', async () => {
    (NotificationBillExtractor.extractBill as jest.Mock).mockReturnValue({
      billerName: 'Adani Electricity',
      billerCategory: 'electricity',
      amountDue: 1420,
      dueDate: '2026-11-28',
    });

    (BillService.mergeOrInsertExternalBill as jest.Mock).mockResolvedValue({
      bill: {
        id: 'bill_paid_1',
        title: 'Adani Electricity',
        category: 'electricity',
        amount: 1420,
        dueDate: '2026-11-28',
        status: 'paid',
        reminderDays: 3,
      },
      isNew: true,
    });

    const result = await NotificationParsingService.processNotification(sampleBillNotification);

    expect(result.type).toBe('BILL');
    if (result.type === 'BILL') {
      expect(result.isNew).toBe(false);
    }
    expect(BillAlertEngine.scheduleNativeBillReminder).not.toHaveBeenCalled();
  });

  it('marks merged duplicate bill notifications with isNew false', async () => {
    (NotificationBillExtractor.extractBill as jest.Mock).mockReturnValue({
      billerName: 'Adani Electricity',
      billerCategory: 'electricity',
      amountDue: 1420,
      dueDate: '2026-11-28',
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
      isNew: false,
    });

    const result = await NotificationParsingService.processNotification(sampleBillNotification);

    expect(result.type).toBe('BILL');
    if (result.type === 'BILL') {
      expect(result.isNew).toBe(false);
    }
    expect(SmsDao.saveSmsBatch).toHaveBeenCalledTimes(1);
  });

  it('parses, saves, and queues a non-duplicate transaction notification for user confirmation', async () => {
    (NotificationBillExtractor.extractBill as jest.Mock).mockReturnValue(null);
    (SmsDao.getUnlinkedParsedTransactions as jest.Mock).mockImplementationOnce(async () => []);

    const result = await NotificationParsingService.processNotification(
      sampleTransactionNotification
    );

    expect(result.type).toBe('TRANSACTION');
    if (result.type === 'TRANSACTION') {
      expect(result.isDuplicate).toBe(false);
      expect(result.transaction.amount).toBe(450);
      expect(result.transaction.merchant).toBe('Chai Point');
      expect(result.transaction.bank).toBe('HDFC Bank');
      expect(result.transaction.accountMask).toBe('1234');
    }

    expect(SmsDao.saveSmsBatch).toHaveBeenCalledTimes(1);
    expect(SmsDao.saveParsedTransactionsBatch).toHaveBeenCalledTimes(1);
    expect(NotificationLedgerService.importParsedTransactions).not.toHaveBeenCalled();
    expect(mockSetPendingTransactions).toHaveBeenCalledTimes(1);
    expect(mockOpenTransactionPrompt).toHaveBeenCalledTimes(1);
  });

  it('detects cross-app duplicates and enriches original via NotificationLedgerService', async () => {
    (NotificationBillExtractor.extractBill as jest.Mock).mockReturnValue(null);

    await NotificationParsingService.processNotification({
      id: 'notif_gpay_first',
      packageName: 'com.google.android.apps.nbu.paisa.user',
      appName: 'Google Pay',
      title: 'Chai Point',
      text: 'You paid ₹450',
      postTime: 1732000000000,
    });

    const secondResult = await NotificationParsingService.processNotification({
      id: 'notif_hdfc_second',
      packageName: 'com.snapwork.hdfc',
      appName: 'HDFC Bank',
      title: 'HDFC Bank Alert',
      text: 'Rs.450.00 debited from A/c XX1234 to chaipoint@okicici Ref 412345678901 Avl Bal Rs.12,500.00',
      postTime: 1732000005000,
    });

    expect(secondResult.type).toBe('TRANSACTION');
    if (secondResult.type === 'TRANSACTION') {
      expect(secondResult.isDuplicate).toBe(true);
    }
    expect(NotificationLedgerService.importParsedTransactions).not.toHaveBeenCalled();
    expect(NotificationLedgerService.enrichDuplicateTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        bank: 'HDFC Bank',
        accountMask: '1234',
        isDuplicate: true,
      })
    );
  });

  it('skips notifications that have already been persisted in SQLite', async () => {
    (SmsDao.getExistingSmsIds as jest.Mock).mockResolvedValueOnce(
      new Set([sampleTransactionNotification.id])
    );

    const result = await NotificationParsingService.processNotification(
      sampleTransactionNotification
    );

    expect(result).toEqual({ type: 'IGNORED', reason: 'ALREADY_PROCESSED' });
    expect(SmsDao.saveParsedTransactionsBatch).not.toHaveBeenCalled();
  });

  it('enriches counterparty title for UPI notifications where text omits merchant', () => {
    const outgoing = buildNotificationBody({
      id: 'gpay_out',
      packageName: 'com.google.android.apps.nbu.paisa.user',
      appName: 'Google Pay',
      title: 'Chai Point',
      text: 'You paid ₹180',
      postTime: 1732000000000,
    });
    expect(outgoing).toBe('You paid ₹180 to Chai Point');

    const incoming = buildNotificationBody({
      id: 'gpay_in',
      packageName: 'com.google.android.apps.nbu.paisa.user',
      appName: 'Google Pay',
      title: 'Rahul Sharma',
      text: 'Paid you ₹500',
      postTime: 1732000000000,
    });
    expect(incoming).toBe('Paid you ₹500 from Rahul Sharma');
  });
});

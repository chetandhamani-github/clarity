import { DuplicateDetectionEngine } from '@/modules/sms/duplicate/duplicateDetectionEngine';
import type { RawNotificationPayload } from '../types';
import { NotificationBillExtractor } from './notificationBillExtractor';
import { buildNotificationBody, NotificationParsingService } from './notificationParsingService';

describe('Notification parsing corpus (end-to-end)', () => {
  beforeEach(() => {
    DuplicateDetectionEngine.clearCache();
  });

  it('parses Google Pay outgoing payment with counterparty in notification title', async () => {
    const result = await NotificationParsingService.parseTransactionCandidate(
      {
        id: 'notif_gpay_1',
        packageName: 'com.google.android.apps.nbu.paisa.user',
        appName: 'Google Pay',
        title: 'Blue Tokai Coffee',
        text: 'You paid ₹320',
        postTime: 1732000000000,
      },
      { checkDatabaseDuplicates: false }
    );
    expect(result.type).toBe('PARSED');
    if (result.type === 'PARSED') {
      expect(result.transaction.type).toBe('DEBIT');
      expect(result.transaction.amount).toBe(320);
      expect(result.transaction.merchant).toBe('Blue Tokai Coffee');
      expect(result.transaction.bank).toBe('Bank / UPI');
      expect(result.transaction.accountMask).toBe('XXXX');
    }
  });

  it('parses Google Pay "Paid you" P2P notification as CREDIT instead of DEBIT', async () => {
    const result = await NotificationParsingService.parseTransactionCandidate(
      {
        id: 'notif_gpay_in_1',
        packageName: 'com.google.android.apps.nbu.paisa.user',
        appName: 'Google Pay',
        title: 'Rahul Sharma',
        text: 'Paid you ₹1,500',
        postTime: 1732000000000,
      },
      { checkDatabaseDuplicates: false }
    );
    expect(result.type).toBe('PARSED');
    if (result.type === 'PARSED') {
      expect(result.transaction.type).toBe('CREDIT');
      expect(result.transaction.amount).toBe(1500);
      expect(result.transaction.merchant).toBe('Rahul Sharma');
    }
  });

  it('parses PhonePe and Paytm notifications accurately', async () => {
    const phonePeResult = await NotificationParsingService.parseTransactionCandidate(
      {
        id: 'notif_phonepe_1',
        packageName: 'com.phonepe.app',
        appName: 'PhonePe',
        title: 'Paid ₹540 to Swiggy',
        text: 'Transaction successful via HDFC Bank XX1234',
        postTime: 1732000000000,
      },
      { checkDatabaseDuplicates: false }
    );
    expect(phonePeResult.type).toBe('PARSED');
    if (phonePeResult.type === 'PARSED') {
      expect(phonePeResult.transaction.type).toBe('DEBIT');
      expect(phonePeResult.transaction.amount).toBe(540);
      expect(phonePeResult.transaction.merchant).toBe('Swiggy');
      expect(phonePeResult.transaction.bank).toBe('HDFC Bank');
      expect(phonePeResult.transaction.accountMask).toBe('1234');
    }
  });

  it('resolves full bank app display names like Bank of India and AU Small Finance Bank', async () => {
    const boiResult = await NotificationParsingService.parseTransactionCandidate(
      {
        id: 'notif_boi_1',
        packageName: 'com.boi.mpassbook',
        appName: 'Bank of India',
        title: 'Account Debited',
        text: 'A/c XX4321 debited by Rs.2,000.00 on 24-Nov-26 to Zomato',
        postTime: 1732000000000,
      },
      { checkDatabaseDuplicates: false }
    );
    expect(boiResult.type).toBe('PARSED');
    if (boiResult.type === 'PARSED') {
      expect(boiResult.transaction.bank).toBe('Bank of India');
      expect(boiResult.transaction.accountMask).toBe('4321');
    }
  });

  it('does not misassign payee bank names like HDFC Credit Card or Axis Mutual Fund', async () => {
    const result = await NotificationParsingService.parseTransactionCandidate(
      {
        id: 'notif_gpay_payee_bank',
        packageName: 'com.google.android.apps.nbu.paisa.user',
        appName: 'Google Pay',
        title: 'Axis Mutual Fund',
        text: 'You paid ₹2,500',
        postTime: 1732000000000,
      },
      { checkDatabaseDuplicates: false }
    );

    expect(result.type).toBe('PARSED');
    if (result.type === 'PARSED') {
      expect(result.transaction.merchant).toBe('Axis Mutual Fund');
      expect(result.transaction.bank).toBe('Bank / UPI');
      expect(result.transaction.accountMask).toBe('XXXX');
    }
  });

  it('ignores UPI collect/payment requests, failed payments, pre-debit mandates, and OTPs', async () => {
    const noiseNotifications: RawNotificationPayload[] = [
      {
        id: 'noise_request',
        packageName: 'com.google.android.apps.nbu.paisa.user',
        appName: 'Google Pay',
        title: 'Swiggy',
        text: 'Payment request of ₹450',
        postTime: 1732000000000,
      },
      {
        id: 'noise_failed',
        packageName: 'com.phonepe.app',
        appName: 'PhonePe',
        title: 'Payment Failed',
        text: 'Payment of ₹899 to Amazon failed due to bank error',
        postTime: 1732000000000,
      },
      {
        id: 'noise_mandate',
        packageName: 'com.snapwork.hdfc',
        appName: 'HDFC Bank',
        title: 'Pre-debit Notification',
        text: 'Rs.649.00 will be debited from A/c XX1234 on 28-Nov-26 for Netflix mandate',
        postTime: 1732000000000,
      },
      {
        id: 'noise_otp',
        packageName: 'com.snapwork.hdfc',
        appName: 'HDFC Bank',
        title: 'Verification Code',
        text: 'Your OTP is 492811 for card txn of Rs.1200. Do not share.',
        postTime: 1732000000000,
      },
    ];

    for (const notif of noiseNotifications) {
      const result = await NotificationParsingService.parseTransactionCandidate(notif, {
        checkDatabaseDuplicates: false,
      });
      expect(result.type).toBe('IGNORED');
    }
  });

  it('deduplicates GPay notification followed by richer HDFC Bank alert within 5 minutes', async () => {
    const first = await NotificationParsingService.parseTransactionCandidate(
      {
        id: 'notif_gpay_dup',
        packageName: 'com.google.android.apps.nbu.paisa.user',
        appName: 'Google Pay',
        title: 'Chai Point',
        text: 'You paid ₹450',
        postTime: 1732000000000,
      },
      { checkDatabaseDuplicates: false }
    );
    expect(first.type).toBe('PARSED');
    if (first.type === 'PARSED') {
      expect(first.transaction.isDuplicate).toBe(false);
    }

    const second = await NotificationParsingService.parseTransactionCandidate(
      {
        id: 'notif_hdfc_dup',
        packageName: 'com.snapwork.hdfc',
        appName: 'HDFC Bank',
        title: 'HDFC Bank Alert',
        text: 'Rs.450.00 debited from A/c XX1234 to chaipoint@okicici Ref 412345678901 Avl Bal Rs.12,500.00',
        postTime: 1732000005000,
      },
      { checkDatabaseDuplicates: false }
    );
    expect(second.type).toBe('PARSED');
    if (second.type === 'PARSED') {
      expect(second.transaction.isDuplicate).toBe(true);
    }
  });

  it('parses PhonePe executed payment phrasing and handles Debit Card vs Credit Card accurately', async () => {
    const debitCardResult = await NotificationParsingService.parseTransactionCandidate(
      {
        id: 'notif_hdfc_debit_card',
        packageName: 'com.snapwork.hdfc',
        appName: 'HDFC Bank',
        title: 'Debit Card Transaction',
        text: 'Rs.1,200.00 spent on HDFC Bank Debit Card ending 4455 at Swiggy',
        postTime: 1732000000000,
      },
      { checkDatabaseDuplicates: false }
    );
    expect(debitCardResult.type).toBe('PARSED');
    if (debitCardResult.type === 'PARSED') {
      expect(debitCardResult.transaction.bank).toBe('HDFC Bank');
      expect(debitCardResult.transaction.accountMask).toBe('4455');
      expect(debitCardResult.transaction.type).toBe('DEBIT');
    }

    const executedPayment = await NotificationParsingService.parseTransactionCandidate(
      {
        id: 'notif_phonepe_exec',
        packageName: 'com.phonepe.app',
        appName: 'PhonePe',
        title: 'Payment Successful',
        text: 'UPI payment of ₹650 to Zomato completed via SBI - 9012',
        postTime: 1732000005000,
      },
      { checkDatabaseDuplicates: false }
    );
    expect(executedPayment.type).toBe('PARSED');
    if (executedPayment.type === 'PARSED') {
      expect(executedPayment.transaction.bank).toBe('State Bank of India');
      expect(executedPayment.transaction.accountMask).toBe('9012');
      expect(executedPayment.transaction.amount).toBe(650);
      expect(executedPayment.transaction.merchant).toBe('Zomato');
    }
  });

  it('treats paid electricity bill notification as transaction rather than pending bill', () => {
    const notif: RawNotificationPayload = {
      id: 'notif_paid_bill',
      packageName: 'net.one97.paytm',
      appName: 'Paytm',
      title: 'Electricity Bill Paid',
      text: 'You paid ₹1,420 to Adani Electricity bill',
      postTime: 1732000000000,
    };
    expect(
      NotificationBillExtractor.extractBill(notif, buildNotificationBody(notif))
    ).toBeNull();
  });

  it('captures pre-debit mandate notifications as upcoming bills via NotificationBillExtractor while ignoring them as executed transactions', async () => {
    const mandateNotif: RawNotificationPayload = {
      id: 'notif_mandate_bill',
      packageName: 'com.snapwork.hdfc',
      appName: 'HDFC Bank',
      title: 'Pre-debit Notification',
      text: 'Rs.649.00 will be debited from A/c XX1234 on 28-Nov-26 for Netflix mandate',
      postTime: 1732000000000,
    };

    const txResult = await NotificationParsingService.parseTransactionCandidate(mandateNotif, {
      checkDatabaseDuplicates: false,
    });
    expect(txResult.type).toBe('IGNORED');

    const billResult = NotificationBillExtractor.extractBill(
      mandateNotif,
      buildNotificationBody(mandateNotif)
    );
    expect(billResult).toMatchObject({
      billerName: 'Netflix',
      billerCategory: 'subscription',
      amountDue: 649,
      dueDate: '2026-11-28',
    });
  });

  it('ignores balance-snapshot-only notifications instead of queueing review items, and captures utilised card spends & cancelled-order refunds', async () => {
    const balanceOnly = await NotificationParsingService.parseTransactionCandidate(
      {
        id: 'notif_bal_only',
        packageName: 'com.snapwork.hdfc',
        appName: 'HDFC Bank',
        title: 'Balance Alert',
        text: 'Your HDFC Bank A/c XX1234 Avl Bal is Rs. 45,230.00',
        postTime: 1732000000000,
      },
      { checkDatabaseDuplicates: false }
    );
    expect(balanceOnly.type).toBe('IGNORED');

    const cardUtilised = await NotificationParsingService.parseTransactionCandidate(
      {
        id: 'notif_card_utilised',
        packageName: 'com.snapwork.hdfc',
        appName: 'HDFC Bank',
        title: 'Card Alert',
        text: 'INR 2,400.00 utilised on HDFC Credit Card XX4521 at Flipkart',
        postTime: 1732000000000,
      },
      { checkDatabaseDuplicates: false }
    );
    expect(cardUtilised.type).toBe('PARSED');
    if (cardUtilised.type === 'PARSED') {
      expect(cardUtilised.transaction.type).toBe('DEBIT');
      expect(cardUtilised.transaction.amount).toBe(2400);
      expect(cardUtilised.transaction.bank).toBe('HDFC Bank');
      expect(cardUtilised.transaction.accountMask).toBe('4521');
    }

    const cancelledRefund = await NotificationParsingService.parseTransactionCandidate(
      {
        id: 'notif_refund_cancelled',
        packageName: 'com.csam.icici.bank.imobile',
        appName: 'ICICI Bank',
        title: 'Refund Alert',
        text: 'Order cancelled. Refund of Rs. 450.00 processed to ICICI A/c XX9988 from Swiggy',
        postTime: 1732000000000,
      },
      { checkDatabaseDuplicates: false }
    );
    expect(cancelledRefund.type).toBe('PARSED');
    if (cancelledRefund.type === 'PARSED') {
      expect(cancelledRefund.transaction.type).toBe('CREDIT');
      expect(cancelledRefund.transaction.amount).toBe(450);
      expect(cancelledRefund.transaction.bank).toBe('ICICI Bank');
      expect(cancelledRefund.transaction.accountMask).toBe('9988');
    }
  });

  it('deduplicates GPay named merchant alert with bank alert using opaque QR VPA handle', async () => {
    const first = await NotificationParsingService.parseTransactionCandidate(
      {
        id: 'notif_gpay_qr_1',
        packageName: 'com.google.android.apps.nbu.paisa.user',
        appName: 'Google Pay',
        title: 'Chai Point',
        text: 'You paid ₹180',
        postTime: 1732000000000,
      },
      { checkDatabaseDuplicates: false }
    );
    expect(first.type).toBe('PARSED');

    const second = await NotificationParsingService.parseTransactionCandidate(
      {
        id: 'notif_hdfc_qr_2',
        packageName: 'com.snapwork.hdfc',
        appName: 'HDFC Bank',
        title: 'HDFC Bank Alert',
        text: 'Rs.180.00 debited from A/c XX1234 to VPA vyapar.16912345@hdfcbank (UPI Ref 412345678902)',
        postTime: 1732000005000,
      },
      { checkDatabaseDuplicates: false }
    );
    expect(second.type).toBe('PARSED');
    if (second.type === 'PARSED') {
      expect(second.transaction.isDuplicate).toBe(true);
    }
  });
});

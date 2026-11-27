import { buildNotificationBody, NotificationExtractor } from './notificationExtractor';
import type { RawNotificationPayload } from '../types';

describe('NotificationExtractor', () => {
  it('builds body including subText while deduplicating appName and repeated text', () => {
    const body = buildNotificationBody({
      id: 'n1',
      packageName: 'com.phonepe.app',
      appName: 'PhonePe',
      title: 'Paid ₹450 to Chai Point',
      text: 'UPI payment successful',
      subText: 'HDFC Bank XX1234',
      postTime: 1732000000000,
    });

    expect(body).toContain('Paid ₹450 to Chai Point');
    expect(body).toContain('HDFC Bank XX1234');
  });

  it('does not turn bank app title into a counterparty merchant', () => {
    const body = buildNotificationBody({
      id: 'n2',
      packageName: 'com.snapwork.hdfc',
      appName: 'HDFC Bank',
      title: 'HDFC Savings Alert',
      text: 'You paid ₹500',
      postTime: 1732000000000,
    });

    expect(body).not.toContain('to HDFC Savings Alert');
  });

  it('does not hijack bank from payee/recipient name in UPI notifications', () => {
    const ccPayNotif: RawNotificationPayload = {
      id: 'n3',
      packageName: 'com.google.android.apps.nbu.paisa.user',
      appName: 'Google Pay',
      title: 'HDFC Bank Credit Card',
      text: 'You paid ₹5,000',
      postTime: 1732000000000,
    };
    const ccBody = buildNotificationBody(ccPayNotif);
    const ccExtracted = NotificationExtractor.extract(ccPayNotif, ccBody);
    expect(ccExtracted?.bank).toBe('Bank / UPI');
    expect(ccExtracted?.accountMask).toBe('XXXX');
    expect(ccExtracted?.merchant).toBe('HDFC Bank Credit Card');
    expect(NotificationExtractor.isCreditCard(ccBody, ccExtracted?.bank)).toBe(false);

    const mfNotif: RawNotificationPayload = {
      id: 'n4',
      packageName: 'com.phonepe.app',
      appName: 'PhonePe',
      title: 'Paid ₹2,000 to Axis Mutual Fund',
      text: 'Payment successful',
      postTime: 1732000000000,
    };
    const mfBody = buildNotificationBody(mfNotif);
    expect(NotificationExtractor.resolveBank(mfNotif, mfBody)).toBe('Bank / UPI');

    const personBobNotif: RawNotificationPayload = {
      id: 'n5',
      packageName: 'com.google.android.apps.nbu.paisa.user',
      appName: 'Google Pay',
      title: 'Bob',
      text: 'You paid ₹500',
      postTime: 1732000000000,
    };
    const bobBody = buildNotificationBody(personBobNotif);
    expect(NotificationExtractor.resolveBank(personBobNotif, bobBody)).toBe('Bank / UPI');
  });

  it('resolves true source bank instead of CRED app name or payee credit card bank', () => {
    const credWithSource: RawNotificationPayload = {
      id: 'n6',
      packageName: 'com.dreamplug.androidapp',
      appName: 'CRED',
      title: 'Bill payment successful',
      text: 'Paid ₹15,000 from SBI A/c XX1234 towards HDFC Bank Credit Card ending 5678',
      postTime: 1732000000000,
    };
    const body1 = buildNotificationBody(credWithSource);
    const ext1 = NotificationExtractor.extract(credWithSource, body1);
    expect(ext1?.bank).toBe('State Bank of India');
    expect(ext1?.accountMask).toBe('1234');
    expect(NotificationExtractor.isCreditCard(body1, ext1?.bank)).toBe(false);

    const credNoSource: RawNotificationPayload = {
      id: 'n7',
      packageName: 'com.dreamplug.androidapp',
      appName: 'CRED',
      title: 'Payment successful',
      text: 'Paid ₹12,000 towards ICICI Bank Credit Card ending 4321',
      postTime: 1732000000000,
    };
    const body2 = buildNotificationBody(credNoSource);
    const ext2 = NotificationExtractor.extract(credNoSource, body2);
    expect(ext2?.bank).toBe('Bank / UPI');
    expect(ext2?.accountMask).toBe('XXXX');
  });

  it('ignores masked phone numbers, amounts, and destination cards when extracting accountMask', () => {
    expect(
      NotificationExtractor.extractAccountMask('You paid ₹500 to ******4321 via UPI')
    ).toBeNull();
    expect(
      NotificationExtractor.extractAccountMask('Debited from your account. 500.00 paid to Swiggy')
    ).toBeNull();
    expect(
      NotificationExtractor.extractAccountMask(
        'Paid ₹4,500 from your bank account towards HDFC Credit Card ending 5678'
      )
    ).toBeNull();
    expect(
      NotificationExtractor.extractAccountMask(
        'Rs.4,500 debited from A/c XX1234 towards HDFC Credit Card ending 5678'
      )
    ).toBe('1234');
  });

  it('distinguishes debit card spends from credit card spends', () => {
    const debitCardBody = 'Rs.1,200.00 spent on HDFC Bank Debit Card ending 4455 at Swiggy';
    expect(NotificationExtractor.isCreditCard(debitCardBody, 'HDFC Bank')).toBe(false);

    const creditCardBody =
      'Rs.2,500.00 spent on HDFC Bank Credit Card ending 8899 at Amazon. Avl Lmt Rs.80,000';
    expect(NotificationExtractor.isCreditCard(creditCardBody, 'HDFC Bank')).toBe(true);
  });

  it('rejects promotional scratch card, unlock nudge, and UPI PIN notifications as push noise', () => {
    expect(NotificationExtractor.isPushNoise('You won a scratch card! Earn up to ₹100')).toBe(
      true
    );
    expect(NotificationExtractor.isPushNoise('UPI PIN set successfully for HDFC A/c')).toBe(true);
    expect(
      NotificationExtractor.isPushNoise('Cashback of ₹50 earned! Pay ₹499 more to unlock reward')
    ).toBe(true);
  });

  it('extracts bank and mask from separator-only UPI alerts like "via HDFC Bank - 1234"', () => {
    const notif: RawNotificationPayload = {
      id: 'n8',
      packageName: 'com.phonepe.app',
      appName: 'PhonePe',
      title: 'Paid ₹780 to Zomato',
      text: 'Payment successful via HDFC Bank - 1234',
      postTime: 1732000000000,
    };
    const body = buildNotificationBody(notif);
    const extracted = NotificationExtractor.extract(notif, body);
    expect(extracted?.bank).toBe('HDFC Bank');
    expect(extracted?.accountMask).toBe('1234');
    expect(extracted?.amount).toBe(780);
    expect(extracted?.merchant).toBe('Zomato');
  });

  it('cleans bogus account-placeholder merchant names and handles executed payment phrasing', () => {
    const creditNotif: RawNotificationPayload = {
      id: 'n9',
      packageName: 'com.snapwork.hdfc',
      appName: 'HDFC Bank',
      title: 'Credit Alert',
      text: 'Rs. 5,000.00 credited to Account XX1234 on 27-Nov',
      postTime: 1732000000000,
    };
    const body1 = buildNotificationBody(creditNotif);
    const ext1 = NotificationExtractor.extract(creditNotif, body1);
    expect(ext1?.type).toBe('CREDIT');
    expect(ext1?.merchant).toBe('');

    const paidAlert: RawNotificationPayload = {
      id: 'n10',
      packageName: 'com.phonepe.app',
      appName: 'PhonePe',
      title: 'Payment Successful',
      text: 'Payment of ₹500 to Swiggy successful via ICICI Bank XX4321',
      postTime: 1732000000000,
    };
    const body2 = buildNotificationBody(paidAlert);
    const ext2 = NotificationExtractor.extract(paidAlert, body2);
    expect(ext2?.type).toBe('DEBIT');
    expect(ext2?.amount).toBe(500);
    expect(ext2?.bank).toBe('ICICI Bank');
    expect(ext2?.accountMask).toBe('4321');
    expect(ext2?.merchant).toBe('Swiggy');

    const incomingOwnAccount: RawNotificationPayload = {
      id: 'n11',
      packageName: 'com.snapwork.hdfc',
      appName: 'HDFC Bank',
      title: 'Money Received',
      text: 'Rs. 10,000.00 transferred to your HDFC A/c XX1234',
      postTime: 1732000000000,
    };
    const body3 = buildNotificationBody(incomingOwnAccount);
    const ext3 = NotificationExtractor.extract(incomingOwnAccount, body3);
    expect(ext3?.type).toBe('CREDIT');
    expect(ext3?.bank).toBe('HDFC Bank');
    expect(ext3?.accountMask).toBe('1234');
  });
});


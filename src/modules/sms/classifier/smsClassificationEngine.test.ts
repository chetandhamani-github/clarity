import { SmsClassificationEngine } from './smsClassificationEngine';
import type { RawSmsMessage } from '@/modules/sms/types';

describe('SmsClassificationEngine', () => {
  const createMsg = (body: string, address: string = 'BANK'): RawSmsMessage => ({
    id: 'test-id',
    address,
    body,
    date: Date.now(),
  });

  describe('Noise Filtering', () => {
    it('classifies OTP correctly and flags isFinancial as false', () => {
      const msg = createMsg('Your OTP for netbanking login is 482910. Valid for 10 mins. Do not share.');
      const res = SmsClassificationEngine.classify(msg);
      expect(res.classification).toBe('OTP');
      expect(res.isFinancial).toBe(false);
    });

    it('classifies Promotional loan offers correctly and flags isFinancial as false', () => {
      const msg = createMsg('Congratulations! You are eligible for a pre-approved loan of Rs 500,000. Apply now with code LOAN50.');
      const res = SmsClassificationEngine.classify(msg);
      expect(res.classification).toBe('PROMOTIONAL');
      expect(res.isFinancial).toBe(false);
    });

    it('classifies Spam/Phishing correctly and flags isFinancial as false', () => {
      const msg = createMsg('Dear customer your KYC expired! Click http://bit.ly/kyc-update to prevent deactivation.');
      const res = SmsClassificationEngine.classify(msg);
      expect(res.classification).toBe('SPAM');
      expect(res.isFinancial).toBe(false);
    });

    it('classifies Non-financial random text as UNKNOWN', () => {
      const msg = createMsg('Hey, are you free for dinner tonight?');
      const res = SmsClassificationEngine.classify(msg);
      expect(res.classification).toBe('UNKNOWN');
      expect(res.isFinancial).toBe(false);
    });
  });

  describe('Financial Classification', () => {
    it('classifies SALARY_CREDIT correctly', () => {
      const msg = createMsg('Your salary for January Rs.85,000.00 has been credited to A/c XX1234 on 31-Jan-25.');
      const res = SmsClassificationEngine.classify(msg);
      expect(res.classification).toBe('SALARY_CREDIT');
      expect(res.isFinancial).toBe(true);
    });

    it('classifies ATM_WITHDRAWAL correctly', () => {
      const msg = createMsg('Rs.5,000.00 withdrawn at SBI ATM from A/c XX5678 on 05-Jan-25. Avl Bal Rs.25,000.00');
      const res = SmsClassificationEngine.classify(msg);
      expect(res.classification).toBe('ATM_WITHDRAWAL');
      expect(res.isFinancial).toBe(true);
    });

    it('classifies EMI correctly', () => {
      const msg = createMsg('Your loan account XX9988 has been debited for EMI of Rs.12,450.00 on 05-Jan-25.');
      const res = SmsClassificationEngine.classify(msg);
      expect(res.classification).toBe('EMI');
      expect(res.isFinancial).toBe(true);
    });

    it('classifies SUBSCRIPTION correctly', () => {
      const msg = createMsg('Auto-debit of Rs.649.00 for Netflix subscription was successful from A/c XX4321.');
      const res = SmsClassificationEngine.classify(msg);
      expect(res.classification).toBe('SUBSCRIPTION');
      expect(res.isFinancial).toBe(true);
    });

    it('classifies BILL correctly', () => {
      const msg = createMsg('Your electricity bill payment of Rs.2,400.00 to BESCOM was debited from A/c XX1234.');
      const res = SmsClassificationEngine.classify(msg);
      expect(res.classification).toBe('BILL');
      expect(res.isFinancial).toBe(true);
    });

    it('classifies UPI_PAYMENT correctly', () => {
      const msg = createMsg('Paid Rs.350.00 via UPI to swiggy@icici from A/c XX1122. UPI Ref 402918237182.');
      const res = SmsClassificationEngine.classify(msg);
      expect(res.classification).toBe('UPI_PAYMENT');
      expect(res.isFinancial).toBe(true);
    });

    it('classifies CARD_PAYMENT correctly', () => {
      const msg = createMsg('Rs.1,599.00 spent on your Credit Card ending 4455 at ZARA POS on 12-Jan-25.');
      const res = SmsClassificationEngine.classify(msg);
      expect(res.classification).toBe('CARD_PAYMENT');
      expect(res.isFinancial).toBe(true);
    });

    it('classifies TRANSACTION_DEBIT correctly', () => {
      const msg = createMsg('Rs.500.00 debited from A/c XX1234 on 01-Jan-25.');
      const res = SmsClassificationEngine.classify(msg);
      expect(res.classification).toBe('TRANSACTION_DEBIT');
      expect(res.isFinancial).toBe(true);
    });

    it('classifies TRANSACTION_CREDIT correctly', () => {
      const msg = createMsg('Rs.2,000.00 credited to A/c XX1234 on 02-Jan-25. Avl Bal Rs.15,000.00');
      const res = SmsClassificationEngine.classify(msg);
      expect(res.classification).toBe('TRANSACTION_CREDIT');
      expect(res.isFinancial).toBe(true);
    });
  });
});

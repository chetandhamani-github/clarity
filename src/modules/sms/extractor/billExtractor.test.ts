import { BillExtractor } from './billExtractor';
import type { RawSmsMessage } from '@/types';

describe('BillExtractor', () => {
  it('should ignore OTP and promotional SMS', () => {
    const otpMsg: RawSmsMessage = {
      id: '1',
      address: 'VK-HDFCBK',
      body: 'Your OTP is 492019 for online purchase of Rs. 1,500. Do not share with anyone.',
      date: Date.now(),
    };
    expect(BillExtractor.extractBill(otpMsg)).toBeNull();

    const promoMsg: RawSmsMessage = {
      id: '2',
      address: 'AD-SWIGGY',
      body: 'Congratulations! You are eligible for 50% discount on food orders up to Rs 150. Use code FEAST50 now!',
      date: Date.now(),
    };
    expect(BillExtractor.extractBill(promoMsg)).toBeNull();

    const debitMsg: RawSmsMessage = {
      id: '2b',
      address: 'VK-SBIINB',
      body: 'Your A/c XX1234 debited by Rs. 2,450.00 on 25-09-2026 towards BESCOM Electricity bill payment. Avl Bal Rs. 15,200.00.',
      date: Date.now(),
    };
    expect(BillExtractor.extractBill(debitMsg)).toBeNull();

    const paidReceiptMsg: RawSmsMessage = {
      id: '2c',
      address: 'BP-AIRTEL',
      body: 'Thank you for paying Rs. 1178 towards Airtel Broadband account 08041234567. Payment received with thanks.',
      date: Date.now(),
    };
    expect(BillExtractor.extractBill(paidReceiptMsg)).toBeNull();
  });

  it('should correctly parse Electricity bills (e.g. BESCOM)', () => {
    const msg: RawSmsMessage = {
      id: '3',
      address: 'VK-BESCOM',
      body: 'Dear Consumer, Electricity bill for BESCOM Account No: 12894532 of Rs. 2,450.00 is generated. Due date is 25-09-2026. Pay online at https://bescom.org/pay',
      date: new Date('2026-09-10').getTime(),
    };

    const bill = BillExtractor.extractBill(msg);
    expect(bill).not.toBeNull();
    expect(bill?.billerName).toBe('BESCOM');
    expect(bill?.billerCategory).toBe('electricity');
    expect(bill?.amountDue).toBe(2450);
    expect(bill?.dueDate).toBe('2026-09-25');
    expect(bill?.accountReference).toBe('12894532');
    expect(bill?.paymentUrl).toBe('https://bescom.org/pay');
  });

  it('should correctly parse regional Discoms with dot-separated dates (e.g. UPPCL)', () => {
    const msg: RawSmsMessage = {
      id: '3b',
      address: 'VK-UPPCL',
      body: 'UPPCL Electricity bill for Consumer No 98765432 of Rs 1,420.00 is generated. Due date is 15.11.2026. Please pay timely.',
      date: new Date('2026-11-01').getTime(),
    };

    const bill = BillExtractor.extractBill(msg);
    expect(bill).not.toBeNull();
    expect(bill?.billerName).toBe('UPPCL Electricity');
    expect(bill?.billerCategory).toBe('electricity');
    expect(bill?.amountDue).toBe(1420);
    expect(bill?.dueDate).toBe('2026-11-15');
    expect(bill?.accountReference).toBe('98765432');
  });

  it('should correctly parse Credit Card statements with Total and Min Due (e.g. HDFC Credit Card)', () => {
    const msg: RawSmsMessage = {
      id: '4',
      address: 'VM-HDFCBK',
      body: 'Statement for HDFC Bank Credit Card ending 4821 is generated. Total Due: Rs 18,450.50, Min Due: Rs 920.00. Payment due on 22-Oct-2026. Click https://hdfcbank.com/cardpay to pay.',
      date: new Date('2026-09-28').getTime(),
    };

    const bill = BillExtractor.extractBill(msg);
    expect(bill).not.toBeNull();
    expect(bill?.billerName).toBe('HDFC Bank Credit Card');
    expect(bill?.billerCategory).toBe('credit_card');
    expect(bill?.amountDue).toBe(18450.5);
    expect(bill?.minAmountDue).toBe(920);
    expect(bill?.dueDate).toBe('2026-10-22');
    expect(bill?.accountReference).toBe('Card ..4821');
    expect(bill?.paymentUrl).toBe('https://hdfcbank.com/cardpay');
  });

  it('should guard against Credit Limit confusion in credit card SMS', () => {
    const msg: RawSmsMessage = {
      id: '4b',
      address: 'VM-SBICRD',
      body: 'Statement for SBI Card ending in 9812: Total Amt Due: Rs 24,500.00, Min Amt Due: Rs 1,225.00, Credit Limit: Rs 1,50,000, Avl Lmt: Rs 1,25,500. Due on 15-Nov-2026.',
      date: new Date('2026-10-25').getTime(),
    };

    const bill = BillExtractor.extractBill(msg);
    expect(bill).not.toBeNull();
    expect(bill?.billerName).toBe('SBI Credit Card');
    expect(bill?.billerCategory).toBe('credit_card');
    expect(bill?.amountDue).toBe(24500);
    expect(bill?.minAmountDue).toBe(1225);
    expect(bill?.dueDate).toBe('2026-11-15');
    expect(bill?.accountReference).toBe('Card ..9812');
  });

  it('should correctly parse Broadband bill reminders (e.g. Airtel Xstream Fiber)', () => {
    const msg: RawSmsMessage = {
      id: '5',
      address: 'BP-AIRTEL',
      body: 'Your Airtel Xstream Fiber bill of Rs. 1,178 for Landline No: 08041234567 is due on 18-Sep-2026. Pay now to avoid late fee.',
      date: new Date('2026-09-05').getTime(),
    };

    const bill = BillExtractor.extractBill(msg);
    expect(bill).not.toBeNull();
    expect(bill?.billerName).toBe('Airtel Xstream Fiber');
    expect(bill?.billerCategory).toBe('broadband');
    expect(bill?.amountDue).toBe(1178);
    expect(bill?.dueDate).toBe('2026-09-18');
    expect(bill?.accountReference).toBe('08041234567');
  });

  it('should parse Month-first dates (e.g. Oct 25, 2026)', () => {
    const msg: RawSmsMessage = {
      id: '5b',
      address: 'AD-JIOFBR',
      body: 'Your JioFiber bill of Rs 1,178 is generated. Payment due date: Oct 25, 2026. Pay via MyJio app.',
      date: new Date('2026-10-10').getTime(),
    };

    const bill = BillExtractor.extractBill(msg);
    expect(bill).not.toBeNull();
    expect(bill?.billerName).toBe('JioFiber');
    expect(bill?.dueDate).toBe('2026-10-25');
    expect(bill?.amountDue).toBe(1178);
  });

  it('should handle Year Rollover when bill arrives in Dec for Jan due date', () => {
    const msg: RawSmsMessage = {
      id: '5c',
      address: 'VM-HDFCBK',
      body: 'Your HDFC Bank Credit Card bill of Rs 8,450 is due on 05-Jan. Pay now to avoid late charges.',
      date: new Date('2026-12-28').getTime(),
    };

    const bill = BillExtractor.extractBill(msg);
    expect(bill).not.toBeNull();
    expect(bill?.dueDate).toBe('2027-01-05');
    expect(bill?.amountDue).toBe(8450);
  });

  it('should correctly parse Piped Gas bills with BP No (e.g. IGL Gas)', () => {
    const msg: RawSmsMessage = {
      id: '6',
      address: 'BW-IGLGAS',
      body: 'IGL Gas bill of Rs 860 for BP No: 40012938 is generated. Pay by 30-09-2026 to avoid penalty.',
      date: new Date('2026-09-12').getTime(),
    };

    const bill = BillExtractor.extractBill(msg);
    expect(bill).not.toBeNull();
    expect(bill?.billerName).toBe('IGL Gas');
    expect(bill?.billerCategory).toBe('gas');
    expect(bill?.amountDue).toBe(860);
    expect(bill?.dueDate).toBe('2026-09-30');
    expect(bill?.accountReference).toBe('40012938');
  });

  it('should correctly parse Loan EMI reminders (e.g. Bajaj Finserv)', () => {
    const msg: RawSmsMessage = {
      id: '7',
      address: 'AD-BAJAJF',
      body: 'Dear Customer, your Bajaj Finserv EMI of Rs. 4,500.00 for Loan Account 883921 is due on 02-11-2026. Keep sufficient balance.',
      date: new Date('2026-10-28').getTime(),
    };

    const bill = BillExtractor.extractBill(msg);
    expect(bill).not.toBeNull();
    expect(bill?.billerName).toBe('Bajaj Finserv EMI');
    expect(bill?.billerCategory).toBe('loan_emi');
    expect(bill?.amountDue).toBe(4500);
    expect(bill?.dueDate).toBe('2026-11-02');
  });

  it('should correctly parse Insurance Premium reminders (e.g. LIC)', () => {
    const msg: RawSmsMessage = {
      id: '8',
      address: 'VM-LICIND',
      body: 'LIC Insurance Premium of Rs 12,500 for Policy No: 49102938 is due on 20-Oct-2026. Pay online at licindia.in',
      date: new Date('2026-10-01').getTime(),
    };

    const bill = BillExtractor.extractBill(msg);
    expect(bill).not.toBeNull();
    expect(bill?.billerName).toBe('LIC Insurance');
    expect(bill?.billerCategory).toBe('insurance');
    expect(bill?.amountDue).toBe(12500);
    expect(bill?.dueDate).toBe('2026-10-20');
    expect(bill?.accountReference).toBe('49102938');
  });
});

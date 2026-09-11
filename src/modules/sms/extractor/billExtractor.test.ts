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

  it('should correctly parse Piped Gas bills (e.g. IGL Gas)', () => {
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
  });
});

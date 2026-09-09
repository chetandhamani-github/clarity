import { TransactionExtractor } from './transactionExtractor';
import type { RawSmsMessage } from '@/modules/sms/types';

describe('TransactionExtractor', () => {
  it('extracts amount, type, and accountMask accurately', () => {
    const msg: RawSmsMessage = {
      id: '1',
      address: 'VM-HDFCBK',
      body: 'Rs.500.00 debited from A/c XX1234 on 15-Jan-25 to Swiggy. Avl Bal Rs.10,250.00',
      date: 1705315200000,
    };

    const res = TransactionExtractor.extract(msg);
    expect(res).not.toBeNull();
    expect(res?.amount).toBe(500);
    expect(res?.type).toBe('DEBIT');
    expect(res?.accountMask).toBe('1234');
    expect(res?.bank).toBe('HDFC Bank');
    expect(res?.availableBalance).toBe(10250);
  });

  it('extracts comma-formatted numbers and decimals', () => {
    const msg: RawSmsMessage = {
      id: '2',
      address: 'AD-ICICIB',
      body: 'Acct XX5678 debited for INR 1,499.50 on 10-Jan-25 at Amazon India. Avl Bal INR 45,000.00',
      date: 1705315200000,
    };

    const res = TransactionExtractor.extract(msg);
    expect(res?.amount).toBe(1499.5);
    expect(res?.availableBalance).toBe(45000);
    expect(res?.accountMask).toBe('5678');
    expect(res?.bank).toBe('ICICI Bank');
  });

  it('extracts reference number (UPI Ref / UTR / RRN)', () => {
    const msg: RawSmsMessage = {
      id: '3',
      address: 'VK-SBIINB',
      body: 'A/C 9988 debited by 750.0 on 12Jan25 trf to Zomato UPI Ref No 402918273612',
      date: 1705315200000,
    };

    const res = TransactionExtractor.extract(msg);
    expect(res?.amount).toBe(750);
    expect(res?.referenceNumber).toBe('402918273612');
    expect(res?.merchant).toBe('Zomato');
  });

  it('extracts credit transactions correctly', () => {
    const msg: RawSmsMessage = {
      id: '4',
      address: 'AXISBK',
      body: 'INR 15,000.00 credited to Axis Bank A/C XX3344 on 01-Jan-25 by Infosys Ltd. Avl Bal INR 85,000.00',
      date: 1705315200000,
    };

    const res = TransactionExtractor.extract(msg);
    expect(res?.type).toBe('CREDIT');
    expect(res?.amount).toBe(15000);
    expect(res?.accountMask).toBe('3344');
    expect(res?.bank).toBe('Axis Bank');
  });

  it('handles balance-first messages, full account numbers, card use, and ordinary recipient names', () => {
    const balanceFirst: RawSmsMessage = {
      id: '5',
      address: 'AD-ICICIB',
      body: 'Avl Bal: Rs.45,000.00. INR 1,499.50 has been debited from Account 123456789012 at Amazon India.',
      date: 1705315200000,
    };
    const cardUse: RawSmsMessage = {
      id: '6',
      address: 'VM-HDFCBK',
      body: 'Your HDFC credit card ending XXXX-XXXX-XXXX-4455 was used for INR 1,250.00 at ZARA.',
      date: 1705315200000,
    };
    const recipient: RawSmsMessage = {
      id: '7',
      address: 'UNKNOWN',
      body: 'Rs.500.00 paid to Bob via UPI from A/c XX1234.',
      date: 1705315200000,
    };

    expect(TransactionExtractor.extract(balanceFirst)).toEqual(
      expect.objectContaining({ amount: 1499.5, availableBalance: 45000, accountMask: '9012', merchant: 'Amazon India' })
    );
    expect(TransactionExtractor.extract(cardUse)).toEqual(
      expect.objectContaining({ type: 'DEBIT', accountMask: '4455', merchant: 'ZARA' })
    );
    expect(TransactionExtractor.extract(recipient)).toEqual(
      expect.objectContaining({ bank: 'Other Bank', merchant: 'Bob' })
    );
  });


  it('extracts the counterparty that credited an account', () => {
    const result = TransactionExtractor.extract({
      id: '8',
      address: 'VM-HDFCBK',
      body: 'Rs.85,000.00 credited to A/c XX1234 by Infosys Ltd. Avl Bal Rs.90,000.00',
      date: 1705315200000,
    });

    expect(result).toEqual(expect.objectContaining({ merchant: 'Infosys Ltd', type: 'CREDIT' }));
  });

});

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


  it('does not treat recharge and payment sender IDs as banks', () => {
    expect(
      TransactionExtractor.resolveBank(
        'VM-AIRTEL',
        'Recharge of Rs.239.00 was successful for Airtel prepaid mobile.'
      )
    ).toBe('Other Bank');
    expect(
      TransactionExtractor.resolveBank(
        'VK-PAYTM',
        'Payment of Rs.299.00 was successful for mobile recharge.'
      )
    ).toBe('Other Bank');
    expect(
      TransactionExtractor.resolveBank(
        'VK-PAYTM',
        'Your Paytm Payments Bank account has been credited.'
      )
    ).toBe('Paytm Payments Bank');
  });

  it('resolves bank names across various Indian bank DLT senders and headers', () => {
    expect(TransactionExtractor.resolveBank('VK-SBINB', 'A/C 1234 debited')).toBe('State Bank of India');
    expect(TransactionExtractor.resolveBank('JD-SBICRD', 'Card ending 4567 spent')).toBe('State Bank of India');
    expect(TransactionExtractor.resolveBank('AD-ICICIT', 'Acct 8910 debited')).toBe('ICICI Bank');
    expect(TransactionExtractor.resolveBank('VK-AXISMB', 'A/c 1122 debited')).toBe('Axis Bank');
    expect(TransactionExtractor.resolveBank('AD-KOTAKM', 'A/c 3344 debited')).toBe('Kotak Mahindra Bank');
    expect(TransactionExtractor.resolveBank('AD-IDFCCC', 'Card 5566 used')).toBe('IDFC FIRST Bank');
    expect(TransactionExtractor.resolveBank('VM-CANSMS', 'Canara A/c 7788 debited')).toBe('Canara Bank');
    expect(TransactionExtractor.resolveBank('BW-BOBTXN', 'A/c 9900 debited')).toBe('Bank of Baroda');
    expect(TransactionExtractor.resolveBank('VM-PNBNET', 'A/c 1212 debited')).toBe('Punjab National Bank');
    expect(TransactionExtractor.resolveBank('AD-FEDBNK', 'A/c 3434 debited')).toBe('Federal Bank');
    expect(TransactionExtractor.resolveBank('AD-INDUSM', 'A/c 5656 debited')).toBe('IndusInd Bank');
    expect(TransactionExtractor.resolveBank('AD-UBISMS', 'A/c 7878 debited')).toBe('Union Bank of India');
  });

  it('extracts account masks from diverse formatting patterns', () => {
    expect(TransactionExtractor.extractAccountMask('debited from A/c...1234')).toBe('1234');
    expect(TransactionExtractor.extractAccountMask('spent on card ending 5678')).toBe('5678');
    expect(TransactionExtractor.extractAccountMask('debited from SBI a/c **9012 on 10-Jan')).toBe('9012');
    expect(TransactionExtractor.extractAccountMask('transferred to A/C-3456')).toBe('3456');
    expect(TransactionExtractor.extractAccountMask('Card: XX7890 used for')).toBe('7890');
  });

  it('correctly extracts transaction amount and ignores card limits for credit card SMS', () => {
    const sbiCardMsg: RawSmsMessage = {
      id: 'cc-1',
      address: 'JD-SBICRD',
      body: 'Rs. 2,499.00 spent on your SBI Credit Card ending 5678 at ZOMATO on 10Sep26. Avl Lmt: Rs. 40,000.00, Total Lmt: Rs. 1,00,000.00',
      date: 1705315200000,
    };
    const res1 = TransactionExtractor.extract(sbiCardMsg);
    expect(res1?.amount).toBe(2499);
    expect(res1?.availableBalance).toBeUndefined();
    expect(res1?.accountMask).toBe('5678');
    expect(res1?.merchant).toBe('ZOMATO');
    expect(res1?.type).toBe('DEBIT');

    const hdfcCardMsg: RawSmsMessage = {
      id: 'cc-2',
      address: 'VM-HDFCBK',
      body: "Alert: You've spent INR 1,250.00 on your HDFC Bank Credit Card ending 1234 at SWIGGY on 10-SEP-26. Bal: INR 45,000.00, Limit: INR 1,00,000.00",
      date: 1705315200000,
    };
    const res2 = TransactionExtractor.extract(hdfcCardMsg);
    expect(res2?.amount).toBe(1250);
    expect(res2?.availableBalance).toBeUndefined();
    expect(res2?.accountMask).toBe('1234');
    expect(res2?.merchant).toBe('SWIGGY');

    const iciciCardMsg: RawSmsMessage = {
      id: 'cc-3',
      address: 'AD-ICICIB',
      body: 'Your ICICI Bank Credit Card XX4321 has been used for a transaction of INR 3,450.00 on 10-Sep-26 at Flipkart. Avail Limit: INR 80,000.00, Total Due: INR 5,000.00',
      date: 1705315200000,
    };
    const res3 = TransactionExtractor.extract(iciciCardMsg);
    expect(res3?.amount).toBe(3450);
    expect(res3?.availableBalance).toBeUndefined();
    expect(res3?.accountMask).toBe('4321');
    expect(res3?.merchant).toBe('Flipkart');

    const axisCardMsg: RawSmsMessage = {
      id: 'cc-4',
      address: 'VK-AXISBK',
      body: 'Transaction alert! INR 1,890.00 spent on Axis Bank Credit Card no. XX8899 on 10-Sep-26 14:30:15 at BOOKMYSHOW. Avail Limit: INR 65,000.00.',
      date: 1705315200000,
    };
    const res4 = TransactionExtractor.extract(axisCardMsg);
    expect(res4?.amount).toBe(1890);
    expect(res4?.availableBalance).toBeUndefined();
    expect(res4?.accountMask).toBe('8899');
    expect(res4?.merchant).toBe('BOOKMYSHOW');

    const kotakCardMsg: RawSmsMessage = {
      id: 'cc-5',
      address: 'AD-KOTAKB',
      body: 'Kotak Card 4455: Spent Rs.1,200.00 at Zomato on 10-Sep-26. Bal Limit Rs.48,800.00.',
      date: 1705315200000,
    };
    const res5 = TransactionExtractor.extract(kotakCardMsg);
    expect(res5?.amount).toBe(1200);
    expect(res5?.availableBalance).toBeUndefined();
    expect(res5?.accountMask).toBe('4455');
    expect(res5?.merchant).toBe('Zomato');

    const oneCardMsg: RawSmsMessage = {
      id: 'cc-6',
      address: 'ONECRD',
      body: 'You have spent Rs. 899.00 on your OneCard ending in 1234 at Swiggy. Available limit is Rs. 45,550.00.',
      date: 1705315200000,
    };
    const res6 = TransactionExtractor.extract(oneCardMsg);
    expect(res6?.amount).toBe(899);
    expect(res6?.availableBalance).toBeUndefined();
    expect(res6?.accountMask).toBe('1234');
    expect(res6?.merchant).toBe('Swiggy');

    const swipedMsg: RawSmsMessage = {
      id: 'cc-7',
      address: 'JD-SBICRD',
      body: "Dear Cardholder, card ending 4321 was swiped at MCDONALD'S on 10-09-2026 for Rs. 540.00. Avl Limit: Rs. 24,000.00",
      date: 1705315200000,
    };
    const res7 = TransactionExtractor.extract(swipedMsg);
    expect(res7?.amount).toBe(540);
    expect(res7?.availableBalance).toBeUndefined();
    expect(res7?.accountMask).toBe('4321');
    expect(res7?.merchant).toBe("MCDONALD'S");

    const paymentReceivedMsg: RawSmsMessage = {
      id: 'cc-8',
      address: 'JD-SBICRD',
      body: 'Dear Cardholder, payment of Rs. 5,000.00 is credited to your SBI Card ending 1234 on 10-Sep-26. Total Outstanding: Rs. 12,000.00, Avl Lmt: Rs. 38,000.00.',
      date: 1705315200000,
    };
    const res8 = TransactionExtractor.extract(paymentReceivedMsg);
    expect(res8?.amount).toBe(5000);
    expect(res8?.availableBalance).toBeUndefined();
    expect(res8?.accountMask).toBe('1234');
    expect(res8?.type).toBe('CREDIT');

    const indusIndCardMsg: RawSmsMessage = {
      id: 'cc-9',
      address: 'AD-INDUSB',
      body: 'Thank you for using IndusInd Bank Credit Card ending 9876 for INR 3,450.00 at ZARA on 10-09-2026. Available Credit Limit: INR 96,550.00, Total Credit Limit: INR 1,00,000.00.',
      date: 1705315200000,
    };
    const res9 = TransactionExtractor.extract(indusIndCardMsg);
    expect(res9?.amount).toBe(3450);
    expect(res9?.availableBalance).toBeUndefined();
    expect(res9?.accountMask).toBe('9876');
    expect(res9?.merchant).toBe('ZARA');

    const scapiaMsg: RawSmsMessage = {
      id: 'cc-10',
      address: 'AD-FEDBNK',
      body: 'You have spent Rs. 850.00 on your Federal Bank Scapia Credit Card ending 1122 at STARBUCKS. Available Limit: Rs. 49,150.00.',
      date: 1705315200000,
    };
    const res10 = TransactionExtractor.extract(scapiaMsg);
    expect(res10?.amount).toBe(850);
    expect(res10?.availableBalance).toBeUndefined();
    expect(res10?.accountMask).toBe('1122');
    expect(res10?.merchant).toBe('STARBUCKS');

    const colonAmtMsg: RawSmsMessage = {
      id: 'cc-11',
      address: 'BW-BOBTXN',
      body: 'BOBCARD: Amt: INR 2,450.00 spent on Card ending 1234 at NYKAA on 10-Sep-26. Avl Limit: INR 45,000.00',
      date: 1705315200000,
    };
    const res11 = TransactionExtractor.extract(colonAmtMsg);
    expect(res11?.amount).toBe(2450);
    expect(res11?.availableBalance).toBeUndefined();
    expect(res11?.accountMask).toBe('1234');
    expect(res11?.merchant).toBe('NYKAA');
  });
});

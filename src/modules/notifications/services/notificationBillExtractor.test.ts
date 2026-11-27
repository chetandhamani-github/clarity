import type { RawNotificationPayload } from '../types';
import { NotificationBillExtractor } from './notificationBillExtractor';

const REF_TIME = new Date(2026, 10, 20, 10, 0, 0).getTime(); // 2026-11-20 local

describe('NotificationBillExtractor', () => {
  it('ignores OTPs, promos, failed notifications, and already-paid utility receipts', () => {
    const noiseCases: RawNotificationPayload[] = [
      {
        id: 'n1',
        packageName: 'com.snapwork.hdfc',
        appName: 'HDFC Bank',
        title: 'OTP',
        text: 'Your OTP is 492811 for credit card bill payment of Rs. 15,000',
        postTime: REF_TIME,
      },
      {
        id: 'n2',
        packageName: 'net.one97.paytm',
        appName: 'Paytm',
        title: 'Win Cashback',
        text: 'Pay electricity bill of Rs. 500 or more and win up to Rs. 100 cashback before 28 Nov',
        postTime: REF_TIME,
      },
      {
        id: 'n3',
        packageName: 'com.phonepe.app',
        appName: 'PhonePe',
        title: 'Electricity Bill Paid',
        text: 'Payment of ₹1,420 to Adani Electricity successful on 20-Nov-26',
        postTime: REF_TIME,
      },
      {
        id: 'n4',
        packageName: 'com.snapwork.hdfc',
        appName: 'HDFC Bank',
        title: 'Account Debited',
        text: 'Rs.649.00 debited from A/c XX1234 on 20-Nov-26 for Netflix mandate',
        postTime: REF_TIME,
      },
      {
        id: 'n5',
        packageName: 'com.google.android.apps.nbu.paisa.user',
        appName: 'Google Pay',
        title: 'Rahul Sharma',
        text: 'Has requested ₹1,200 on Google Pay due today',
        postTime: REF_TIME,
      },
      {
        id: 'n6',
        packageName: 'com.csam.icici.bank.imobile',
        appName: 'iMobile Pay',
        title: 'FASTag Alert',
        text: 'Low balance alert for your ICICI FASTag: Avl Bal Rs. 120.00',
        postTime: REF_TIME,
      },
      {
        id: 'n7',
        packageName: 'com.phonepe.app',
        appName: 'PhonePe',
        title: 'Adani Electricity',
        text: 'Adani Electricity bill of ₹1,420 paid via PhonePe before due date 28-Nov-26',
        postTime: REF_TIME,
      },
    ];

    for (const notif of noiseCases) {
      expect(NotificationBillExtractor.extractBill(notif)).toBeNull();
    }
  });

  it('extracts credit card statement notifications using bank app context and avoids credit limit', () => {
    const bill = NotificationBillExtractor.extractBill({
      id: 'cc1',
      packageName: 'com.snapwork.hdfc',
      appName: 'HDFC Bank',
      title: 'Credit Card Statement Generated',
      text: 'Card ending 4521. Credit Limit Rs 2,50,000. Total Amt Due Rs 18,450.50, Min Amt Due Rs 925.00 due by 05 Dec 2026. Please ignore if already paid.',
      postTime: REF_TIME,
    });

    expect(bill).not.toBeNull();
    expect(bill?.billerName).toBe('HDFC Bank Credit Card');
    expect(bill?.billerCategory).toBe('credit_card');
    expect(bill?.amountDue).toBe(18450.5);
    expect(bill?.minAmountDue).toBe(925);
    expect(bill?.dueDate).toBe('2026-12-05');
    expect(bill?.accountReference).toBe('4521');
    expect(bill?.frequency).toBe('monthly');
  });

  it('extracts electricity discom bills with ISO due date and prefers due date over statement date', () => {
    const isoBill = NotificationBillExtractor.extractBill({
      id: 'el1',
      packageName: 'com.dreamplug.androidapp',
      appName: 'CRED',
      title: 'Bill Due: Electricity Bill of ₹1,420',
      text: 'Your Adani Electricity bill (Consumer No: 102938475) is due on 2026-11-28.',
      postTime: REF_TIME,
    });

    expect(isoBill).toMatchObject({
      billerName: 'Adani Electricity',
      billerCategory: 'electricity',
      amountDue: 1420,
      dueDate: '2026-11-28',
      accountReference: '102938475',
    });

    const generatedWithLastDate = NotificationBillExtractor.extractBill({
      id: 'el1b',
      packageName: 'com.phonepe.app',
      appName: 'PhonePe',
      title: 'Adani Electricity',
      text: 'Bill of ₹1,420 generated. Last date 28-Nov-26.',
      postTime: REF_TIME,
    });
    expect(generatedWithLastDate).toMatchObject({
      billerName: 'Adani Electricity',
      billerCategory: 'electricity',
      amountDue: 1420,
      dueDate: '2026-11-28',
    });

    const priorityBill = NotificationBillExtractor.extractBill({
      id: 'el2',
      packageName: 'com.phonepe.app',
      appName: 'PhonePe',
      title: 'BESCOM Bill Alert',
      text: 'Statement generated on 01 Nov 2026 for BESCOM Total Amt Due Rs. 2,340. Pay by 29-11-2026.',
      postTime: REF_TIME,
    });

    expect(priorityBill).toMatchObject({
      billerName: 'BESCOM Electricity',
      billerCategory: 'electricity',
      amountDue: 2340,
      dueDate: '2026-11-29',
    });
  });

  it('handles relative due dates (due today, due tomorrow, expires in N days) and day-of-month', () => {
    const dueToday = NotificationBillExtractor.extractBill({
      id: 'rel1',
      packageName: 'com.myairtelapp',
      appName: 'Airtel',
      title: 'Broadband Bill Reminder',
      text: 'Your Airtel Xstream Fiber bill of ₹999 is due today.',
      postTime: REF_TIME,
    });
    expect(dueToday).toMatchObject({
      billerName: 'Airtel Xstream Fiber',
      billerCategory: 'broadband',
      amountDue: 999,
      dueDate: '2026-11-20',
    });

    const packExpiring = NotificationBillExtractor.extractBill({
      id: 'rel2',
      packageName: 'com.google.android.apps.nbu.paisa.user',
      appName: 'Google Pay',
      title: 'Jio Pack Expiring',
      text: 'Your Jio prepaid plan ₹749 expires in 3 days.',
      postTime: REF_TIME,
    });
    expect(packExpiring).toMatchObject({
      billerName: 'Jio',
      billerCategory: 'mobile_postpaid',
      amountDue: 749,
      dueDate: '2026-11-23',
      frequency: 'one_time',
      isRecurring: false,
    });

    const dayOnly = NotificationBillExtractor.extractBill({
      id: 'rel3',
      packageName: 'com.phonepe.app',
      appName: 'PhonePe',
      title: 'House Rent',
      text: 'Monthly rent of ₹22,000 due on 5th.',
      postTime: REF_TIME,
    });
    expect(dayOnly).toMatchObject({
      billerName: 'House Rent',
      billerCategory: 'rent',
      amountDue: 22000,
      dueDate: '2026-12-05',
    });
  });

  it('captures future pre-debit e-mandates and OTT subscriptions as bills', () => {
    const mandate = NotificationBillExtractor.extractBill({
      id: 'm1',
      packageName: 'com.snapwork.hdfc',
      appName: 'HDFC Bank',
      title: 'Pre-debit Notification',
      text: 'Rs.649.00 will be debited from A/c XX1234 on 28-Nov-26 for Netflix mandate.',
      postTime: REF_TIME,
    });

    expect(mandate).toMatchObject({
      billerName: 'Netflix',
      billerCategory: 'subscription',
      amountDue: 649,
      dueDate: '2026-11-28',
      accountReference: 'XX1234',
      frequency: 'monthly',
    });

    const yearlyPrime = NotificationBillExtractor.extractBill({
      id: 'm2',
      packageName: 'com.icicibank.pockets',
      appName: 'ICICI',
      title: 'Upcoming AutoPay Mandate',
      text: 'Upcoming AutoPay of ₹1,499 scheduled for Amazon Prime yearly renewal on 02 Dec 2026.',
      postTime: REF_TIME,
    });

    expect(yearlyPrime).toMatchObject({
      billerName: 'Amazon Prime',
      billerCategory: 'subscription',
      amountDue: 1499,
      dueDate: '2026-12-02',
      frequency: 'yearly',
    });
  });

  it('covers piped gas, water, DTH, loan EMI, insurance, maintenance, tuition, and dynamic utilities', () => {
    const gas = NotificationBillExtractor.extractBill({
      id: 'u1',
      packageName: 'net.one97.paytm',
      appName: 'Paytm',
      title: 'IGL Piped Gas Bill',
      text: 'Your IGL bill of Rs. 850 is due by 30-11-2026. Pay at https://paytm.com/gas',
      postTime: REF_TIME,
    });
    expect(gas).toMatchObject({
      billerName: 'IGL Piped Gas',
      billerCategory: 'gas',
      amountDue: 850,
      dueDate: '2026-11-30',
      paymentUrl: 'https://paytm.com/gas',
    });

    const water = NotificationBillExtractor.extractBill({
      id: 'u2',
      packageName: 'com.google.android.apps.nbu.paisa.user',
      appName: 'Google Pay',
      title: 'BWSSB Water Bill',
      text: 'Amount due Rs. 420 payable by 03-Dec-2026.',
      postTime: REF_TIME,
    });
    expect(water).toMatchObject({
      billerName: 'BWSSB Water',
      billerCategory: 'water',
      amountDue: 420,
      dueDate: '2026-12-03',
    });

    const dth = NotificationBillExtractor.extractBill({
      id: 'u3',
      packageName: 'com.phonepe.app',
      appName: 'PhonePe',
      title: 'Tata Play Recharge',
      text: 'Your Tata Play DTH pack of ₹350 expires tomorrow. Subscriber ID: 1092837465.',
      postTime: REF_TIME,
    });
    expect(dth).toMatchObject({
      billerName: 'Tata Play DTH',
      billerCategory: 'dth',
      amountDue: 350,
      dueDate: '2026-11-21',
      accountReference: '1092837465',
    });

    const emi = NotificationBillExtractor.extractBill({
      id: 'u4',
      packageName: 'com.axis.mobile',
      appName: 'Axis Mobile',
      title: 'EMI Reminder',
      text: 'Your Home Loan EMI of Rs. 32,450 is due on 05-12-2026.',
      postTime: REF_TIME,
    });
    expect(emi).toMatchObject({
      billerName: 'Axis Bank Loan EMI',
      billerCategory: 'loan_emi',
      amountDue: 32450,
      dueDate: '2026-12-05',
    });

    const insurance = NotificationBillExtractor.extractBill({
      id: 'u5',
      packageName: 'com.dreamplug.androidapp',
      appName: 'CRED',
      title: 'Insurance Policy Renewal',
      text: 'Your HDFC Life policy renewal premium due Rs. 14,500 on 10 Dec 2026. Policy No: POL889911.',
      postTime: REF_TIME,
    });
    expect(insurance).toMatchObject({
      billerName: 'HDFC Insurance',
      billerCategory: 'insurance',
      amountDue: 14500,
      dueDate: '2026-12-10',
      accountReference: 'POL889911',
      frequency: 'yearly',
    });

    const society = NotificationBillExtractor.extractBill({
      id: 'u6',
      packageName: 'com.phonepe.app',
      appName: 'PhonePe',
      title: 'MyGate Maintenance',
      text: 'Society maintenance charges of ₹4,500 due on 01 Dec 2026.',
      postTime: REF_TIME,
    });
    expect(society).toMatchObject({
      billerName: 'MyGate Maintenance',
      billerCategory: 'maintenance',
      amountDue: 4500,
      dueDate: '2026-12-01',
    });

    const dynamicDiscom = NotificationBillExtractor.extractBill({
      id: 'u7',
      packageName: 'com.google.android.apps.nbu.paisa.user',
      appName: 'Google Pay',
      title: 'Bill Due',
      text: 'Your PowerGrid Discom electricity bill of ₹1,890 is due on 04 Dec 2026.',
      postTime: REF_TIME,
    });
    expect(dynamicDiscom).toMatchObject({
      billerName: 'PowerGrid Discom',
      billerCategory: 'electricity',
      amountDue: 1890,
      dueDate: '2026-12-04',
    });
    expect(dynamicDiscom?.billerName).not.toBe('Google Pay');
  });

  it('guards against matching English modal "may" as May month', () => {
    const planAlert = NotificationBillExtractor.extractBill({
      id: 'may1',
      packageName: 'com.phonepe.app',
      appName: 'PhonePe',
      title: 'BESCOM Electricity',
      text: 'Your BESCOM electricity bill of ₹1,100 has been generated. Late fee 15 may apply. Due on 27 Nov 2026.',
      postTime: REF_TIME,
    });
    expect(planAlert?.dueDate).toBe('2026-11-27');
  });
});


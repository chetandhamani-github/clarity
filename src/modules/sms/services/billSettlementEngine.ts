import { DeviceEventEmitter } from 'react-native';
import { findMatchingUnpaidBill, markBillAsPaid } from '@/services/database/bill-dao';
import { BillService } from '@/modules/bills/services/BillService';
import { insertNotification } from '@/services/database/notification-dao';
import { formatCurrency } from '@/utils/format';
import type { Transaction, BillReminder } from '@/types';

export class BillSettlementEngine {
  /**
   * Settle any matching unpaid bill reminder when an expense transaction occurs.
   */
  public static async settleBillsForTransaction(
    transaction: Pick<Transaction, 'id' | 'merchant' | 'amount' | 'type' | 'date' | 'category'>
  ): Promise<{ settled: boolean; bill?: BillReminder; nextBill?: BillReminder }> {
    // Only expense transactions (or credit card payments) can settle bills
    if (transaction.type !== 'expense') {
      return { settled: false };
    }

    try {
      let modernSettled = false;
      let modernBillerName = '';

      // 1. Settle in modern Bills module (displayed in UI)
      try {
        const modernMatched = await BillService.matchTransactionWithUnpaidBill(
          transaction.merchant || transaction.category,
          transaction.amount,
          transaction.date
        );
        if (modernMatched) {
          await BillService.markBillPaid(
            modernMatched.id,
            transaction.date.split('T')[0],
            transaction.id
          );
          modernSettled = true;
          modernBillerName = modernMatched.provider || modernMatched.title;
        }
      } catch {
        // Fallback or ignore error
      }

      // 2. Settle in legacy bill-dao
      let legacyUpdatedBill: BillReminder | undefined;
      let legacyNextBill: BillReminder | undefined;
      let legacyBillerName = '';

      try {
        const matched = await findMatchingUnpaidBill(
          transaction.merchant || transaction.category,
          transaction.amount,
          transaction.date,
          30, // 30-day window around due date
          0.02 // 2% tolerance
        );

        if (matched) {
          const { updatedBill, nextBill } = await markBillAsPaid(
            matched.id,
            transaction.date.split('T')[0],
            transaction.id
          );
          legacyUpdatedBill = updatedBill;
          legacyNextBill = nextBill;
          legacyBillerName = matched.billerName;
        }
      } catch {
        // Ignore legacy error
      }

      if (!modernSettled && !legacyUpdatedBill) {
        return { settled: false };
      }

      const settledName = modernBillerName || legacyBillerName || 'Bill';

      // Create notification
      await insertNotification({
        title: 'Bill Paid',
        description: `Your ${settledName} bill of ${formatCurrency(transaction.amount)} was automatically matched and marked as paid.`,
        type: 'bill',
        actionUrl: '/(app)/bills',
      });

      DeviceEventEmitter.emit('billsUpdated');
      DeviceEventEmitter.emit('notificationsUpdated');

      return {
        settled: true,
        bill: legacyUpdatedBill,
        nextBill: legacyNextBill,
      };
    } catch {
      return { settled: false };
    }
  }

  /**
   * Batch settlement for multiple transactions (e.g. during initial/incremental SMS sync).
   */
  public static async settleBatchTransactions(
    transactions: Array<Pick<Transaction, 'id' | 'merchant' | 'amount' | 'type' | 'date' | 'category'>>
  ): Promise<number> {
    let settledCount = 0;
    for (const tx of transactions) {
      const result = await this.settleBillsForTransaction(tx);
      if (result.settled) {
        settledCount++;
      }
    }
    return settledCount;
  }
}

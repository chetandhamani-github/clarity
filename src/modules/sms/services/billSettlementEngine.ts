import { DeviceEventEmitter } from 'react-native';
import { findMatchingUnpaidBill, markBillAsPaid } from '@/services/database/bill-dao';
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
      const matched = await findMatchingUnpaidBill(
        transaction.merchant || transaction.category,
        transaction.amount,
        transaction.date,
        7, // 7-day window around due date
        0.02 // 2% tolerance
      );

      if (!matched) {
        return { settled: false };
      }

      const { updatedBill, nextBill } = await markBillAsPaid(
        matched.id,
        transaction.date.split('T')[0],
        transaction.id
      );

      // Create notification
      await insertNotification({
        title: 'Bill Paid',
        description: `Your ${matched.billerName} bill of ${formatCurrency(transaction.amount)} was automatically matched and marked as paid.`,
        type: 'default',
        actionUrl: '/(app)/bills',
      });

      DeviceEventEmitter.emit('billsUpdated');
      DeviceEventEmitter.emit('notificationsUpdated');

      return {
        settled: true,
        bill: updatedBill,
        nextBill,
      };
    } catch (error) {
      console.warn('[BillSettlementEngine] Error matching bill settlement:', error);
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

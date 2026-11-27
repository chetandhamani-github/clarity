import {
  NotificationLedgerService,
  type ImportNotificationsOptions,
} from '@/modules/notifications/services/notificationLedgerService';
import { RecurringDetectionEngine } from '@/modules/sms/recurring/recurringDetectionEngine';
import { SmsDao } from '@/modules/sms/storage/smsDao';
import type { ParsedTransaction } from '@/modules/sms/types';

/**
 * Legacy compatibility facade delegating ledger sync and balance reconciliation
 * to NotificationLedgerService. SMS inbox reading has been removed for Google Play compliance.
 */
export class SmsSyncService {
  public static cancelSync(): void {
    // No background SMS inbox scan runs in notification-only mode
  }

  public static async importParsedTransactions(
    parsedTransactions: ParsedTransaction[],
    options?: ImportNotificationsOptions
  ): Promise<void> {
    return NotificationLedgerService.importParsedTransactions(parsedTransactions, options);
  }

  public static async enrichDuplicateTransaction(duplicateTx: ParsedTransaction): Promise<boolean> {
    return NotificationLedgerService.enrichDuplicateTransaction(duplicateTx);
  }

  public static async consolidateDuplicateBankAccounts(): Promise<void> {
    await NotificationLedgerService.reconcileAvailableBalances();
  }

  public static async autoRepairMisassignedAccounts(): Promise<void> {
    await NotificationLedgerService.reconcileAvailableBalances();
  }

  public static async detectRecurringTransactions() {
    const history = await SmsDao.getTransactionsForRecurringAnalysis();
    return RecurringDetectionEngine.detectRecurring(history);
  }
}

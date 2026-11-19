import { DeviceEventEmitter } from 'react-native';
import { BillExtractor } from '@/modules/sms/extractor/billExtractor';
import { SmsPipelineService } from '@/modules/sms/services/smsPipelineService';
import { SmsSyncService } from '@/modules/sms/services/smsSyncService';
import { SmsDao } from '@/modules/sms/storage/smsDao';
import { BillService } from '@/modules/bills/services/BillService';
import { BillAlertEngine } from '@/services/notifications/bill-alert-engine';
import { mergeOrInsertSmsBill } from '@/services/database/bill-dao';
import type { RawSmsMessage, ParsedTransaction } from '@/modules/sms/types';
import type { BillCategory } from '@/modules/bills/types/bill.types';
import type { RawNotificationPayload, NotificationParseResult } from '../types';

function mapToBillCategory(billerCategory: string): BillCategory {
  switch (billerCategory) {
    case 'electricity':
      return 'electricity';
    case 'water':
      return 'water';
    case 'piped_gas':
    case 'lpg_cylinder':
      return 'other';
    case 'broadband':
    case 'landline':
      return 'internet';
    case 'mobile_postpaid':
      return 'mobile';
    case 'credit_card':
      return 'credit_card';
    case 'loan_emi':
      return 'emi';
    case 'insurance':
      return 'insurance';
    case 'rent':
    case 'housing_society':
      return 'rent';
    case 'subscription':
    case 'dth':
    case 'cable_tv':
      return 'subscription';
    case 'tuition':
      return 'education';
    default:
      return 'other';
  }
}

export class NotificationParsingService {
  /**
   * Process an incoming notification payload through Clarity's intelligence engine.
   */
  public static async processNotification(
    notification: RawNotificationPayload,
    options: {
      parseTransactions?: boolean;
      parseBills?: boolean;
    } = {}
  ): Promise<NotificationParseResult> {
    const { parseTransactions = true, parseBills = true } = options;

    // Combine notification components into unified body
    const parts = [notification.title, notification.text, notification.bigText].filter(Boolean);
    const body = Array.from(new Set(parts)).join(' - ').trim();

    if (!body) {
      return { type: 'IGNORED', reason: 'EMPTY_NOTIFICATION_BODY' };
    }

    const message: RawSmsMessage = {
      id: notification.id,
      address: notification.appName || notification.packageName,
      body,
      date: notification.postTime || Date.now(),
    };

    // 1. Check for Bill / Statement Due Reminders
    if (parseBills) {
      try {
        const extractedBill = BillExtractor.extractBill(message);
        if (extractedBill) {
          const billCategory = mapToBillCategory(extractedBill.billerCategory);

          const { bill: insertedBill } = await BillService.mergeOrInsertExternalBill({
            title: extractedBill.billerName,
            provider: extractedBill.billerName,
            category: billCategory,
            amount: extractedBill.amountDue,
            minAmount: extractedBill.minAmountDue,
            dueDate: extractedBill.dueDate,
            accountReference: extractedBill.accountReference,
            paymentUrl: extractedBill.paymentUrl,
            smsId: message.id,
            source: 'sms',
            notes: `Auto-detected from ${notification.appName || 'Push Notification'}`,
          });

          await mergeOrInsertSmsBill({
            ...extractedBill,
            smsId: message.id,
          });

          if (insertedBill) {
            await BillAlertEngine.scheduleNativeBillReminder({
              id: insertedBill.id,
              billerName: insertedBill.title,
              amountDue: insertedBill.amount,
              dueDate: insertedBill.dueDate,
              status: insertedBill.status,
              reminderDaysBefore: insertedBill.reminderDays ?? 3,
            });
          }

          DeviceEventEmitter.emit('billDetected', extractedBill);
          DeviceEventEmitter.emit('notificationsUpdated');

          return { type: 'BILL', bill: extractedBill };
        }
      } catch {
        // Continue to transaction extraction if bill parsing had non-critical issue
      }
    }

    // 2. Check for Financial Debit / Credit Transaction
    if (parseTransactions) {
      try {
        const pipelineResult = await SmsPipelineService.processMessage(message, {
          checkDatabaseDuplicates: true,
        });

        if (pipelineResult.type === 'PARSED') {
          const tx = pipelineResult.transaction;

          // Save raw message & parsed record
          await SmsDao.saveSmsBatch([message]);
          await SmsDao.saveParsedTransactionsBatch([tx]);

          if (!tx.isDuplicate) {
            // Import immediately into Clarity accounts & transactions ledger
            await SmsSyncService.importParsedTransactions([tx]);
            DeviceEventEmitter.emit('transactionParsed', tx);
            DeviceEventEmitter.emit('notificationsUpdated');
          }

          return {
            type: 'TRANSACTION',
            transaction: tx,
            isDuplicate: tx.isDuplicate,
          };
        } else if (pipelineResult.type === 'REVIEW') {
          await SmsDao.saveSmsBatch([message]);
          await SmsDao.saveReviewQueueBatch([pipelineResult.reviewItem]);
          DeviceEventEmitter.emit('notificationsUpdated');
          return {
            type: 'IGNORED',
            reason: `SENT_TO_REVIEW_QUEUE: ${pipelineResult.reviewItem.reason}`,
          };
        } else {
          return {
            type: 'IGNORED',
            reason: pipelineResult.reason,
          };
        }
      } catch (err) {
        return {
          type: 'IGNORED',
          reason: err instanceof Error ? err.message : 'EXTRACTION_FAILED',
        };
      }
    }

    return { type: 'IGNORED', reason: 'PARSING_DISABLED' };
  }
}


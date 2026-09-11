import { BillsRepository } from '../database/bills.repository';
import { ReminderService } from './ReminderService';
import type {
  Bill,
  BillCategory,
  CreateBillDTO,
  UpdateBillDTO,
  CreateSubscriptionDTO,
  UpdateSubscriptionDTO,
  BillsSummary,
  Subscription,
  SubscriptionCycle,
  BillFrequency,
} from '../types/bill.types';
import { getDatabase } from '@/services/database';

export class BillService {
  /**
   * Creates a bill, schedules reminder notification, and returns created entity.
   */
  public static async createBill(dto: CreateBillDTO): Promise<Bill> {
    const bill = await BillsRepository.insertBill(dto);

    // Schedule reminders if bill is upcoming
    if (bill.status === 'upcoming') {
      await ReminderService.scheduleBillReminder(bill);
    }

    return bill;
  }

  /**
   * Updates an existing bill and updates scheduled reminder.
   */
  public static async updateBill(id: string, updates: UpdateBillDTO): Promise<void> {
    await BillsRepository.updateBill(id, updates);
    const updated = await BillsRepository.getBillById(id);
    if (updated) {
      if (updated.status === 'upcoming') {
        await ReminderService.scheduleBillReminder(updated);
      } else {
        await ReminderService.cancelBillReminder(id);
      }
    }
  }

  /**
   * Deletes a bill and cancels scheduled reminders.
   */
  public static async deleteBill(id: string): Promise<void> {
    await ReminderService.cancelBillReminder(id);
    await BillsRepository.deleteBill(id);
  }

  /**
   * Marks a bill as paid. If recurring, automatically generates the next occurrence.
   */
  public static async markBillPaid(
    id: string,
    paidDate?: string,
    paidTransactionId?: string
  ): Promise<{ updatedBill: Bill; nextBill?: Bill }> {
    const result = await BillsRepository.markBillAsPaid(id, paidDate, paidTransactionId);

    // Cancel old reminder
    await ReminderService.cancelBillReminder(id);

    // If a next recurring bill was generated, schedule reminders for it
    if (result.nextBill) {
      await ReminderService.scheduleBillReminder(result.nextBill);
    }

    return result;
  }

  // --- Subscriptions ---

  public static async createSubscription(dto: CreateSubscriptionDTO): Promise<Subscription> {
    return BillsRepository.insertSubscription(dto);
  }

  public static async updateSubscription(
    id: string,
    updates: UpdateSubscriptionDTO
  ): Promise<void> {
    return BillsRepository.updateSubscription(id, updates);
  }

  public static async deleteSubscription(id: string): Promise<void> {
    return BillsRepository.deleteSubscription(id);
  }

  public static async getSummary(month?: number, year?: number): Promise<BillsSummary> {
    return BillsRepository.getSummary(month, year);
  }

  public static calculateMonthlyNormalizedCost(amount: number, cycle: SubscriptionCycle): number {
    return BillsRepository.calculateMonthlyNormalizedCost(amount, cycle);
  }

  public static calculateNextOccurrence(currentDate: string, frequency: BillFrequency): string {
    return BillsRepository.calculateNextOccurrence(currentDate, frequency);
  }

  /**
   * Seamless integration hook for SMS / Email / BBPS automatic bill detection.
   * Handles deduplication and updates existing bills if reminder received again.
   */
  public static async mergeOrInsertExternalBill(extracted: {
    title: string;
    provider: string;
    category: BillCategory;
    amount: number;
    minAmount?: number;
    dueDate: string;
    accountReference?: string;
    paymentUrl?: string;
    smsId?: string;
    notes?: string;
    source: 'sms' | 'email' | 'future_api';
  }): Promise<{ bill: Bill; isNew: boolean }> {
    const db = getDatabase();
    await BillsRepository.ensureSchema();

    // Check for existing unpaid bill from same provider around the due date (15-day tolerance window)
    const [year, month, day] = extracted.dueDate.split('-').map(Number);
    const dueTime = new Date(year, month - 1, day).getTime();
    const minRange = new Date(dueTime - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const maxRange = new Date(dueTime + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const existing = await db.getFirstAsync<{ id: string }>(
      `SELECT id FROM bills 
       WHERE (status = 'upcoming' OR status = 'overdue')
         AND (provider LIKE ? OR title LIKE ? OR category = ?)
         AND due_date BETWEEN ? AND ?
       LIMIT 1`,
      [`%${extracted.provider}%`, `%${extracted.title}%`, extracted.category, minRange, maxRange]
    );

    if (existing) {
      await BillsRepository.updateBill(existing.id, {
        amount: extracted.amount,
        minAmount: extracted.minAmount,
        dueDate: extracted.dueDate,
        accountReference: extracted.accountReference,
        paymentUrl: extracted.paymentUrl,
        smsId: extracted.smsId,
      });

      const updated = await BillsRepository.getBillById(existing.id);
      return { bill: updated!, isNew: false };
    }

    const created = await this.createBill({
      title: extracted.title,
      provider: extracted.provider,
      category: extracted.category,
      amount: extracted.amount,
      minAmount: extracted.minAmount,
      dueDate: extracted.dueDate,
      accountReference: extracted.accountReference,
      paymentUrl: extracted.paymentUrl,
      smsId: extracted.smsId,
      source: extracted.source,
      notes: extracted.notes || `Auto-detected from ${extracted.source.toUpperCase()}`,
      status: 'upcoming',
      reminderDays: 3,
      isRecurring: true,
      frequency: 'monthly',
    });

    return { bill: created, isNew: true };
  }

  /**
   * Matches an expense transaction with unpaid bills to auto-settle them.
   */
  public static async matchTransactionWithUnpaidBill(
    merchant: string,
    amount: number,
    transactionDate: string,
    toleranceDays: number = 7,
    tolerancePct: number = 0.02
  ): Promise<Bill | null> {
    const db = getDatabase();
    await BillsRepository.ensureSchema();

    const txDate = transactionDate.split('T')[0];
    const [y, m, d] = txDate.split('-').map(Number);
    const targetTime = new Date(y, m - 1, d).getTime();

    const minDate = new Date(targetTime - toleranceDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const maxDate = new Date(targetTime + toleranceDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const rows = await db.getAllAsync<{ id: string; provider: string; title: string; amount: number; min_amount: number | null; account_reference: string | null }>(
      `SELECT id, provider, title, amount, min_amount, account_reference 
       FROM bills 
       WHERE (status = 'upcoming' OR status = 'overdue')
         AND due_date BETWEEN ? AND ?`,
      [minDate, maxDate]
    );

    const cleanMerchant = merchant.toLowerCase().trim();

    for (const r of rows) {
      const cleanProvider = (r.provider || r.title).toLowerCase().trim();
      const isNameMatch =
        cleanMerchant.includes(cleanProvider) ||
        cleanProvider.includes(cleanMerchant) ||
        (r.account_reference && cleanMerchant.includes(r.account_reference.toLowerCase()));

      if (!isNameMatch) continue;

      const matchesTotal = Math.abs(r.amount - amount) <= Math.max(1, r.amount * tolerancePct);
      const matchesMin = r.min_amount != null && Math.abs(r.min_amount - amount) <= Math.max(1, r.min_amount * tolerancePct);

      if (matchesTotal || matchesMin) {
        return BillsRepository.getBillById(r.id);
      }
    }

    return null;
  }
}

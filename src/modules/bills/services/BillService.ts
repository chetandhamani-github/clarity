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

    // 1. Direct sms_id check
    if (extracted.smsId) {
      const existingBySms = await db.getFirstAsync<{ id: string }>(
        `SELECT id FROM bills WHERE sms_id = ? LIMIT 1`,
        [extracted.smsId]
      );
      if (existingBySms) {
        const bill = await BillsRepository.getBillById(existingBySms.id);
        if (bill) return { bill, isNew: false };
      }
    }

    // 2. Fetch candidate bills within flexible billing period (±30 days around due date)
    const [year, month, day] = extracted.dueDate.split('-').map(Number);
    const dueTime = new Date(year, month - 1, day).getTime();
    const minRange = new Date(dueTime - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const maxRange = new Date(dueTime + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const candidates = await db.getAllAsync<{
      id: string;
      title: string;
      provider: string;
      category: BillCategory;
      amount: number;
      min_amount: number | null;
      due_date: string;
      status: string;
      account_reference: string | null;
      payment_url: string | null;
      sms_id: string | null;
    }>(
      `SELECT id, title, provider, category, amount, min_amount, due_date, status, account_reference, payment_url, sms_id 
       FROM bills 
       WHERE due_date BETWEEN ? AND ?`,
      [minRange, maxRange]
    );

    // Also include candidates by account reference if present
    if (extracted.accountReference && extracted.accountReference.trim()) {
      const refMatches = await db.getAllAsync<{
        id: string;
        title: string;
        provider: string;
        category: BillCategory;
        amount: number;
        min_amount: number | null;
        due_date: string;
        status: string;
        account_reference: string | null;
        payment_url: string | null;
        sms_id: string | null;
      }>(
        `SELECT id, title, provider, category, amount, min_amount, due_date, status, account_reference, payment_url, sms_id 
         FROM bills 
         WHERE account_reference IS NOT NULL AND account_reference != ''`
      );

      for (const rm of refMatches) {
        if (!candidates.some((c) => c.id === rm.id)) {
          candidates.push(rm);
        }
      }
    }

    // 3. Calculate similarity score for each candidate
    let bestCandidate: (typeof candidates)[0] | null = null;
    let highestScore = 0;

    for (const cand of candidates) {
      let score = 0;

      // 3a. Account reference matching (highest confidence)
      if (extracted.accountReference && cand.account_reference) {
        const extRef = extracted.accountReference.toLowerCase().trim();
        const candRef = cand.account_reference.toLowerCase().trim();
        const extDigits = extRef.replace(/\D/g, '');
        const candDigits = candRef.replace(/\D/g, '');

        if (extRef === candRef) {
          score += 80;
        } else if (extRef.includes(candRef) || candRef.includes(extRef)) {
          score += 70;
        } else if (extDigits.length >= 4 && candDigits.length >= 4) {
          if (extDigits.endsWith(candDigits) || candDigits.endsWith(extDigits)) {
            score += 75;
          }
        }
      }

      // 3b. Name / Provider matching (two-way normalized + token matching)
      const normExtP = (extracted.provider || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
      const normExtT = (extracted.title || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
      const normCandP = (cand.provider || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
      const normCandT = (cand.title || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();

      const extWords = new Set(
        [...normExtP.split(/\s+/), ...normExtT.split(/\s+/)].filter((w) => w.length >= 3)
      );
      const candWords = new Set(
        [...normCandP.split(/\s+/), ...normCandT.split(/\s+/)].filter((w) => w.length >= 3)
      );

      let sharedWords = 0;
      for (const w of extWords) {
        if (candWords.has(w)) sharedWords++;
      }

      const isSub =
        (normExtP && normCandP && (normExtP.includes(normCandP) || normCandP.includes(normExtP))) ||
        (normExtT && normCandT && (normExtT.includes(normCandT) || normCandT.includes(normExtT))) ||
        (normExtP && normCandT && (normExtP.includes(normCandT) || normCandT.includes(normExtP))) ||
        (normExtT && normCandP && (normExtT.includes(normCandP) || normCandP.includes(normExtT)));

      if (
        (normExtP && normCandP && normExtP === normCandP) ||
        (normExtT && normCandT && normExtT === normCandT)
      ) {
        score += 50;
      } else if (isSub) {
        score += 40;
      } else if (sharedWords > 0) {
        score += Math.min(35, sharedWords * 15);
      }

      // 3c. Category match
      if (cand.category === extracted.category) {
        score += 30;
      }

      // 3d. Amount match
      const amountDiff = Math.abs(cand.amount - extracted.amount);
      const amountDiffPct = cand.amount > 0 ? amountDiff / cand.amount : 1;
      if (amountDiff <= 1) {
        score += 40;
      } else if (amountDiffPct <= 0.05 || amountDiff <= 10) {
        score += 25;
      } else if (
        extracted.minAmount &&
        cand.min_amount &&
        Math.abs(extracted.minAmount - cand.min_amount) <= 1
      ) {
        score += 20;
      }

      // 3e. Due date proximity
      const [cYear, cMonth, cDay] = cand.due_date.split('-').map(Number);
      const dayDiff = Math.abs(
        Math.round((new Date(cYear, cMonth - 1, cDay).getTime() - dueTime) / (1000 * 60 * 60 * 24))
      );

      if (dayDiff === 0) {
        score += 25;
      } else if (dayDiff <= 5) {
        score += 20;
      } else if (dayDiff <= 15) {
        score += 10;
      } else if (dayDiff <= 25) {
        score += 5;
      }

      if (score > highestScore) {
        highestScore = score;
        bestCandidate = cand;
      }
    }

    // 4. If high-confidence match found, update existing bill
    if (bestCandidate && highestScore >= 50) {
      if (bestCandidate.status === 'paid') {
        // Keep it paid, update missing metadata
        await BillsRepository.updateBill(bestCandidate.id, {
          accountReference: extracted.accountReference || bestCandidate.account_reference || undefined,
          paymentUrl: extracted.paymentUrl || bestCandidate.payment_url || undefined,
          smsId: extracted.smsId || bestCandidate.sms_id || undefined,
        });
        const updated = await BillsRepository.getBillById(bestCandidate.id);
        return { bill: updated!, isNew: false };
      }

      // Update upcoming or overdue bill
      await BillsRepository.updateBill(bestCandidate.id, {
        provider:
          bestCandidate.provider && bestCandidate.provider !== bestCandidate.title
            ? bestCandidate.provider
            : extracted.provider,
        amount: extracted.amount,
        minAmount:
          extracted.minAmount !== undefined ? extracted.minAmount : bestCandidate.min_amount ?? undefined,
        dueDate: extracted.dueDate,
        accountReference: extracted.accountReference || bestCandidate.account_reference || undefined,
        paymentUrl: extracted.paymentUrl || bestCandidate.payment_url || undefined,
        smsId: extracted.smsId || bestCandidate.sms_id || undefined,
      });

      const updated = await BillsRepository.getBillById(bestCandidate.id);
      return { bill: updated!, isNew: false };
    }

    // 5. If brand new bill, check if an existing expense transaction already paid it
    const matchedPayment = await db.getFirstAsync<{ id: string; date: string }>(
      `SELECT id, date FROM transactions 
       WHERE (merchant LIKE ? OR category LIKE ? OR ? LIKE '%' || merchant || '%') 
         AND ABS(amount - ?) <= ? 
         AND type = 'expense'
         AND date BETWEEN ? AND ?
       LIMIT 1`,
      [
        `%${extracted.provider}%`,
        `%${extracted.category}%`,
        extracted.provider,
        extracted.amount,
        Math.max(2, extracted.amount * 0.03),
        minRange,
        maxRange,
      ]
    );

    const now = new Date();
    const todayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const diffDays = Math.round((dueTime - todayTime) / (1000 * 60 * 60 * 24));

    const initialStatus = matchedPayment
      ? 'paid'
      : diffDays < -30
        ? 'paid'
        : diffDays < 0
          ? 'overdue'
          : 'upcoming';

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
      status: initialStatus,
      paidDate: matchedPayment ? matchedPayment.date.split('T')[0] : undefined,
      paidTransactionId: matchedPayment ? matchedPayment.id : undefined,
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

import { BillsRepository } from '@/modules/bills/database/bills.repository';
import { getAllAccounts } from '@/services/database/account-dao';
import { getGoals } from '@/services/database/goal-dao';
import { formatLocalDateYmd, getLocalTodayYmd, shiftYmdDays } from '@/utils/date';
import { formatCurrency } from '@/utils/format';
import { RemindersRepository } from '../database/reminders.repository';
import type {
  CreateReminderDTO,
  Reminder,
  UnifiedReminderItem,
  UpdateReminderDTO,
} from '../types/reminder.types';
import { ReminderScheduler, parseTimeHm } from './ReminderScheduler';

function formatHmLabel(raw: string): string {
  const { hour, minute } = parseTimeHm(raw, 9, 0);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function resolveLinkedActionUrl(
  linkedType?: Reminder['linkedType'],
  linkedId?: string
): string {
  if (!linkedType || !linkedId) return '/(app)/reminders';
  switch (linkedType) {
    case 'bill':
      return `/(app)/bill-details?billId=${linkedId}`;
    case 'subscription':
      return '/(app)/bills';
    case 'account':
      return `/(app)/account-details?accountId=${linkedId}`;
    case 'goal':
      return `/(app)/goal-details?id=${linkedId}`;
    case 'splitwise_person':
      return `/(app)/splitwise-person-details?personId=${linkedId}`;
    default:
      return '/(app)/reminders';
  }
}

function getNextCreditCardDueYmd(dueDay: number, today = new Date()): string {
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const curMonthMax = new Date(startOfToday.getFullYear(), startOfToday.getMonth() + 1, 0).getDate();
  let candidate = new Date(
    startOfToday.getFullYear(),
    startOfToday.getMonth(),
    Math.min(Math.max(1, dueDay), curMonthMax)
  );
  if (candidate < startOfToday) {
    const nextMonthMax = new Date(
      startOfToday.getFullYear(),
      startOfToday.getMonth() + 2,
      0
    ).getDate();
    candidate = new Date(
      startOfToday.getFullYear(),
      startOfToday.getMonth() + 1,
      Math.min(Math.max(1, dueDay), nextMonthMax)
    );
  }
  return formatLocalDateYmd(candidate);
}

export class RemindersService {
  public static async createReminder(dto: CreateReminderDTO): Promise<Reminder> {
    const created = await RemindersRepository.insertReminder(dto);
    await ReminderScheduler.scheduleReminder(created).catch(() => {});
    return created;
  }

  public static async updateReminder(
    id: string,
    updates: UpdateReminderDTO
  ): Promise<Reminder | null> {
    const updated = await RemindersRepository.updateReminder(id, updates);
    if (updated) {
      if (updated.status === 'completed' || updated.status === 'dismissed') {
        await ReminderScheduler.cancelReminder(id).catch(() => {});
      } else {
        await ReminderScheduler.scheduleReminder(updated).catch(() => {});
      }
    }
    return updated;
  }

  public static async deleteReminder(id: string): Promise<void> {
    await ReminderScheduler.cancelReminder(id).catch(() => {});
    await RemindersRepository.deleteReminder(id);
  }

  public static async completeReminder(
    id: string
  ): Promise<{ completed: Reminder; nextReminder?: Reminder }> {
    const result = await RemindersRepository.markReminderCompleted(id);
    await ReminderScheduler.cancelReminder(id).catch(() => {});
    if (result.nextReminder) {
      await ReminderScheduler.scheduleReminder(result.nextReminder).catch(() => {});
    }
    return result;
  }

  public static async snoozeReminder(id: string, hours: number = 24): Promise<Reminder | null> {
    const snoozeUntil = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    const updated = await RemindersRepository.snoozeReminder(id, snoozeUntil);
    if (updated) {
      await ReminderScheduler.scheduleReminder(updated).catch(() => {});
    }
    return updated;
  }

  public static async dismissReminder(id: string): Promise<Reminder | null> {
    await ReminderScheduler.cancelReminder(id).catch(() => {});
    return RemindersRepository.updateReminder(id, {
      status: 'dismissed',
      snoozeUntil: null,
    });
  }

  /**
   * Builds a unified read-through timeline combining custom reminders with upcoming
   * bills, active subscriptions, credit card due dates, and goal deadlines without duplicating rows.
   */
  public static async getUnifiedFeed(
    daysAhead: number = 45,
    defaultTime: string = '09:00'
  ): Promise<{
    customReminders: Reminder[];
    unifiedUpcoming: UnifiedReminderItem[];
    completedReminders: Reminder[];
  }> {
    const todayStr = getLocalTodayYmd();
    const maxDateStr = shiftYmdDays(todayStr, daysAhead);
    const formattedDefaultTime = formatHmLabel(defaultTime);

    const [allCustom, upcomingBills, allSubs, accounts, goals] = await Promise.all([
      RemindersRepository.getAllReminders(),
      BillsRepository.getUpcomingBills(daysAhead).catch(() => []),
      BillsRepository.getAllSubscriptions().catch(() => []),
      getAllAccounts().catch(() => []),
      getGoals().catch(() => []),
    ]);

    const completedReminders = allCustom
      .filter((r) => r.status === 'completed' || r.status === 'dismissed')
      .sort((a, b) => (b.completedAt || b.updatedAt).localeCompare(a.completedAt || a.updatedAt));

    const activeCustom = allCustom.filter(
      (r) => r.status === 'pending' || r.status === 'snoozed'
    );

    const unifiedUpcoming: UnifiedReminderItem[] = [];

    for (const r of activeCustom) {
      const isSnoozed = r.status === 'snoozed' && Boolean(r.snoozeUntil);
      const isOverdue = !isSnoozed && r.remindAtDate < todayStr;
      unifiedUpcoming.push({
        id: `custom:${r.id}`,
        sourceKind: 'custom',
        sourceId: r.id,
        title: r.title,
        subtitle: r.notes || 'Personal finance reminder',
        category: r.category,
        amount: r.amount,
        dueDate: r.remindAtDate,
        remindTime: r.remindAtTime,
        isOverdue,
        isSnoozed,
        snoozeUntil: r.snoozeUntil,
        repeatRule: r.repeatRule,
        status: isOverdue ? 'overdue' : isSnoozed ? 'snoozed' : 'pending',
        actionUrl: resolveLinkedActionUrl(r.linkedType, r.linkedId),
        linkedType: r.linkedType,
        linkedId: r.linkedId,
        notes: r.notes,
      });
    }

    for (const bill of upcomingBills) {
      if (bill.status === 'paid' || bill.status === 'dismissed') continue;
      const isOverdue = bill.status === 'overdue' || bill.dueDate < todayStr;
      unifiedUpcoming.push({
        id: `bill:${bill.id}`,
        sourceKind: 'bill',
        sourceId: bill.id,
        title: bill.provider || bill.title,
        subtitle: `Bill due ${bill.dueDate}`,
        category: bill.category,
        amount: bill.amount,
        dueDate: bill.dueDate,
        remindTime: formattedDefaultTime,
        isOverdue,
        isSnoozed: false,
        repeatRule: bill.frequency === 'one_time' ? 'none' : bill.frequency,
        status: isOverdue ? 'overdue' : 'pending',
        actionUrl: `/(app)/bill-details?billId=${bill.id}`,
        notes: bill.notes,
      });
    }

    for (const sub of allSubs) {
      if (sub.status !== 'active') continue;
      if (!sub.nextRenewalDate || sub.nextRenewalDate < todayStr || sub.nextRenewalDate > maxDateStr) {
        continue;
      }
      unifiedUpcoming.push({
        id: `subscription:${sub.id}`,
        sourceKind: 'subscription',
        sourceId: sub.id,
        title: sub.name,
        subtitle: `Subscription renewal (${sub.billingCycle})`,
        category: sub.category,
        amount: sub.amount,
        dueDate: sub.nextRenewalDate,
        remindTime: formattedDefaultTime,
        isOverdue: false,
        isSnoozed: false,
        repeatRule: sub.billingCycle,
        status: 'pending',
        actionUrl: '/(app)/bills',
        notes: sub.notes,
      });
    }

    for (const acc of accounts) {
      if (acc.type !== 'credit' || !acc.dueDay || acc.balance >= 0) continue;
      const dueYmd = getNextCreditCardDueYmd(acc.dueDay);
      if (dueYmd > maxDateStr) continue;
      unifiedUpcoming.push({
        id: `credit_card:${acc.id}`,
        sourceKind: 'credit_card',
        sourceId: acc.id,
        title: `${acc.name} Payment`,
        subtitle: `Card payment due (${formatCurrency(Math.abs(acc.balance))})`,
        category: 'credit_card',
        amount: Math.abs(acc.balance),
        dueDate: dueYmd,
        remindTime: formattedDefaultTime,
        isOverdue: false,
        isSnoozed: false,
        repeatRule: 'monthly',
        status: 'pending',
        actionUrl: `/(app)/account-details?accountId=${acc.id}`,
      });
    }

    for (const goal of goals) {
      if (
        !goal.targetDate ||
        goal.currentAmount >= goal.targetAmount ||
        goal.targetDate < todayStr ||
        goal.targetDate > maxDateStr
      ) {
        continue;
      }
      const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
      unifiedUpcoming.push({
        id: `goal:${goal.id}`,
        sourceKind: 'goal',
        sourceId: goal.id,
        title: `${goal.name} Deadline`,
        subtitle: `${formatCurrency(remaining)} remaining`,
        category: 'goal',
        amount: remaining,
        dueDate: goal.targetDate,
        remindTime: formattedDefaultTime,
        isOverdue: false,
        isSnoozed: false,
        repeatRule: 'none',
        status: 'pending',
        actionUrl: `/(app)/goal-details?id=${goal.id}`,
      });
    }

    unifiedUpcoming.sort((a, b) => {
      if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
      const dateCmp = a.dueDate.localeCompare(b.dueDate);
      if (dateCmp !== 0) return dateCmp;
      return a.remindTime.localeCompare(b.remindTime);
    });

    return {
      customReminders: activeCustom,
      unifiedUpcoming,
      completedReminders,
    };
  }
}


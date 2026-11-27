import { DeviceEventEmitter } from 'react-native';
import { getDatabase } from '@/services/database';
import { getLocalTodayYmd, shiftMonthsPreserveDay, shiftYmdDays } from '@/utils/date';
import type {
  CreateReminderDTO,
  Reminder,
  ReminderCategory,
  ReminderLinkedType,
  ReminderRepeatRule,
  ReminderStatus,
  UpdateReminderDTO,
} from '../types/reminder.types';

interface ReminderRow {
  id: string;
  title: string;
  notes: string | null;
  category: string;
  amount: number | null;
  remind_at_date: string;
  remind_at_time: string;
  repeat_rule: string;
  advance_days: number;
  status: string;
  snooze_until: string | null;
  linked_type: string | null;
  linked_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r % 4) + 8;
    return v.toString(16);
  });
}

function normalizeTimeHm(time?: string): string {
  if (!time) return '09:00';
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!match) return '09:00';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function mapRow(row: ReminderRow): Reminder {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes ?? '',
    category: (row.category as ReminderCategory) || 'general',
    amount: row.amount ?? undefined,
    remindAtDate: row.remind_at_date,
    remindAtTime: normalizeTimeHm(row.remind_at_time),
    repeatRule: (row.repeat_rule as ReminderRepeatRule) || 'none',
    advanceDays: row.advance_days ?? 0,
    status: (row.status as ReminderStatus) || 'pending',
    snoozeUntil: row.snooze_until ?? undefined,
    linkedType: (row.linked_type as ReminderLinkedType) ?? undefined,
    linkedId: row.linked_id ?? undefined,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function calculateNextReminderDate(
  currentDate: string,
  repeatRule: ReminderRepeatRule
): string {
  switch (repeatRule) {
    case 'daily':
      return shiftYmdDays(currentDate, 1);
    case 'weekly':
      return shiftYmdDays(currentDate, 7);
    case 'monthly':
      return shiftMonthsPreserveDay(currentDate, 1);
    case 'quarterly':
      return shiftMonthsPreserveDay(currentDate, 3);
    case 'yearly':
      return shiftMonthsPreserveDay(currentDate, 12);
    default:
      return currentDate;
  }
}

export class RemindersRepository {
  private static schemaInitialized = false;

  public static resetSchemaCache(): void {
    this.schemaInitialized = false;
  }

  public static async ensureSchema(): Promise<void> {
    if (this.schemaInitialized) return;
    const db = getDatabase();
    if (typeof db.execAsync === 'function') {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS reminders (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          notes TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL CHECK(
            category IN ('general', 'tax', 'insurance', 'trial', 'investment', 'splitwise', 'daily_log', 'bill_custom')
          ) DEFAULT 'general',
          amount REAL DEFAULT NULL,
          remind_at_date TEXT NOT NULL,
          remind_at_time TEXT NOT NULL DEFAULT '09:00',
          repeat_rule TEXT NOT NULL CHECK(
            repeat_rule IN ('none', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly')
          ) DEFAULT 'none',
          advance_days INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL CHECK(
            status IN ('pending', 'snoozed', 'completed', 'dismissed')
          ) DEFAULT 'pending',
          snooze_until TEXT DEFAULT NULL,
          linked_type TEXT DEFAULT NULL CHECK(
            linked_type IS NULL OR linked_type IN ('bill', 'account', 'goal', 'subscription', 'splitwise_person')
          ),
          linked_id TEXT DEFAULT NULL,
          completed_at TEXT DEFAULT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_reminders_status_date ON reminders(status, remind_at_date ASC);
        CREATE INDEX IF NOT EXISTS idx_reminders_linked ON reminders(linked_type, linked_id);
      `);
      this.schemaInitialized = true;
    }
  }

  private static async expireElapsedSnoozes(): Promise<void> {
    const db = getDatabase();
    const nowIso = new Date().toISOString();
    await db.runAsync(
      `UPDATE reminders
       SET status = 'pending', snooze_until = NULL, updated_at = ?
       WHERE status = 'snoozed' AND snooze_until IS NOT NULL AND snooze_until <= ?`,
      [nowIso, nowIso]
    );
  }

  public static async getAllReminders(): Promise<Reminder[]> {
    await this.ensureSchema();
    await this.expireElapsedSnoozes();
    const db = getDatabase();
    const rows = await db.getAllAsync<ReminderRow>(
      `SELECT * FROM reminders ORDER BY remind_at_date ASC, remind_at_time ASC, created_at DESC`
    );
    return rows.map(mapRow);
  }

  public static async getActiveReminders(daysAhead: number = 45): Promise<Reminder[]> {
    await this.ensureSchema();
    await this.expireElapsedSnoozes();
    const db = getDatabase();
    const maxDate = shiftYmdDays(getLocalTodayYmd(), daysAhead);
    const rows = await db.getAllAsync<ReminderRow>(
      `SELECT * FROM reminders
       WHERE status IN ('pending', 'snoozed')
         AND remind_at_date <= ?
       ORDER BY remind_at_date ASC, remind_at_time ASC`,
      [maxDate]
    );
    return rows.map(mapRow);
  }

  public static async getReminderById(id: string): Promise<Reminder | null> {
    await this.ensureSchema();
    const db = getDatabase();
    const row = await db.getFirstAsync<ReminderRow>(`SELECT * FROM reminders WHERE id = ?`, [id]);
    return row ? mapRow(row) : null;
  }

  public static async insertReminder(dto: CreateReminderDTO): Promise<Reminder> {
    await this.ensureSchema();
    const db = getDatabase();
    const id = generateId();
    const nowIso = new Date().toISOString();
    const title = dto.title.trim();
    const notes = dto.notes?.trim() ?? '';
    const category = dto.category ?? 'general';
    const amount = dto.amount !== undefined && Number.isFinite(dto.amount) ? dto.amount : null;
    const remindAtDate = dto.remindAtDate;
    const remindAtTime = normalizeTimeHm(dto.remindAtTime);
    const repeatRule = dto.repeatRule ?? 'none';
    const advanceDays = Math.max(0, Math.trunc(dto.advanceDays ?? 0));

    await db.runAsync(
      `INSERT INTO reminders (
        id, title, notes, category, amount,
        remind_at_date, remind_at_time, repeat_rule, advance_days,
        status, snooze_until, linked_type, linked_id, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, NULL, ?, ?)`,
      [
        id,
        title,
        notes,
        category,
        amount,
        remindAtDate,
        remindAtTime,
        repeatRule,
        advanceDays,
        dto.linkedType ?? null,
        dto.linkedId ?? null,
        nowIso,
        nowIso,
      ]
    );

    DeviceEventEmitter.emit('remindersUpdated');

    return {
      id,
      title,
      notes,
      category,
      amount: amount ?? undefined,
      remindAtDate,
      remindAtTime,
      repeatRule,
      advanceDays,
      status: 'pending',
      linkedType: dto.linkedType,
      linkedId: dto.linkedId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  public static async updateReminder(id: string, updates: UpdateReminderDTO): Promise<Reminder | null> {
    await this.ensureSchema();
    const db = getDatabase();
    const sets: string[] = [];
    const params: (string | number | null)[] = [];

    if (updates.title !== undefined) {
      sets.push('title = ?');
      params.push(updates.title.trim());
    }
    if (updates.notes !== undefined) {
      sets.push('notes = ?');
      params.push(updates.notes.trim());
    }
    if (updates.category !== undefined) {
      sets.push('category = ?');
      params.push(updates.category);
    }
    if (updates.amount !== undefined) {
      sets.push('amount = ?');
      params.push(updates.amount);
    }
    if (updates.remindAtDate !== undefined) {
      sets.push('remind_at_date = ?');
      params.push(updates.remindAtDate);
    }
    if (updates.remindAtTime !== undefined) {
      sets.push('remind_at_time = ?');
      params.push(normalizeTimeHm(updates.remindAtTime));
    }
    if (updates.repeatRule !== undefined) {
      sets.push('repeat_rule = ?');
      params.push(updates.repeatRule);
    }
    if (updates.advanceDays !== undefined) {
      sets.push('advance_days = ?');
      params.push(Math.max(0, Math.trunc(updates.advanceDays)));
    }
    if (updates.status !== undefined) {
      sets.push('status = ?');
      params.push(updates.status);
    }
    if (updates.snoozeUntil !== undefined) {
      sets.push('snooze_until = ?');
      params.push(updates.snoozeUntil);
    }
    if (updates.linkedType !== undefined) {
      sets.push('linked_type = ?');
      params.push(updates.linkedType);
    }
    if (updates.linkedId !== undefined) {
      sets.push('linked_id = ?');
      params.push(updates.linkedId);
    }
    if (updates.completedAt !== undefined) {
      sets.push('completed_at = ?');
      params.push(updates.completedAt);
    }

    if (sets.length === 0) {
      return this.getReminderById(id);
    }

    sets.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    await db.runAsync(`UPDATE reminders SET ${sets.join(', ')} WHERE id = ?`, params);
    DeviceEventEmitter.emit('remindersUpdated');
    return this.getReminderById(id);
  }

  public static async markReminderCompleted(
    id: string
  ): Promise<{ completed: Reminder; nextReminder?: Reminder }> {
    await this.ensureSchema();
    const db = getDatabase();
    const existing = await this.getReminderById(id);
    if (!existing) {
      throw new Error(`Reminder not found: ${id}`);
    }

    const nowIso = new Date().toISOString();
    await db.runAsync(
      `UPDATE reminders
       SET status = 'completed', snooze_until = NULL, completed_at = ?, updated_at = ?
       WHERE id = ?`,
      [nowIso, nowIso, id]
    );

    const completed: Reminder = {
      ...existing,
      status: 'completed',
      snoozeUntil: undefined,
      completedAt: nowIso,
      updatedAt: nowIso,
    };

    let nextReminder: Reminder | undefined;
    if (existing.repeatRule !== 'none') {
      const nextDate = calculateNextReminderDate(existing.remindAtDate, existing.repeatRule);
      nextReminder = await this.insertReminder({
        title: existing.title,
        notes: existing.notes,
        category: existing.category,
        amount: existing.amount,
        remindAtDate: nextDate,
        remindAtTime: existing.remindAtTime,
        repeatRule: existing.repeatRule,
        advanceDays: existing.advanceDays,
        linkedType: existing.linkedType,
        linkedId: existing.linkedId,
      });
    } else {
      DeviceEventEmitter.emit('remindersUpdated');
    }

    return { completed, nextReminder };
  }

  public static async snoozeReminder(id: string, snoozeUntilIso: string): Promise<Reminder | null> {
    return this.updateReminder(id, {
      status: 'snoozed',
      snoozeUntil: snoozeUntilIso,
    });
  }

  public static async deleteReminder(id: string): Promise<void> {
    await this.ensureSchema();
    const db = getDatabase();
    await db.runAsync(`DELETE FROM reminders WHERE id = ?`, [id]);
    DeviceEventEmitter.emit('remindersUpdated');
  }
}

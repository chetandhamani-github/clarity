import { mmkv } from '@/lib/storage';

const SENT_ALERTS_KEY = 'clarity_sent_reminder_alerts_v1';
const SNOOZED_BILLS_KEY = 'clarity_snoozed_bill_reminders_v1';
const SCHEDULED_META_KEY = 'clarity_scheduled_bill_meta_v1';

const MAX_SENT_ALERT_AGE_MS = 45 * 24 * 60 * 60 * 1000;
const MAX_SENT_ALERT_ENTRIES = 250;

function readRecord(storageKey: string): Record<string, number> {
  try {
    const raw = mmkv.getString(storageKey);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        result[k] = v;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function writeRecord(storageKey: string, record: Record<string, number>): void {
  try {
    mmkv.set(storageKey, JSON.stringify(record));
  } catch {
    // Ignore storage errors in constrained environments
  }
}

function pruneSentAlerts(record: Record<string, number>, nowMs: number): Record<string, number> {
  const cutoff = nowMs - MAX_SENT_ALERT_AGE_MS;
  const freshEntries = Object.entries(record).filter(([, ts]) => ts >= cutoff);
  if (freshEntries.length <= MAX_SENT_ALERT_ENTRIES) {
    return Object.fromEntries(freshEntries);
  }
  freshEntries.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(freshEntries.slice(0, MAX_SENT_ALERT_ENTRIES));
}

export function hasSentReminder(key: string): boolean {
  const record = readRecord(SENT_ALERTS_KEY);
  return typeof record[key] === 'number';
}

export function hasSentReminderWithin(
  key: string,
  windowMs: number,
  nowMs: number = Date.now()
): boolean {
  const record = readRecord(SENT_ALERTS_KEY);
  const ts = record[key];
  if (typeof ts !== 'number') return false;
  return nowMs - ts < windowMs;
}

export function markReminderSent(key: string, nowMs: number = Date.now()): void {
  const record = readRecord(SENT_ALERTS_KEY);
  record[key] = nowMs;
  writeRecord(SENT_ALERTS_KEY, pruneSentAlerts(record, nowMs));
}

export function getBillSnoozeUntil(billId: string, nowMs: number = Date.now()): number | null {
  const record = readRecord(SNOOZED_BILLS_KEY);
  const until = record[billId];
  if (typeof until !== 'number') return null;
  if (until <= nowMs) {
    delete record[billId];
    writeRecord(SNOOZED_BILLS_KEY, record);
    return null;
  }
  return until;
}

export function setBillSnoozeUntil(billId: string, snoozeUntilMs: number): void {
  const record = readRecord(SNOOZED_BILLS_KEY);
  record[billId] = snoozeUntilMs;
  writeRecord(SNOOZED_BILLS_KEY, record);
}

export function getScheduledBillTrigger(billId: string): number | null {
  const record = readRecord(SCHEDULED_META_KEY);
  const triggerMs = record[billId];
  return typeof triggerMs === 'number' ? triggerMs : null;
}

export function setScheduledBillTrigger(billId: string, triggerMs: number | null): void {
  const record = readRecord(SCHEDULED_META_KEY);
  if (triggerMs === null) {
    if (!(billId in record)) return;
    delete record[billId];
  } else {
    record[billId] = triggerMs;
  }
  writeRecord(SCHEDULED_META_KEY, record);
}

export function clearReminderStateForBill(billId: string): void {
  const snoozed = readRecord(SNOOZED_BILLS_KEY);
  if (billId in snoozed) {
    delete snoozed[billId];
    writeRecord(SNOOZED_BILLS_KEY, snoozed);
  }

  const meta = readRecord(SCHEDULED_META_KEY);
  if (billId in meta) {
    delete meta[billId];
    writeRecord(SCHEDULED_META_KEY, meta);
  }
}

export function clearAllReminderState(): void {
  writeRecord(SENT_ALERTS_KEY, {});
  writeRecord(SNOOZED_BILLS_KEY, {});
  writeRecord(SCHEDULED_META_KEY, {});
}

export function clearSentRemindersWithPrefix(prefix: string): void {
  const record = readRecord(SENT_ALERTS_KEY);
  let changed = false;
  for (const key of Object.keys(record)) {
    if (key.startsWith(prefix)) {
      delete record[key];
      changed = true;
    }
  }
  if (changed) {
    writeRecord(SENT_ALERTS_KEY, record);
  }
}

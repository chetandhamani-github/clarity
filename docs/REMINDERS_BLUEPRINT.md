# Clarity Reminders Module & Alert Hardening Blueprint

This document defines the architecture, cleanup plan, SQLite schema, OS scheduling engine, UI specifications, and verification checklist for fixing Clarity's fragmented notification/bill-reminder plumbing and implementing a dedicated `reminders` module (`src/modules/reminders/`).

---

## 1. Current State & Problem Audit

Clarity currently implements financial alerts and reminders across several disconnected files without a unified scheduler or user preference layer:

| Area | Current State | Identified Issues | Target State |
| :--- | :--- | :--- | :--- |
| **Bills Storage** | Both `bill_reminders` (`bill-dao.ts`, `use-bills.ts`) and `bills` (`BillsRepository`, `BillService`) exist | Dual reads/deduplication in `cashflow-engine.ts`, `billSettlementEngine.ts`, `backup-restore-service.ts`, and stale `useMonthlyBillSummary` in `plan.tsx` / `copilot.tsx` | Migrate legacy `bill_reminders` rows into `bills`; switch active app hooks & engines to `BillsRepository` |
| **OS Notification Scheduling** | `BillAlertEngine.scheduleNativeBillReminder` hardcodes `9:00 AM` for bills only | `cancelAllNativeBillReminders()` calls `cancelAllScheduledNotificationsAsync()`, wiping all app alarms; subscriptions, credit card due dates, goals, and custom tasks have no native OS triggers | Unified `ReminderScheduler` using prefix-scoped cancellations, user-configured default time, and a capped rolling 45-day OS alarm window |
| **Duplicate Alerts** | `BillService` triggers both `ReminderService.scheduleBillReminder` (calls `insertNotification` -> fires immediate OS notification) and `BillAlertEngine.scheduleNativeBillReminder` | Users can receive both an immediate banner from `insertNotification` and a scheduled native trigger for the same cycle | `insertNotification` supports `notifySystem?: boolean` so in-app ledger logs do not double-fire when a native OS trigger handles delivery |
| **Missed Same-Day Renewals** | `alert-engine.ts` filters `next_process_date > todayStr` and `next_renewal_date > todayStr` | Items due **today** are skipped if the app was not opened before midnight | Inclusive `>= todayStr` window for upcoming subscriptions |
| **Daily Financial Pulse** | `triggerDailyPulseNotification` exists in `system-notification.ts` | Never wired to a daily schedule or user preference | Configurable Daily Pulse toggle + preferred time managed via Settings & `ReminderScheduler` |
| **Custom Financial Reminders** | No model or UI for zero-amount or non-bill tasks (tax filing, trial cancellations, insurance renewals, Splitwise follow-ups, daily log nudges) | `AddBillScreen` enforces `amount > 0`; Notifications screen is a read-only alert log | Full `reminders` table, repository, `ReminderScheduler`, TanStack Query hooks, `RemindersScreen`, and `AddReminderScreen` |

---

## 2. Architectural Principles

1. **Local-First & Zero Duplication (`AGENTS.md` compliant)**
   - Custom reminders live in SQLite (`reminders` table) and sync inside encrypted Google Drive snapshots (`backup-restore-service.ts`). No Spring Boot backend dependency is required.
   - Bills, subscriptions, credit card accounts, and goals remain the single sources of truth in their own tables (`bills`, `subscriptions`, `accounts`, `goals`). The Reminders hub projects them dynamically as read-through items instead of copying them into `reminders`.
2. **State Separation**
   - **SQLite (`reminders.repository.ts`)**: Persistent reminder records, completion timestamps, snooze timestamps, and recurrence rules.
   - **TanStack Query (`useReminders.ts`)**: Server/DB async state, mutations, and reactive invalidation via `['reminders']` and `DeviceEventEmitter` `'remindersUpdated'`.
   - **Zustand (`reminders.store.ts` & `useAppStore`)**: Client UI filters (active tab, category filter, search query) and user notification timing preferences.
3. **Rolling Native OS Quota Protection**
   - Android enforces pending alarm caps across vendors. `ReminderScheduler` computes upcoming triggers for the next **45 days** and caps active scheduled notifications (prioritizing soonest triggers) with deterministic identifier prefixes:
     - `reminder-<id>`: Custom reminders
     - `bill-reminder-<id>`: Bills
     - `sub-reminder-<id>`: Active subscriptions
     - `cc-reminder-<id>`: Credit card due dates
     - `goal-reminder-<id>`: Goal target deadlines
     - `daily-pulse-scheduled`: Daily Financial Pulse recurring trigger

---

## 3. Database Schema & Migrations

### 3.1 `reminders` Table (`src/services/database/migrations.ts`)

```sql
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK(
    category IN (
      'general',
      'tax',
      'insurance',
      'trial',
      'investment',
      'splitwise',
      'daily_log',
      'bill_custom'
    )
  ) DEFAULT 'general',
  amount REAL DEFAULT NULL,
  remind_at_date TEXT NOT NULL,      -- YYYY-MM-DD (local calendar date)
  remind_at_time TEXT NOT NULL DEFAULT '09:00', -- HH:mm (24h local)
  repeat_rule TEXT NOT NULL CHECK(
    repeat_rule IN ('none', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly')
  ) DEFAULT 'none',
  advance_days INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(
    status IN ('pending', 'snoozed', 'completed', 'dismissed')
  ) DEFAULT 'pending',
  snooze_until TEXT DEFAULT NULL,    -- ISO timestamp when snoozed
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
```

### 3.2 Legacy `bill_reminders` Migration (`src/services/database/migrations.ts`)

During `runMigrations(db)` (and post-restore in `backup-restore-service.ts`):
- Migrate any non-duplicate rows from `bill_reminders` into `bills` (mapping `UNPAID` -> `upcoming`, `OVERDUE` -> `overdue`, `PAID` -> `paid`, `DISMISSED` -> `dismissed`, `MANUAL` -> `manual`, `SMS` -> `sms`), preserving `paid_transaction_id`, `paid_date`, `sms_id`, and `payment_url`.
- Remove migrated rows from `bill_reminders` cleanly so legacy reads no longer diverge from `bills`.

### 3.3 Backup, Restore & App Reset Integration

- **`src/services/database/index.ts`**: Add `DROP TABLE IF EXISTS reminders;` in `clearDatabase()` fallback block.
- **`src/services/database/backup-restore-service.ts`**:
  - Export `reminders` in `generateDatabaseSnapshot()`.
  - Count `reminders` in `isMeaningfulDatabaseSnapshot()`.
  - Wipe & restore `reminders` inside `restoreDatabaseFromSnapshot()`.
  - Migrate restored `bill_reminders` into `bills`, clear stale scheduled triggers by prefix, and run `ReminderScheduler.syncAll()`.
- **`src/services/app-reset.ts`**:
  - Cancel all scheduled OS notifications (`ReminderScheduler.cancelAll()`), clear delivered tray items, and clear reminder MMKV state.

---

## 4. User Preferences (`src/store/use-app-store.ts`)

Add persistent reminder preferences (mirrored in backup/restore & reset defaults):

- `defaultReminderTime`: `string` (default `'09:00'`, formatted `'HH:mm'`)
- `dailyPulseEnabled`: `boolean` (default `false`)
- `dailyPulseTime`: `string` (default `'20:00'`)
- `billRemindersEnabled`: `boolean` (default `true`)
- `cardDueAlertsEnabled`: `boolean` (default `true`)
- `budgetAlertsEnabled`: `boolean` (default `true`)
- `goalRemindersEnabled`: `boolean` (default `true`)

---

## 5. Module Structure (`src/modules/reminders/`)

```
src/modules/reminders/
├── index.ts
├── types/
│   └── reminder.types.ts
├── database/
│   └── reminders.repository.ts
├── services/
│   ├── RemindersService.ts        # CRUD + recurrence advancement + unified projection
│   └── ReminderScheduler.ts       # OS notification trigger sync, prefix cleanup, snooze
├── hooks/
│   └── useReminders.ts            # TanStack Query queries/mutations + DeviceEventEmitter sync
├── store/
│   └── reminders.store.ts         # Client UI tab / category / search state
├── components/
│   ├── ReminderCard.tsx
│   ├── TimePickerModal.tsx
│   └── UpcomingRemindersWidget.tsx
├── screens/
│   ├── RemindersScreen.tsx
│   └── AddReminderScreen.tsx
└── __tests__/
    ├── reminders.repository.test.ts
    ├── ReminderService.test.ts
    └── ReminderScheduler.test.ts
```

### 5.1 Unified Read-Through Timeline

`RemindersService.getUnifiedFeed()` merges:
1. **Custom Reminders** (`reminders` table, `status IN ('pending', 'snoozed')`, plus completed history tab).
2. **Upcoming & Overdue Bills** (`BillsRepository.getUpcomingBills(45)`).
3. **Active Subscriptions** (`BillsRepository.getAllSubscriptions()`, status `'active'`).
4. **Credit Card Due Dates** (`accounts` where `type = 'credit' AND due_day IS NOT NULL AND balance < 0`).
5. **Goal Target Deadlines** (`goals` where `current_amount < target_amount` and `target_date` within 45 days).

Users can view everything in **All Upcoming** or filter specifically to **Custom**, **Bills & Cards**, **Snoozed**, or **Completed**, and jump straight to the underlying detail screen (`/(app)/bill-details`, `/(app)/account-details`, `/(app)/goal-details`, `/(app)/splitwise-person-details`) or mark custom reminders done in one tap.

### 5.2 Notification Channels & Interactive Actions

- **Channel (`src/services/notifications/system-notification.ts`)**:
  - Add `NOTIFICATION_CHANNELS.REMINDERS = 'financial_reminders'` and `NOTIFICATION_CATEGORIES.REMINDER = 'REMINDER'`.
  - Interactive action buttons on `REMINDER`:
    - `REMINDER_MARK_DONE` (`Mark Done`, `opensAppToForeground: false`)
    - `REMINDER_SNOOZE_1D` (`Snooze 1d`, `opensAppToForeground: false`)
    - `REMINDER_OPEN` (`Open`, `opensAppToForeground: true`)
  - Interactive snooze action on `BILL_REMINDER`: keep `VIEW_BILL` & `MARK_PAID`.
- **Action Routing (`src/hooks/use-push-notifications.ts`)**:
  - Handle `REMINDER_MARK_DONE` -> calls `ReminderService.completeReminder(reminderId)`, emits `'remindersUpdated'`, invalidates `['reminders']`, dismisses tray notification.
  - Handle `REMINDER_SNOOZE_1D` -> calls `ReminderService.snoozeReminder(reminderId, 24)`, emits `'remindersUpdated'`, invalidates `['reminders']`, dismisses tray notification.
  - Handle `REMINDER_OPEN` / tap -> navigates to `data.actionUrl` or `'/(app)/reminders'`.

---

## 6. Phased Implementation Checklist

### Phase 1: Cleanup & Existing Alert Hardening
- [x] Add `notifySystem?: boolean` to `insertNotification` (`src/services/database/notification-dao.ts`) so `ReminderService` (bills) logs in-app alerts without duplicate immediate OS banners when native triggers are scheduled.
- [x] Fix prefix-scoped OS cancellation in `BillAlertEngine` (`src/services/notifications/bill-alert-engine.ts`) so `cancelAllNativeBillReminders()` / sync does not erase non-bill notifications.
- [x] Respect user `defaultReminderTime` and reminder category toggles in `BillAlertEngine` and `alert-engine.ts`.
- [x] Fix strict `>` comparison to `>=` in `alert-engine.ts` for subscriptions due today (`next_renewal_date >= todayStr`).
- [x] Add one-time `bill_reminders` -> `bills` migration helper in `src/services/database/migrations.ts` and switch `use-bills.ts` monthly summary to read via `BillsRepository`.

### Phase 2: Core `reminders` Data Layer, Scheduler, Backup & Reset
- [x] Add `reminders` SQLite table + indexes in `src/services/database/migrations.ts` and drop fallback in `src/services/database/index.ts`.
- [x] Add reminder preferences to `src/store/use-app-store.ts`.
- [x] Implement `src/modules/reminders/types/reminder.types.ts` and `src/modules/reminders/database/reminders.repository.ts`.
- [x] Implement `src/modules/reminders/services/RemindersService.ts` (recurrence calculation, snooze, complete, unified read-through projection).
- [x] Implement `src/modules/reminders/services/ReminderScheduler.ts` (capped 45-day rolling scheduler for custom reminders, bills, subscriptions, credit card due dates, goal deadlines, and Daily Pulse).
- [x] Add `REMINDERS` channel, `REMINDER` interactive category, and background response handlers in `system-notification.ts` and `use-push-notifications.ts`.
- [x] Wire `reminders` + preferences into `backup-restore-service.ts`, `app-reset.ts`, and `src/app/_layout.tsx`.
- [x] Write unit tests for repository, service, and scheduler.

### Phase 3: Hooks, Screens, Widgets & Settings UI
- [x] Implement TanStack Query hooks in `src/modules/reminders/hooks/useReminders.ts` and Zustand filter store in `src/modules/reminders/store/reminders.store.ts`.
- [x] Build `ReminderCard.tsx`, `TimePickerModal.tsx`, `UpcomingRemindersWidget.tsx`, `RemindersScreen.tsx`, and `AddReminderScreen.tsx`.
- [x] Register routes `src/app/(app)/reminders.tsx`, `src/app/(app)/add-reminder.tsx`, and stack entries in `src/app/(app)/_layout.tsx`.
- [x] Add **Reminders & Alerts** section to `src/app/(app)/settings.tsx` (default time picker, Daily Pulse toggle & time, category toggles, quick link to Reminders).
- [x] Add entry points from `notifications.tsx`, Home dashboard, `plan.tsx`, Splitwise `PersonDetailsScreen`, and `goal-details.tsx`.

### Phase 4: Verification
- [x] Run `npm run typecheck`, `npm run lint` on touched files, and Jest tests (`npm test`).
- [x] Confirm all checklist items and new/related reminder, bill, notification, backup, and app-reset suites pass without regressions (note: pre-existing unrelated failure in `src/services/export/pdf-statement-parser.test.ts`).

# Clarity Feature Roadmap and Implementation Blueprint

This document outlines the architectural specifications, database schema modifications, service requirements, and implementation checklists for the remaining core features and enhancements identified in the Clarity application audit.

---

## Table of Contents

1. [Category-Level Budget Caps (Micro-Budgets)](#1-category-level-budget-caps-micro-budgets)
2. [Credit Card Billing Cycles and Utilization Tracking](#2-credit-card-billing-cycles-and-utilization-tracking)
3. [Password-Protected Bank PDF Statement Import](#3-password-protected-bank-pdf-statement-import)
4. [Receipt Photo and Document Attachment](#4-receipt-photo-and-document-attachment)
5. [Custom Cross-Category Tags](#5-custom-cross-category-tags)
6. [Multi-Select and Bulk Transaction Operations](#6-multi-select-and-bulk-transaction-operations)
7. [Scheduled Background Auto-Backup](#7-scheduled-background-auto-backup)
8. [Undo Action Toast on Delete](#8-undo-action-toast-on-delete)
9. [Haptic Feedback Integration](#9-haptic-feedback-integration)
10. [Android Home Screen Quick Widget](#10-android-home-screen-quick-widget)

---

## 1. Category-Level Budget Caps (Micro-Budgets)

### Overview
Clarity currently implements a macro 50/30/20 budget framework (`Needs`, `Wants`, `Savings`). However, users cannot configure spending limits for individual categories (for example, a maximum cap of 8,000 for Food and Dining or 3,000 for Entertainment). Micro-budgets provide proactive guardrails, alerting users when specific category thresholds (80% and 100%) are reached before end-of-month budget overruns occur.

### Database Schema Updates
Add a dedicated table in [src/services/database/migrations.ts](file:///home/lalit/Documents/Clarity/src/services/database/migrations.ts):

```sql
CREATE TABLE IF NOT EXISTS category_budgets (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  amount REAL NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
  UNIQUE(category_id, month, year)
);
CREATE INDEX IF NOT EXISTS idx_category_budgets_period ON category_budgets(month, year);
```

### Data Access and State Management
- **DAO Layer**: Extend [src/services/database/budget-dao.ts](file:///home/lalit/Documents/Clarity/src/services/database/budget-dao.ts) with:
  - `getCategoryBudgets(month: number, year: number): Promise<CategoryBudget[]>`
  - `upsertCategoryBudget(categoryId: string, amount: number, month: number, year: number): Promise<void>`
  - `deleteCategoryBudget(id: string): Promise<void>`
- **Hooks**: Extend [src/hooks/use-budget.ts](file:///home/lalit/Documents/Clarity/src/hooks/use-budget.ts) with TanStack Query hooks:
  - `useCategoryBudgets(month, year)`
  - `useUpsertCategoryBudget()`
- **Alert Engine**: In [src/services/notifications/alert-engine.ts](file:///home/lalit/Documents/Clarity/src/services/notifications/alert-engine.ts), compute category spend against `category_budgets` on transaction creation and trigger local notifications at 80% and 100% capacity.

### UI Integration
- **Screen**: [src/app/(app)/(tabs)/plan.tsx](file:///home/lalit/Documents/Clarity/src/app/(app)/(tabs)/plan.tsx).
- **Components**:
  - Category spending progress bar displaying spent amount versus limit.
  - Modal dialog to set, edit, or remove monthly spending caps per category.
  - Visual status badges (Normal, Approaching Cap, Exceeded Cap).

### Implementation Checklist
- [x] Category cap data modeling in `budget_categories` and `CategorySpending`.
- [x] Implement DAO methods in `budget-dao.ts`.
- [x] Add TanStack Query hooks and reactive cache invalidation in `use-budget.ts`.
- [x] Update notification alert engine (`evaluateCategoryBudgetAlert`) for 80% and 100% threshold alerts.
- [x] Design and integrate category spending cards, progress bars, status pills, and cap editor modal in `plan.tsx`.

---

## 2. Credit Card Billing Cycles and Utilization Tracking

### Overview
Credit card accounts are currently tracked as generic liability accounts. Credit cards require distinct financial mechanics: statement generation dates, payment due dates, total credit limits, and credit utilization tracking. Maintaining a credit utilization ratio below 30% is critical for credit health and CIBIL/FICO scores.

### Database Schema Updates
Add columns to the `accounts` table in [src/services/database/migrations.ts](file:///home/lalit/Documents/Clarity/src/services/database/migrations.ts):

```sql
ALTER TABLE accounts ADD COLUMN credit_limit REAL DEFAULT NULL;
ALTER TABLE accounts ADD COLUMN statement_day INTEGER DEFAULT NULL;
ALTER TABLE accounts ADD COLUMN due_day INTEGER DEFAULT NULL;
ALTER TABLE accounts ADD COLUMN auto_pay_enabled INTEGER DEFAULT 0;
```

### Business Logic and Utilities
- **Cycle Window Calculation**: In a new utility [src/utils/credit-card.ts](file:///home/lalit/Documents/Clarity/src/utils/credit-card.ts):
  - Compute current statement cycle dates based on `statement_day`.
  - Calculate cycle total spend and statement balance.
  - Calculate utilization percentage: `(current_balance / credit_limit) * 100`.
  - Calculate days remaining until payment due date.
- **Alert Trigger**: In [src/services/notifications/alert-engine.ts](file:///home/lalit/Documents/Clarity/src/services/notifications/alert-engine.ts):
  - Send reminder notification 3 days and 1 day prior to `due_day`.
  - Send advisory alert if utilization crosses 30%.

### UI Integration
- **Screen**: [src/app/(app)/(tabs)/accounts.tsx](file:///home/lalit/Documents/Clarity/src/app/(app)/(tabs)/accounts.tsx) and [src/app/(app)/account-details.tsx](file:///home/lalit/Documents/Clarity/src/app/(app)/account-details.tsx).
- **Components**:
  - Credit utilization visual gauge (safe under 30%, warning between 30% and 50%, alert above 50%).
  - Billing cycle timeline card showing Statement Date, Payment Due Date, and Days Remaining.
  - Add/Edit account form fields for Credit Limit, Statement Day (1-31), and Due Day (1-31).

### Implementation Checklist
- [x] SQLite migration columns for credit card metadata (`credit_limit`, `billing_cycle_day`, `due_day`).
- [x] Update [src/services/database/account-dao.ts](file:///home/lalit/Documents/Clarity/src/services/database/account-dao.ts) mappings and types.
- [x] Credit card calculation utilities (utilization ratio, statement date, due date countdown).
- [x] Add credit card due date and utilization checks in alert engine (30% advisory alert and 80% critical alert).
- [x] Enhance Account Card, Detail Card on Accounts Tab, and Details screen with utilization gauge, available limit, and due date badge.

---

## 3. Password-Protected Bank PDF Statement Import

### Overview
The statement import feature in [src/app/(app)/import-statement.tsx](file:///home/lalit/Documents/Clarity/src/app/(app)/import-statement.tsx) only parses plain `.csv` files. Most retail banks (such as HDFC, SBI, ICICI, Axis, and Chase) distribute monthly e-statements as password-protected PDF files locked with user credentials (such as PAN number, date of birth, or account digits). Providing native PDF parsing with password unlocking removes a major barrier for everyday users.

### Architectural Workflow
1. **File Selection**: User picks `.pdf` or `.csv` in [src/app/(app)/import-statement.tsx](file:///home/lalit/Documents/Clarity/src/app/(app)/import-statement.tsx).
2. **Encrypted Check**: Detect if PDF is encrypted; if protected, present a password modal with bank-specific password formatting hints.
3. **Extraction Engine**: Local PDF text/table parser extracts statement lines (Date, Narration, Cheque/Reference Number, Withdrawal, Deposit, Balance).
4. **Standardization**: Bank-specific regex rules normalize transaction rows into standard Clarity transaction schema.
5. **Deduplication**: Match against existing transaction reference numbers or date-amount hashes to prevent duplicate entries.
6. **Preview & Confirm**: Display parsed transactions for user review before committing batch to SQLite.

### Service Structure
- **Service**: [src/services/export/pdf-statement-parser.ts](file:///home/lalit/Documents/Clarity/src/services/export/pdf-statement-parser.ts).
- **Bank Profiles**: Rule definitions for standard Indian banks (SBI, HDFC, ICICI, Axis, Kotak) mapping column formats and default password patterns.

### UI Integration
- Password input modal with password visibility toggle.
- Bank format selector (Auto-Detect, HDFC, SBI, ICICI, Axis, Generic).
- Preview list with checkboxes to exclude specific rows prior to saving.

### Implementation Checklist
- [x] Integrate local PDF extraction handler in `pdf-statement-parser.ts`.
- [x] Add password prompt modal in `import-statement.tsx`.
- [x] Define parser rules and password hints for major bank statement layouts (SBI, HDFC, ICICI, Axis, Kotak).
- [x] Connect deduplication service before batch SQLite commit.
- [x] Add parsing error boundary with interactive inclusion checkboxes in preview.

---

## 4. Receipt Photo and Document Attachment

### Overview
Clarity features an OCR receipt scanner in [src/app/(app)/add-transaction.tsx](file:///home/lalit/Documents/Clarity/src/app/(app)/add-transaction.tsx), but the scanned receipt image is discarded after text extraction. Storing the receipt image or document attachment with the transaction record is essential for warranty tracking, expense reimbursement, tax records, and purchase returns.

### Database Schema Updates
Add column to `transactions` table in [src/services/database/migrations.ts](file:///home/lalit/Documents/Clarity/src/services/database/migrations.ts):

```sql
ALTER TABLE transactions ADD COLUMN receipt_uri TEXT DEFAULT NULL;
```

### Storage and File System Management
- **Directory**: Store receipt images in sandboxed app storage using `expo-file-system`:
  `${FileSystem.documentDirectory}receipts/{transactionId}.jpg`
- **Compression**: Downscale and compress images to JPEG (max width 1200px, quality 0.7) to prevent excessive storage consumption.
- **Cleanup**: Delete associated local image files on transaction deletion in [src/services/database/transaction-dao.ts](file:///home/lalit/Documents/Clarity/src/services/database/transaction-dao.ts).
- **Backup**: Include receipt image path references in backup metadata.

### UI Integration
- **Transaction Entry**: In [src/app/(app)/add-transaction.tsx](file:///home/lalit/Documents/Clarity/src/app/(app)/add-transaction.tsx):
  - Thumbnail preview of attached receipt with remove button.
  - Option to retain photo taken during OCR receipt scan.
  - Image picker button to attach existing photo from gallery.
- **Transaction Details / History**: Fullscreen modal to view, zoom, and share the receipt image.

### Implementation Checklist
- [x] Add `receipt_uri` migration to `transactions` table in `migrations.ts`.
- [x] Implement file storage helper in [src/services/storage/receipt-storage.ts](file:///home/lalit/Documents/Clarity/src/services/storage/receipt-storage.ts).
- [x] Update [src/app/(app)/add-transaction.tsx](file:///home/lalit/Documents/Clarity/src/app/(app)/add-transaction.tsx) to attach images via document picker and retain images from AI receipt scanner.
- [x] Add fullscreen zoomable receipt photo viewer modal.
- [x] Add visual receipt indicator badge on transaction feed items in [src/app/(app)/(tabs)/transactions.tsx](file:///home/lalit/Documents/Clarity/src/app/(app)/(tabs)/transactions.tsx).

---

## 5. Custom Cross-Category Tags

### Overview
Transactions currently support only one primary category (`Dining`, `Groceries`, `Travel`, etc.). Real-world spending frequently spans multiple categories across a single event or purpose (such as `#goa-trip`, `#tax-deductible`, `#work-reimbursement`, or `#renovation`). Cross-cutting tags enable users to group, track, and filter related expenses across categories.

### Database Schema Updates
Add tables in [src/services/database/migrations.ts](file:///home/lalit/Documents/Clarity/src/services/database/migrations.ts):

```sql
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transaction_tags (
  transaction_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (transaction_id, tag_id),
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_trans_tags_tag ON transaction_tags(tag_id);
```

### Data Access and State Management
- **DAO Layer**: Create [src/services/database/tag-dao.ts](file:///home/lalit/Documents/Clarity/src/services/database/tag-dao.ts):
  - `getAllTags(): Promise<Tag[]>`
  - `createTag(name: string, color?: string): Promise<Tag>`
  - `setTransactionTags(transactionId: string, tagIds: string[]): Promise<void>`
  - `getTagsForTransaction(transactionId: string): Promise<Tag[]>`
  - `getTransactionsByTag(tagId: string): Promise<Transaction[]>`
- **Hooks**: [src/hooks/use-tags.ts](file:///home/lalit/Documents/Clarity/src/hooks/use-tags.ts) for query and mutation invalidation.

### UI Integration
- **Transaction Creation**: Tag selector input with auto-completion and chip creation in [src/app/(app)/add-transaction.tsx](file:///home/lalit/Documents/Clarity/src/app/(app)/add-transaction.tsx).
- **Activity Feed**: Display tag chips in transaction list items in [src/app/(app)/(tabs)/transactions.tsx](file:///home/lalit/Documents/Clarity/src/app/(app)/(tabs)/transactions.tsx).
- **Filters**: Add horizontal tag filter carousel in the Activity tab.
- **Analytics**: Add tag aggregation section in [src/app/(app)/analytics.tsx](file:///home/lalit/Documents/Clarity/src/app/(app)/analytics.tsx) to inspect total spend per tag.

### Implementation Checklist
- [x] Add `tags` and `transaction_tags` migrations.
- [x] Create `tag-dao.ts` and unit tests.
- [x] Implement `use-tags.ts` hook layer.
- [x] Add tag chip selector to transaction add/edit forms.
- [x] Add tag filtering to transaction list and analytics.

---

## 6. Multi-Select and Bulk Transaction Operations

### Overview
In [src/app/(app)/(tabs)/transactions.tsx](file:///home/lalit/Documents/Clarity/src/app/(app)/(tabs)/transactions.tsx), transactions can only be managed individually. Managing imported statements or reorganizing expense logs requires multi-selection for bulk operations: deleting records, re-assigning categories, moving accounts, and marking entries as reviewed.

### Architectural Blueprint
- **Selection State**: Controlled selection mode in `transactions.tsx`:
  - `isSelectionMode: boolean`
  - `selectedIds: Set<string>`
  - Triggered by long-press on any transaction card or tapping a "Select" button in the header.
- **Batch Processing**: In [src/services/database/transaction-dao.ts](file:///home/lalit/Documents/Clarity/src/services/database/transaction-dao.ts), wrap bulk actions inside SQLite transactions:
  - `bulkDeleteTransactions(ids: string[]): Promise<void>`
  - `bulkUpdateCategory(ids: string[], categoryId: string): Promise<void>`
  - `bulkUpdateAccount(ids: string[], accountId: string): Promise<void>`
- **Performance**: Invalidate TanStack Query caches once for the entire batch rather than per item.

### UI Integration
- **Header**: Transitions to show selection count (for example, "5 Selected") with a "Select All" toggle and a "Cancel" action.
- **Floating Bottom Action Bar**: An animated bottom drawer containing:
  - Delete Selected (with destructive confirmation dialog).
  - Change Category (bottom sheet category picker).
  - Move to Account (bottom sheet account picker).
- **List Items**: Show checkbox / circular radio selection indicator when selection mode is active.

### Implementation Checklist
- [x] Implement bulk DAO functions inside `transaction-dao.ts` (`bulkDeleteTransactions`, `bulkUpdateCategory`, `bulkUpdateAccount`).
- [x] Add selection state, select all, and long-press handler to `transactions.tsx`.
- [x] Create floating bottom action bar component with Delete, Category, and Account actions.
- [x] Implement category and account reassignment sheet modals for bulk updates.
- [x] Add atomic TanStack Query invalidation and batch undo support.

---

## 7. Scheduled Background Auto-Backup

### Overview
Clarity supports encrypted Google Drive backups in [src/services/cloud/google-drive-service.ts](file:///home/lalit/Documents/Clarity/src/services/cloud/google-drive-service.ts) and [src/services/database/backup-restore-service.ts](file:///home/lalit/Documents/Clarity/src/services/database/backup-restore-service.ts). However, backups currently depend on manual triggers. A scheduled headless background task ensures encrypted snapshots are regularly uploaded so users never face data loss.

### Architectural Blueprint
- **Background Execution**: Use `expo-task-manager` and `expo-background-fetch` (or Android WorkManager via custom module).
- **Execution Strategy**:
  - Run once daily during low-activity hours (such as 02:00 AM).
  - Verify conditions: device connected to Wi-Fi (unmetered network), battery level above 20%, and user authenticated with Google Drive.
  - Export encrypted SQLite database snapshot using AES-256-GCM ([src/services/cloud/backup-crypto.ts](file:///home/lalit/Documents/Clarity/src/services/cloud/backup-crypto.ts)).
  - Upload file silently to Google Drive AppData folder (`clarity_backup_auto.enc`).
  - Store last successful backup timestamp in MMKV storage.
- **Error Resilience**: If backup fails due to network outage, retry with exponential backoff on next opportunistic background window.

### UI Integration
- **Settings**: In Settings screen, provide:
  - Toggle: "Automatic Daily Backup".
  - Toggle: "Only on Wi-Fi".
  - Label: "Last auto-backup: Today at 2:14 AM".
  - Error indicator if Google Drive token has expired, with one-tap reauthorization.

### Implementation Checklist
- [x] Register headless background scheduler and opportunistic daily triggers.
- [x] Configure daily minimum interval check (24h elapsed).
- [x] Implement network precondition checks (online check & Wi-Fi only option).
- [x] Integrate background backup runner with `google-drive-service.ts`.
- [x] Update Settings UI with auto-backup preferences and timestamp display.

---

## 8. Undo Action Toast on Delete

### Overview
Currently, deleting a transaction, recurring rule, or bill executes immediately. Accidental taps can lead to unintended permanent data removal. Providing an interactive 4-second notification toast with an "Undo" action gives users immediate recovery without having to restore from cloud backups.

### Architectural Blueprint
- **Toast Enhancement**: Update [src/components/ui/Toast.tsx](file:///home/lalit/Documents/Clarity/src/components/ui/Toast.tsx) and its store/provider to support interactive action buttons:
  ```typescript
  interface ToastOptions {
    message: string;
    type?: 'info' | 'success' | 'error';
    duration?: number;
    action?: {
      label: string;
      onPress: () => void;
    };
  }
  ```
- **Recovery Strategy**:
  - Keep the deleted entity payload in memory for 4 seconds upon deletion.
  - If "Undo" is pressed: re-insert the exact entity with its original ID, timestamps, and account balance reconciliation.
  - If 4 seconds elapse without undo: finalize deletion and cleanup secondary resources (such as receipt images).

### UI Integration
- Bottom-positioned snackbar showing "Transaction deleted" along with a high-contrast "UNDO" action button.
- Progress bar or timed auto-dismiss animation indicating the remaining window to reverse the action.

### Implementation Checklist
- [x] Extend `Toast.tsx` component and hook to support action buttons (`ToastAction`).
- [x] Update transaction deletion in `add-transaction.tsx` to provide undo restoration callback with 4.5s interactive window.
- [x] Support undo in bulk delete operations on `transactions.tsx`.
- [x] Test rapid deletion sequences and queue handling.

---

## 9. Haptic Feedback Integration

### Overview
Tactile feedback elevates the perceived quality, responsiveness, and trust of a financial application. Implementing deliberate, subtle haptic patterns confirms key operations such as transaction logging, speech recognition start/stop, card swipes, and bill settlements.

### Architectural Blueprint
- **Utility Wrapper**: Create [src/utils/haptics.ts](file:///home/lalit/Documents/Clarity/src/utils/haptics.ts) providing tactile feedback patterns:
  - `selection()`: Checkbox and item selection clicks.
  - `light()`: Tab switching and filter adjustments.
  - `medium()`: Long-press activation and modal openings.
  - `heavy()`: Pull-to-refresh and major view switches.
  - `success()`: Transaction recorded and bill paid.
  - `warning()`: Deletion confirmation and threshold alerts.
  - `error()`: Form submission or network failure.

### Implementation Checklist
- [x] Create [src/utils/haptics.ts](file:///home/lalit/Documents/Clarity/src/utils/haptics.ts) wrapper with native vibration patterns.
- [x] Wire haptic calls into transaction selection, bulk actions, and delete warning confirmations.

---

## 10. Android Home Screen Quick Widget

### Overview
Opening the full app, passing biometric authentication, and navigating to forms introduces friction for quick, on-the-go financial entries. An Android App Widget and Quick Settings Tile provide instantaneous access to critical balances and one-tap voice transaction entry directly from the phone's home screen.

### Architectural Blueprint
- **Widget Technology**: Android Glance App Widget or `react-native-android-widget` native provider.
- **Glance Data Set**:
  - Total Net Worth / Available Balance.
  - Today's Total Spend.
  - Active Budget Remaining for Current Month.
- **Quick Action Triggers**:
  - Tap Microphone icon: Deep link to `clarity://voice-add` (launches app directly into [src/components/modals/VoiceTransactionModal.tsx](file:///home/lalit/Documents/Clarity/src/components/modals/VoiceTransactionModal.tsx)).
  - Tap Plus icon: Deep link to `clarity://add-transaction`.
- **Data Synchronization**:
  - Maintain an Android `SharedPreferences` cache updated on transaction changes via [src/services/database/transaction-dao.ts](file:///home/lalit/Documents/Clarity/src/services/database/transaction-dao.ts).
  - Enables the widget to render instantly without spinning up the React Native JavaScript runtime.

### UI Integration
- 4x1 Minimalist Balance & Quick Add Bar.
- 4x2 Detailed Balance, Recent 3 Transactions, and Voice Add Launcher.
- Matches Clarity's centralized dark and light typography and neutral color palette.

### Implementation Checklist
- [x] Configure Android shortcuts provider in `android/app/src/main/res/xml/shortcuts.xml` and `AndroidManifest.xml`.
- [x] Set up deep linking routes in `src/app/` for `clarity://voice-add` and `clarity://add-transaction`.
- [x] Implement instant voice launcher route in `src/app/(app)/voice-add.tsx` with direct save and apply flows.
- [x] Implement widget and quick actions adhering to the app design system and haptics.

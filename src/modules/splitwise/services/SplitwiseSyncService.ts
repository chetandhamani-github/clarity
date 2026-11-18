/**
 * ============================================================================
 * Splitwise Cloud Sync Service Architecture
 * ============================================================================
 * Prepares cloud backup and synchronization interfaces for Google Drive
 * and Clarity backend integration without breaking local SQLite operations.
 */

import { DeviceEventEmitter } from 'react-native';
import { getDatabase } from '@/services/database';
import { syncSplitwiseData } from '@/services/api/splitwise.api';
import { mmkv } from '@/lib/storage';
import type {
  ISplitwiseCloudSyncService,
  SplitwiseSyncMetadata,
  SplitwiseSyncPayload,
  SplitwiseSyncResult,
} from '../types/splitwise.types';
import {
  SplitwiseRepository,
  getDeletedRecords,
  removeConfirmedDeletedRecords,
} from '../database/splitwise.repository';

const SPLITWISE_LAST_SYNCED_KEY = 'clarity_splitwise_last_synced_at';

export class SplitwiseSyncService implements ISplitwiseCloudSyncService {
  private static instance: SplitwiseSyncService;

  public static getInstance(): SplitwiseSyncService {
    if (!SplitwiseSyncService.instance) {
      SplitwiseSyncService.instance = new SplitwiseSyncService();
    }
    return SplitwiseSyncService.instance;
  }

  /**
   * Retrieves current sync state metadata.
   */
  public async getSyncMetadata(): Promise<SplitwiseSyncMetadata> {
    await SplitwiseRepository.ensureSchema();
    const lastSyncedAt = mmkv.getString(SPLITWISE_LAST_SYNCED_KEY) ?? undefined;

    return {
      syncInProgress: false,
      pendingChangesCount: 0,
      clientVersion: 1,
      deviceId: 'local-device',
      lastSyncedAt,
    };
  }

  /**
   * Exports full Splitwise dataset into a portable JSON sync payload.
   */
  public async exportPayload(): Promise<SplitwiseSyncPayload> {
    await SplitwiseRepository.ensureSchema();
    const [people, debts, settlements, groups, expenses] = await Promise.all([
      SplitwiseRepository.getAllPeople(),
      SplitwiseRepository.getAllDebts(),
      SplitwiseRepository.getAllSettlements(),
      SplitwiseRepository.getAllGroups(true),
      SplitwiseRepository.getAllExpenses(),
    ]);

    const allSplits = expenses.flatMap((e) => e.splits);

    return {
      people,
      debts,
      settlements,
      groups,
      groupMembers: groups.flatMap((g) => g.members || []),
      expenses,
      expenseSplits: allSplits,
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
    };
  }

  /**
   * Imports a cloud sync payload and applies records to SQLite.
   */
  public async importPayload(payload: SplitwiseSyncPayload): Promise<SplitwiseSyncResult> {
    await SplitwiseRepository.ensureSchema();
    const db = getDatabase();

    try {
      await db.withTransactionAsync(async () => {
        // Upsert people
        for (const p of payload.people || []) {
          await db.runAsync(
            `INSERT INTO splitwise_people (id, name, email, phone, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               email = excluded.email,
               phone = excluded.phone,
               notes = excluded.notes;`,
            [p.id, p.name, p.email ?? null, p.phone ?? null, p.notes ?? null, p.createdAt]
          );
        }

        // Upsert debts
        for (const d of payload.debts || []) {
          await db.runAsync(
            `INSERT INTO splitwise_debts (id, person_id, amount, type, description, friend_email, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               amount = excluded.amount,
               type = excluded.type,
               description = excluded.description,
               friend_email = excluded.friend_email;`,
            [d.id, d.personId, d.amount, d.type, d.description, d.friendEmail ?? null, d.createdAt]
          );
        }

        // Upsert settlements
        for (const s of payload.settlements || []) {
          await db.runAsync(
            `INSERT INTO splitwise_settlements (id, person_id, amount, description, settlement_type, friend_email, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               amount = excluded.amount,
               description = excluded.description,
               settlement_type = excluded.settlement_type,
               friend_email = excluded.friend_email;`,
            [s.id, s.personId, s.amount, s.description ?? null, s.settlementType || 'THEY_PAID', s.friendEmail ?? null, s.createdAt]
          );
        }

        // Upsert groups
        for (const g of payload.groups || []) {
          await db.runAsync(
            `INSERT INTO splitwise_groups (id, name, description, icon, category, currency, is_archived, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               description = excluded.description,
               icon = excluded.icon,
               category = excluded.category,
               currency = excluded.currency,
               is_archived = excluded.is_archived,
               updated_at = excluded.updated_at;`,
            [
              g.id,
              g.name,
              g.description ?? null,
              g.icon ?? null,
              g.category ?? null,
              g.currency || 'INR',
              g.isArchived ? 1 : 0,
              g.createdAt,
              g.updatedAt ?? g.createdAt,
            ]
          );
        }

        // Upsert group members
        for (const gm of payload.groupMembers || []) {
          await db.runAsync(
            `INSERT INTO splitwise_group_members (id, group_id, person_id, role, joined_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(group_id, person_id) DO UPDATE SET
               role = excluded.role;`,
            [gm.id || `${gm.groupId}_${gm.personId}`, gm.groupId, gm.personId, gm.role || 'member', gm.joinedAt]
          );
        }

        // Upsert expenses
        for (const e of payload.expenses || []) {
          await db.runAsync(
            `INSERT INTO splitwise_expenses (id, description, amount, currency, category, date, payer_id, group_id, split_type, notes, receipt_url, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               description = excluded.description,
               amount = excluded.amount,
               category = excluded.category,
               date = excluded.date,
               payer_id = excluded.payer_id,
               group_id = excluded.group_id,
               split_type = excluded.split_type,
               notes = excluded.notes,
               updated_at = excluded.updated_at;`,
            [
              e.id,
              e.description,
              e.amount,
              e.currency || 'INR',
              e.category ?? null,
              e.date,
              e.payerId,
              e.groupId ?? null,
              e.splitType,
              e.notes ?? null,
              e.receiptUrl ?? null,
              e.createdAt,
              e.updatedAt ?? e.createdAt,
            ]
          );
        }

        // Upsert expense splits
        for (const es of payload.expenseSplits || []) {
          await db.runAsync(
            `INSERT INTO splitwise_expense_splits (id, expense_id, person_id, paid_amount, owed_amount, percentage, shares, is_paid, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               paid_amount = excluded.paid_amount,
               owed_amount = excluded.owed_amount,
               percentage = excluded.percentage,
               shares = excluded.shares,
               is_paid = excluded.is_paid;`,
            [
              es.id || `${es.expenseId || ''}_${es.personId || ''}`,
              es.expenseId ?? null,
              es.personId ?? null,
              es.paidAmount || 0,
              es.owedAmount || 0,
              es.percentage ?? null,
              es.shares ?? null,
              es.isPaid ? 1 : 0,
              es.createdAt || new Date().toISOString(),
            ]
          );
        }
      });

      return {
        success: true,
        syncedAt: new Date().toISOString(),
        appliedCount: {
          people: payload.people?.length || 0,
          debts: payload.debts?.length || 0,
          settlements: payload.settlements?.length || 0,
          groups: payload.groups?.length || 0,
          expenses: payload.expenses?.length || 0,
        },
        conflictsCount: 0,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Import failed';
      return {
        success: false,
        syncedAt: new Date().toISOString(),
        appliedCount: { people: 0, debts: 0, settlements: 0, groups: 0, expenses: 0 },
        conflictsCount: 0,
        error: message,
      };
    }
  }

  /**
   * Synchronizes local SQLite database with Clarity Spring Boot backend.
   */
  public async syncWithCloud(): Promise<SplitwiseSyncResult> {
    try {
      await SplitwiseRepository.ensureSchema();
      const lastSyncedAt = mmkv.getString(SPLITWISE_LAST_SYNCED_KEY) ?? null;
      const localData = await this.exportPayload();

      // Retrieve locally queued deletions to propagate to cloud
      const deletedRecords = getDeletedRecords();
      const deletedPeople = deletedRecords.filter((r) => r.type === 'person');
      const deletedDebts = deletedRecords.filter((r) => r.type === 'debt');
      const deletedSettlements = deletedRecords.filter((r) => r.type === 'settlement');

      // 1. Send local records & delta request to Spring Boot backend
      const response = await syncSplitwiseData({
        lastSyncedAt,
        people: [
          ...localData.people.map((p) => ({
            id: p.id,
            name: p.name,
            email: p.email,
            phone: p.phone,
            notes: p.notes,
            avatarUrl: p.avatarUrl,
            isDeleted: false,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt ?? p.createdAt,
          })),
          ...deletedPeople.map((p) => ({
            id: p.id,
            isDeleted: true,
            updatedAt: p.deletedAt,
          })),
        ],
        debts: [
          ...localData.debts.map((d) => ({
            id: d.id,
            personId: d.personId,
            friendEmail: d.friendEmail,
            amount: d.amount,
            type: d.type,
            description: d.description,
            isDeleted: false,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt ?? d.createdAt,
          })),
          ...deletedDebts.map((d) => ({
            id: d.id,
            isDeleted: true,
            updatedAt: d.deletedAt,
          })),
        ],
        settlements: [
          ...localData.settlements.map((s) => ({
            id: s.id,
            personId: s.personId,
            friendEmail: s.friendEmail,
            amount: s.amount,
            settlementType: s.settlementType,
            description: s.description,
            isDeleted: false,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt ?? s.createdAt,
          })),
          ...deletedSettlements.map((s) => ({
            id: s.id,
            isDeleted: true,
            updatedAt: s.deletedAt,
          })),
        ],
      });

      // 2. Apply server delta updates to local SQLite
      const db = getDatabase();
      let serverAppliedCount = { people: 0, debts: 0, settlements: 0 };

      if (response && response.success) {
        await db.withTransactionAsync(async () => {
          // Upsert server people
          if (Array.isArray(response.people)) {
            for (const p of response.people) {
              if (p.isDeleted) {
                await db.runAsync('DELETE FROM splitwise_debts WHERE person_id = ?', [p.id]);
                await db.runAsync('DELETE FROM splitwise_settlements WHERE person_id = ?', [p.id]);
                await db.runAsync('DELETE FROM splitwise_people WHERE id = ?', [p.id]);
              } else {
                await db.runAsync(
                  `INSERT INTO splitwise_people (id, name, email, phone, notes, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     name = excluded.name,
                     email = excluded.email,
                     phone = excluded.phone,
                     notes = excluded.notes;`,
                  [p.id, p.name, p.email ?? null, p.phone ?? null, p.notes ?? null, p.createdAt || new Date().toISOString()]
                );
              }
              serverAppliedCount.people++;
            }
          }

          // Upsert server debts
          if (Array.isArray(response.debts)) {
            for (const d of response.debts) {
              if (d.isDeleted) {
                await db.runAsync('DELETE FROM splitwise_debts WHERE id = ?', [d.id]);
              } else {
                await db.runAsync(
                  `INSERT INTO splitwise_debts (id, person_id, amount, type, description, friend_email, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     amount = excluded.amount,
                     type = excluded.type,
                     description = excluded.description,
                     friend_email = excluded.friend_email;`,
                  [d.id, d.personId, d.amount, d.type, d.description, d.friendEmail ?? null, d.createdAt || new Date().toISOString()]
                );
              }
              serverAppliedCount.debts++;
            }
          }

          // Upsert server settlements
          if (Array.isArray(response.settlements)) {
            for (const s of response.settlements) {
              if (s.isDeleted) {
                await db.runAsync('DELETE FROM splitwise_settlements WHERE id = ?', [s.id]);
              } else {
                await db.runAsync(
                  `INSERT INTO splitwise_settlements (id, person_id, amount, description, settlement_type, friend_email, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     amount = excluded.amount,
                     description = excluded.description,
                     settlement_type = excluded.settlement_type,
                     friend_email = excluded.friend_email;`,
                  [s.id, s.personId, s.amount, s.description ?? null, s.settlementType || 'THEY_PAID', s.friendEmail ?? null, s.createdAt || new Date().toISOString()]
                );
              }
              serverAppliedCount.settlements++;
            }
          }
        });

        // 3. Clear confirmed deleted records from local deletion tracker
        if (Array.isArray(response.confirmedIds) && response.confirmedIds.length > 0) {
          removeConfirmedDeletedRecords(response.confirmedIds);
        }

        // 4. Update last synced timestamp
        if (response.syncedAt) {
          mmkv.set(SPLITWISE_LAST_SYNCED_KEY, response.syncedAt);
        }

        // 5. Notify all UI listeners to refresh
        DeviceEventEmitter.emit('splitwiseUpdated');

        return {
          success: true,
          syncedAt: response.syncedAt,
          appliedCount: {
            people: serverAppliedCount.people,
            debts: serverAppliedCount.debts,
            settlements: serverAppliedCount.settlements,
            groups: 0,
            expenses: 0,
          },
          conflictsCount: 0,
        };
      }

      return {
        success: false,
        syncedAt: new Date().toISOString(),
        appliedCount: { people: 0, debts: 0, settlements: 0, groups: 0, expenses: 0 },
        conflictsCount: 0,
        error: 'Backend returned unsuccessful sync response',
      };
    } catch (error: unknown) {
      return {
        success: false,
        syncedAt: new Date().toISOString(),
        appliedCount: { people: 0, debts: 0, settlements: 0, groups: 0, expenses: 0 },
        conflictsCount: 0,
        error: error instanceof Error ? error.message : 'Sync network failure',
      };
    }
  }
}


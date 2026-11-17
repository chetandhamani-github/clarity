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
    const [people, debts, settlements] = await Promise.all([
      SplitwiseRepository.getAllPeople(),
      SplitwiseRepository.getAllDebts(),
      SplitwiseRepository.getAllSettlements(),
    ]);

    return {
      people,
      debts,
      settlements,
      groups: [],
      groupMembers: [],
      expenses: [],
      expenseSplits: [],
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
            `INSERT INTO splitwise_people (id, name, phone, notes, created_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               phone = excluded.phone,
               notes = excluded.notes;`,
            [p.id, p.name, p.phone ?? null, p.notes ?? null, p.createdAt]
          );
        }

        // Upsert debts
        for (const d of payload.debts || []) {
          await db.runAsync(
            `INSERT INTO splitwise_debts (id, person_id, amount, type, description, created_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               amount = excluded.amount,
               type = excluded.type,
               description = excluded.description;`,
            [d.id, d.personId, d.amount, d.type, d.description, d.createdAt]
          );
        }

        // Upsert settlements
        for (const s of payload.settlements || []) {
          await db.runAsync(
            `INSERT INTO splitwise_settlements (id, person_id, amount, description, settlement_type, created_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               amount = excluded.amount,
               description = excluded.description,
               settlement_type = excluded.settlement_type;`,
            [s.id, s.personId, s.amount, s.description ?? null, s.settlementType || 'THEY_PAID', s.createdAt]
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
          groups: 0,
          expenses: 0,
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
                  `INSERT INTO splitwise_people (id, name, phone, notes, created_at)
                   VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     name = excluded.name,
                     phone = excluded.phone,
                     notes = excluded.notes;`,
                  [p.id, p.name, p.phone ?? null, p.notes ?? null, p.createdAt || new Date().toISOString()]
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
                  `INSERT INTO splitwise_debts (id, person_id, amount, type, description, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     amount = excluded.amount,
                     type = excluded.type,
                     description = excluded.description;`,
                  [d.id, d.personId, d.amount, d.type, d.description, d.createdAt || new Date().toISOString()]
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
                  `INSERT INTO splitwise_settlements (id, person_id, amount, description, settlement_type, created_at)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     amount = excluded.amount,
                     description = excluded.description,
                     settlement_type = excluded.settlement_type;`,
                  [s.id, s.personId, s.amount, s.description ?? null, s.settlementType || 'THEY_PAID', s.createdAt || new Date().toISOString()]
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


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
import type { SplitSyncGroupMemberDTO } from '@/services/api/types';
import { useAuthStore } from '@/store/use-auth-store';
import { mmkv } from '@/lib/storage';
import {
  CURRENT_USER_ID,
  type ISplitwiseCloudSyncService,
  type SplitwiseSyncMetadata,
  type SplitwiseSyncPayload,
  type SplitwiseSyncResult,
} from '../types/splitwise.types';
import {
  SplitwiseRepository,
  getDeletedRecords,
  removeConfirmedDeletedRecords,
} from '../database/splitwise.repository';

const SPLITWISE_LAST_SYNCED_KEY = 'clarity_splitwise_last_synced_at';

export class SplitwiseSyncService implements ISplitwiseCloudSyncService {
  private static instance: SplitwiseSyncService;
  private syncInFlightPromise: Promise<SplitwiseSyncResult> | null = null;

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
    if (this.syncInFlightPromise) {
      return this.syncInFlightPromise;
    }
    this.syncInFlightPromise = this.performCloudSync().finally(() => {
      this.syncInFlightPromise = null;
    });
    return this.syncInFlightPromise;
  }

  private async performCloudSync(): Promise<SplitwiseSyncResult> {
    try {
      await SplitwiseRepository.ensureSchema();
      const lastSyncedAt = mmkv.getString(SPLITWISE_LAST_SYNCED_KEY) ?? null;
      const localData = await this.exportPayload();
      const authUser = useAuthStore.getState().user;
      const myEmail = authUser?.email?.trim().toLowerCase() || undefined;
      const myName = authUser?.name?.trim() || undefined;
      const peopleById = new Map(localData.people.map((p) => [p.id, p]));
      const resolvePersonMeta = (personId: string): { email?: string; name?: string } => {
        if (personId === CURRENT_USER_ID) {
          return { email: myEmail, name: myName };
        }
        const person = peopleById.get(personId);
        return {
          email: person?.email?.trim().toLowerCase() || undefined,
          name: person?.name?.trim() || undefined,
        };
      };

      // Retrieve locally queued deletions to propagate to cloud
      const deletedRecords = getDeletedRecords();
      const deletedPeople = deletedRecords.filter((r) => r.type === 'person');
      const deletedDebts = deletedRecords.filter((r) => r.type === 'debt');
      const deletedSettlements = deletedRecords.filter((r) => r.type === 'settlement');
      const deletedGroups = deletedRecords.filter((r) => r.type === 'group');
      const deletedExpenses = deletedRecords.filter((r) => r.type === 'expense');

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
            friendEmail: s.friendEmail ?? resolvePersonMeta(s.personId).email,
            groupId: s.groupId,
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
        groups: [
          ...localData.groups.map((g) => ({
            id: g.id,
            name: g.name,
            description: g.description,
            icon: g.icon,
            category: g.category,
            currency: g.currency || 'INR',
            memberIds: (g.members || []).map((m) => m.personId),
            members: (g.members || []).map((m) => {
              const meta = resolvePersonMeta(m.personId);
              return {
                personId: m.personId,
                email: meta.email,
                name: meta.name,
                role: m.role,
              };
            }),
            isArchived: g.isArchived,
            isDeleted: false,
            createdAt: g.createdAt,
            updatedAt: g.updatedAt ?? g.createdAt,
          })),
          ...deletedGroups.map((g) => ({
            id: g.id,
            isDeleted: true,
            updatedAt: g.deletedAt,
          })),
        ],
        expenses: [
          ...localData.expenses.map((e) => {
            const payerMeta = resolvePersonMeta(e.payerId);
            return {
              id: e.id,
              groupId: e.groupId,
              payerId: e.payerId,
              payerEmail: payerMeta.email,
              payerName: payerMeta.name,
              description: e.description,
              amount: e.amount,
              currency: e.currency || 'INR',
              category: e.category,
              date: e.date,
              splitType: e.splitType,
              notes: e.notes,
              receiptUrl: e.receiptUrl,
              splits: (e.splits || []).map((sp) => {
                const splitMeta = resolvePersonMeta(sp.personId);
                return {
                  id: sp.id,
                  expenseId: sp.expenseId,
                  personId: sp.personId,
                  personEmail: splitMeta.email,
                  personName: splitMeta.name,
                  paidAmount: sp.paidAmount,
                  owedAmount: sp.owedAmount,
                  percentage: sp.percentage,
                  shares: sp.shares,
                  isPaid: sp.isPaid,
                  createdAt: sp.createdAt,
                };
              }),
              isDeleted: false,
              createdAt: e.createdAt,
              updatedAt: e.updatedAt ?? e.createdAt,
            };
          }),
          ...deletedExpenses.map((e) => ({
            id: e.id,
            isDeleted: true,
            updatedAt: e.deletedAt,
          })),
        ],
      });

      // 2. Apply server delta updates to local SQLite
      const db = getDatabase();
      const serverAppliedCount = { people: 0, debts: 0, settlements: 0, groups: 0, expenses: 0 };

      if (response && response.success) {
        const resolvedPersonCache = new Map<string, string>();
        const resolveLocalPersonId = async (
          remotePersonId: string | undefined,
          email?: string,
          name?: string,
          createdAt?: string
        ): Promise<string> => {
          const normEmail = email?.trim().toLowerCase() || undefined;
          if (!remotePersonId || remotePersonId === CURRENT_USER_ID) {
            return CURRENT_USER_ID;
          }
          if (normEmail && myEmail && normEmail === myEmail) {
            return CURRENT_USER_ID;
          }

          const cacheKey = `${remotePersonId}|${normEmail || ''}`;
          const cached = resolvedPersonCache.get(cacheKey);
          if (cached) return cached;

          if (normEmail) {
            const existingByEmail = await db.getFirstAsync<{ id: string }>(
              'SELECT id FROM splitwise_people WHERE LOWER(email) = ? AND id != ?',
              [normEmail, CURRENT_USER_ID]
            );
            if (existingByEmail?.id) {
              resolvedPersonCache.set(cacheKey, existingByEmail.id);
              return existingByEmail.id;
            }
          }

          const existingById = await db.getFirstAsync<{ id: string; email: string | null }>(
            'SELECT id, email FROM splitwise_people WHERE id = ?',
            [remotePersonId]
          );
          if (existingById) {
            if (!normEmail || !existingById.email || existingById.email.toLowerCase() === normEmail) {
              if (normEmail && !existingById.email) {
                await db.runAsync('UPDATE splitwise_people SET email = ? WHERE id = ?', [
                  normEmail,
                  existingById.id,
                ]);
              }
              resolvedPersonCache.set(cacheKey, existingById.id);
              return existingById.id;
            }
          }

          const canReuseId = !existingById && !remotePersonId.startsWith('user_inst_');
          const newId = canReuseId
            ? remotePersonId
            : `p_shared_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const displayName =
            name?.trim() || (normEmail ? normEmail.split('@')[0] : 'Member');
          await db.runAsync(
            `INSERT INTO splitwise_people (id, name, email, created_at)
             VALUES (?, ?, ?, ?)`,
            [newId, displayName, normEmail ?? null, createdAt || new Date().toISOString()]
          );
          resolvedPersonCache.set(cacheKey, newId);
          return newId;
        };

        await db.withTransactionAsync(async () => {
          // Upsert server people
          if (Array.isArray(response.people)) {
            for (const p of response.people) {
              if (p.isDeleted) {
                await db.runAsync('DELETE FROM splitwise_group_members WHERE person_id = ?', [p.id]);
                await db.runAsync('DELETE FROM splitwise_expense_splits WHERE person_id = ?', [p.id]);
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
                const localPersonId = await resolveLocalPersonId(
                  d.personId,
                  d.friendEmail ?? undefined,
                  undefined,
                  d.createdAt
                );
                await db.runAsync(
                  `INSERT INTO splitwise_debts (id, person_id, amount, type, description, friend_email, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     person_id = excluded.person_id,
                     amount = excluded.amount,
                     type = excluded.type,
                     description = excluded.description,
                     friend_email = excluded.friend_email;`,
                  [d.id, localPersonId, d.amount, d.type, d.description, d.friendEmail ?? null, d.createdAt || new Date().toISOString()]
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
                const localPersonId = await resolveLocalPersonId(
                  s.personId,
                  s.friendEmail,
                  undefined,
                  s.createdAt
                );
                await db.runAsync(
                  `INSERT INTO splitwise_settlements (id, person_id, amount, description, settlement_type, friend_email, group_id, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     person_id = excluded.person_id,
                     amount = excluded.amount,
                     description = excluded.description,
                     settlement_type = excluded.settlement_type,
                     friend_email = excluded.friend_email,
                     group_id = excluded.group_id;`,
                  [
                    s.id,
                    localPersonId,
                    s.amount,
                    s.description ?? null,
                    s.settlementType || 'THEY_PAID',
                    s.friendEmail ?? null,
                    s.groupId ?? null,
                    s.createdAt || new Date().toISOString(),
                  ]
                );
              }
              serverAppliedCount.settlements++;
            }
          }

          // Upsert server groups
          if (Array.isArray(response.groups)) {
            for (const g of response.groups) {
              if (g.isDeleted) {
                await db.runAsync(
                  `DELETE FROM splitwise_expense_splits
                   WHERE expense_id IN (SELECT id FROM splitwise_expenses WHERE group_id = ?)`,
                  [g.id]
                );
                await db.runAsync('DELETE FROM splitwise_expenses WHERE group_id = ?', [g.id]);
                await db.runAsync('DELETE FROM splitwise_group_members WHERE group_id = ?', [g.id]);
                await db.runAsync('DELETE FROM splitwise_groups WHERE id = ?', [g.id]);
              } else {
                const nowIso = new Date().toISOString();
                await db.runAsync(
                  `INSERT INTO splitwise_groups (id, name, description, icon, category, currency, is_archived, sync_status, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     name = excluded.name,
                     description = excluded.description,
                     icon = excluded.icon,
                     category = excluded.category,
                     currency = excluded.currency,
                     is_archived = excluded.is_archived,
                     sync_status = 'SYNCED',
                     updated_at = excluded.updated_at;`,
                  [
                    g.id,
                    g.name ?? 'Group',
                    g.description ?? null,
                    g.icon ?? null,
                    g.category ?? null,
                    g.currency || 'INR',
                    g.isArchived ? 1 : 0,
                    g.createdAt || nowIso,
                    g.updatedAt || g.createdAt || nowIso,
                  ]
                );
                const incomingMembers: SplitSyncGroupMemberDTO[] =
                  Array.isArray(g.members) && g.members.length > 0
                    ? g.members
                    : Array.isArray(g.memberIds)
                      ? g.memberIds.map((pid) => ({ personId: pid, role: 'member' }))
                      : [];
                if (incomingMembers.length > 0) {
                  await db.runAsync('DELETE FROM splitwise_group_members WHERE group_id = ?', [g.id]);
                  const seenMemberIds = new Set<string>();
                  for (const m of incomingMembers) {
                    const localMemberId = await resolveLocalPersonId(
                      m.personId,
                      m.email,
                      m.name,
                      g.createdAt || nowIso
                    );
                    if (seenMemberIds.has(localMemberId)) continue;
                    seenMemberIds.add(localMemberId);
                    await db.runAsync(
                      `INSERT INTO splitwise_group_members (id, group_id, person_id, role, joined_at, sync_status)
                       VALUES (?, ?, ?, ?, ?, 'SYNCED');`,
                      [
                        `${g.id}_${localMemberId}`,
                        g.id,
                        localMemberId,
                        m.role || (localMemberId === CURRENT_USER_ID ? 'admin' : 'member'),
                        g.createdAt || nowIso,
                      ]
                    );
                  }
                }
              }
              serverAppliedCount.groups++;
            }
          }

          // Upsert server expenses
          if (Array.isArray(response.expenses)) {
            for (const e of response.expenses) {
              if (e.isDeleted) {
                await db.runAsync('DELETE FROM splitwise_expense_splits WHERE expense_id = ?', [e.id]);
                await db.runAsync('DELETE FROM splitwise_expenses WHERE id = ?', [e.id]);
              } else {
                const nowIso = new Date().toISOString();
                const localPayerId = await resolveLocalPersonId(
                  e.payerId,
                  e.payerEmail,
                  e.payerName,
                  e.createdAt || nowIso
                );
                await db.runAsync(
                  `INSERT INTO splitwise_expenses (id, description, amount, currency, category, date, payer_id, group_id, split_type, notes, receipt_url, sync_status, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SYNCED', ?, ?)
                   ON CONFLICT(id) DO UPDATE SET
                     description = excluded.description,
                     amount = excluded.amount,
                     currency = excluded.currency,
                     category = excluded.category,
                     date = excluded.date,
                     payer_id = excluded.payer_id,
                     group_id = excluded.group_id,
                     split_type = excluded.split_type,
                     notes = excluded.notes,
                     receipt_url = excluded.receipt_url,
                     sync_status = 'SYNCED',
                     updated_at = excluded.updated_at;`,
                  [
                    e.id,
                    e.description ?? 'Expense',
                    e.amount ?? 0,
                    e.currency || 'INR',
                    e.category ?? null,
                    e.date || e.createdAt || nowIso,
                    localPayerId,
                    e.groupId ?? null,
                    e.splitType || 'EQUAL',
                    e.notes ?? null,
                    e.receiptUrl ?? null,
                    e.createdAt || nowIso,
                    e.updatedAt || e.createdAt || nowIso,
                  ]
                );
                if (Array.isArray(e.splits)) {
                  await db.runAsync('DELETE FROM splitwise_expense_splits WHERE expense_id = ?', [e.id]);
                  for (const sp of e.splits) {
                    const localSplitPersonId = await resolveLocalPersonId(
                      sp.personId,
                      sp.personEmail,
                      sp.personName,
                      sp.createdAt || e.createdAt || nowIso
                    );
                    await db.runAsync(
                      `INSERT INTO splitwise_expense_splits (id, expense_id, person_id, paid_amount, owed_amount, percentage, shares, is_paid, created_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                      [
                        sp.id || `${e.id}_${localSplitPersonId}`,
                        e.id,
                        localSplitPersonId,
                        sp.paidAmount ?? 0,
                        sp.owedAmount ?? 0,
                        sp.percentage ?? null,
                        sp.shares ?? null,
                        sp.isPaid ? 1 : 0,
                        sp.createdAt || e.createdAt || nowIso,
                      ]
                    );
                  }
                }
              }
              serverAppliedCount.expenses++;
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
            groups: serverAppliedCount.groups,
            expenses: serverAppliedCount.expenses,
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


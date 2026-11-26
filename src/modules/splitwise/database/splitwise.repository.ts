import { DeviceEventEmitter } from 'react-native';
import { getDatabase } from '@/services/database';
import { mmkv } from '@/lib/storage';
import { runSplitwiseMigrations } from './splitwise.migration';

const SPLITWISE_DELETED_RECORDS_KEY = 'clarity_splitwise_deleted_records';

export interface SplitwiseDeletedRecord {
  id: string;
  type: 'person' | 'debt' | 'settlement' | 'group' | 'expense';
  deletedAt: string;
}

export function getDeletedRecords(): SplitwiseDeletedRecord[] {
  try {
    const raw = mmkv.getString(SPLITWISE_DELETED_RECORDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function trackDeletedRecord(
  id: string,
  type: 'person' | 'debt' | 'settlement' | 'group' | 'expense'
): void {
  try {
    const current = getDeletedRecords();
    if (!current.some((r) => r.id === id)) {
      current.push({ id, type, deletedAt: new Date().toISOString() });
      mmkv.set(SPLITWISE_DELETED_RECORDS_KEY, JSON.stringify(current));
    }
  } catch {}
}

export function removeConfirmedDeletedRecords(confirmedIds: string[]): void {
  try {
    const current = getDeletedRecords();
    const remaining = current.filter((r) => !confirmedIds.includes(r.id));
    mmkv.set(SPLITWISE_DELETED_RECORDS_KEY, JSON.stringify(remaining));
  } catch {}
}
import { BalanceCalculator } from '../services/BalanceCalculator';
import {
  CURRENT_USER_ID,
  CURRENT_USER_NAME,
} from '../types/splitwise.types';
import type {
  SplitwisePerson,
  SplitwiseDebt,
  SplitwiseSettlement,
  CreatePersonDTO,
  UpdatePersonDTO,
  CreateDebtDTO,
  UpdateDebtDTO,
  CreateSettlementDTO,
  UpdateSettlementDTO,
  PersonBalanceSummary,
  GroupBalanceSummary,
  SplitwiseOverallSummary,
  SplitwiseActivityItem,
  Group,
  GroupMember,
  ExpenseSplit,
  ExpenseWithSplits,
  CreateGroupDTO,
  UpdateGroupDTO,
  CreateExpenseDTO,
  DebtType,
  SettlementType,
  SplitType,
  GroupRole,
} from '../types/splitwise.types';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r % 4) + 8;
    return v.toString(16);
  });
}

interface PersonRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

interface DebtRow {
  id: string;
  person_id: string;
  amount: number;
  type: string;
  description: string;
  friend_email: string | null;
  group_id?: string | null;
  created_at: string;
}

interface SettlementRow {
  id: string;
  person_id: string;
  amount: number;
  description: string | null;
  settlement_type: string | null;
  friend_email: string | null;
  group_id?: string | null;
  created_at: string;
}

interface PersonBalanceRow {
  person_id: string;
  person_name: string;
  person_email: string | null;
  person_phone: string | null;
  person_notes: string | null;
  person_created_at: string;
  total_owed_to_me: number | null;
  total_i_owe: number | null;
  total_settled_by_them: number | null;
  total_settled_by_you: number | null;
  total_settled: number | null;
}

function mapPersonRow(row: PersonRow): SplitwisePerson {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

function mapDebtRow(row: DebtRow): SplitwiseDebt {
  return {
    id: row.id,
    personId: row.person_id,
    amount: row.amount,
    type: row.type as DebtType,
    description: row.description,
    friendEmail: row.friend_email ?? undefined,
    groupId: row.group_id ?? undefined,
    createdAt: row.created_at,
  };
}

function mapSettlementRow(row: SettlementRow): SplitwiseSettlement {
  return {
    id: row.id,
    personId: row.person_id,
    amount: row.amount,
    description: row.description ?? undefined,
    settlementType: (row.settlement_type as SettlementType) || undefined,
    friendEmail: row.friend_email ?? undefined,
    groupId: row.group_id ?? undefined,
    createdAt: row.created_at,
  };
}

export class SplitwiseRepository {
  /**
   * Ensures Splitwise tables and indexes exist before database operations.
   */
  public static async ensureSchema(): Promise<void> {
    const db = getDatabase();
    await runSplitwiseMigrations(db);
    try {
      await db.runAsync(
        `INSERT OR IGNORE INTO splitwise_people (id, name, created_at)
         VALUES (?, ?, '2000-01-01T00:00:00.000Z')`,
        [CURRENT_USER_ID, CURRENT_USER_NAME]
      );
    } catch {}
  }

  // ==========================================
  // PEOPLE CRUD METHODS
  // ==========================================

  /**
   * Creates a new person record.
   */
  public static async createPerson(dto: CreatePersonDTO): Promise<SplitwisePerson> {
    await this.ensureSchema();
    const db = getDatabase();
    const id = generateId();
    const nowStr = new Date().toISOString();
    const name = dto.name.trim();
    const email = dto.email?.trim().toLowerCase() || null;
    const phone = dto.phone?.trim() || null;
    const notes = dto.notes?.trim() || null;

    if (!name) {
      throw new Error('Person name is required');
    }

    await db.runAsync(
      `INSERT INTO splitwise_people (id, name, email, phone, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, name, email, phone, notes, nowStr]
    );

    DeviceEventEmitter.emit('splitwiseUpdated');

    return {
      id,
      name,
      email: email ?? undefined,
      phone: phone ?? undefined,
      notes: notes ?? undefined,
      createdAt: nowStr,
    };
  }

  /**
   * Gets a person by ID.
   */
  public static async getPersonById(id: string): Promise<SplitwisePerson | null> {
    await this.ensureSchema();
    const db = getDatabase();
    const row = await db.getFirstAsync<PersonRow>(
      `SELECT * FROM splitwise_people WHERE id = ?`,
      [id]
    );
    return row ? mapPersonRow(row) : null;
  }

  /**
   * Gets all people ordered alphabetically by name.
   */
  public static async getAllPeople(): Promise<SplitwisePerson[]> {
    await this.ensureSchema();
    const db = getDatabase();
    const rows = await db.getAllAsync<PersonRow>(
      `SELECT * FROM splitwise_people WHERE id != ? ORDER BY name COLLATE NOCASE ASC`,
      [CURRENT_USER_ID]
    );
    return rows.map(mapPersonRow);
  }

  /**
   * Searches people by name or phone number.
   */
  public static async searchPeople(query: string): Promise<SplitwisePerson[]> {
    await this.ensureSchema();
    const db = getDatabase();
    const term = `%${query.trim()}%`;
    const rows = await db.getAllAsync<PersonRow>(
      `SELECT * FROM splitwise_people 
       WHERE name LIKE ? OR (phone IS NOT NULL AND phone LIKE ?) OR (email IS NOT NULL AND email LIKE ?)
       ORDER BY name COLLATE NOCASE ASC`,
      [term, term, term]
    );
    return rows.map(mapPersonRow);
  }

  /**
   * Updates an existing person record.
   */
  public static async updatePerson(
    id: string,
    updates: UpdatePersonDTO
  ): Promise<SplitwisePerson> {
    await this.ensureSchema();
    const db = getDatabase();

    const existing = await this.getPersonById(id);
    if (!existing) {
      throw new Error(`Person with id ${id} not found`);
    }

    const sets: string[] = [];
    const params: (string | null)[] = [];

    if (updates.name !== undefined) {
      const trimmedName = updates.name.trim();
      if (!trimmedName) {
        throw new Error('Person name cannot be empty');
      }
      sets.push('name = ?');
      params.push(trimmedName);
    }

    if (updates.email !== undefined) {
      sets.push('email = ?');
      params.push(updates.email ? updates.email.trim().toLowerCase() : null);
    }

    if (updates.phone !== undefined) {
      sets.push('phone = ?');
      params.push(updates.phone ? updates.phone.trim() : null);
    }

    if (updates.notes !== undefined) {
      sets.push('notes = ?');
      params.push(updates.notes ? updates.notes.trim() : null);
    }

    if (sets.length > 0) {
      params.push(id);
      await db.runAsync(
        `UPDATE splitwise_people SET ${sets.join(', ')} WHERE id = ?`,
        params
      );
      DeviceEventEmitter.emit('splitwiseUpdated');
    }

    const updated = await this.getPersonById(id);
    if (!updated) {
      throw new Error(`Failed to retrieve updated person with id ${id}`);
    }
    return updated;
  }

  /**
   * Deletes a person and cascades deletion to their debts and settlements.
   */
  public static async deletePerson(id: string): Promise<void> {
    await this.ensureSchema();
    const db = getDatabase();

    // Track deleted debts & settlements for this person before removing from SQLite
    try {
      const debts = await this.getDebtsByPersonId(id);
      for (const d of debts) {
        trackDeletedRecord(d.id, 'debt');
      }
      const settlements = await this.getSettlementsByPersonId(id);
      for (const s of settlements) {
        trackDeletedRecord(s.id, 'settlement');
      }
    } catch {
      // Fallback if querying sub-records fails
    }

    trackDeletedRecord(id, 'person');
    await db.runAsync(`DELETE FROM splitwise_debts WHERE person_id = ?`, [id]);
    await db.runAsync(`DELETE FROM splitwise_settlements WHERE person_id = ?`, [id]);
    await db.runAsync(`DELETE FROM splitwise_people WHERE id = ?`, [id]);
    DeviceEventEmitter.emit('splitwiseUpdated');
  }

  // ==========================================
  // DEBTS CRUD METHODS
  // ==========================================

  /**
   * Creates a new debt record.
   */
  public static async createDebt(dto: CreateDebtDTO): Promise<SplitwiseDebt> {
    await this.ensureSchema();
    const db = getDatabase();
    const id = generateId();
    const nowStr = dto.createdAt || new Date().toISOString();
    const description = dto.description.trim();

    if (!dto.personId) {
      throw new Error('personId is required for debt');
    }
    if (typeof dto.amount !== 'number' || isNaN(dto.amount) || dto.amount <= 0) {
      throw new Error('Debt amount must be a positive number');
    }
    if (dto.type !== 'OWE_ME' && dto.type !== 'I_OWE') {
      throw new Error("Debt type must be either 'OWE_ME' or 'I_OWE'");
    }
    if (!description) {
      throw new Error('Debt description is required');
    }

    // Verify person exists
    const person = await this.getPersonById(dto.personId);
    if (!person) {
      throw new Error(`Person with id ${dto.personId} does not exist`);
    }

    const friendEmail = dto.friendEmail?.trim().toLowerCase() || (person.email ?? null);
    const groupId = dto.groupId || null;

    await db.runAsync(
      `INSERT INTO splitwise_debts (id, person_id, amount, type, description, friend_email, group_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, dto.personId, dto.amount, dto.type, description, friendEmail, groupId, nowStr]
    );

    DeviceEventEmitter.emit('splitwiseUpdated');

    return {
      id,
      personId: dto.personId,
      amount: dto.amount,
      type: dto.type,
      description,
      friendEmail: friendEmail ?? undefined,
      groupId: groupId ?? undefined,
      createdAt: nowStr,
    };
  }

  /**
   * Gets a debt by ID.
   */
  public static async getDebtById(id: string): Promise<SplitwiseDebt | null> {
    await this.ensureSchema();
    const db = getDatabase();
    const row = await db.getFirstAsync<DebtRow>(
      `SELECT * FROM splitwise_debts WHERE id = ?`,
      [id]
    );
    return row ? mapDebtRow(row) : null;
  }

  /**
   * Gets all debts for a specific person, ordered newest first.
   */
  public static async getDebtsByPersonId(personId: string): Promise<SplitwiseDebt[]> {
    await this.ensureSchema();
    const db = getDatabase();
    const rows = await db.getAllAsync<DebtRow>(
      `SELECT * FROM splitwise_debts WHERE person_id = ? ORDER BY created_at DESC`,
      [personId]
    );
    return rows.map(mapDebtRow);
  }

  /**
   * Gets all debts across all people, optionally filtered by debt type.
   */
  public static async getAllDebts(type?: DebtType): Promise<SplitwiseDebt[]> {
    await this.ensureSchema();
    const db = getDatabase();
    if (type) {
      const rows = await db.getAllAsync<DebtRow>(
        `SELECT * FROM splitwise_debts WHERE type = ? ORDER BY created_at DESC`,
        [type]
      );
      return rows.map(mapDebtRow);
    }
    const rows = await db.getAllAsync<DebtRow>(
      `SELECT * FROM splitwise_debts ORDER BY created_at DESC`
    );
    return rows.map(mapDebtRow);
  }

  /**
   * Updates an existing debt record.
   */
  public static async updateDebt(
    id: string,
    updates: UpdateDebtDTO
  ): Promise<SplitwiseDebt> {
    await this.ensureSchema();
    const db = getDatabase();

    const existing = await this.getDebtById(id);
    if (!existing) {
      throw new Error(`Debt with id ${id} not found`);
    }

    const sets: string[] = [];
    const params: (string | number)[] = [];

    if (updates.personId !== undefined) {
      const person = await this.getPersonById(updates.personId);
      if (!person) {
        throw new Error(`Person with id ${updates.personId} does not exist`);
      }
      sets.push('person_id = ?');
      params.push(updates.personId);
    }

    if (updates.amount !== undefined) {
      if (typeof updates.amount !== 'number' || isNaN(updates.amount) || updates.amount <= 0) {
        throw new Error('Debt amount must be a positive number');
      }
      sets.push('amount = ?');
      params.push(updates.amount);
    }

    if (updates.type !== undefined) {
      if (updates.type !== 'OWE_ME' && updates.type !== 'I_OWE') {
        throw new Error("Debt type must be either 'OWE_ME' or 'I_OWE'");
      }
      sets.push('type = ?');
      params.push(updates.type);
    }

    if (updates.description !== undefined) {
      const trimmed = updates.description.trim();
      if (!trimmed) {
        throw new Error('Debt description cannot be empty');
      }
      sets.push('description = ?');
      params.push(trimmed);
    }

    if (updates.createdAt !== undefined) {
      sets.push('created_at = ?');
      params.push(updates.createdAt);
    }

    if (sets.length > 0) {
      params.push(id);
      await db.runAsync(
        `UPDATE splitwise_debts SET ${sets.join(', ')} WHERE id = ?`,
        params
      );
      DeviceEventEmitter.emit('splitwiseUpdated');
    }

    const updated = await this.getDebtById(id);
    if (!updated) {
      throw new Error(`Failed to retrieve updated debt with id ${id}`);
    }
    return updated;
  }

  /**
   * Deletes a debt by ID.
   */
  public static async deleteDebt(id: string): Promise<void> {
    await this.ensureSchema();
    const db = getDatabase();
    trackDeletedRecord(id, 'debt');
    await db.runAsync(`DELETE FROM splitwise_debts WHERE id = ?`, [id]);
    DeviceEventEmitter.emit('splitwiseUpdated');
  }

  // ==========================================
  // SETTLEMENTS CRUD METHODS
  // ==========================================

  /**
   * Creates a new settlement record.
   */
  public static async createSettlement(
    dto: CreateSettlementDTO
  ): Promise<SplitwiseSettlement> {
    await this.ensureSchema();
    const db = getDatabase();
    const id = generateId();
    const nowStr = dto.createdAt || new Date().toISOString();
    const description = dto.description?.trim() || null;

    if (!dto.personId) {
      throw new Error('personId is required for settlement');
    }
    if (typeof dto.amount !== 'number' || isNaN(dto.amount) || dto.amount <= 0) {
      throw new Error('Settlement amount must be a positive number');
    }

    // Verify person exists
    const person = await this.getPersonById(dto.personId);
    if (!person) {
      throw new Error(`Person with id ${dto.personId} does not exist`);
    }

    const settlementType = dto.settlementType || 'THEY_PAID';
    const friendEmail = dto.friendEmail?.trim().toLowerCase() || (person.email ?? null);
    const groupId = dto.groupId || null;

    await db.runAsync(
      `INSERT INTO splitwise_settlements (id, person_id, amount, description, settlement_type, friend_email, group_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, dto.personId, dto.amount, description, settlementType, friendEmail, groupId, nowStr]
    );

    DeviceEventEmitter.emit('splitwiseUpdated');

    return {
      id,
      personId: dto.personId,
      amount: dto.amount,
      description: description ?? undefined,
      settlementType,
      friendEmail: friendEmail ?? undefined,
      groupId: groupId ?? undefined,
      createdAt: nowStr,
    };
  }

  /**
   * Gets a settlement by ID.
   */
  public static async getSettlementById(id: string): Promise<SplitwiseSettlement | null> {
    await this.ensureSchema();
    const db = getDatabase();
    const row = await db.getFirstAsync<SettlementRow>(
      `SELECT * FROM splitwise_settlements WHERE id = ?`,
      [id]
    );
    return row ? mapSettlementRow(row) : null;
  }

  /**
   * Gets all settlements for a specific person, ordered newest first.
   */
  public static async getSettlementsByPersonId(
    personId: string
  ): Promise<SplitwiseSettlement[]> {
    await this.ensureSchema();
    const db = getDatabase();
    const rows = await db.getAllAsync<SettlementRow>(
      `SELECT * FROM splitwise_settlements WHERE person_id = ? ORDER BY created_at DESC`,
      [personId]
    );
    return rows.map(mapSettlementRow);
  }

  /**
   * Gets all settlements across all people.
   */
  public static async getAllSettlements(): Promise<SplitwiseSettlement[]> {
    await this.ensureSchema();
    const db = getDatabase();
    const rows = await db.getAllAsync<SettlementRow>(
      `SELECT * FROM splitwise_settlements ORDER BY created_at DESC`
    );
    return rows.map(mapSettlementRow);
  }

  /**
   * Updates an existing settlement record.
   */
  public static async updateSettlement(
    id: string,
    updates: UpdateSettlementDTO
  ): Promise<SplitwiseSettlement> {
    await this.ensureSchema();
    const db = getDatabase();

    const existing = await this.getSettlementById(id);
    if (!existing) {
      throw new Error(`Settlement with id ${id} not found`);
    }

    const sets: string[] = [];
    const params: (string | number | null)[] = [];

    if (updates.personId !== undefined) {
      const person = await this.getPersonById(updates.personId);
      if (!person) {
        throw new Error(`Person with id ${updates.personId} does not exist`);
      }
      sets.push('person_id = ?');
      params.push(updates.personId);
    }

    if (updates.amount !== undefined) {
      if (typeof updates.amount !== 'number' || isNaN(updates.amount) || updates.amount <= 0) {
        throw new Error('Settlement amount must be a positive number');
      }
      sets.push('amount = ?');
      params.push(updates.amount);
    }

    if (updates.description !== undefined) {
      sets.push('description = ?');
      params.push(updates.description ? updates.description.trim() : null);
    }

    if (updates.settlementType !== undefined) {
      sets.push('settlement_type = ?');
      params.push(updates.settlementType);
    }

    if (updates.createdAt !== undefined) {
      sets.push('created_at = ?');
      params.push(updates.createdAt);
    }

    if (sets.length > 0) {
      params.push(id);
      await db.runAsync(
        `UPDATE splitwise_settlements SET ${sets.join(', ')} WHERE id = ?`,
        params
      );
      DeviceEventEmitter.emit('splitwiseUpdated');
    }

    const updated = await this.getSettlementById(id);
    if (!updated) {
      throw new Error(`Failed to retrieve updated settlement with id ${id}`);
    }
    return updated;
  }

  /**
   * Deletes a settlement by ID.
   */
  public static async deleteSettlement(id: string): Promise<void> {
    await this.ensureSchema();
    const db = getDatabase();
    trackDeletedRecord(id, 'settlement');
    await db.runAsync(`DELETE FROM splitwise_settlements WHERE id = ?`, [id]);
    DeviceEventEmitter.emit('splitwiseUpdated');
  }

  // ==========================================
  // BALANCE CALCULATIONS & AGGREGATIONS
  // ==========================================

  /**
   * Computes balance summary for a single person.
   * Net balance is (totalOwedToMe - totalIOwe) - totalSettled.
   * Positive net balance means the person owes you money.
   * Negative net balance means you owe the person money.
   */
  public static async getPersonBalance(
    personId: string
  ): Promise<PersonBalanceSummary | null> {
    await this.ensureSchema();
    const db = getDatabase();

    const person = await this.getPersonById(personId);
    if (!person) return null;

    const debtStats = await db.getFirstAsync<{
      total_owed_to_me: number | null;
      total_i_owe: number | null;
    }>(
      `SELECT 
        SUM(CASE WHEN type = 'OWE_ME' THEN amount ELSE 0 END) AS total_owed_to_me,
        SUM(CASE WHEN type = 'I_OWE' THEN amount ELSE 0 END) AS total_i_owe
       FROM splitwise_debts
       WHERE person_id = ?`,
      [personId]
    );

    const settlementStats = await db.getFirstAsync<{
      total_settled_by_them: number | null;
      total_settled_by_you: number | null;
      total_settled: number | null;
    }>(
      `SELECT 
        SUM(CASE WHEN settlement_type = 'YOU_PAID' THEN 0 ELSE amount END) AS total_settled_by_them,
        SUM(CASE WHEN settlement_type = 'YOU_PAID' THEN amount ELSE 0 END) AS total_settled_by_you,
        SUM(amount) AS total_settled
       FROM splitwise_settlements
       WHERE person_id = ?`,
      [personId]
    );

    const expenseOwedToMe = await db.getFirstAsync<{ sum: number | null }>(
      `SELECT SUM(es.owed_amount) AS sum
       FROM splitwise_expense_splits es
       JOIN splitwise_expenses e ON es.expense_id = e.id
       WHERE e.payer_id = ? AND es.person_id = ?`,
      [CURRENT_USER_ID, personId]
    );

    const expenseIOwe = await db.getFirstAsync<{ sum: number | null }>(
      `SELECT SUM(es.owed_amount) AS sum
       FROM splitwise_expense_splits es
       JOIN splitwise_expenses e ON es.expense_id = e.id
       WHERE es.person_id = ? AND e.payer_id = ?`,
      [CURRENT_USER_ID, personId]
    );

    const totalOwedToMe = (debtStats?.total_owed_to_me ?? 0) + (expenseOwedToMe?.sum ?? 0);
    const totalIOwe = (debtStats?.total_i_owe ?? 0) + (expenseIOwe?.sum ?? 0);
    const totalSettled = settlementStats?.total_settled ?? 0;

    let settledByThem = settlementStats?.total_settled_by_them;
    let settledByYou = settlementStats?.total_settled_by_you;

    if (settledByThem === undefined || settledByThem === null) {
      if (totalIOwe > totalOwedToMe) {
        settledByYou = totalSettled;
        settledByThem = 0;
      } else {
        settledByThem = totalSettled;
        settledByYou = 0;
      }
    }

    const remainingReceivable = Math.max(0, totalOwedToMe - (settledByThem ?? 0));
    const remainingPayable = Math.max(0, totalIOwe - (settledByYou ?? 0));
    const netBalance = remainingReceivable - remainingPayable;

    return {
      person,
      totalOwedToMe,
      totalIOwe,
      totalSettled,
      remainingReceivable,
      remainingPayable,
      netBalance,
    };
  }

  public static async getPersonBalanceSummary(
    personId: string
  ): Promise<PersonBalanceSummary | null> {
    return this.getPersonBalance(personId);
  }

  /**
   * Computes balance summaries for all people in the database.
   */
  public static async getAllPeopleWithBalances(): Promise<PersonBalanceSummary[]> {
    await this.ensureSchema();
    const db = getDatabase();

    const rows = await db.getAllAsync<PersonBalanceRow>(
      `SELECT 
        p.id AS person_id,
        p.name AS person_name,
        p.phone AS person_phone,
        p.notes AS person_notes,
        p.created_at AS person_created_at,
        COALESCE(d.total_owed_to_me, 0) + COALESCE(e_owed.amount, 0) AS total_owed_to_me,
        COALESCE(d.total_i_owe, 0) + COALESCE(e_owe.amount, 0) AS total_i_owe,
        s.total_settled_by_them,
        s.total_settled_by_you,
        s.total_settled
       FROM splitwise_people p
       LEFT JOIN (
         SELECT 
           person_id,
           SUM(CASE WHEN type = 'OWE_ME' THEN amount ELSE 0 END) AS total_owed_to_me,
           SUM(CASE WHEN type = 'I_OWE' THEN amount ELSE 0 END) AS total_i_owe
         FROM splitwise_debts
         GROUP BY person_id
       ) d ON p.id = d.person_id
       LEFT JOIN (
         SELECT 
           es.person_id,
           SUM(es.owed_amount) AS amount
         FROM splitwise_expense_splits es
         JOIN splitwise_expenses e ON es.expense_id = e.id
         WHERE e.payer_id = ? AND es.person_id != ?
         GROUP BY es.person_id
       ) e_owed ON p.id = e_owed.person_id
       LEFT JOIN (
         SELECT 
           e.payer_id AS person_id,
           SUM(es.owed_amount) AS amount
         FROM splitwise_expense_splits es
         JOIN splitwise_expenses e ON es.expense_id = e.id
         WHERE es.person_id = ? AND e.payer_id != ?
         GROUP BY e.payer_id
       ) e_owe ON p.id = e_owe.person_id
       LEFT JOIN (
         SELECT 
           person_id,
           SUM(CASE WHEN settlement_type = 'YOU_PAID' THEN 0 ELSE amount END) AS total_settled_by_them,
           SUM(CASE WHEN settlement_type = 'YOU_PAID' THEN amount ELSE 0 END) AS total_settled_by_you,
           SUM(amount) AS total_settled
         FROM splitwise_settlements
         GROUP BY person_id
       ) s ON p.id = s.person_id
       WHERE p.id != ?
       ORDER BY p.name COLLATE NOCASE ASC`,
      [CURRENT_USER_ID, CURRENT_USER_ID, CURRENT_USER_ID, CURRENT_USER_ID, CURRENT_USER_ID]
    );

    return rows.map((row) => {
      const person: SplitwisePerson = {
        id: row.person_id,
        name: row.person_name,
        phone: row.person_phone ?? undefined,
        notes: row.person_notes ?? undefined,
        createdAt: row.person_created_at,
      };

      const totalOwedToMe = row.total_owed_to_me ?? 0;
      const totalIOwe = row.total_i_owe ?? 0;
      const settledByThem = row.total_settled_by_them ?? 0;
      const settledByYou = row.total_settled_by_you ?? 0;
      const totalSettled = row.total_settled ?? 0;

      const remainingReceivable = Math.max(0, totalOwedToMe - settledByThem);
      const remainingPayable = Math.max(0, totalIOwe - settledByYou);
      const netBalance = remainingReceivable - remainingPayable;

      return {
        person,
        totalOwedToMe,
        totalIOwe,
        totalSettled,
        remainingReceivable,
        remainingPayable,
        netBalance,
      };
    });
  }

  /**
   * Computes overall portfolio summary across all people, debts, and settlements.
   */
  public static async getOverallSummary(): Promise<SplitwiseOverallSummary> {
    await this.ensureSchema();
    const db = getDatabase();

    const peopleCountRow = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM splitwise_people WHERE id != ?`,
      [CURRENT_USER_ID]
    );

    const debtStats = await db.getFirstAsync<{
      total_owed_to_me: number | null;
      total_i_owe: number | null;
    }>(
      `SELECT 
        SUM(CASE WHEN type = 'OWE_ME' THEN amount ELSE 0 END) AS total_owed_to_me,
        SUM(CASE WHEN type = 'I_OWE' THEN amount ELSE 0 END) AS total_i_owe
       FROM splitwise_debts`
    );

    const expenseStats = await db.getFirstAsync<{
      total_owed_to_me: number | null;
      total_i_owe: number | null;
    }>(
      `SELECT 
        (SELECT SUM(es.owed_amount) FROM splitwise_expense_splits es JOIN splitwise_expenses e ON es.expense_id = e.id WHERE e.payer_id = ? AND es.person_id != ?) AS total_owed_to_me,
        (SELECT SUM(es.owed_amount) FROM splitwise_expense_splits es JOIN splitwise_expenses e ON es.expense_id = e.id WHERE es.person_id = ? AND e.payer_id != ?) AS total_i_owe`,
      [CURRENT_USER_ID, CURRENT_USER_ID, CURRENT_USER_ID, CURRENT_USER_ID]
    );

    const settlementStats = await db.getFirstAsync<{
      total_settled_by_them: number | null;
      total_settled_by_you: number | null;
      total_settled: number | null;
    }>(
      `SELECT 
        SUM(CASE WHEN settlement_type = 'YOU_PAID' THEN 0 ELSE amount END) AS total_settled_by_them,
        SUM(CASE WHEN settlement_type = 'YOU_PAID' THEN amount ELSE 0 END) AS total_settled_by_you,
        SUM(amount) AS total_settled
       FROM splitwise_settlements`
    );

    const totalOwedToMe = (debtStats?.total_owed_to_me ?? 0) + (expenseStats?.total_owed_to_me ?? 0);
    const totalIOwe = (debtStats?.total_i_owe ?? 0) + (expenseStats?.total_i_owe ?? 0);
    const totalSettled = settlementStats?.total_settled ?? 0;

    let settledByThem = settlementStats?.total_settled_by_them;
    let settledByYou = settlementStats?.total_settled_by_you;

    if (settledByThem === undefined || settledByThem === null) {
      if (totalIOwe > totalOwedToMe) {
        settledByYou = totalSettled;
        settledByThem = 0;
      } else {
        settledByThem = totalSettled;
        settledByYou = 0;
      }
    }

    const remainingReceivable = Math.max(0, totalOwedToMe - (settledByThem ?? 0));
    const remainingPayable = Math.max(0, totalIOwe - (settledByYou ?? 0));
    const netBalance = remainingReceivable - remainingPayable;
    const peopleCount = peopleCountRow?.count ?? 0;

    const groupCountRow = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM splitwise_groups WHERE is_archived = 0`
    );

    return {
      totalOwedToMe,
      totalIOwe,
      totalSettled,
      netBalance,
      peopleCount,
      groupCount: groupCountRow?.count ?? 0,
    };
  }

  /**
   * Returns a unified, chronologically sorted activity feed (debts and settlements) for a person.
   */
  public static async getPersonActivityHistory(
    personId: string
  ): Promise<SplitwiseActivityItem[]> {
    await this.ensureSchema();
    const db = getDatabase();

    interface ActivityRow {
      id: string;
      activity_type: 'debt' | 'settlement' | 'expense';
      person_id: string;
      person_name: string;
      amount: number;
      debt_type: string | null;
      settlement_type: string | null;
      description: string | null;
      created_at: string;
    }

    const rows = await db.getAllAsync<ActivityRow>(
      `SELECT 
        d.id,
        'debt' AS activity_type,
        d.person_id,
        p.name AS person_name,
        d.amount,
        d.type AS debt_type,
        NULL AS settlement_type,
        d.description,
        d.created_at
       FROM splitwise_debts d
       JOIN splitwise_people p ON d.person_id = p.id
       WHERE d.person_id = ?
       
       UNION ALL
       
       SELECT 
        s.id,
        'settlement' AS activity_type,
        s.person_id,
        p.name AS person_name,
        s.amount,
        NULL AS debt_type,
        s.settlement_type,
        COALESCE(s.description, 'Settlement payment') AS description,
        s.created_at
       FROM splitwise_settlements s
       JOIN splitwise_people p ON s.person_id = p.id
       WHERE s.person_id = ?

       UNION ALL

       SELECT 
        e.id,
        'expense' AS activity_type,
        CASE WHEN e.payer_id = ? THEN es.person_id ELSE e.payer_id END AS person_id,
        p.name AS person_name,
        es.owed_amount AS amount,
        CASE WHEN e.payer_id = ? THEN 'OWE_ME' ELSE 'I_OWE' END AS debt_type,
        NULL AS settlement_type,
        e.description,
        e.created_at
       FROM splitwise_expense_splits es
       JOIN splitwise_expenses e ON es.expense_id = e.id
       JOIN splitwise_people p ON (CASE WHEN e.payer_id = ? THEN es.person_id ELSE e.payer_id END) = p.id
       WHERE (e.payer_id = ? AND es.person_id = ?)
          OR (e.payer_id = ? AND es.person_id = ?)
       
       ORDER BY created_at DESC`,
      [
        personId,
        personId,
        CURRENT_USER_ID,
        CURRENT_USER_ID,
        CURRENT_USER_ID,
        CURRENT_USER_ID,
        personId,
        personId,
        CURRENT_USER_ID,
      ]
    );

    return rows.map((r) => ({
      id: r.id,
      activityType: r.activity_type,
      personId: r.person_id,
      personName: r.person_name,
      amount: r.amount,
      debtType: (r.debt_type as DebtType) || undefined,
      settlementType: (r.settlement_type as SettlementType) || undefined,
      description: r.description || '',
      createdAt: r.created_at,
    }));
  }

  /**
   * Returns a unified, chronologically sorted activity feed across all people.
   */
  public static async getAllActivityHistory(
    limit: number = 50
  ): Promise<SplitwiseActivityItem[]> {
    await this.ensureSchema();
    const db = getDatabase();

    interface ActivityRow {
      id: string;
      activity_type: 'debt' | 'settlement' | 'expense';
      person_id: string;
      person_name: string;
      amount: number;
      debt_type: string | null;
      settlement_type: string | null;
      description: string | null;
      group_id: string | null;
      group_name: string | null;
      created_at: string;
    }

    const rows = await db.getAllAsync<ActivityRow>(
      `SELECT 
        d.id,
        'debt' AS activity_type,
        d.person_id,
        p.name AS person_name,
        d.amount,
        d.type AS debt_type,
        NULL AS settlement_type,
        d.description,
        NULL AS group_id,
        NULL AS group_name,
        d.created_at
       FROM splitwise_debts d
       JOIN splitwise_people p ON d.person_id = p.id
       
       UNION ALL
       
       SELECT 
        s.id,
        'settlement' AS activity_type,
        s.person_id,
        p.name AS person_name,
        s.amount,
        NULL AS debt_type,
        s.settlement_type,
        COALESCE(s.description, 'Settlement payment') AS description,
        s.group_id,
        g.name AS group_name,
        s.created_at
       FROM splitwise_settlements s
       JOIN splitwise_people p ON s.person_id = p.id
       LEFT JOIN splitwise_groups g ON s.group_id = g.id
       
       UNION ALL
       
       SELECT 
        e.id,
        'expense' AS activity_type,
        e.payer_id AS person_id,
        p.name AS person_name,
        e.amount,
        NULL AS debt_type,
        NULL AS settlement_type,
        e.description,
        e.group_id,
        g.name AS group_name,
        e.created_at
       FROM splitwise_expenses e
       JOIN splitwise_people p ON e.payer_id = p.id
       LEFT JOIN splitwise_groups g ON e.group_id = g.id
       
       ORDER BY created_at DESC
       LIMIT ?`,
      [limit]
    );

    return rows.map((r) => ({
      id: r.id,
      activityType: r.activity_type,
      personId: r.person_id,
      personName: r.person_name,
      amount: r.amount,
      debtType: (r.debt_type as DebtType) || undefined,
      settlementType: (r.settlement_type as SettlementType) || undefined,
      description: r.description || '',
      groupId: r.group_id || undefined,
      groupName: r.group_name || undefined,
      createdAt: r.created_at,
    }));
  }

  // ============================================================================
  // Group Operations
  // ============================================================================

  /**
   * Creates a new Group with its initial member associations.
   */
  public static async createGroup(dto: CreateGroupDTO): Promise<Group> {
    await this.ensureSchema();
    const db = getDatabase();

    const id = generateId();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO splitwise_groups (
        id, name, description, icon, category, currency, is_archived, sync_status, sync_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 'LOCAL_ONLY', 1, ?, ?)`,
      [
        id,
        dto.name.trim(),
        dto.description?.trim() || null,
        dto.icon || null,
        dto.category || null,
        dto.currency || 'INR',
        now,
        now,
      ]
    );

    const effectiveMemberIds = dto.memberIds.includes(CURRENT_USER_ID)
      ? dto.memberIds
      : [CURRENT_USER_ID, ...dto.memberIds];

    const members: GroupMember[] = [];
    for (const personId of effectiveMemberIds) {
      const memberId = generateId();
      await db.runAsync(
        `INSERT INTO splitwise_group_members (
          id, group_id, person_id, role, joined_at, sync_status
        ) VALUES (?, ?, ?, ?, ?, 'LOCAL_ONLY')`,
        [memberId, id, personId, personId === CURRENT_USER_ID ? 'admin' : 'member', now]
      );
      members.push({
        id: memberId,
        groupId: id,
        personId,
        role: personId === CURRENT_USER_ID ? 'admin' : 'member',
        joinedAt: now,
      });
    }

    DeviceEventEmitter.emit('splitwiseUpdated');

    return {
      id,
      name: dto.name.trim(),
      description: dto.description?.trim(),
      icon: dto.icon,
      category: dto.category,
      currency: dto.currency || 'INR',
      memberIds: effectiveMemberIds,
      members,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Retrieves a single group by ID along with its members.
   */
  public static async getGroupById(id: string): Promise<Group | null> {
    await this.ensureSchema();
    const db = getDatabase();

    interface GroupRow {
      id: string;
      name: string;
      description: string | null;
      icon: string | null;
      category: string | null;
      currency: string | null;
      created_by: string | null;
      is_archived: number;
      created_at: string;
      updated_at: string | null;
    }

    const row = await db.getFirstAsync<GroupRow>(
      `SELECT * FROM splitwise_groups WHERE id = ?`,
      [id]
    );

    if (!row) return null;

    interface MemberRow {
      id: string;
      group_id: string;
      person_id: string;
      role: string;
      joined_at: string;
    }

    const memberRows = await db.getAllAsync<MemberRow>(
      `SELECT id, group_id, person_id, role, joined_at FROM splitwise_group_members WHERE group_id = ?`,
      [id]
    );

    const members: GroupMember[] = memberRows.map((m) => ({
      id: m.id,
      groupId: m.group_id,
      personId: m.person_id,
      role: (m.role as GroupRole) || 'member',
      joinedAt: m.joined_at,
    }));

    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      icon: row.icon || undefined,
      category: row.category || undefined,
      currency: row.currency || 'INR',
      createdBy: row.created_by || undefined,
      memberIds: members.map((m) => m.personId),
      members,
      isArchived: row.is_archived === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at || undefined,
    };
  }

  /**
   * Retrieves all groups.
   */
  public static async getAllGroups(includeArchived: boolean = false): Promise<Group[]> {
    await this.ensureSchema();
    const db = getDatabase();

    interface GroupRow {
      id: string;
      name: string;
      description: string | null;
      icon: string | null;
      category: string | null;
      currency: string | null;
      created_by: string | null;
      is_archived: number;
      created_at: string;
      updated_at: string | null;
    }

    const rows = await db.getAllAsync<GroupRow>(
      `SELECT * FROM splitwise_groups ${includeArchived ? '' : 'WHERE is_archived = 0'} ORDER BY updated_at DESC, created_at DESC`
    );

    const groups: Group[] = [];
    for (const row of rows) {
      const memberRows = await db.getAllAsync<{ person_id: string; role: string }>(
        `SELECT person_id, role FROM splitwise_group_members WHERE group_id = ?`,
        [row.id]
      );

      groups.push({
        id: row.id,
        name: row.name,
        description: row.description || undefined,
        icon: row.icon || undefined,
        category: row.category || undefined,
        currency: row.currency || 'INR',
        createdBy: row.created_by || undefined,
        memberIds: memberRows.map((m) => m.person_id),
        isArchived: row.is_archived === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at || undefined,
      });
    }

    return groups;
  }

  /**
   * Updates an existing group and synchronizes members.
   */
  public static async updateGroup(id: string, updates: UpdateGroupDTO): Promise<Group> {
    await this.ensureSchema();
    const db = getDatabase();

    const existing = await this.getGroupById(id);
    if (!existing) {
      throw new Error(`Group with id ${id} not found`);
    }

    const sets: string[] = [];
    const values: any[] = [];
    const now = new Date().toISOString();

    if (updates.name !== undefined) {
      sets.push('name = ?');
      values.push(updates.name.trim());
    }
    if (updates.description !== undefined) {
      sets.push('description = ?');
      values.push(updates.description.trim() || null);
    }
    if (updates.icon !== undefined) {
      sets.push('icon = ?');
      values.push(updates.icon || null);
    }
    if (updates.category !== undefined) {
      sets.push('category = ?');
      values.push(updates.category || null);
    }
    if (updates.currency !== undefined) {
      sets.push('currency = ?');
      values.push(updates.currency);
    }
    if (updates.isArchived !== undefined) {
      sets.push('is_archived = ?');
      values.push(updates.isArchived ? 1 : 0);
    }

    sets.push('updated_at = ?');
    values.push(now);

    values.push(id);

    await db.runAsync(
      `UPDATE splitwise_groups SET ${sets.join(', ')} WHERE id = ?`,
      values
    );

    if (updates.memberIds && Array.isArray(updates.memberIds)) {
      await db.runAsync(`DELETE FROM splitwise_group_members WHERE group_id = ?`, [id]);
      for (const personId of updates.memberIds) {
        const memberId = generateId();
        await db.runAsync(
          `INSERT INTO splitwise_group_members (id, group_id, person_id, role, joined_at, sync_status)
           VALUES (?, ?, ?, 'member', ?, 'LOCAL_ONLY')`,
          [memberId, id, personId, now]
        );
      }
    }

    DeviceEventEmitter.emit('splitwiseUpdated');

    const updated = await this.getGroupById(id);
    if (!updated) throw new Error('Failed to retrieve updated group');
    return updated;
  }

  /**
   * Deletes a group and all associated expenses and splits.
   */
  public static async deleteGroup(id: string): Promise<void> {
    await this.ensureSchema();
    const db = getDatabase();

    // Cascades delete group expenses, splits, and members
    const expenses = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM splitwise_expenses WHERE group_id = ?`,
      [id]
    );
    for (const exp of expenses) {
      await db.runAsync(`DELETE FROM splitwise_expense_splits WHERE expense_id = ?`, [exp.id]);
      trackDeletedRecord(exp.id, 'expense');
    }
    await db.runAsync(`DELETE FROM splitwise_expenses WHERE group_id = ?`, [id]);
    await db.runAsync(`DELETE FROM splitwise_group_members WHERE group_id = ?`, [id]);
    await db.runAsync(`DELETE FROM splitwise_groups WHERE id = ?`, [id]);

    trackDeletedRecord(id, 'group');
    DeviceEventEmitter.emit('splitwiseUpdated');
  }

  /**
   * Retrieves all Person records belonging to a group.
   */
  public static async getGroupMembers(groupId: string): Promise<SplitwisePerson[]> {
    await this.ensureSchema();
    const db = getDatabase();

    const rows = await db.getAllAsync<PersonRow>(
      `SELECT p.* 
       FROM splitwise_people p
       JOIN splitwise_group_members gm ON p.id = gm.person_id
       WHERE gm.group_id = ?
       ORDER BY CASE WHEN p.id = ? THEN 0 ELSE 1 END, p.name COLLATE NOCASE ASC`,
      [groupId, CURRENT_USER_ID]
    );

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email || undefined,
      phone: r.phone || undefined,
      notes: r.notes || undefined,
      createdAt: r.created_at,
    }));
  }

  /**
   * Adds new members to an existing group.
   */
  public static async addGroupMembers(groupId: string, personIds: string[]): Promise<void> {
    await this.ensureSchema();
    const db = getDatabase();
    const now = new Date().toISOString();

    for (const personId of personIds) {
      const existing = await db.getFirstAsync(
        `SELECT id FROM splitwise_group_members WHERE group_id = ? AND person_id = ?`,
        [groupId, personId]
      );
      if (!existing) {
        const memberId = generateId();
        await db.runAsync(
          `INSERT INTO splitwise_group_members (id, group_id, person_id, role, joined_at, sync_status)
           VALUES (?, ?, ?, 'member', ?, 'LOCAL_ONLY')`,
          [memberId, groupId, personId, now]
        );
      }
    }
    await db.runAsync(`UPDATE splitwise_groups SET updated_at = ? WHERE id = ?`, [now, groupId]);
    DeviceEventEmitter.emit('splitwiseUpdated');
  }

  /**
   * Removes a member from a group.
   */
  public static async removeGroupMember(groupId: string, personId: string): Promise<void> {
    await this.ensureSchema();
    const db = getDatabase();
    await db.runAsync(
      `DELETE FROM splitwise_group_members WHERE group_id = ? AND person_id = ?`,
      [groupId, personId]
    );
    const now = new Date().toISOString();
    await db.runAsync(`UPDATE splitwise_groups SET updated_at = ? WHERE id = ?`, [now, groupId]);
    DeviceEventEmitter.emit('splitwiseUpdated');
  }

  // ============================================================================
  // Multi-party Shared Expenses & Splits Operations
  // ============================================================================

  /**
   * Creates a multi-party expense with its individual splits.
   */
  public static async createExpense(dto: CreateExpenseDTO): Promise<ExpenseWithSplits> {
    await this.ensureSchema();
    const db = getDatabase();

    const id = generateId();
    const now = new Date().toISOString();
    const expenseDate = dto.date || now;

    await db.runAsync(
      `INSERT INTO splitwise_expenses (
        id, description, amount, currency, category, date, payer_id, group_id, split_type, notes, receipt_url, sync_status, sync_version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'LOCAL_ONLY', 1, ?, ?)`,
      [
        id,
        dto.description.trim(),
        dto.amount,
        'INR',
        dto.category || null,
        expenseDate,
        dto.payerId,
        dto.groupId || null,
        dto.splitType,
        dto.notes?.trim() || null,
        dto.receiptUrl || null,
        now,
        now,
      ]
    );

    const savedSplits: ExpenseSplit[] = [];
    for (const s of dto.splits) {
      const splitId = generateId();
      await db.runAsync(
        `INSERT INTO splitwise_expense_splits (
          id, expense_id, person_id, paid_amount, owed_amount, percentage, shares, is_paid, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          splitId,
          id,
          s.personId,
          s.paidAmount || 0,
          s.owedAmount || 0,
          s.percentage !== undefined ? s.percentage : null,
          s.shares !== undefined ? s.shares : null,
          s.isPaid ? 1 : 0,
          now,
        ]
      );

      savedSplits.push({
        id: splitId,
        expenseId: id,
        personId: s.personId,
        paidAmount: s.paidAmount || 0,
        owedAmount: s.owedAmount || 0,
        percentage: s.percentage,
        shares: s.shares,
        isPaid: s.isPaid || false,
        createdAt: now,
      });
    }

    if (dto.groupId) {
      await db.runAsync(`UPDATE splitwise_groups SET updated_at = ? WHERE id = ?`, [now, dto.groupId]);
    }

    DeviceEventEmitter.emit('splitwiseUpdated');

    const created = await this.getExpenseById(id);
    if (!created) throw new Error('Failed to retrieve created expense');
    return created;
  }

  /**
   * Retrieves an expense by ID with full split and participant details.
   */
  public static async getExpenseById(id: string): Promise<ExpenseWithSplits | null> {
    await this.ensureSchema();
    const db = getDatabase();

    interface ExpenseRow {
      id: string;
      description: string;
      amount: number;
      currency: string | null;
      category: string | null;
      date: string;
      payer_id: string;
      group_id: string | null;
      split_type: string;
      notes: string | null;
      receipt_url: string | null;
      created_at: string;
      updated_at: string | null;
    }

    const row = await db.getFirstAsync<ExpenseRow>(
      `SELECT * FROM splitwise_expenses WHERE id = ?`,
      [id]
    );

    if (!row) return null;

    const payer = await this.getPersonById(row.payer_id);

    interface SplitRow {
      id: string;
      expense_id: string;
      person_id: string;
      paid_amount: number;
      owed_amount: number;
      percentage: number | null;
      shares: number | null;
      is_paid: number;
      created_at: string;
      person_name: string;
      person_email: string | null;
      person_phone: string | null;
    }

    const splitRows = await db.getAllAsync<SplitRow>(
      `SELECT es.*, p.name as person_name, p.email as person_email, p.phone as person_phone
       FROM splitwise_expense_splits es
       JOIN splitwise_people p ON es.person_id = p.id
       WHERE es.expense_id = ?`,
      [id]
    );

    const splitsWithPeople = splitRows.map((sr) => ({
      id: sr.id,
      expenseId: sr.expense_id,
      personId: sr.person_id,
      paidAmount: sr.paid_amount,
      owedAmount: sr.owed_amount,
      percentage: sr.percentage !== null ? sr.percentage : undefined,
      shares: sr.shares !== null ? sr.shares : undefined,
      isPaid: sr.is_paid === 1,
      createdAt: sr.created_at,
      person: {
        id: sr.person_id,
        name: sr.person_name,
        email: sr.person_email || undefined,
        phone: sr.person_phone || undefined,
        createdAt: '',
      },
    }));

    return {
      id: row.id,
      description: row.description,
      amount: row.amount,
      currency: row.currency || 'INR',
      category: row.category || undefined,
      date: row.date,
      payerId: row.payer_id,
      groupId: row.group_id || undefined,
      splitType: (row.split_type as SplitType) || 'EQUAL',
      splits: splitsWithPeople,
      splitsWithPeople,
      payer: payer || undefined,
      notes: row.notes || undefined,
      receiptUrl: row.receipt_url || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at || undefined,
    };
  }

  /**
   * Retrieves all expenses for a specific group.
   */
  public static async getExpensesByGroupId(groupId: string): Promise<ExpenseWithSplits[]> {
    await this.ensureSchema();
    const db = getDatabase();

    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM splitwise_expenses WHERE group_id = ? ORDER BY date DESC, created_at DESC`,
      [groupId]
    );

    const expenses: ExpenseWithSplits[] = [];
    for (const r of rows) {
      const exp = await this.getExpenseById(r.id);
      if (exp) expenses.push(exp);
    }
    return expenses;
  }

  /**
   * Retrieves all expenses across all groups.
   */
  public static async getAllExpenses(): Promise<ExpenseWithSplits[]> {
    await this.ensureSchema();
    const db = getDatabase();

    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM splitwise_expenses ORDER BY date DESC, created_at DESC`
    );

    const expenses: ExpenseWithSplits[] = [];
    for (const r of rows) {
      const exp = await this.getExpenseById(r.id);
      if (exp) expenses.push(exp);
    }
    return expenses;
  }

  /**
   * Deletes an expense and its associated splits.
   */
  public static async deleteExpense(id: string): Promise<void> {
    await this.ensureSchema();
    const db = getDatabase();

    const existing = await this.getExpenseById(id);
    await db.runAsync(`DELETE FROM splitwise_expense_splits WHERE expense_id = ?`, [id]);
    await db.runAsync(`DELETE FROM splitwise_expenses WHERE id = ?`, [id]);

    if (existing?.groupId) {
      const now = new Date().toISOString();
      await db.runAsync(`UPDATE splitwise_groups SET updated_at = ? WHERE id = ?`, [now, existing.groupId]);
    }

    trackDeletedRecord(id, 'expense');
    DeviceEventEmitter.emit('splitwiseUpdated');
  }

  /**
   * Retrieves settlements for a specific group.
   */
  public static async getSettlementsByGroupId(groupId: string): Promise<SplitwiseSettlement[]> {
    await this.ensureSchema();
    const db = getDatabase();

    const rows = await db.getAllAsync<SettlementRow>(
      `SELECT * FROM splitwise_settlements WHERE group_id = ? ORDER BY created_at DESC`,
      [groupId]
    );

    return rows.map(mapSettlementRow);
  }

  /**
   * Computes the complete balance breakdown and summary for a group.
   */
  public static async getGroupBalanceSummary(groupId: string): Promise<GroupBalanceSummary> {
    const group = await this.getGroupById(groupId);
    if (!group) throw new Error(`Group with id ${groupId} not found`);

    const members = await this.getGroupMembers(groupId);
    const expenses = await this.getExpensesByGroupId(groupId);
    const settlements = await this.getSettlementsByGroupId(groupId);

    return BalanceCalculator.calculateGroupBalances(
      groupId,
      group.name,
      members,
      expenses,
      settlements
    );
  }
}

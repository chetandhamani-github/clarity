import { DeviceEventEmitter } from 'react-native';
import { getDatabase } from '@/services/database';
import { runSplitwiseMigrations } from './splitwise.migration';
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
  SplitwiseOverallSummary,
  SplitwiseActivityItem,
  DebtType,
} from '../types/splitwise.types';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface PersonRow {
  id: string;
  name: string;
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
  created_at: string;
}

interface SettlementRow {
  id: string;
  person_id: string;
  amount: number;
  description: string | null;
  created_at: string;
}

interface PersonBalanceRow {
  person_id: string;
  person_name: string;
  person_phone: string | null;
  person_notes: string | null;
  person_created_at: string;
  total_owed_to_me: number | null;
  total_i_owe: number | null;
  total_settled: number | null;
}

function mapPersonRow(row: PersonRow): SplitwisePerson {
  return {
    id: row.id,
    name: row.name,
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
    createdAt: row.created_at,
  };
}

function mapSettlementRow(row: SettlementRow): SplitwiseSettlement {
  return {
    id: row.id,
    personId: row.person_id,
    amount: row.amount,
    description: row.description ?? undefined,
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
    const phone = dto.phone?.trim() || null;
    const notes = dto.notes?.trim() || null;

    if (!name) {
      throw new Error('Person name is required');
    }

    await db.runAsync(
      `INSERT INTO splitwise_people (id, name, phone, notes, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, name, phone, notes, nowStr]
    );

    DeviceEventEmitter.emit('splitwiseUpdated');

    return {
      id,
      name,
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
      `SELECT * FROM splitwise_people ORDER BY name COLLATE NOCASE ASC`
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
       WHERE name LIKE ? OR (phone IS NOT NULL AND phone LIKE ?)
       ORDER BY name COLLATE NOCASE ASC`,
      [term, term]
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

    await db.runAsync(
      `INSERT INTO splitwise_debts (id, person_id, amount, type, description, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, dto.personId, dto.amount, dto.type, description, nowStr]
    );

    DeviceEventEmitter.emit('splitwiseUpdated');

    return {
      id,
      personId: dto.personId,
      amount: dto.amount,
      type: dto.type,
      description,
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

    await db.runAsync(
      `INSERT INTO splitwise_settlements (id, person_id, amount, description, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [id, dto.personId, dto.amount, description, nowStr]
    );

    DeviceEventEmitter.emit('splitwiseUpdated');

    return {
      id,
      personId: dto.personId,
      amount: dto.amount,
      description: description ?? undefined,
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

    const settlementStats = await db.getFirstAsync<{ total_settled: number | null }>(
      `SELECT SUM(amount) AS total_settled
       FROM splitwise_settlements
       WHERE person_id = ?`,
      [personId]
    );

    const totalOwedToMe = debtStats?.total_owed_to_me ?? 0;
    const totalIOwe = debtStats?.total_i_owe ?? 0;
    const totalSettled = settlementStats?.total_settled ?? 0;
    const netBalance = (totalOwedToMe - totalIOwe) - totalSettled;

    return {
      person,
      totalOwedToMe,
      totalIOwe,
      totalSettled,
      netBalance,
    };
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
        d.total_owed_to_me,
        d.total_i_owe,
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
           person_id,
           SUM(amount) AS total_settled
         FROM splitwise_settlements
         GROUP BY person_id
       ) s ON p.id = s.person_id
       ORDER BY p.name COLLATE NOCASE ASC`
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
      const totalSettled = row.total_settled ?? 0;
      const netBalance = (totalOwedToMe - totalIOwe) - totalSettled;

      return {
        person,
        totalOwedToMe,
        totalIOwe,
        totalSettled,
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
      `SELECT COUNT(*) AS count FROM splitwise_people`
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

    const settlementStats = await db.getFirstAsync<{ total_settled: number | null }>(
      `SELECT SUM(amount) AS total_settled FROM splitwise_settlements`
    );

    const totalOwedToMe = debtStats?.total_owed_to_me ?? 0;
    const totalIOwe = debtStats?.total_i_owe ?? 0;
    const totalSettled = settlementStats?.total_settled ?? 0;
    const netBalance = (totalOwedToMe - totalIOwe) - totalSettled;
    const peopleCount = peopleCountRow?.count ?? 0;

    return {
      totalOwedToMe,
      totalIOwe,
      totalSettled,
      netBalance,
      peopleCount,
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
      activity_type: 'debt' | 'settlement';
      person_id: string;
      person_name: string;
      amount: number;
      debt_type: string | null;
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
        COALESCE(s.description, 'Settlement payment') AS description,
        s.created_at
       FROM splitwise_settlements s
       JOIN splitwise_people p ON s.person_id = p.id
       WHERE s.person_id = ?
       
       ORDER BY created_at DESC`,
      [personId, personId]
    );

    return rows.map((r) => ({
      id: r.id,
      activityType: r.activity_type,
      personId: r.person_id,
      personName: r.person_name,
      amount: r.amount,
      debtType: (r.debt_type as DebtType) || undefined,
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
      activity_type: 'debt' | 'settlement';
      person_id: string;
      person_name: string;
      amount: number;
      debt_type: string | null;
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
        d.description,
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
        COALESCE(s.description, 'Settlement payment') AS description,
        s.created_at
       FROM splitwise_settlements s
       JOIN splitwise_people p ON s.person_id = p.id
       
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
      description: r.description || '',
      createdAt: r.created_at,
    }));
  }
}

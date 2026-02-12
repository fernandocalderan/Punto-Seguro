const { query } = require("../db/client");
const { createProvider, createLead, LEAD_STATUSES } = require("./models");

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeProviderRow(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email || "",
    phone: row.phone || "",
    zones: ensureArray(row.zones),
    business_types: ensureArray(row.business_types),
    active: Boolean(row.active),
    priority: Number(row.priority ?? 0),
    daily_cap: Number(row.daily_cap ?? 999),
    last_assigned_at: toIso(row.last_assigned_at),
  };
}

function normalizeLeadRow(row) {
  return {
    id: row.id,
    created_at: toIso(row.created_at),
    name: row.name,
    email: row.email || "",
    phone: row.phone || "",
    city: row.city || "",
    postal_code: row.postal_code || "",
    business_type: row.business_type || "general",
    risk_level: row.risk_level || "MEDIO",
    urgency: row.urgency || "media",
    budget_range: row.budget_range || "sin_definir",
    intent_plazo: row.intent_plazo || null,
    lead_score: row.lead_score !== null && row.lead_score !== undefined ? Number(row.lead_score) : null,
    ticket_estimated_eur:
      row.ticket_estimated_eur !== null && row.ticket_estimated_eur !== undefined
        ? Number(row.ticket_estimated_eur)
        : null,
    price_eur: row.price_eur !== null && row.price_eur !== undefined ? Number(row.price_eur) : null,
    assignment_mode: row.assignment_mode || "auto",
    assigned_by: row.assigned_by || null,
    updated_at: toIso(row.updated_at),
    deleted_at: toIso(row.deleted_at),
    consent: Boolean(row.consent),
    consent_timestamp: toIso(row.consent_timestamp),
    consent_ip: row.consent_ip || null,
    evaluation_summary: row.evaluation_summary ?? "",
    provider_ids: ensureArray(row.provider_ids),
    assigned_provider_id: row.assigned_provider_id || null,
    assigned_at: toIso(row.assigned_at),
    accepted_at: toIso(row.accepted_at),
    sold_at: toIso(row.sold_at),
    status: LEAD_STATUSES.includes(row.status) ? row.status : "new",
    notes: row.notes || "",
  };
}

class ProviderRepositoryPg {
  async list() {
    const result = await query(
      `SELECT id, name, email, phone, zones, business_types, active, priority, daily_cap, last_assigned_at
       FROM providers
       ORDER BY priority ASC, name ASC`
    );
    return result.rows.map(normalizeProviderRow);
  }

  async listActive() {
    const result = await query(
      `SELECT id, name, email, phone, zones, business_types, active, priority, daily_cap, last_assigned_at
       FROM providers
       WHERE active = TRUE
       ORDER BY priority ASC, name ASC`
    );
    return result.rows.map(normalizeProviderRow);
  }

  async getById(id) {
    const result = await query(
      `SELECT id, name, email, phone, zones, business_types, active, priority, daily_cap, last_assigned_at
       FROM providers
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    if (result.rowCount === 0) return null;
    return normalizeProviderRow(result.rows[0]);
  }

  async getByIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const clean = Array.from(new Set(ids.map((id) => String(id).trim()).filter(Boolean)));
    if (clean.length === 0) return [];

    const result = await query(
      `SELECT id, name, email, phone, zones, business_types, active, priority, daily_cap, last_assigned_at
       FROM providers
       WHERE id = ANY($1::text[])`,
      [clean]
    );

    return result.rows.map(normalizeProviderRow);
  }

  async create(input) {
    const provider = createProvider(input);
    const result = await query(
      `INSERT INTO providers (id, name, email, phone, zones, business_types, active, priority, daily_cap, last_assigned_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10::timestamptz)
       RETURNING id, name, email, phone, zones, business_types, active, priority, daily_cap, last_assigned_at`,
      [
        provider.id,
        provider.name,
        provider.email,
        provider.phone,
        JSON.stringify(provider.zones),
        JSON.stringify(provider.business_types),
        provider.active,
        provider.priority,
        provider.daily_cap,
        provider.last_assigned_at,
      ]
    );

    return normalizeProviderRow(result.rows[0]);
  }

  async update(id, input) {
    const existing = await this.getById(id);
    if (!existing) return null;

    const provider = createProvider(input, existing);
    const result = await query(
      `UPDATE providers
       SET name = $2,
           email = $3,
           phone = $4,
           zones = $5::jsonb,
           business_types = $6::jsonb,
           active = $7,
           priority = $8,
           daily_cap = $9,
           last_assigned_at = $10::timestamptz
       WHERE id = $1
       RETURNING id, name, email, phone, zones, business_types, active, priority, daily_cap, last_assigned_at`,
      [
        id,
        provider.name,
        provider.email,
        provider.phone,
        JSON.stringify(provider.zones),
        JSON.stringify(provider.business_types),
        provider.active,
        provider.priority,
        provider.daily_cap,
        provider.last_assigned_at,
      ]
    );

    return normalizeProviderRow(result.rows[0]);
  }

  async touchAssignedAt(providerIds, assignedAtIso) {
    if (!Array.isArray(providerIds) || providerIds.length === 0) return;

    await query(
      `UPDATE providers
       SET last_assigned_at = $1::timestamptz
       WHERE id = ANY($2::text[])`,
      [assignedAtIso, providerIds]
    );
  }

  async listProviders() {
    return this.list();
  }

  async getProvider(id) {
    return this.getById(id);
  }

  async upsertProvider(input) {
    const existing = input.id ? await this.getById(input.id) : null;
    if (existing) {
      return this.update(input.id, input);
    }
    return this.create(input);
  }

  async deleteProvider(id) {
    const result = await query(`DELETE FROM providers WHERE id = $1`, [id]);
    return result.rowCount > 0;
  }
}

class LeadRepositoryPg {
  constructor() {
    this.supportsAdminOpsColumns = null;
  }

  async list() {
    const result = await query(
      `SELECT *
       FROM leads
       ORDER BY created_at DESC`
    );

    return result.rows.map(normalizeLeadRow);
  }

  async getById(id) {
    const result = await query(
      `SELECT *
       FROM leads
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

    if (result.rowCount === 0) return null;
    return normalizeLeadRow(result.rows[0]);
  }

  async create(input, options) {
    const lead = createLead(input, options);

    const result = await query(
      `INSERT INTO leads (
         id, created_at, name, email, phone, city, postal_code, business_type, risk_level,
         urgency, budget_range, intent_plazo, lead_score, ticket_estimated_eur, price_eur,
         consent, consent_timestamp, consent_ip, evaluation_summary, provider_ids,
         assigned_provider_id, assigned_at, accepted_at, sold_at, status, notes
       ) VALUES (
         $1,$2::timestamptz,$3,$4,$5,$6,$7,$8,$9,
         $10,$11,$12,$13,$14,$15,
         $16,$17::timestamptz,$18,$19::jsonb,$20::jsonb,
         $21,$22::timestamptz,$23::timestamptz,$24::timestamptz,$25,$26
       )
       RETURNING *`,
      [
        lead.id,
        lead.created_at,
        lead.name,
        lead.email,
        lead.phone,
        lead.city,
        lead.postal_code,
        lead.business_type,
        lead.risk_level,
        lead.urgency,
        lead.budget_range,
        lead.intent_plazo,
        lead.lead_score,
        lead.ticket_estimated_eur,
        lead.price_eur,
        lead.consent,
        lead.consent_timestamp,
        lead.consent_ip,
        JSON.stringify(lead.evaluation_summary),
        JSON.stringify(lead.provider_ids),
        lead.assigned_provider_id,
        lead.assigned_at,
        lead.accepted_at,
        lead.sold_at,
        lead.status,
        lead.notes,
      ]
    );

    return normalizeLeadRow(result.rows[0]);
  }

  async update(id, patch) {
    const existing = await this.getById(id);
    if (!existing) return null;

    const merged = {
      ...existing,
      ...patch,
      id: existing.id,
      created_at: existing.created_at,
    };

    const lead = createLead(merged, {
      ip: merged.consent_ip,
    });
    lead.id = existing.id;
    lead.created_at = existing.created_at;

    const paramsBase = [
      id,
      lead.name,
      lead.email,
      lead.phone,
      lead.city,
      lead.postal_code,
      lead.business_type,
      lead.risk_level,
      lead.urgency,
      lead.budget_range,
      lead.intent_plazo,
      lead.lead_score,
      lead.ticket_estimated_eur,
      lead.price_eur,
      lead.consent,
      lead.consent_timestamp,
      lead.consent_ip,
      JSON.stringify(lead.evaluation_summary),
      JSON.stringify(lead.provider_ids),
      lead.assigned_provider_id,
      lead.assigned_at,
      lead.accepted_at,
      lead.sold_at,
      lead.status,
      lead.notes,
    ];

    const sqlBase = `UPDATE leads
       SET name = $2,
           email = $3,
           phone = $4,
           city = $5,
           postal_code = $6,
           business_type = $7,
           risk_level = $8,
           urgency = $9,
           budget_range = $10,
           intent_plazo = $11,
           lead_score = $12,
           ticket_estimated_eur = $13,
           price_eur = $14,
           consent = $15,
           consent_timestamp = $16::timestamptz,
           consent_ip = $17,
           evaluation_summary = $18::jsonb,
           provider_ids = $19::jsonb,
           assigned_provider_id = $20,
           assigned_at = $21::timestamptz,
           accepted_at = $22::timestamptz,
           sold_at = $23::timestamptz,
           status = $24,
           notes = $25
       WHERE id = $1
       RETURNING *`;

    const sqlWithAdminOps = `UPDATE leads
       SET name = $2,
           email = $3,
           phone = $4,
           city = $5,
           postal_code = $6,
           business_type = $7,
           risk_level = $8,
           urgency = $9,
           budget_range = $10,
           intent_plazo = $11,
           lead_score = $12,
           ticket_estimated_eur = $13,
           price_eur = $14,
           consent = $15,
           consent_timestamp = $16::timestamptz,
           consent_ip = $17,
           evaluation_summary = $18::jsonb,
           provider_ids = $19::jsonb,
           assigned_provider_id = $20,
           assigned_at = $21::timestamptz,
           accepted_at = $22::timestamptz,
           sold_at = $23::timestamptz,
           status = $24,
           notes = $25,
           assignment_mode = $26,
           assigned_by = $27,
           updated_at = $28::timestamptz,
           deleted_at = $29::timestamptz
       WHERE id = $1
       RETURNING *`;

    const paramsWithAdminOps = paramsBase.concat([
      lead.assignment_mode,
      lead.assigned_by,
      lead.updated_at,
      lead.deleted_at,
    ]);

    let result;
    if (this.supportsAdminOpsColumns !== false) {
      try {
        result = await query(sqlWithAdminOps, paramsWithAdminOps);
        this.supportsAdminOpsColumns = true;
        return normalizeLeadRow(result.rows[0]);
      } catch (error) {
        if (error && error.code === "42703") {
          this.supportsAdminOpsColumns = false;
        } else {
          throw error;
        }
      }
    }

    result = await query(sqlBase, paramsBase);

    return normalizeLeadRow(result.rows[0]);
  }

  async anonymize(id, { reason } = {}) {
    const reasonText = String(reason || "").trim();
    const noteSuffix = reasonText ? ` ${reasonText}` : "";
    const notesAppend = `\n[ANONYMIZED]${noteSuffix}`;
    const nowIso = new Date().toISOString();

    const sqlWithAdminOps = `UPDATE leads
      SET status = 'deleted',
          deleted_at = $2::timestamptz,
          updated_at = $2::timestamptz,
          name = 'ANONIMIZADO',
          email = NULL,
          phone = NULL,
          city = NULL,
          postal_code = NULL,
          consent_ip = NULL,
          notes = COALESCE(notes, '') || $3
      WHERE id = $1
      RETURNING *`;

    const sqlBase = `UPDATE leads
      SET status = 'deleted',
          name = 'ANONIMIZADO',
          email = NULL,
          phone = NULL,
          city = NULL,
          postal_code = NULL,
          consent_ip = NULL,
          notes = COALESCE(notes, '') || $2
      WHERE id = $1
      RETURNING *`;

    let result;
    if (this.supportsAdminOpsColumns !== false) {
      try {
        result = await query(sqlWithAdminOps, [id, nowIso, notesAppend]);
        this.supportsAdminOpsColumns = true;
      } catch (error) {
        if (error && error.code === "42703") {
          this.supportsAdminOpsColumns = false;
        } else {
          throw error;
        }
      }
    }

    if (!result) {
      result = await query(sqlBase, [id, notesAppend]);
    }

    if (result.rowCount === 0) return null;
    return normalizeLeadRow(result.rows[0]);
  }

  async countAssignedForProviderOnDate(providerId, dateIso) {
    const result = await query(
      `SELECT COUNT(*)::int AS count
       FROM leads
       WHERE created_at >= $1::date
         AND created_at < ($1::date + INTERVAL '1 day')
         AND provider_ids @> $2::jsonb`,
      [dateIso, JSON.stringify([providerId])]
    );

    return Number(result.rows[0]?.count || 0);
  }

  async createLead(lead, options) {
    return this.create(lead, options);
  }

  async listLeads() {
    return this.list();
  }

  async getLead(id) {
    return this.getById(id);
  }

  async updateLead(lead) {
    if (!lead?.id) throw new Error("Lead id is required");
    return this.update(lead.id, lead);
  }

  async updateLeadStatus(id, status) {
    const existing = await this.getById(id);
    if (!existing) return null;
    return this.update(id, { ...existing, status });
  }

  async addLeadNote(id, note) {
    const existing = await this.getById(id);
    if (!existing) return null;
    return this.update(id, { ...existing, notes: note });
  }
}

class EventRepositoryPg {
  async list(limit = 200) {
    const cappedLimit = Math.max(1, Math.min(Number(limit) || 200, 10000));
    const result = await query(
      `SELECT id, ts, name, payload
       FROM events
       ORDER BY ts DESC
       LIMIT $1`,
      [cappedLimit]
    );

    return result.rows.map((row) => {
      const payload = row.payload || {};
      return {
        id: String(row.id),
        event_name: row.name,
        timestamp: payload.timestamp || toIso(row.ts),
        payload: payload.payload ?? payload,
        context: payload.context || {},
      };
    });
  }

  async append(event) {
    const payload = {
      id: event.id,
      timestamp: event.timestamp,
      payload: event.payload || {},
      context: event.context || {},
    };

    const result = await query(
      `INSERT INTO events (name, payload)
       VALUES ($1, $2::jsonb)
       RETURNING id, ts`,
      [event.event_name, JSON.stringify(payload)]
    );

    return {
      id: String(result.rows[0].id),
      event_name: event.event_name,
      timestamp: event.timestamp,
      payload: event.payload || {},
      context: event.context || {},
    };
  }

  async appendEvent(name, payload = {}) {
    const result = await query(
      `INSERT INTO events (name, payload)
       VALUES ($1, $2::jsonb)
       RETURNING id, ts`,
      [name, JSON.stringify(payload)]
    );

    return {
      id: String(result.rows[0].id),
      event_name: name,
      timestamp: toIso(result.rows[0].ts),
      payload,
    };
  }
}

function createPostgresRepositories() {
  return {
    providers: new ProviderRepositoryPg(),
    leads: new LeadRepositoryPg(),
    events: new EventRepositoryPg(),
  };
}

module.exports = {
  createPostgresRepositories,
};

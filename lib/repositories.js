const fs = require("node:fs");
const path = require("node:path");
const { createProvider, createLead } = require("./models");
const { createPostgresRepositories } = require("./repositories.pg");

class JsonRepository {
  constructor(filePath, defaultValue = []) {
    this.filePath = filePath;
    this.defaultValue = defaultValue;
    this.ensureFile();
  }

  ensureFile() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify(this.defaultValue, null, 2));
    }
  }

  read() {
    this.ensureFile();
    const raw = fs.readFileSync(this.filePath, "utf8").trim();
    if (!raw) return JSON.parse(JSON.stringify(this.defaultValue));
    return JSON.parse(raw);
  }

  write(payload) {
    this.ensureFile();
    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2));
    fs.renameSync(tempPath, this.filePath);
    return payload;
  }
}

class ProviderRepositoryJson {
  constructor(dataDir) {
    this.repo = new JsonRepository(path.join(dataDir, "providers.json"), []);
  }

  async list() {
    return this.repo.read();
  }

  async listActive() {
    const providers = await this.list();
    return providers.filter((provider) => provider.active);
  }

  async getById(id) {
    const providers = await this.list();
    return providers.find((provider) => provider.id === id) || null;
  }

  async getByIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const idSet = new Set(ids.map((item) => String(item).trim()).filter(Boolean));
    if (idSet.size === 0) return [];

    const providers = await this.list();
    return providers.filter((provider) => idSet.has(provider.id));
  }

  async create(input) {
    const providers = await this.list();
    const provider = createProvider(input);
    providers.push(provider);
    this.repo.write(providers);
    return provider;
  }

  async update(id, input) {
    const providers = await this.list();
    const index = providers.findIndex((provider) => provider.id === id);
    if (index === -1) return null;

    const updatedProvider = createProvider(input, providers[index]);
    providers[index] = updatedProvider;
    this.repo.write(providers);
    return updatedProvider;
  }

  async touchAssignedAt(providerIds, assignedAtIso) {
    if (!providerIds.length) return;
    const providerIdSet = new Set(providerIds);
    const providers = await this.list();

    const updated = providers.map((provider) => {
      if (!providerIdSet.has(provider.id)) return provider;
      return {
        ...provider,
        last_assigned_at: assignedAtIso,
      };
    });

    this.repo.write(updated);
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
    const providers = await this.list();
    const filtered = providers.filter((provider) => provider.id !== id);
    const deleted = filtered.length !== providers.length;
    if (deleted) {
      this.repo.write(filtered);
    }
    return deleted;
  }
}

class LeadRepositoryJson {
  constructor(dataDir) {
    this.repo = new JsonRepository(path.join(dataDir, "leads.json"), []);
  }

  async list() {
    return this.repo
      .read()
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }

  async getById(id) {
    const leads = await this.list();
    return leads.find((lead) => lead.id === id) || null;
  }

  async create(input, options) {
    const leads = await this.list();
    const lead = createLead(input, options);
    leads.unshift(lead);
    this.repo.write(leads);
    return lead;
  }

  async update(id, patch) {
    const leads = await this.list();
    const index = leads.findIndex((lead) => lead.id === id);
    if (index === -1) return null;

    const merged = {
      ...leads[index],
      ...patch,
    };

    const validated = createLead(merged, {
      ip: merged.consent_ip,
    });
    validated.id = leads[index].id;
    validated.created_at = leads[index].created_at;

    leads[index] = validated;
    this.repo.write(leads);
    return validated;
  }

  async anonymize(id, { reason } = {}) {
    const leads = await this.list();
    const index = leads.findIndex((lead) => lead.id === id);
    if (index === -1) return null;

    const existing = leads[index];
    const nowIso = new Date().toISOString();
    const reasonText = String(reason || "").trim();
    const noteSuffix = reasonText ? ` ${reasonText}` : "";
    const notesAppend = `\n[ANONYMIZED]${noteSuffix}`;
    const providerIds = Array.isArray(existing.provider_ids) ? existing.provider_ids.slice(0, 2) : [];

    const anonymized = {
      ...existing,
      status: "deleted",
      deleted_at: nowIso,
      updated_at: nowIso,
      name: "ANONIMIZADO",
      email: null,
      phone: null,
      city: null,
      postal_code: null,
      consent_ip: null,
      provider_ids: providerIds,
      assigned_provider_id: providerIds.length > 0 ? providerIds[0] : null,
      notes: `${existing.notes || ""}${notesAppend}`,
    };

    leads[index] = anonymized;
    this.repo.write(leads);
    return anonymized;
  }

  async countAssignedForProviderOnDate(providerId, dateIso) {
    const leads = await this.list();
    return leads.reduce((count, lead) => {
      const sameDate = lead.created_at && lead.created_at.startsWith(dateIso);
      const assigned = Array.isArray(lead.provider_ids) && lead.provider_ids.includes(providerId);
      return sameDate && assigned ? count + 1 : count;
    }, 0);
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
    const lead = await this.getById(id);
    if (!lead) return null;
    return this.update(id, { ...lead, status });
  }

  async addLeadNote(id, note) {
    const lead = await this.getById(id);
    if (!lead) return null;
    return this.update(id, { ...lead, notes: note });
  }
}

class EventRepositoryJson {
  constructor(dataDir) {
    this.repo = new JsonRepository(path.join(dataDir, "events.json"), []);
  }

  async list(limit = 200) {
    return this.repo
      .read()
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
      .slice(0, limit);
  }

  async append(event) {
    const events = this.repo.read();
    events.push(event);
    this.repo.write(events);
    return event;
  }

  async appendEvent(name, payload = {}) {
    const event = {
      id: String(Date.now()),
      event_name: name,
      timestamp: new Date().toISOString(),
      payload,
      context: {},
    };
    return this.append(event);
  }
}

function createJsonRepositories(dataDir) {
  return {
    providers: new ProviderRepositoryJson(dataDir),
    leads: new LeadRepositoryJson(dataDir),
    events: new EventRepositoryJson(dataDir),
  };
}

function createRepositories(dataDir) {
  if (process.env.DATABASE_URL) {
    return createPostgresRepositories();
  }
  return createJsonRepositories(dataDir);
}

module.exports = {
  createRepositories,
};

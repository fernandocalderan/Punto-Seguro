const fs = require("node:fs");
const path = require("node:path");
const { createProvider, createLead } = require("./models");

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

class ProviderRepository {
  constructor(dataDir) {
    this.repo = new JsonRepository(path.join(dataDir, "providers.json"), []);
  }

  list() {
    return this.repo.read();
  }

  listActive() {
    return this.list().filter((provider) => provider.active);
  }

  getById(id) {
    return this.list().find((provider) => provider.id === id) || null;
  }

  create(input) {
    const providers = this.list();
    const provider = createProvider(input);
    providers.push(provider);
    this.repo.write(providers);
    return provider;
  }

  update(id, input) {
    const providers = this.list();
    const index = providers.findIndex((provider) => provider.id === id);
    if (index === -1) return null;

    const updatedProvider = createProvider(input, providers[index]);
    providers[index] = updatedProvider;
    this.repo.write(providers);
    return updatedProvider;
  }

  touchAssignedAt(providerIds, assignedAtIso) {
    if (!providerIds.length) return;
    const providerIdSet = new Set(providerIds);
    const providers = this.list();

    const updated = providers.map((provider) => {
      if (!providerIdSet.has(provider.id)) return provider;
      return {
        ...provider,
        last_assigned_at: assignedAtIso,
      };
    });

    this.repo.write(updated);
  }
}

class LeadRepository {
  constructor(dataDir) {
    this.repo = new JsonRepository(path.join(dataDir, "leads.json"), []);
  }

  list() {
    return this.repo
      .read()
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }

  getById(id) {
    return this.list().find((lead) => lead.id === id) || null;
  }

  create(input, options) {
    const leads = this.list();
    const lead = createLead(input, options);
    leads.unshift(lead);
    this.repo.write(leads);
    return lead;
  }

  update(id, patch) {
    const leads = this.list();
    const index = leads.findIndex((lead) => lead.id === id);
    if (index === -1) return null;

    const merged = {
      ...leads[index],
      ...patch,
    };

    // Revalidate required fields while preserving id/created_at
    const validated = createLead(merged, {
      ip: merged.consent_ip,
    });
    validated.id = leads[index].id;
    validated.created_at = leads[index].created_at;

    leads[index] = validated;
    this.repo.write(leads);
    return validated;
  }

  countAssignedForProviderOnDate(providerId, dateIso) {
    return this.list().reduce((count, lead) => {
      const sameDate = lead.created_at && lead.created_at.startsWith(dateIso);
      const assigned = Array.isArray(lead.provider_ids) && lead.provider_ids.includes(providerId);
      return sameDate && assigned ? count + 1 : count;
    }, 0);
  }
}

class EventRepository {
  constructor(dataDir) {
    this.repo = new JsonRepository(path.join(dataDir, "events.json"), []);
  }

  list(limit = 200) {
    return this.repo
      .read()
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
      .slice(0, limit);
  }

  append(event) {
    const events = this.repo.read();
    events.push(event);
    this.repo.write(events);
    return event;
  }
}

function createRepositories(dataDir) {
  return {
    providers: new ProviderRepository(dataDir),
    leads: new LeadRepository(dataDir),
    events: new EventRepository(dataDir),
  };
}

module.exports = {
  createRepositories,
};

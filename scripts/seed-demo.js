#!/usr/bin/env node
require("dotenv").config();

const path = require("node:path");
const { createRepositories } = require("../lib/repositories");
const { createEmailService } = require("../lib/email");
const { createLeadAndDispatch } = require("../lib/leadService");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");

const repositories = createRepositories(DATA_DIR);
const emailService = createEmailService({
  env: process.env,
  dataDir: DATA_DIR,
});

const DEMO_PROVIDERS = [
  {
    name: "Alarma BCN Centro",
    email: "demo-bcn-centro@puntoseguro.local",
    phone: "+34 931 000 001",
    zones: ["08001", "08002", "08003", "barcelona"],
    business_types: ["vivienda", "comercio"],
    active: true,
    priority: 10,
    daily_cap: 4,
  },
  {
    name: "Castelldefels Protegido",
    email: "demo-castelldefels@puntoseguro.local",
    phone: "+34 936 000 002",
    zones: ["08860", "castelldefels"],
    business_types: ["vivienda"],
    active: true,
    priority: 20,
    daily_cap: 3,
  },
  {
    name: "Gava Seguridad Activa",
    email: "demo-gava@puntoseguro.local",
    phone: "+34 936 000 003",
    zones: ["08850", "gava"],
    business_types: ["vivienda", "comercio"],
    active: true,
    priority: 15,
    daily_cap: 3,
  },
  {
    name: "Viladecans Alerta",
    email: "demo-viladecans@puntoseguro.local",
    phone: "+34 936 000 004",
    zones: ["08840", "viladecans"],
    business_types: ["vivienda", "comercio"],
    active: true,
    priority: 25,
    daily_cap: 2,
  },
  {
    name: "Barcelona Empresas Seguras",
    email: "demo-bcn-empresa@puntoseguro.local",
    phone: "+34 931 000 005",
    zones: ["08001", "08002", "08003", "08004", "barcelona"],
    business_types: ["comercio", "oficina"],
    active: true,
    priority: 30,
    daily_cap: 5,
  },
];

async function upsertProviders() {
  const existing = await repositories.providers.list();

  for (const providerData of DEMO_PROVIDERS) {
    const found = existing.find((provider) => provider.email === providerData.email);
    if (found) {
      await repositories.providers.update(found.id, providerData);
    } else {
      await repositories.providers.create(providerData);
    }
  }
}

async function seedLead() {
  const result = await createLeadAndDispatch({
    leadInput: {
      name: "Lead Demo Punto Seguro",
      email: "lead-demo@puntoseguro.local",
      phone: "+34 600 111 222",
      city: "Barcelona",
      postal_code: "08002",
      business_type: "vivienda",
      risk_level: "ALTO",
      urgency: "alta",
      budget_range: "1500_3000",
      consent: true,
      consent_timestamp: new Date().toISOString(),
      evaluation_summary: "Accesos principales y horarios previsibles incrementan la exposición.",
    },
    requesterIp: "127.0.0.1",
    repositories,
    emailService,
    maxProvidersPerLead: Number(process.env.MAX_PROVIDERS_PER_LEAD || 2),
  });

  return result;
}

async function main() {
  await upsertProviders();
  const providers = await repositories.providers.list();
  const shouldSeedLead = process.env.SEED_SKIP_LEAD !== "true";
  const result = shouldSeedLead ? await seedLead() : null;

  console.log("Seed completado");
  console.log(`Providers totales: ${providers.length}`);
  if (result) {
    console.log(`Lead demo creado: ${result.lead.id}`);
    console.log(`Providers asignados al demo: ${result.assignedProviders.length}`);
  } else {
    console.log("Lead demo omitido (SEED_SKIP_LEAD=true)");
  }
  console.log(`Modo email: ${emailService.mode}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

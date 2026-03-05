#!/usr/bin/env node

/*
 * Guardrail validator for P0 NO_TOCAR contracts.
 * Fails fast when DOM/storage/API/tracking contracts are missing.
 */

const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const CONTRACT_PATH = path.join(ROOT_DIR, "contracts", "no_tocar_p0.json");
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function escapeRegExp(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasId(html, id) {
  const re = new RegExp(`id=["']${escapeRegExp(id)}["']`);
  return re.test(html);
}

function hasClassToken(html, classToken) {
  const re = new RegExp(`class=["'][^"']*\\b${escapeRegExp(classToken)}\\b`);
  return re.test(html);
}

function checkOrderedRefs(html, refs) {
  const failures = [];
  let cursor = -1;

  for (const ref of refs || []) {
    const idx = html.indexOf(ref);
    if (idx === -1) {
      failures.push(`missing ref: ${ref}`);
      continue;
    }
    if (idx < cursor) {
      failures.push(`out of order ref: ${ref}`);
    }
    cursor = idx;
  }

  return failures;
}

function walkFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(ROOT_DIR, fullPath);

    if (entry.isDirectory()) {
      if (["node_modules", ".git", "docs", "data"].includes(entry.name)) {
        continue;
      }
      walkFiles(fullPath, out);
      continue;
    }

    if (entry.isFile() && (relPath.endsWith(".js") || relPath.endsWith(".html"))) {
      out.push(fullPath);
    }
  }
  return out;
}

async function fetchUrl(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  return { status: response.status, text };
}

function routeLabel(route) {
  return route === "/" ? "/ (home)" : route;
}

function fail(list, msg) {
  list.push(msg);
  console.error(`  [FAIL] ${msg}`);
}

function ok(msg) {
  console.log(`  [OK] ${msg}`);
}

function validateStorageKeys(contract, failures) {
  console.log("\n== Storage keys ==");
  const files = walkFiles(ROOT_DIR);
  const corpus = files.map((filePath) => readText(filePath)).join("\n");

  for (const key of contract.storageKeys || []) {
    if (corpus.includes(key)) {
      ok(`storage key present: ${key}`);
    } else {
      fail(failures, `storage key not found in source: ${key}`);
    }
  }
}

function validateApiStatic(contract, failures) {
  console.log("\n== API static contracts in server.js ==");
  const serverPath = path.join(ROOT_DIR, "server.js");
  const serverText = readText(serverPath);

  for (const endpoint of contract.apiContracts || []) {
    const method = String(endpoint.method || "").toLowerCase();
    const route = String(endpoint.path || "");
    const snippet = `app.${method}(\"${route}\"`;

    if (serverText.includes(snippet)) {
      ok(`${endpoint.method} ${route}`);
    } else {
      fail(failures, `missing API contract in server.js: ${endpoint.method} ${route}`);
    }
  }
}

async function validateRouteContracts(contract, failures) {
  console.log("\n== Route contracts ==");

  for (const routeCfg of contract.routes || []) {
    const route = routeCfg.path;
    const url = `${BASE_URL}${route}`;
    console.log(`\n-- ${routeLabel(route)} (${url})`);

    let payload;
    try {
      payload = await fetchUrl(url);
    } catch (error) {
      fail(failures, `${route}: fetch failed (${error.message})`);
      continue;
    }

    if (payload.status !== 200) {
      fail(failures, `${route}: expected HTTP 200, got ${payload.status}`);
      continue;
    }
    ok(`${route}: HTTP 200`);

    const html = payload.text;

    for (const id of routeCfg.requiredIds || []) {
      if (hasId(html, id)) {
        ok(`${route}: id ${id}`);
      } else {
        fail(failures, `${route}: missing id ${id}`);
      }
    }

    for (const classToken of routeCfg.requiredClassTokens || []) {
      if (hasClassToken(html, classToken)) {
        ok(`${route}: class token ${classToken}`);
      } else {
        fail(failures, `${route}: missing class token ${classToken}`);
      }
    }

    for (const dataAttr of routeCfg.requiredDataAttrs || []) {
      if (html.includes(dataAttr)) {
        ok(`${route}: data attr ${dataAttr}`);
      } else {
        fail(failures, `${route}: missing data attr ${dataAttr}`);
      }
    }

    for (const snippet of routeCfg.requiredInlineSnippets || []) {
      if (html.includes(snippet)) {
        ok(`${route}: inline snippet present (${snippet.slice(0, 48)}...)`);
      } else {
        fail(failures, `${route}: missing inline snippet (${snippet})`);
      }
    }

    const cssOrderFailures = checkOrderedRefs(html, routeCfg.requiredCssRefsOrdered || []);
    for (const orderFailure of cssOrderFailures) {
      fail(failures, `${route}: ${orderFailure}`);
    }
    if (cssOrderFailures.length === 0 && (routeCfg.requiredCssRefsOrdered || []).length) {
      ok(`${route}: CSS refs ordered`);
    }

    const scriptOrderFailures = checkOrderedRefs(html, routeCfg.requiredScriptRefsOrdered || []);
    for (const orderFailure of scriptOrderFailures) {
      fail(failures, `${route}: ${orderFailure}`);
    }
    if (scriptOrderFailures.length === 0 && (routeCfg.requiredScriptRefsOrdered || []).length) {
      ok(`${route}: script refs ordered`);
    }
  }
}

async function validateAssets(contract, failures) {
  console.log("\n== Critical assets ==");

  for (const asset of contract.criticalAssets || []) {
    const url = `${BASE_URL}${asset}`;
    try {
      const response = await fetch(url);
      if (response.status === 200) {
        ok(`${asset}: HTTP 200`);
      } else {
        fail(failures, `${asset}: expected HTTP 200, got ${response.status}`);
      }
    } catch (error) {
      fail(failures, `${asset}: fetch failed (${error.message})`);
    }
  }
}

function validateTrackingStatic(contract, failures) {
  console.log("\n== Tracking static contracts ==");
  const files = walkFiles(ROOT_DIR);
  const corpus = files.map((filePath) => readText(filePath)).join("\n");

  for (const attr of contract.trackingAttrs || []) {
    if (corpus.includes(attr)) {
      ok(`tracking attr referenced: ${attr}`);
    } else {
      fail(failures, `tracking attr missing in source: ${attr}`);
    }
  }

  for (const eventName of contract.trackingEvents || []) {
    const markerDouble = `\"${eventName}\"`;
    const markerSingle = `'${eventName}'`;
    if (corpus.includes(markerDouble) || corpus.includes(markerSingle)) {
      ok(`tracking event referenced: ${eventName}`);
    } else {
      fail(failures, `tracking event missing in source: ${eventName}`);
    }
  }
}

function validateSourceSnippets(contract, failures) {
  console.log("\n== Source snippet contracts ==");
  const files = walkFiles(ROOT_DIR);
  const corpus = files.map((filePath) => readText(filePath)).join("\n");

  for (const snippet of contract.sourceSnippets || []) {
    if (corpus.includes(snippet)) {
      ok(`source snippet present: ${snippet.slice(0, 56)}${snippet.length > 56 ? "..." : ""}`);
    } else {
      fail(failures, `source snippet missing: ${snippet}`);
    }
  }
}

function validateAdminIsolation(contract, failures) {
  console.log("\n== Admin isolation ==");
  const adminCfg = contract.adminIsolation || {};

  for (const relFile of adminCfg.files || []) {
    const absFile = path.join(ROOT_DIR, relFile);
    if (!fs.existsSync(absFile)) {
      fail(failures, `admin file missing: ${relFile}`);
      continue;
    }

    const html = readText(absFile);
    ok(`admin file found: ${relFile}`);

    for (const forbidden of adminCfg.forbiddenRefs || []) {
      if (html.includes(forbidden)) {
        fail(failures, `${relFile}: forbidden ref found (${forbidden})`);
      }
    }
  }
}

async function validateApiProbes(contract, failures) {
  console.log("\n== API runtime probes ==");

  for (const probe of contract.apiProbes || []) {
    const method = String(probe.method || "GET").toUpperCase();
    const pathName = String(probe.path || "");
    const url = `${BASE_URL}${pathName}`;

    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    if (probe.body && method !== "GET" && method !== "HEAD") {
      options.body = JSON.stringify(probe.body);
    }

    try {
      const response = await fetch(url, options);
      const expected = new Set((probe.expectedStatuses || []).map((n) => Number(n)));
      if (expected.has(response.status)) {
        ok(`${method} ${pathName}: HTTP ${response.status}`);
      } else {
        fail(
          failures,
          `${method} ${pathName}: unexpected HTTP ${response.status}, expected ${Array.from(expected).join(", ")}`
        );
      }
    } catch (error) {
      fail(failures, `${method} ${pathName}: probe failed (${error.message})`);
    }
  }
}

async function main() {
  if (!fs.existsSync(CONTRACT_PATH)) {
    console.error(`[guardrail] missing contract file: ${CONTRACT_PATH}`);
    process.exit(1);
  }

  const contract = readJson(CONTRACT_PATH);
  const failures = [];

  console.log("== Guardrail contract validation ==");
  console.log(`Contract file: ${path.relative(ROOT_DIR, CONTRACT_PATH)}`);
  console.log(`Base URL: ${BASE_URL}`);

  await validateRouteContracts(contract, failures);
  await validateAssets(contract, failures);
  await validateApiProbes(contract, failures);
  validateStorageKeys(contract, failures);
  validateApiStatic(contract, failures);
  validateTrackingStatic(contract, failures);
  validateSourceSnippets(contract, failures);
  validateAdminIsolation(contract, failures);

  console.log("\n== Summary ==");
  if (failures.length > 0) {
    console.error(`[guardrail] FAIL (${failures.length} issues)`);
    process.exit(1);
  }

  console.log("[guardrail] PASS");
}

main().catch((error) => {
  console.error(`[guardrail] fatal error: ${error.stack || error.message}`);
  process.exit(1);
});

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

let chromium;
let devices;
try {
  ({ chromium, devices } = require('playwright'));
} catch (_e) {
  console.error('Missing dependency: playwright. Install with: npm install --no-save playwright && npx playwright install chromium');
  process.exit(2);
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OUT_DIR = path.join(process.cwd(), 'docs', 'diagnostics');
const P0_ROUTES = ['/', '/diagnostico', '/resultado', '/solicitar-propuesta', '/confirmacion'];
const EXPECTED_TRACKING = [
  'quiz_started',
  'quiz_completed',
  'result_viewed',
  'cta_proposals_click',
  'lead_submit_clicked',
  'lead_submit_success',
];

const artifacts = {
  baseUrl: BASE_URL,
  generatedAt: new Date().toISOString(),
  visitedRoutes: [],
  consoleErrors: [],
  pageErrors: [],
  networkFailures: [],
  apiCalls: [],
  trackingEventsSeen: [],
  trackingMissing: [],
  otpStatus: 'UNKNOWN',
  mobileChecks: {},
  notes: [],
};

function pathnameOf(url) {
  try {
    return new URL(url).pathname;
  } catch (_e) {
    return url;
  }
}

async function readBodySafe(response) {
  try {
    return await response.text();
  } catch (_e) {
    return '';
  }
}

function attachObservers(page, label, eventSet) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      artifacts.consoleErrors.push({ label, pageUrl: page.url(), text: msg.text() });
    }
  });

  page.on('pageerror', (err) => {
    artifacts.pageErrors.push({ label, pageUrl: page.url(), message: err.message || String(err) });
  });

  page.on('response', async (res) => {
    const req = res.request();
    const method = req.method();
    const status = res.status();
    const urlPath = pathnameOf(res.url());

    let errorBody = '';
    if (status >= 400 && urlPath.startsWith('/api/')) {
      errorBody = await readBodySafe(res);
    }

    if (status >= 400) {
      artifacts.networkFailures.push({
        label,
        pageUrl: page.url(),
        method,
        status,
        url: urlPath,
        errorBody,
      });
    }

    if (urlPath.startsWith('/api/')) {
      artifacts.apiCalls.push({ label, method, status, url: urlPath });
    }

    if (urlPath === '/api/events') {
      const payload = req.postData();
      if (payload) {
        try {
          const parsed = JSON.parse(payload);
          if (parsed && parsed.event_name) {
            eventSet.add(String(parsed.event_name));
          }
        } catch (_e) {
          // ignore parse errors
        }
      }
    }
  });
}

async function runDesktopFlow() {
  const events = new Set();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  attachObservers(page, 'desktop', events);

  try {
    for (const route of P0_ROUTES) {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
      artifacts.visitedRoutes.push({ route, finalUrl: page.url() });
    }

    // Funnel interaction for tracking sampling.
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await Promise.all([
      page.waitForURL(/\/diagnostico/, { timeout: 20000 }),
      page.locator('#hero-primary-cta').click(),
    ]);

    // Minimal diagnostico completion.
    if (await page.locator('.ps-type-btn[data-type="vivienda"]').count()) {
      await page.locator('.ps-type-btn[data-type="vivienda"]').click();
    }
    await page.waitForTimeout(800);

    const dynamicSelectCount = await page.locator('select[data-qid]').count();
    artifacts.diagnosticoDynamic = { selectDataQidCount: dynamicSelectCount };
    if (dynamicSelectCount === 0) {
      artifacts.notes.push('No se detectaron select[data-qid] en /diagnostico después de seleccionar tipo de inmueble.');
    }

    await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select[data-qid]')).filter((el) => !el.disabled && el.offsetParent !== null);
      for (const el of selects) {
        const options = Array.from(el.options || []).map((o) => o.value).filter(Boolean);
        if (options.length > 0) {
          el.value = options[0];
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });

    const submit = page.locator('#evaluador-form button[type="submit"], .btn-evaluador').first();
    await Promise.all([
      page.waitForURL(/\/resultado/, { timeout: 40000 }),
      submit.click(),
    ]);

    // Click CTA request for cta_proposals_click.
    if (await page.locator('#cta-request').count()) {
      await Promise.all([
        page.waitForURL(/\/solicitar-propuesta/, { timeout: 20000 }),
        page.locator('#cta-request').click(),
      ]);
    }

    // Lead submit click for lead_submit_clicked.
    if (await page.locator('#lead-form').count()) {
      await page.fill('#name', 'Diag Runtime');
      await page.fill('#phone', '+34612345678');
      await page.fill('#email', 'diag-runtime@puntoseguro.local');
      await page.fill('#postal_code', '08001');
      if (await page.locator('#consent').count()) {
        await page.check('#consent');
      }
      await page.locator('#lead-form button[type="submit"]').click();
      await page.waitForTimeout(1500);
    }
  } finally {
    artifacts.trackingEventsSeen = Array.from(events).sort();
    await context.close();
    await browser.close();
  }
}

async function runMobileChecks() {
  const events = new Set();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices['iPhone 12'] });
  const page = await context.newPage();
  attachObservers(page, 'mobile', events);

  try {
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    const preScroll = await page.evaluate(() => {
      const sticky = document.querySelector('.ps-sticky-bar');
      const cta = document.querySelector('#hero-primary-cta');
      const stickyVisible = Boolean(sticky) && getComputedStyle(sticky).display !== 'none';
      let overlap = false;
      if (sticky && cta) {
        const sr = sticky.getBoundingClientRect();
        const cr = cta.getBoundingClientRect();
        overlap = !(cr.bottom < sr.top || cr.top > sr.bottom);
      }
      return { stickyVisible, overlap, className: sticky ? sticky.className : null };
    });

    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(700);

    const postScroll = await page.evaluate(() => {
      const sticky = document.querySelector('.ps-sticky-bar');
      const stickyVisible = Boolean(sticky) && getComputedStyle(sticky).display !== 'none';
      return { stickyVisible, className: sticky ? sticky.className : null };
    });

    await page.goto(`${BASE_URL}/solicitar-propuesta`, { waitUntil: 'networkidle' });
    const otpModalStyle = await page.evaluate(() => {
      const overlay = document.querySelector('#ps-otp-overlay');
      if (!overlay) return null;
      const st = getComputedStyle(overlay);
      return {
        position: st.position,
        zIndex: st.zIndex,
        display: st.display,
      };
    });

    artifacts.mobileChecks = { preScroll, postScroll, otpModalStyle };
  } finally {
    await context.close();
    await browser.close();
  }
}

function writeOutputs() {
  artifacts.trackingMissing = EXPECTED_TRACKING.filter((eventName) => !artifacts.trackingEventsSeen.includes(eventName));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'console_errors.json'), JSON.stringify({
    console: artifacts.consoleErrors,
    page: artifacts.pageErrors,
  }, null, 2));

  fs.writeFileSync(path.join(OUT_DIR, 'network_failures.json'), JSON.stringify({
    failures: artifacts.networkFailures,
    apiCalls: artifacts.apiCalls,
  }, null, 2));

  fs.writeFileSync(path.join(OUT_DIR, 'runtime_smoke_summary.json'), JSON.stringify(artifacts, null, 2));
}

function classifyOtpStatus() {
  const otpStart = artifacts.apiCalls.filter((entry) => entry.url === '/api/otp/start');
  const otpCheck = artifacts.apiCalls.filter((entry) => entry.url === '/api/otp/check');
  const otpToken = artifacts.apiCalls.filter((entry) => entry.url === '/api/otp/token');
  const leads = artifacts.apiCalls.filter((entry) => entry.url === '/api/leads');

  const otpNotConfiguredFailure = artifacts.networkFailures.find(
    (entry) =>
      entry.url === '/api/otp/start' &&
      entry.status === 503 &&
      String(entry.errorBody || '').includes('otp_not_configured')
  );

  if (otpNotConfiguredFailure) {
    artifacts.otpStatus = 'SKIPPED_ENV_NOT_CONFIGURED';
    return;
  }

  if (leads.some((entry) => entry.status === 201)) {
    artifacts.otpStatus = 'PASS_LEAD_201';
    return;
  }

  if (otpStart.length === 0) {
    artifacts.otpStatus = 'NOT_EXECUTED';
    return;
  }

  if (otpStart.some((entry) => entry.status >= 500)) {
    artifacts.otpStatus = 'FAIL_ENV_OR_PROVIDER';
    return;
  }

  if (otpStart.some((entry) => entry.status === 429)) {
    artifacts.otpStatus = 'FAIL_RATE_LIMITED';
    return;
  }

  if (otpStart.some((entry) => entry.status === 200) && otpCheck.length === 0 && otpToken.length === 0) {
    artifacts.otpStatus = 'STARTED_WAITING_USER_CODE';
    return;
  }

  artifacts.otpStatus = 'PARTIAL';
}

async function main() {
  await runDesktopFlow();
  await runMobileChecks();
  classifyOtpStatus();
  writeOutputs();

  const criticalErrors = artifacts.consoleErrors.length + artifacts.pageErrors.length;
  if ((artifacts.diagnosticoDynamic?.selectDataQidCount || 0) === 0) {
    process.exitCode = 1;
  }
  const failures = artifacts.networkFailures.filter((f) => {
    if (f.url === '/api/eval-snapshot/me' && f.status === 404) return false;
    if (
      f.url === '/api/otp/start' &&
      f.status === 503 &&
      String(f.errorBody || '').includes('otp_not_configured')
    ) {
      return false;
    }
    return true;
  });

  console.log('[runtime_smoke_playwright] completed');
  console.log(`console/page errors: ${criticalErrors}`);
  console.log(`network failures (excluding /api/eval-snapshot/me 404): ${failures.length}`);
  console.log(`otp status: ${artifacts.otpStatus}`);
  console.log(`tracking seen: ${artifacts.trackingEventsSeen.join(', ') || 'none'}`);
  console.log(`tracking missing: ${artifacts.trackingMissing.join(', ') || 'none'}`);

  if (criticalErrors > 0 || failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[runtime_smoke_playwright] fatal', error);
  process.exit(1);
});

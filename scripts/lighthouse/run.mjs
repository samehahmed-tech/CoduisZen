// Lighthouse runner for Restoflow ERP (Vite SPA + Express API).
// Zero new deps: Chrome launched with chrome-launcher-style flags, auth seeded
// via raw CDP (puppeteer defaults wedge heavy-page targets: NO_FCP + PROTOCOL_TIMEOUT).
// Lighthouse CLI runs via npx with --disable-storage-reset so the session survives.
// Usage: npm run lighthouse:all | LH_ONLY=/pos,/orders npm run lighthouse:run
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(DIR, '..', '..');
const OUT = join(ROOT, 'reports', 'lighthouse');
const RAW = join(OUT, 'raw');

// --- env files (never print values) ---
for (const f of ['.env.local', '.env']) {
  const p = join(ROOT, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}

const BASE = (process.env.LH_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
const API = (process.env.LH_API_URL || 'http://127.0.0.1:3001/api').replace(/\/+$/, '');
async function freePort(prefer) {
  const net = await import('node:net');
  for (let p = prefer; p < prefer + 50; p++) {
    const ok = await new Promise((res) => {
      const s = net.createConnection({ host: '127.0.0.1', port: p, timeout: 500 });
      s.on('connect', () => { s.destroy(); res(false); });
      s.on('timeout', () => { s.destroy(); res(true); });
      s.on('error', () => res(true));
    });
    if (ok) return p;
  }
  fail('no free debug port found');
}
const DEBUG_PORT = await freePort(Number(process.env.LH_DEBUG_PORT || 9222));
const EMAIL = process.env.LH_EMAIL || process.env.DEV_BOOTSTRAP_EMAIL || process.env.LOAD_AUTH_EMAIL || process.env.HEALTH_AUTH_EMAIL || '';
const PASSWORD = process.env.LH_PASSWORD || process.env.DEV_BOOTSTRAP_PASSWORD || process.env.LOAD_AUTH_PASSWORD || process.env.HEALTH_AUTH_PASSWORD || '';
const ONLY = (process.env.LH_ONLY || '').split(',').map(s => s.trim()).filter(Boolean);
const MAX_PAGES = Number(process.env.LH_MAX_PAGES || 0);
const DRY = process.env.LH_DRY_RUN === '1';
const MIN_PERF = Number(process.env.LH_MIN_PERF || 0);

const slug = (p) => p === '/' ? 'home' : p.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-');
const fail = (msg) => { console.error(`[lighthouse] FATAL: ${msg}`); process.exit(2); };
const LOGF = join(OUT, 'run-progress.log');
const log = (msg) => {
  const line = `[lighthouse ${new Date().toISOString().slice(11, 19)}] ${msg}`;
  console.log(line);
  try { appendFileSync(LOGF, line + '\n'); } catch { /* */ }
};

const reg = JSON.parse(readFileSync(join(DIR, 'routes.json'), 'utf8'));
let routes = reg.routes;
if (ONLY.length) routes = routes.filter(r => ONLY.includes(r.path));
if (MAX_PAGES > 0) routes = routes.slice(0, MAX_PAGES);
const DEVICES = ['desktop', 'mobile'];

// Chrome pinned to lighthouse's expected build (puppeteer cache) so CDP matches;
// system Chrome only as fallback. Exported to lighthouse via CHROME_PATH.
const CHROME_CANDS = [process.env.LH_CHROME_PATH || '',
  'C:\\Users\\Admin\\.cache\\puppeteer\\chrome\\win64-146.0.7680.153\\chrome-win64\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'];
const CHROME_EXE = CHROME_CANDS.find(p => p && existsSync(p)) || '';
if (!CHROME_EXE) fail('no Chrome found. Run: npx puppeteer browsers install chrome');
process.env.CHROME_PATH = process.env.CHROME_PATH || CHROME_EXE;

async function checkServers() {
  try {
    const r = await fetch(BASE + '/', { signal: AbortSignal.timeout(10000) });
    if (!r.ok) fail(`frontend ${BASE} returned HTTP ${r.status}. Start it: npm run preview -- --port 3000 --host`);
  } catch (e) { fail(`frontend ${BASE} unreachable (${e.cause?.code || e.message}). Start it: npm run preview -- --port 3000 --host`); }
  try {
    const r = await fetch(API + '/health', { signal: AbortSignal.timeout(10000) });
    if (!r.ok) fail(`api ${API} returned HTTP ${r.status}. Start it: npm run start`);
  } catch (e) { fail(`api ${API} unreachable (${e.cause?.code || e.message}). Start it: npm run start`); }
}

async function login() {
  if (!EMAIL || !PASSWORD) fail('no test credentials. Set LH_EMAIL + LH_PASSWORD (or LOAD_AUTH_*/DEV_BOOTSTRAP_* in .env.local).');
  const r = await fetch(API + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, deviceName: 'lighthouse-audit' }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) fail(`login failed: HTTP ${r.status} ${body.code || body.message || ''} (check credentials / MFA lockout)`);
  if (body.mfaRequired) fail('login requires MFA code — needs human one-time setup. Aborting without weakening auth.');
  if (!body.token || !body.user) fail('login response missing token/user — not treating as success.');
  const me = await fetch(API + '/auth/me', { headers: { Authorization: `Bearer ${body.token}` }, signal: AbortSignal.timeout(15000) });
  if (!me.ok) fail(`session verify failed: HTTP ${me.status}. Distinguishing auth failure from page failure.`);
  log(`authenticated as ${body.user.email || body.user.name || 'user'} (role: ${body.user.role || '?'})`);
  return body;
}

// CDP helpers (no puppeteer: its default flags wedge Lighthouse targets on heavy pages)
const cdpSend = (wsUrl, method, params = {}) => new Promise((resolve, reject) => {
  const ws = new WebSocket(wsUrl);
  const id = Math.floor(Math.random() * 1e9);
  const timer = setTimeout(() => { try { ws.close(); } catch { /* */ } reject(new Error('cdp-timeout:' + method)); }, 25000);
  ws.onopen = () => ws.send(JSON.stringify({ id, method, params }));
  ws.onmessage = (ev) => { const m = JSON.parse(String(ev.data)); if (m.id === id) { clearTimeout(timer); ws.close(); m.error ? reject(new Error(JSON.stringify(m.error).slice(0, 120))) : resolve(m.result); } };
  ws.onerror = () => { clearTimeout(timer); reject(new Error('ws-error')); };
});
const cdpEval = (wsUrl, expr) => cdpSend(wsUrl, 'Runtime.evaluate', { expression: expr, returnByValue: true });
async function cdpWait(wsUrl, expr, want, tries = 20) {
  for (let i = 0; i < tries; i++) {
    try { const r = await cdpEval(wsUrl, expr); if (String(r?.result?.value) === want) return true; } catch { /* */ }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

async function seedBrowser(session) {
  // Launch flags mirror chrome-launcher (what Lighthouse drives cleanly).
  // Puppeteer defaults were verified to wedge heavy-page targets (NO_FCP + PROTOCOL_TIMEOUT).
  const { spawn } = await import('node:child_process');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const profile = mkdtempSync(join(tmpdir(), 'lh-prof-'));
  const chrome = spawn(CHROME_EXE, ['--headless=new', '--no-first-run', '--no-default-browser-check',
    '--no-sandbox', '--disable-dev-shm-usage', '--disable-features=Translate,OptimizationHints,MediaRouter',
    '--disable-extensions', '--disable-component-extensions-with-background-pages',
    '--hide-scrollbars', '--mute-audio', `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  const kill = () => { try { chrome.kill(); } catch { /* */ } try { rmSync(profile, { recursive: true, force: true }); } catch { /* */ } };
  await new Promise((r) => setTimeout(r, 4000));
  if (chrome.exitCode !== null) { kill(); fail('seed chrome exited early'); }
  let version = 'unknown';
  try { version = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`, { signal: AbortSignal.timeout(10000) })).json()).Browser || version; } catch { /* */ }
  const openTab = async (url) => (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(15000) })).json());
  let tab;
  try {
    tab = await openTab('about:blank');
    await cdpSend(tab.webSocketDebuggerUrl, 'Page.navigate', { url: BASE + '/login' });
    if (!await cdpWait(tab.webSocketDebuggerUrl, 'document.readyState', 'complete')) throw new Error('login page never ready');
    await new Promise((r) => setTimeout(r, 2000));
    const seedExpr = `(function(){localStorage.setItem('auth_token',${JSON.stringify(session.token)});localStorage.setItem('auth_refresh_token',${JSON.stringify(session.refreshToken || '')});return localStorage.getItem('auth_token')?'stored':'fail'})()`;
    const seeded = await cdpEval(tab.webSocketDebuggerUrl, seedExpr);
    if (seeded?.result?.value !== 'stored') throw new Error('localStorage seed failed');
    await cdpSend(tab.webSocketDebuggerUrl, 'Page.navigate', { url: BASE + '/' });
    await new Promise((r) => setTimeout(r, 6000));
    const url = (await cdpEval(tab.webSocketDebuggerUrl, 'location.href'))?.result?.value || '';
    if (url.includes('/login')) {
      const me = await fetch(API + '/auth/me', { headers: { Authorization: `Bearer ${session.token}` }, signal: AbortSignal.timeout(15000) });
      kill();
      fail(`seeded session lands on /login (server me:${me.status}). Auth failure, not page failure.`);
    }
    log(`session seeded, verified landing: ${url}`);
  } finally {
    try { if (tab?.id) await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/close/${tab.id}`).catch(() => undefined); } catch { /* */ }
  }
  return { chrome, kill, version };
}

function lhVersion() {
  const r = spawnSync('npx', ['--yes', 'lighthouse', '--version'], { shell: true, encoding: 'utf8', timeout: 120000 });
  return (r.stdout || '').trim().split('\n').pop() || 'unknown';
}

function runOne(route, device) {
  const url = BASE + route.path;
  const base = join(RAW, `${slug(route.path)}.${device}`);
  const args = [url, `--port=${DEBUG_PORT}`, '--disable-storage-reset', '--max-wait-for-load=45000',
    '--throttling-method=simulate', '--output=html', '--output=json', `--output-path=${base}`,
    '--chrome-flags=--no-sandbox --disable-dev-shm-usage', '--quiet'];
  if (device === 'desktop') args.push('--preset=desktop');
  const r = spawnSync('npx', ['--yes', 'lighthouse', ...args], { shell: true, encoding: 'utf8', timeout: 300000 });
  const jsonCands = [base + '.report.json', base + '.json', base].filter((p, i, a) => a.indexOf(p) === i);
  const found = jsonCands.find(p => existsSync(p));
  if (!found) return { route: route.path, device, status: 'error', error: `no json output (exit ${r.status}): ${(r.stderr || '').split('\n').slice(-3).join(' ')}`.slice(0, 300) };
  const htmlCands = [base + '.report.html', base + '.html', base + '.report.html'];
  const htmlFound = htmlCands.find(p => existsSync(p)) || null;
  try {
    const j = JSON.parse(readFileSync(found, 'utf8'));
    const cat = (n) => Math.round((j.categories?.[n]?.score ?? 0) * 100);
    const num = (n) => j.audits?.[n]?.numericValue ?? null;
    const finalUrl = j.finalDisplayedUrl || j.finalUrl || url;
    if (route.path !== '/login' && route.path !== '/setup' && finalUrl.includes('/login'))
      return { route: route.path, device, status: 'auth-redirect', finalUrl, reportHtml: htmlFound, reportJson: found };
    return {
      route: route.path, device, status: 'ok', finalUrl,
      scores: { performance: cat('performance'), accessibility: cat('accessibility'), bestPractices: cat('best-practices'), seo: cat('seo') },
      metrics: { lcpMs: num('largest-contentful-paint'), cls: num('cumulative-layout-shift'), tbtMs: num('total-blocking-time'), fcpMs: num('first-contentful-paint'), speedIndexMs: num('speed-index'), inpMs: num('interaction-to-next-paint') },
      consoleErrors: (j.audits?.['errors-in-console']?.details?.items?.length) ?? null,
      reportHtml: htmlFound, reportJson: found,
    };
  } catch (e) { return { route: route.path, device, status: 'error', error: `parse failed: ${e.message}`.slice(0, 200) }; }
}

function validExisting(route, device) {
  if (process.env.LH_FRESH === '1') return null;
  const base = join(RAW, `${slug(route.path)}.${device}`);
  for (const p of [base + '.report.json', base + '.json', base]) {
    if (!existsSync(p)) continue;
    try {
      const j = JSON.parse(readFileSync(p, 'utf8'));
      if (j.categories?.performance && (j.finalDisplayedUrl || j.finalUrl)) {
        const html = [base + '.report.html', base + '.html'].find(h => existsSync(h)) || null;
        const cat = (n) => Math.round((j.categories?.[n]?.score ?? 0) * 100);
        const num = (n) => j.audits?.[n]?.numericValue ?? null;
        const finalUrl = j.finalDisplayedUrl || j.finalUrl;
        if (route.path !== '/login' && route.path !== '/setup' && finalUrl.includes('/login')) continue;
        return {
          route: route.path, device, status: 'ok', finalUrl, resumed: true,
          scores: { performance: cat('performance'), accessibility: cat('accessibility'), bestPractices: cat('best-practices'), seo: cat('seo') },
          metrics: { lcpMs: num('largest-contentful-paint'), cls: num('cumulative-layout-shift'), tbtMs: num('total-blocking-time'), fcpMs: num('first-contentful-paint'), speedIndexMs: num('speed-index'), inpMs: num('interaction-to-next-paint') },
          consoleErrors: (j.audits?.['errors-in-console']?.details?.items?.length) ?? null,
          reportHtml: html, reportJson: p,
        };
      }
    } catch { /* fall through to fresh run */ }
  }
  return null;
}

const main = async () => {
  mkdirSync(RAW, { recursive: true });
  log(`plan: ${routes.length} routes x ${DEVICES.length} devices = ${routes.length * DEVICES.length} runs against ${BASE}`);
  if (DRY) { for (const r of routes) for (const d of DEVICES) console.log(`  would run: [${d}] ${r.path}`); return; }
  await checkServers();
  const session = await login();
  const { kill, version } = await seedBrowser(session);
  const results = [];
  try {
    for (const route of routes) {
      for (const device of DEVICES) {
        const cached = validExisting(route, device);
        if (cached) { log(`resume [${device}] ${route.path} perf=${cached.scores.performance}`); results.push(cached); continue; }
        log(`run [${device}] ${route.path}`);
        let res = runOne(route, device);
        if (res.status === 'error') { log(`retry [${device}] ${route.path}`); res = runOne(route, device); }
        results.push(res);
        log(` -> ${res.status}${res.scores ? ` perf=${res.scores.performance} a11y=${res.scores.accessibility} bp=${res.scores.bestPractices} seo=${res.scores.seo}` : ''}${res.error ? ` (${res.error})` : ''}`);
      }
    }
  } finally { kill(); }

  const stamp = new Date().toISOString();
  const summary = {
    generatedAt: stamp, base: BASE,
    env: { lighthouse: lhVersion(), chrome: version, node: process.version, api: API },
    settings: { desktop: 'lighthouse preset=desktop', mobile: 'lighthouse default (motoG4-ish, simulated throttling)', storageReset: 'disabled (shared auth session)', retries: 1 },
    totals: { routes: routes.length, runs: results.length, ok: results.filter(r => r.status === 'ok').length, failed: results.filter(r => r.status !== 'ok').length },
    results,
  };
  writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  const head = 'route,device,status,performance,accessibility,best_practices,seo,lcp_ms,cls,tbt_ms,fcp_ms,speed_index_ms,inp_ms,final_url,report';
  const rows = results.map(r => [r.route, r.device, r.status, r.scores?.performance ?? '', r.scores?.accessibility ?? '', r.scores?.bestPractices ?? '', r.scores?.seo ?? '',
    r.metrics?.lcpMs ?? '', r.metrics?.cls ?? '', r.metrics?.tbtMs ?? '', r.metrics?.fcpMs ?? '', r.metrics?.speedIndexMs ?? '', r.metrics?.inpMs ?? '',
    `"${r.finalUrl || ''}"`, r.reportHtml ? `"${r.reportHtml.split(/[\\/]/).pop()}"` : ''].join(','));
  writeFileSync(join(OUT, 'summary.csv'), head + '\n' + rows.join('\n') + '\n');
  writeFileSync(join(OUT, 'coverage.json'), JSON.stringify({
    generatedAt: stamp, discovered: reg.routes.length + reg.excluded.length,
    eligible: reg.routes.length, tested: routes.length,
    testedPublic: routes.filter(r => !r.auth).length, testedAuth: routes.filter(r => r.auth).length,
    untested: reg.routes.filter(r => !routes.some(t => t.path === r.path)).map(r => r.path),
    excluded: reg.excluded,
  }, null, 2));
  writeFileSync(join(OUT, 'errors.json'), JSON.stringify(results.filter(r => r.status !== 'ok'), null, 2));
  writeFileSync(join(OUT, 'env.json'), JSON.stringify(summary.env, null, 2));
  log(`wrote ${OUT}/summary.{json,csv} coverage.json errors.json env.json`);

  let code = 0;
  if (summary.totals.failed > 0) { log(`${summary.totals.failed} run(s) not ok — see errors.json`); code = 1; }
  if (MIN_PERF > 0) {
    const bad = results.filter(r => r.status === 'ok' && r.scores.performance < MIN_PERF);
    if (bad.length) { log(`${bad.length} page(s) below LH_MIN_PERF=${MIN_PERF}`); code = 1; }
  }
  process.exit(code);
};

main().catch(e => fail(e.message || String(e)));

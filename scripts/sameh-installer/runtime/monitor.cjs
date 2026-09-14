const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { appendLog } = require('./log-file.cjs');

const root = path.resolve(__dirname, '..');
const logDir = path.join(root, 'logs');
const monitorLog = path.join(logDir, 'monitor.log');
fs.mkdirSync(logDir, { recursive: true });
const log = message => appendLog(monitorLog, message);
const readJson = (file, fallback = {}) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const parseBody = response => { try { return JSON.parse(response.body || '{}'); } catch { return {}; } };

function recentErrors() {
  const lines = [];
  for (const name of ['server.log', 'print-bridge.log', 'supervisor.log']) {
    const file = path.join(logDir, name);
    if (!fs.existsSync(file)) continue;
    const tail = fs.readFileSync(file, 'utf8').slice(-40_000).split(/\r?\n/);
    for (const line of tail.filter(value => /error|failed|refused|stopped|invalid|timeout/i.test(value)).slice(-4)) {
      lines.push(`${name}: ${line.replace(/(token|password|pwd)=\S+/gi, '$1=***').slice(0, 500)}`);
    }
  }
  return lines.slice(-8);
}

function probe(url) {
  return new Promise(resolve => {
    const request = http.get(url, response => { let body = ''; response.on('data', chunk => body += chunk); response.on('end', () => resolve({ ok: response.statusCode < 400, reachable: true, statusCode: response.statusCode, body })); });
    request.setTimeout(3000, () => { request.destroy(); resolve({ ok: false, error: 'انتهت مهلة الاتصال' }); });
    request.on('error', error => resolve({ ok: false, error: error.message }));
  });
}

async function systemStatus() {
  const state = readJson(path.join(root, 'install-state.json'), { role: 'unknown', appUrl: 'http://127.0.0.1:3001' });
  const setup = readJson(path.join(root, 'runtime-status.json'), { warnings: [], errors: [] });
  const update = readJson(path.join(root, 'runtime', 'update-state.json'), {});
  const [app, bridge, printersResponse] = await Promise.all([
    probe(`${state.appUrl}/api/health`), probe('http://127.0.0.1:3002/health'), probe('http://127.0.0.1:3002/printers'),
  ]);
  let database = false;
  let whatsappStatus = { status: 'UNKNOWN', provider: 'unknown', configured: false };
  let serverPrinting = { status: 'UNKNOWN', connectedBridges: 0, bridges: [] };
  const appBody = parseBody(app);
  const bridgeStatus = parseBody(bridge);
  const printers = parseBody(printersResponse).printers || [];
  try {
    const services = appBody.health?.services || appBody.details?.health?.services;
    database = services?.database?.status === 'CONNECTED';
    whatsappStatus = services?.whatsapp || whatsappStatus;
    serverPrinting = services?.printing || serverPrinting;
  } catch {}
  const warnings = (setup.warnings || []).filter(warning => !(database && /SQL Server|ODBC Driver|قاعدة البيانات/i.test(warning)));
  if (!bridge.reachable) warnings.push(`Print Bridge غير متاح: ${bridge.error || 'Port 3002 مغلق'}`);
  else if (!bridgeStatus.serverConnected) warnings.push(`Print Bridge لا يصل للسيرفر: ${bridgeStatus.lastError || 'سبب غير معروف'}`);
  if (bridge.reachable && !printers.length) warnings.push('Print Bridge يعمل لكن لا توجد Windows Printers معرفة على الجهاز.');
  return {
    role: state.role, version: state.version || '-', url: state.appUrl, openUrl: app.reachable ? state.appUrl : '/system', app: Boolean(app.reachable), appError: app.error,
    database, bridge: Boolean(bridge.reachable && bridgeStatus.serverConnected), bridgeReachable: Boolean(bridge.reachable), bridgeStatus, printers, serverPrinting,
    whatsapp: whatsappStatus.status === 'READY', whatsappStatus, update,
    warnings, errors: setup.errors || [], recentErrors: recentErrors(), lastRepairs: setup.lastRepairs || [], repairedAt: setup.repairedAt, updatedAt: new Date().toISOString(),
  };
}

function launchWatchdog(restartServices = false) {
  if (restartServices) fs.writeFileSync(path.join(root, 'runtime', 'restart.request'), new Date().toISOString());
  const watchdog = spawn(path.join(root, 'runtime', 'node.exe'), [path.join(root, 'runtime', 'watchdog.cjs')], { cwd: root, detached: true, windowsHide: true, stdio: 'ignore' });
  watchdog.on('error', error => log(`watchdog launch failed: ${error.message}`));
  watchdog.unref();
}

function launchRepair() {
  const repair = spawn(path.join(root, 'runtime', 'node.exe'), [path.join(root, 'runtime', 'setup-agent.cjs'), 'repair'], { cwd: root, detached: true, windowsHide: true, stdio: 'ignore' });
  repair.on('error', error => log(`repair launch failed: ${error.message}`));
  repair.unref();
}

function card(title, ok, detail) {
  return `<div class="card"><span class="dot ${ok ? 'ok' : 'bad'}"></span><div><b>${title}</b><small>${detail || (ok ? 'يعمل بصورة طبيعية' : 'لا يعمل — راجع التنبيهات')}</small></div></div>`;
}

function html(status) {
  const alerts = [...status.errors, ...status.warnings];
  const alertHtml = alerts.length ? alerts.map(text => `<li>${escapeHtml(text)}</li>`).join('') : '<li class="success">لا توجد نواقص مسجلة.</li>';
  const repairsHtml = status.lastRepairs.length ? `<h2>إصلاحات تلقائية</h2><ul>${status.lastRepairs.map(text => `<li class="success">${escapeHtml(text)}</li>`).join('')}</ul>` : '';
  const errorsHtml = status.recentErrors.length ? `<h2>آخر أخطاء فعلية</h2><ul>${status.recentErrors.map(text => `<li><code>${escapeHtml(text)}</code></li>`).join('')}</ul>` : '';
  const bridgeDetail = status.bridgeReachable ? `${status.bridgeStatus.status || 'UNKNOWN'} · ${status.printers.length} طابعة · مطبوع ${status.bridgeStatus.printed || 0} · فشل ${status.bridgeStatus.failed || 0}` : 'Process متوقف';
  const queue = status.serverPrinting.queue || {};
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta http-equiv="refresh" content="10"><meta name="viewport" content="width=device-width"><title>Sameh System Monitor</title><style>*{box-sizing:border-box}body{margin:0;background:#07111f;color:#fff;font-family:Segoe UI,Tahoma;padding:32px}.wrap{max-width:1100px;margin:auto}h1{margin:0;font-size:32px}p,small{color:#9bb0c8}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin:24px 0}.card,.alerts{background:#101e31;border:1px solid #203550;border-radius:16px;padding:18px}.card{display:flex;gap:13px;align-items:center}.card b,.card small{display:block}.dot{width:13px;height:13px;border-radius:50%;flex:none}.ok{background:#28d17c;box-shadow:0 0 14px #28d17c}.bad{background:#ff5d6c;box-shadow:0 0 14px #ff5d6c}.alerts{border-color:#7f3540}.alerts h2{margin-top:18px}.alerts li{margin:9px 0;color:#ffd2d6;overflow-wrap:anywhere}.alerts .success{color:#70e3a9}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}button,a{border:0;border-radius:10px;padding:12px 18px;font:inherit;font-weight:700;cursor:pointer;text-decoration:none;color:#fff;background:#2a7fff}.secondary{background:#24364e}.repair{background:#e08a18}.test{background:#128766}code{direction:ltr;display:inline-block}</style></head><body><main class="wrap"><h1>Sameh System Monitor</h1><p>${status.role === 'server' ? 'جهاز السيرفر + الكاشير المحلي' : 'جهاز كاشير'} · إصدار ${status.version} · Live refresh كل 10 ثوانٍ</p><section class="grid">${card('السيستم / API', status.app, status.appError)}${card('قاعدة البيانات', status.database, status.database ? 'متصلة' : 'غير متصلة')}${card('Print Bridge', status.bridge, bridgeDetail)}${card('Server Print Queue', status.serverPrinting.status === 'READY', `Bridges ${status.serverPrinting.connectedBridges || 0} · Queue ${queue.queued || 0} · Failed ${queue.failed || 0}`)}${card('WhatsApp', status.whatsapp, `${status.whatsappStatus.status} · ${status.whatsappStatus.provider}`)}</section><section class="alerts"><h2>التنبيهات والمطلوب</h2><ul>${alertHtml}</ul>${repairsHtml}${errorsHtml}<small>السجلات: <code>${escapeHtml(logDir)}</code></small></section><div class="actions"><a href="${status.openUrl}">فتح RestoFlow ERP</a><button onclick="restart(this)">إعادة تشغيل الخدمات</button><button class="repair" onclick="repair(this)">فحص وإصلاح شامل</button><button class="test" onclick="testPrint(this)">اختبار الطابعة الافتراضية</button><a class="secondary" href="/api/status">تفاصيل JSON</a></div><script>async function action(button,url,wait){button.disabled=true;const old=button.textContent;button.textContent='جاري التنفيذ...';const r=await fetch(url,{method:'POST'});const data=await r.json().catch(()=>({}));button.textContent=r.ok?'تم بنجاح':(data.error||'فشل');setTimeout(()=>{button.disabled=false;button.textContent=old;location.reload()},wait)}function restart(b){action(b,'/api/restart',3000)}function repair(b){action(b,'/api/repair',8000)}function testPrint(b){action(b,'/api/bridge-test',3000)}</script></main></body></html>`;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function serveSystemFile(requestPath, response) {
  const dist = path.join(root, 'dist');
  const relative = requestPath === '/system' ? 'index.html' : requestPath.replace(/^\//, '');
  const file = path.resolve(dist, relative);
  if (!file.startsWith(`${dist}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return false;
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
  response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
  return true;
}

function proxyApi(request, response, targetUrl) {
  const target = new URL(targetUrl);
  const upstream = http.request({ hostname: target.hostname, port: target.port || 80, path: request.url, method: request.method, headers: request.headers }, upstreamResponse => {
    response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on('error', error => { response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify({ error: 'SERVER_NOT_READY', message: error.message })); });
  request.pipe(upstream);
}

const server = http.createServer(async (request, response) => {
  if (request.url === '/health') { response.writeHead(200).end('ok'); return; }
  if (request.url === '/api/restart' && request.method === 'POST') {
    const origin = request.headers.origin;
    if (origin && origin !== 'http://127.0.0.1:3099' && origin !== 'http://localhost:3099') { response.writeHead(403).end('forbidden'); return; }
    launchWatchdog(true); response.writeHead(202).end('restarting'); return;
  }
  if (request.url === '/api/repair' && request.method === 'POST') {
    const origin = request.headers.origin;
    if (origin && origin !== 'http://127.0.0.1:3099' && origin !== 'http://localhost:3099') { response.writeHead(403).end('forbidden'); return; }
    launchRepair(); response.writeHead(202).end('repairing'); return;
  }
  if (request.url === '/api/bridge-test' && request.method === 'POST') {
    const origin = request.headers.origin;
    if (origin && origin !== 'http://127.0.0.1:3099' && origin !== 'http://localhost:3099') { response.writeHead(403).end('forbidden'); return; }
    try {
      const result = await fetch('http://127.0.0.1:3002/test-print', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const body = await result.text();
      response.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(body); return;
    } catch (error) {
      response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify({ error: error.message })); return;
    }
  }
  const status = await systemStatus();
  if (request.url === '/api/status') { response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.end(JSON.stringify(status, null, 2)); return; }
  if (request.url.startsWith('/api/')) { proxyApi(request, response, status.url); return; }
  if (request.url === '/system' || request.url.startsWith('/assets/')) {
    if (serveSystemFile(request.url, response)) return;
    response.writeHead(404).end('not found'); return;
  }
  response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html(status));
});
server.on('error', error => { log(`server error: ${error.stack || error}`); process.exit(1); });
process.on('uncaughtException', error => { log(`uncaught: ${error.stack || error}`); process.exit(1); });
server.listen(3099, '127.0.0.1', () => {
  log('monitor ready on http://127.0.0.1:3099');
  launchWatchdog();
  setInterval(launchWatchdog, 60000);
});

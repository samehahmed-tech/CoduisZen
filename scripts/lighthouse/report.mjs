// Builds reports/lighthouse/index.html (+ compare.json vs baseline) from summary.json.
// Usage: node scripts/lighthouse/report.mjs [--save-baseline]
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const OUT = join(DIR, '..', '..', 'reports', 'lighthouse');
const sum = JSON.parse(readFileSync(join(OUT, 'summary.json'), 'utf8'));
const ok = sum.results.filter(r => r.status === 'ok');
const avg = (f) => ok.length ? Math.round(ok.reduce((a, r) => a + f(r), 0) / ok.length) : 0;
const byDev = (d) => ok.filter(r => r.device === d);
const avgDev = (d, f) => { const s = byDev(d); return s.length ? Math.round(s.reduce((a, r) => a + f(r), 0) / s.length) : 0; };

if (process.argv.includes('--save-baseline')) { copyFileSync(join(OUT, 'summary.json'), join(OUT, 'summary.baseline.json')); console.log('[report] baseline saved'); }

let compare = null;
if (existsSync(join(OUT, 'summary.baseline.json'))) {
  const base = JSON.parse(readFileSync(join(OUT, 'summary.baseline.json'), 'utf8'));
  const bmap = new Map(base.results.filter(r => r.status === 'ok').map(r => [`${r.route}|${r.device}`, r.scores.performance]));
  compare = ok.map(r => ({ route: r.route, device: r.device, before: bmap.get(`${r.route}|${r.device}`) ?? null, after: r.scores.performance, delta: bmap.has(`${r.route}|${r.device}`) ? r.scores.performance - bmap.get(`${r.route}|${r.device}`) : null }));
  writeFileSync(join(OUT, 'compare.json'), JSON.stringify({ generatedAt: sum.generatedAt, compare }, null, 2));
}

const worst = [...ok].sort((a, b) => a.scores.performance - b.scores.performance).slice(0, 10);
const row = (r) => `<tr><td>${r.route}</td><td>${r.device}</td><td>${r.status}</td><td><b>${r.scores.performance}</b></td><td>${r.scores.accessibility}</td><td>${r.scores.bestPractices}</td><td>${r.scores.seo}</td><td>${r.metrics.lcpMs == null ? '-' : Math.round(r.metrics.lcpMs)}</td><td>${r.metrics.cls == null ? '-' : Number(r.metrics.cls).toFixed(3)}</td><td>${r.reportHtml ? `<a href="raw/${r.reportHtml.split(/[\\/]/).pop()}">report</a>` : '-'}</td></tr>`;
const cmpRow = compare ? compare.map(c => `<tr><td>${c.route}</td><td>${c.device}</td><td>${c.before ?? '-'}</td><td>${c.after}</td><td>${c.delta == null ? '-' : (c.delta > 0 ? '+' : '') + c.delta}</td></tr>`).join('') : '<tr><td colspan="5">no baseline yet — run with --save-baseline first</td></tr>';

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lighthouse audit — ${sum.generatedAt}</title>
<style>body{font-family:system-ui,sans-serif;max-width:1100px;margin:2rem auto;padding:0 1rem}table{border-collapse:collapse;width:100%;font-size:.85rem}td,th{border:1px solid #ccc;padding:.3rem .5rem;text-align:left}th{background:#f0f0f0}.cards{display:flex;gap:1rem;flex-wrap:wrap}.card{border:1px solid #ccc;border-radius:8px;padding:.8rem 1.2rem;min-width:150px}</style></head><body>
<h1>Lighthouse audit — Restoflow ERP</h1>
<p>Generated ${sum.generatedAt} · base ${sum.base} · lighthouse ${sum.env.lighthouse} · ${sum.env.chrome}</p>
<p>Runs: ${sum.totals.runs} · ok: ${sum.totals.ok} · failed: ${sum.totals.failed} (averages over ok runs only)</p>
<h2>Averages (ok runs: ${ok.length})</h2><div class="cards">
<div class="card"><b>Perf</b><br>all ${avg(r => r.scores.performance)} · desktop ${avgDev('desktop', r => r.scores.performance)} · mobile ${avgDev('mobile', r => r.scores.performance)}</div>
<div class="card"><b>A11y</b><br>all ${avg(r => r.scores.accessibility)} · desktop ${avgDev('desktop', r => r.scores.accessibility)} · mobile ${avgDev('mobile', r => r.scores.accessibility)}</div>
<div class="card"><b>Best practices</b><br>${avg(r => r.scores.bestPractices)}</div>
<div class="card"><b>SEO</b><br>${avg(r => r.scores.seo)}</div>
<div class="card"><b>LCP ms</b><br>desktop ${avgDev('desktop', r => r.metrics.lcpMs || 0)} · mobile ${avgDev('mobile', r => r.metrics.lcpMs || 0)}</div>
</div>
<h2>Worst pages by performance</h2><table><tr><th>route</th><th>device</th><th>status</th><th>perf</th><th>a11y</th><th>bp</th><th>seo</th><th>lcp</th><th>cls</th><th>link</th></tr>${worst.map(row).join('')}</table>
<h2>All results</h2><table><tr><th>route</th><th>device</th><th>status</th><th>perf</th><th>a11y</th><th>bp</th><th>seo</th><th>lcp</th><th>cls</th><th>link</th></tr>${ok.map(row).join('')}${sum.results.filter(r => r.status !== 'ok').map(r => `<tr><td>${r.route}</td><td>${r.device}</td><td>${r.status}</td><td colspan="6">${r.error || r.finalUrl || ''}</td><td>-</td></tr>`).join('')}</table>
<h2>Before / after (performance)</h2><table><tr><th>route</th><th>device</th><th>before</th><th>after</th><th>delta</th></tr>${cmpRow}</table>
<p>Raw files: <a href="summary.json">summary.json</a> · <a href="summary.csv">summary.csv</a> · <a href="coverage.json">coverage.json</a> · <a href="errors.json">errors.json</a> · raw/ per-page reports.</p>
</body></html>`;
writeFileSync(join(OUT, 'index.html'), html);
console.log(`[report] wrote ${OUT}/index.html (${ok.length} ok, ${sum.totals.failed} failed)`);

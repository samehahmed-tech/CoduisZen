#!/usr/bin/env node
// Read-only API latency smoke test. Requires an explicit base URL and never
// creates business data. Use a health/read endpoint unless a safe endpoint is
// explicitly selected by the operator.

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (token === '--help' || token === '-h') {
    console.log('Usage: node scripts/api-load-smoke.mjs --base-url http://127.0.0.1:3001 --path /api/health [--requests 100] [--concurrency 10] [--timeout-ms 10000] [--max-p95 250] [--max-failure-rate 0]');
    process.exit(0);
  }
  if (token.startsWith('--')) args.set(token.slice(2), process.argv[i + 1]);
}

const required = (name, fallback) => args.get(name) ?? process.env[`LOAD_${name.replaceAll('-', '_').toUpperCase()}`] ?? fallback;
const baseUrl = required('base-url', '');
const path = required('path', '/api/health');
const requests = Math.max(1, Number(required('requests', 50)));
const concurrency = Math.max(1, Math.min(requests, Number(required('concurrency', 10))));
const timeoutMs = Math.max(100, Number(required('timeout-ms', 10000)));
const token = required('token', '');
const maxP95Ms = Math.max(0, Number(required('max-p95', 0)));
const maxFailureRate = Math.max(0, Math.min(1, Number(required('max-failure-rate', 0))));

if (!baseUrl) {
  console.error('Missing --base-url (or LOAD_BASE_URL). Refusing to guess a target.');
  process.exit(2);
}
let target;
try { target = new URL(path, baseUrl).toString(); } catch { console.error('Invalid base URL/path.'); process.exit(2); }

const samples = [];
let failures = 0;
let cursor = 0;
const worker = async () => {
  while (true) {
    const index = cursor++;
    if (index >= requests) return;
    const started = performance.now();
    try {
      const response = await fetch(target, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const elapsed = performance.now() - started;
      samples.push(elapsed);
      if (!response.ok) failures += 1;
      await response.body?.cancel();
    } catch {
      samples.push(performance.now() - started);
      failures += 1;
    }
  }
};

await Promise.all(Array.from({ length: concurrency }, worker));
samples.sort((a, b) => a - b);
const percentile = (p) => samples[Math.min(samples.length - 1, Math.ceil(samples.length * p) - 1)] ?? null;
const result = {
  generatedAt: new Date().toISOString(),
  target,
  requests,
  concurrency,
  timeoutMs,
  failures,
  successRate: Number(((requests - failures) / requests).toFixed(4)),
  thresholds: { maxP95Ms: maxP95Ms || null, maxFailureRate },
  latencyMs: {
    min: Number((samples[0] ?? 0).toFixed(2)),
    p50: Number((percentile(0.50) ?? 0).toFixed(2)),
    p95: Number((percentile(0.95) ?? 0).toFixed(2)),
    p99: Number((percentile(0.99) ?? 0).toFixed(2)),
    max: Number((samples.at(-1) ?? 0).toFixed(2)),
  },
};
const failureRate = failures / requests;
const violations = [];
if (failures > 0) violations.push(`failures=${failures}`);
if (maxP95Ms > 0 && (percentile(0.95) ?? Infinity) > maxP95Ms) violations.push(`p95>${maxP95Ms}ms`);
if (failureRate > maxFailureRate) violations.push(`failureRate>${maxFailureRate}`);
result.violations = violations;
console.log(JSON.stringify(result, null, 2));
process.exit(violations.length ? 1 : 0);

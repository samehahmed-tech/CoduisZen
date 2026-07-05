import * as dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

dotenv.config({ path: ['.env.local', '.env'] as any });

const ENV_LOCAL_PATH = path.join(process.cwd(), '.env.local');

const parseEnvFile = (content: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
};

const serializeEnv = (env: Record<string, string>) => {
  const keys = Object.keys(env).sort((a, b) => a.localeCompare(b));
  return keys.map((k) => `${k}=${env[k]}`).join('\n') + '\n';
};

const genPassword = () => {
  // base64url gives a good mix; keep it readable enough for humans.
  return crypto.randomBytes(12).toString('base64url'); // ~16 chars
};

const main = () => {
  const existing = fs.existsSync(ENV_LOCAL_PATH) ? fs.readFileSync(ENV_LOCAL_PATH, 'utf8') : '';
  const env = parseEnvFile(existing);

  const email = env.DEV_BOOTSTRAP_EMAIL || process.env.DEV_BOOTSTRAP_EMAIL || 'admin@coduiszen.com';
  const password = env.DEV_BOOTSTRAP_PASSWORD || process.env.DEV_BOOTSTRAP_PASSWORD || genPassword();

  const ensure = (k: string, v: string) => {
    if (!env[k] || String(env[k]).trim() === '') env[k] = v;
  };

  ensure('DEV_BOOTSTRAP_EMAIL', email);
  ensure('DEV_BOOTSTRAP_PASSWORD', password);
  ensure('DEV_BOOTSTRAP_FORCE_PASSWORD', 'false');

  // Make ops tooling and load tests work without manually copying AUTH_TOKEN.
  ensure('LOAD_AUTH_EMAIL', email);
  ensure('LOAD_AUTH_PASSWORD', password);
  ensure('HEALTH_AUTH_EMAIL', email);
  ensure('HEALTH_AUTH_PASSWORD', password);

  // Keep backend base defaults explicit for local execution.
  ensure('API_BASE', 'http://localhost:3001');
  ensure('SOCKET_BASE', 'http://localhost:3001');
  ensure('HEALTH_API_BASE_URL', 'http://localhost:3001/api');

  const next = serializeEnv(env);
  fs.writeFileSync(ENV_LOCAL_PATH, next, 'utf8');

  console.log(JSON.stringify({
    ok: true,
    path: '.env.local',
    wrote: Object.keys(env).length,
    notes: [
      'DEV_BOOTSTRAP_PASSWORD generated if missing.',
      'LOAD_AUTH_* and HEALTH_AUTH_* set to match admin credentials.',
    ],
  }, null, 2));
};

main();

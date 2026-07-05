import * as dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

import { closeDatabase, db } from '../server/db';
import { branches, users } from '../src/db/schema';

// Load .env.local first (developer machine), then fallback to .env.
dotenv.config({ path: ['.env.local', '.env'] as any });

const get = (key: string) => (process.env[key] || '').trim();
const isEnabled = (key: string, fallback = false) => {
  const raw = get(key).toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
};

const mask = (value: string) => {
  if (!value) return '';
  if (value.length <= 8) return '********';
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
};

const main = async () => {
  const nodeEnv = get('NODE_ENV') || 'development';
  const allowProd = isEnabled('DEV_BOOTSTRAP_ALLOW_PROD', false);
  if (nodeEnv === 'production' && !allowProd) {
    console.error('[dev-bootstrap-auth] Refusing to run in production. Set DEV_BOOTSTRAP_ALLOW_PROD=true to override.');
    process.exit(2);
  }

  const branchId = get('DEV_BOOTSTRAP_BRANCH_ID') || 'b1';
  const branchName = get('DEV_BOOTSTRAP_BRANCH_NAME') || 'الفرع الرئيسي';
  const email = (get('DEV_BOOTSTRAP_EMAIL') || 'admin@coduiszen.com').toLowerCase();
  const name = get('DEV_BOOTSTRAP_NAME') || 'مدير النظام';
  const password = get('DEV_BOOTSTRAP_PASSWORD');
  const force = isEnabled('DEV_BOOTSTRAP_FORCE_PASSWORD', false);

  if (!password || password.length < 6) {
    console.error('[dev-bootstrap-auth] Missing/weak DEV_BOOTSTRAP_PASSWORD (min 6).');
    process.exit(1);
  }

  await db.insert(branches).values({
    id: branchId,
    name: branchName,
    address: get('DEV_BOOTSTRAP_BRANCH_ADDRESS') || 'القاهرة، مصر',
    phone: get('DEV_BOOTSTRAP_BRANCH_PHONE') || '0123456789',
    isActive: true,
  }).onConflictDoNothing();

  const existing = await db.select().from(users).where(eq(users.email, email));
  if (existing.length === 0) {
    const hash = await bcrypt.hash(password, 10);
    await db.insert(users).values({
      id: get('DEV_BOOTSTRAP_USER_ID') || `usr-${email.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}`,
      name,
      email,
      role: 'SUPER_ADMIN' as any,
      permissions: ['*'] as any,
      assignedBranchId: branchId,
      isActive: true,
      passwordHash: hash,
      managerPin: get('DEV_BOOTSTRAP_MANAGER_PIN') || '1234',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).onConflictDoNothing();

    console.log(JSON.stringify({
      ok: true,
      action: 'created-user',
      email,
      password: mask(password),
      branchId,
    }, null, 2));
    return;
  }

  const user = existing[0] as any;
  const needsPassword = !user.passwordHash || force;
  if (needsPassword) {
    const hash = await bcrypt.hash(password, 10);
    await db.update(users)
      .set({ passwordHash: hash, updatedAt: new Date() } as any)
      .where(eq(users.id, user.id));
  }

  console.log(JSON.stringify({
    ok: true,
    action: needsPassword ? (force ? 'forced-password-reset' : 'set-missing-password') : 'no-op',
    email,
    password: mask(password),
    branchId: user.assignedBranchId || branchId,
  }, null, 2));
};

main().catch((e: any) => {
  console.error('[dev-bootstrap-auth] fatal', e?.message || e);
  process.exit(1);
}).finally(async () => {
  await closeDatabase().catch(() => undefined);
});

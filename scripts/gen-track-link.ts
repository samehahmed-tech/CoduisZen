import * as dotenv from 'dotenv';

dotenv.config({ path: ['.env.local', '.env'] as any });

// Prints a signed public-tracking URL for an order, using the server's own
// secret via GET /api/orders/:id/track-link (never forge client-side).
// Usage: npm run ops:track-link -- <orderId | orderNumber>
const main = async () => {
  const key = String(process.argv[2] || '').trim();
  if (!key) {
    console.error('Usage: npm run ops:track-link -- <orderId | orderNumber>');
    process.exit(1);
  }
  const API = String(process.env.LH_API_URL || 'http://127.0.0.1:3001/api').replace(/\/+$/, '');
  const email = String(process.env.DEV_BOOTSTRAP_EMAIL || process.env.LOAD_AUTH_EMAIL || '').trim();
  const password = String(process.env.DEV_BOOTSTRAP_PASSWORD || process.env.LOAD_AUTH_PASSWORD || '').trim();
  if (!email || !password) {
    console.error('TRACK_AUTH_MISSING (DEV_BOOTSTRAP_EMAIL/PASSWORD or LOAD_AUTH_*)');
    process.exit(1);
  }
  const lr = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, deviceName: 'track-link' }),
  });
  const sess = await lr.json().catch(() => ({}));
  if (!lr.ok || !sess.token) {
    console.error(`TRACK_LOGIN_FAILED: HTTP ${lr.status} ${sess.code || sess.message || ''}`);
    process.exit(1);
  }
  // Resolve orderNumber -> id via list endpoint when key is numeric.
  let orderId = key;
  if (/^\d+$/.test(key)) {
    const q = await fetch(`${API}/orders?limit=100`, { headers: { Authorization: `Bearer ${sess.token}` } });
    const list = await q.json().catch(() => ({}));
    const rows = Array.isArray(list) ? list : list.orders || list.data || [];
    const hit = rows.find((o: any) => String(o.orderNumber ?? o.order_number ?? '') === key);
    if (!hit) {
      console.error('ORDER_NOT_FOUND for number: ' + key);
      process.exit(1);
    }
    orderId = String(hit.id);
  }
  const tr = await fetch(`${API}/orders/${encodeURIComponent(orderId)}/track-link`, {
    headers: { Authorization: `Bearer ${sess.token}` },
  });
  const body = await tr.json().catch(() => ({}));
  if (!tr.ok || !body.url) {
    console.error(`TRACK_LINK_FAILED: HTTP ${tr.status} ${body.code || body.message || ''}`);
    process.exit(1);
  }
  const base = String(process.env.PUBLIC_TRACKING_URL || '').replace(/\/+$/, '');
  console.log(base ? body.url.replace(/^(\/t\/)/, `${base}$1`) : body.url.replace(/^\//, 'http://127.0.0.1:3000/'));
};

main().catch((e: any) => {
  console.error('fatal', e?.message || e);
  process.exit(1);
});

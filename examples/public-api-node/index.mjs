#!/usr/bin/env node

const args = new Set(process.argv.slice(2));
const valueAfter = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const printHelp = () => {
  console.log(`RestoFlow Public API Node sample

Environment:
  RESTOFLOW_API_BASE_URL   default: http://localhost:3001/api/v1
  RESTOFLOW_CLIENT_ID      managed API client id
  RESTOFLOW_CLIENT_SECRET  one-time-delivered managed API secret
  RESTOFLOW_BRANCH_ID      branch used by the orders example

Commands:
  node examples/public-api-node/index.mjs
      Request an OAuth token and list branch orders.
  node examples/public-api-node/index.mjs --create-webhook --webhook-url https://example.com/hook
      Also create a signed webhook (requires webhooks:manage scope).
  node examples/public-api-node/index.mjs --help
`);
};

if (args.has('--help')) {
  printHelp();
  process.exit(0);
}

const baseUrl = String(process.env.RESTOFLOW_API_BASE_URL || 'http://localhost:3001/api/v1').replace(/\/+$/, '');
const clientId = String(process.env.RESTOFLOW_CLIENT_ID || '').trim();
const clientSecret = String(process.env.RESTOFLOW_CLIENT_SECRET || '').trim();
const branchId = String(process.env.RESTOFLOW_BRANCH_ID || '').trim();
const webhookUrl = String(valueAfter('--webhook-url') || '').trim();
const createWebhook = args.has('--create-webhook');

if (!clientId || !clientSecret || !branchId || (createWebhook && !webhookUrl)) {
  console.error('Missing RESTOFLOW_CLIENT_ID, RESTOFLOW_CLIENT_SECRET, RESTOFLOW_BRANCH_ID, or --webhook-url. Use --help.');
  process.exit(2);
}

const readJson = async (response) => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || `HTTP_${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
};

const tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
  method: 'POST',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
    Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')}`,
  },
  body: new URLSearchParams({
    grant_type: 'client_credentials',
    scope: createWebhook ? 'orders:read webhooks:manage' : 'orders:read',
  }),
});
const token = await readJson(tokenResponse);

const apiGet = async (path) => readJson(await fetch(`${baseUrl}${path}`, {
  headers: { Accept: 'application/json', Authorization: `Bearer ${token.access_token}` },
}));

const orders = await apiGet(`/branches/${encodeURIComponent(branchId)}/orders?limit=10`);
console.log(JSON.stringify({ orders: orders.data || [], paging: orders.paging || null }, null, 2));

if (createWebhook) {
  const webhookResponse = await fetch(`${baseUrl}/webhooks`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token.access_token}`,
    },
    body: JSON.stringify({
      name: 'RestoFlow Node sample',
      url: webhookUrl,
      branchId,
      events: ['order.created', 'order.status_changed'],
    }),
  });
  const webhook = await readJson(webhookResponse);
  console.log(JSON.stringify({ webhook: { ...webhook, secret: '[returned once — store securely]' } }, null, 2));
}

# WhatsApp Baileys Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `whatsapp-web.js` transport with Baileys, keeping every public interface identical.

**Architecture:** Single-file transport swap inside `server/services/whatsappService.ts` (Baileys socket lifecycle + mapping layer); queue, delays, AI bot, socket events, and all callers untouched. New dep `@whiskeysockets/baileys`; delete `whatsapp-web.js` + `puppeteer` (verified: no direct imports, only wweb.js's deduped copy).

**Tech Stack:** Baileys (WebSocket, `useMultiFileAuthState`), existing Express service, vitest.

> **Amendment 2026-10-12 (Task 1 finding):** `puppeteer` is STAYS — the PDF
> pipeline (`pdfService.ts`, `reportStyle.ts`) imports it directly. Only
> `whatsapp-web.js` is removed. Build-green for the server is deferred to
> Task 2 (which removes the dangling static import).

**Spec:** `docs/superpowers/specs/2026-10-12-whatsapp-baileys-design.md`

## Global Constraints
- Public API frozen: `sendWhatsAppText`, `enqueueMessage`, `getStatus`, `onMessage`, `restart({resetSession})`, `getQueueCount`, `handleIncomingWebhookMessage` — same signatures.
- Same `WhatsAppStatus` union and same `whatsapp:*` socket events.
- `WHATSAPP_PROVIDER=whatsapp-web.js` keeps working as alias of Baileys; `disabled`/`openwa` untouched.
- Delays unchanged: transactional 1500ms / marketing 8–22s / batch 35 + 10min.
- Auth dir `sessions/baileys-<clientId>` gitignored, never committed.
- No browser/Chrome flags may remain referenced by the engine.

## Review Focus
- QR consumed but session never READY (stale-qr hang users report) → test pins AUTHENTICATED-then-READY transition.
- Marketing sent to opted-out number → STOP test pins skip.
- Token-less `/t/:id` confusion is out of scope (separate track-link work, done).
- Reconnect storm on flaky network (tight loop) → backoff test pins delays.
- Media send failure drops message silently → requeue-once test pins retry then FAILED.

## Files
- Modify: `server/services/whatsappService.ts` (transport only, ~681 lines, same class shape)
- Modify: `package.json` (+ `@whiskeysockets/baileys`, − `whatsapp-web.js`, − `puppeteer`)
- Modify: `components/WhatsAppHub.tsx` (pairing-code box only)
- Modify: `.env.example` (Baileys notes), `.gitignore` (`sessions/`)
- Test: `tests/whatsappBaileys.test.ts` (new; pure-mapper + queue-behavior tests)
- Keep green: `tests/whatsappWebhookAuth.test.ts`

---

### Task 1: Dependency swap

**Files:**
- Modify: `package.json`
- Test: `npm ls @whiskeysockets/baileys` + `npm run build:server`

**Interfaces:**
- Consumes: nothing
- Produces: `Baileys` importable from server code; `whatsapp-web.js` absent

- [ ] **Step 1: Install and remove**
Run: `npm i @whiskeysockets/baileys && npm un -S whatsapp-web.js puppeteer`
Expected: `package.json` shows baileys, neither wweb.js nor puppeteer
- [ ] **Step 2: Verify no dangling imports**
Run: grep for `whatsapp-web.js` / `from 'puppeteer'` outside docs/specs
Expected: only `.env.example`, Hub hints, health checks referencing the provider *name string* (allowed — name stays as alias)
- [ ] **Step 3: Server still builds**
Run: `npm run build:server`
Expected: `✅ Server build complete`
- [ ] **Step 4: Commit**
```bash
git add package.json package-lock.json
git commit -m "chore(whatsapp): baileys dep in, wweb.js+puppeteer out"
```

### Task 2: Baileys transport (connect, QR, pairing, send)

**Files:**
- Modify: `server/services/whatsappService.ts:1-50,86-250` (imports, provider type, client field, createLocalClient, initialize, restart, getStatus)
- Test: `tests/whatsappBaileys.test.ts`

**Interfaces:**
- Consumes: `useMultiFileAuthState`, `makeWASocket`, `DisconnectReason`, `fetchLatestBaileysVersion` from `@whiskeysockets/baileys`
- Produces: `sock` (Baileys socket), `getStatus()` returning same shape + optional `pairingCode` field, `whatsapp:pairing` socket emit

- [ ] **Step 1: Write failing test for status mapping**
```ts
// tests/whatsappBaileys.test.ts
import { mapConnectionUpdate } from '../server/services/whatsappConnection';
test('close 401 maps to AUTH_ERROR needing fresh QR', () => {
  expect(mapConnectionUpdate({ connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } }).status).toBe('AUTH_ERROR');
});
test('reconnect backoff never below 5s', () => {
  expect(reconnectDelay(0)).toBeGreaterThanOrEqual(5000);
});
```
Run: `npx vitest run tests/whatsappBaileys.test.ts`
Expected: FAIL with "not defined"
- [ ] **Step 2: Create pure mapper module**
Create `server/services/whatsappConnection.ts` with `mapConnectionUpdate(u): {status, reason?}` covering: `connecting`→INITIALIZING (or AUTHENTICATED if prior qr-scanned flag), `open`→READY, `close`+401→AUTH_ERROR, `close`+408/515/503→DISCONNECTED-retryable, else DISCONNECTED. Also `reconnectDelay(attempt): ms` returning 5000/15000/60000 caps (pins no-tight-loop).
- [ ] **Step 3: Run test, expect PASS**
- [ ] **Step 4: Swap transport in `whatsappService.ts`**
Replace `Client`/`LocalAuth`/puppeteer block with: `makeWASocket({ version, logger: pino-silent, auth: state, browser: ['CoduisZen','Chrome','1.0'] })`; wire `connection.update` (qr string → existing qr flow; `open` → existing ready flow), `creds.update` → saveCreds. `requestPairingCode(phone)` exposed as `getPairingCode(phone)` emitting `whatsapp:pairing`. Keep every public method signature and every `getIO().emit` event name.
- [ ] **Step 5: Send path**
`sendMessage(jid, {text})`; media: fetch `mediaUrl` → buffer → `{ image: buf, caption }` with text fallback; registration check via `sock.onWhatsApp(jid)`. Keep delays/spintax/normalize untouched.
- [ ] **Step 6: Boot check**
Run: start dev API (`API_PORT=3009`, WhatsApp enabled) and read `/api/whatsapp/status` (path per `whatsappRoutes.ts`)
Expected: `INITIALIZING` then `AWAITING_SCAN` with `qr` string
- [ ] **Step 7: Commit**
```bash
git add server/services/whatsappService.ts server/services/whatsappConnection.ts tests/whatsappBaileys.test.ts
git commit -m "feat(whatsapp): baileys transport behind identical public API"
```

### Task 3: Incoming, receipts, STOP opt-out

**Files:**
- Modify: `server/services/whatsappService.ts:561-634` (message handler), `src/db/schema` iff opt-out table missing (check first; memory-map fallback with warn log if absent)
- Test: `tests/whatsappBaileys.test.ts` (append)

**Interfaces:**
- Consumes: `handleIncomingLocalMessage` (existing, unchanged), `whatsappMessages` table (existing)
- Produces: same `customMessageHandler` payload shape `{from, body, hasMedia, id}`

- [ ] **Step 1: Failing tests**
```ts
test('STOP skips queued marketing to that number', ...);
test('receipt ack maps to READ status update', ...);
test('failed send requeues once then marks FAILED', ...);
```
Run: `npx vitest run tests/whatsappBaileys.test.ts` — Expected: FAIL
- [ ] **Step 2: Wire `messages.upsert`** → normalize → skip broadcast/status → STOP check → existing handler. Wire `message-receipt.update` → update `whatsappMessages.status` by externalId (best-effort try/catch). Send failure: requeue once (mark `_retried`), second failure → DB status FAILED + drop.
- [ ] **Step 3: Run tests, expect PASS** (plus full `tests/whatsappWebhookAuth.test.ts` green)
- [ ] **Step 4: Commit**
```bash
git add server/services/whatsappService.ts tests/whatsappBaileys.test.ts
git commit -m "feat(whatsapp): receipts, STOP opt-out on baileys transport"
```

### Task 4: Hub pairing-code UI + docs

**Files:**
- Modify: `components/WhatsAppHub.tsx` (pairing box next to QR), `.env.example`, `.gitignore`
- Test: manual Hub render (dev preview) + `npm run build:frontend`

- [ ] **Step 1: Pairing UI**
Subscribe to `whatsapp:pairing` (same pattern as `whatsapp:qr` ~line 170); show 8-digit code + phone input + request button calling existing restart/status endpoints only (no new endpoint; add `getPairingCode` via controller only if socket insufficient — prefer socket).
- [ ] **Step 2: Env/docs**
`.env.example`: Baileys notes (no Chrome vars needed); `.gitignore`: `sessions/`
- [ ] **Step 3: Frontend builds**
Run: `npm run build:frontend` — Expected: `✓ built`
- [ ] **Step 4: Commit**
```bash
git add components/WhatsAppHub.tsx .env.example .gitignore
git commit -m "feat(whatsapp): pairing-code UI, baileys env docs"
```

### Task 5: Live verification (off-hours, needs human QR scan)

**Files:** none (runbook)
- [ ] **Step 1: Deploy off-hours**, delete `.wwebjs_auth`, start server
- [ ] **Step 2: Scan QR once from Hub** — Expected: AUTHENTICATED then READY
- [ ] **Step 3: Send test text to a test number** — Expected: delivered, DB row SENT→DELIVERED/READ
- [ ] **Step 4: Kill network 60s** — Expected: backoff reconnect, no tight loop, queue drains after
- [ ] **Step 5: 5-recipient marketing sample** — Expected: 8–22s spacing, STOP number skipped
- [ ] **Step 6: Record results** in UAT (tests M06 + X-notes) and close plan

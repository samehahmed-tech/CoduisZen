# WhatsApp engine swap — design spec (2026-10-12)

## Brief
Replace the `whatsapp-web.js` transport (headless Chrome, QR-only, ~400MB,
fragile reconnect) with Baileys (`@whiskeysockets/baileys`: direct WebSocket,
~50MB, auto-reconnect, QR + pairing code). Full replacement (no parallel
engine). Approved approach A; design sections 1–3 approved in chat.

## Non-goals
- No Meta Cloud API (not open-source, needs FB app + templates).
- No new marketing features beyond STOP opt-out + delivery receipts.
- No changes to callers: OTP (delivery), campaigns, feedback, Hub UI contract.

## Architecture
Same file, same public surface. Only the transport internals change:

| Current (`whatsapp-web.js`) | New (Baileys) |
|---|---|
| `Client` + LocalAuth (`.wwebjs_auth`) | `makeWASocket` + `useMultiFileAuthState` (`sessions/baileys-<clientId>`) |
| `qr` event → string | `connection.update.qr` → same string to Hub |
| `authenticated` / `ready` events | `connection.update` (`connecting` → `open`) |
| `disconnected` + manual re-init | `connection.update` (`close` + status code) → auto-reconnect w/ backoff, except `401 logged-out` → fresh QR |
| `sendMessage(jid, text/media)` | `sock.sendMessage(jid, {text} / {image|document})` |
| `isRegisteredUser` check | `sock.onWhatsApp(jid)` (same purpose) |
| `MessageMedia.fromUrl` | fetch URL → buffer → `{image: buf, caption}` |
| puppeteer + Chrome | deleted: no browser at all |

Public API preserved exactly: `sendWhatsAppText`, `enqueueMessage`,
`getStatus` (+ same `WhatsAppStatus` union + socket emits), `onMessage`,
`restart({resetSession})`, `getQueueCount`, `handleIncomingWebhookMessage`.
`WHATSAPP_PROVIDER=whatsapp-web.js` keeps working as alias of the new engine
(no silent behavior change for existing env files); `disabled` unchanged;
`openwa` path untouched.

## Session & pairing
- Auth dir `sessions/baileys-<clientId>` (gitignored; never commit).
- Pairing code: `sock.requestPairingCode(phone)` → Hub shows 8-digit code
  (`whatsapp:pairing` socket event + `GET /status` field). QR stays primary.
- First boot after deploy REQUIRES one rescan (old session incompatible).
- `restart({resetSession:true})` wipes the Baileys dir (same semantics).

## Queue & sending (unchanged behavior)
Transactional 1.5s / marketing 8–22s random / batch 35 + 10min pause,
spintax, Egyptian phone normalize, per-message session routing kept.
Marketing STOP: incoming text matching `STOP|إيقاف|الغاء الاشتراك` marks the
number opted-out (in-memory + persisted table if present, else memory with
warn log) and skips queued marketing to it.

## Incoming & AI (unchanged)
`messages.upsert` → normalize → existing `handleIncomingLocalMessage`
(menu keyword, AI ordering bot, custom handler). Media flag from message
type. Group/status-broadcast ignored as today.

## Receipts (new)
`message-receipt.update` → map ack to stored `whatsappMessages.externalId`
and update status SENT → DELIVERED → READ. Best-effort, warn-and-continue.

## Errors & reconnect
- `close` codes: 408/515/503 → reconnect backoff 5s/15s/60s; 401 → emit
  AUTH_ERROR + fresh QR (wipe creds); 403/405 → DISCONNECTED + reason.
- Send failure: keep message? Today failures are dropped with console.error.
  Improvement (in scope): requeue once, then drop with DB status FAILED.
- No Chrome flags/env (`WHATSAPP_CHROME_*` ignored with startup note).

## Files
- Rewrite: `server/services/whatsappService.ts` (transport only).
- Delete dep: `whatsapp-web.js` (+ `puppeteer` iff unused elsewhere — verify).
- Small: WhatsAppHub pairing-code UI + `services/api/whatsapp.ts` passthrough
  (only if Hub needs new endpoint; prefer socket event, no new endpoint).
- Env docs: `.env.example` Baileys notes; sessions dir gitignore.
- Tests: extend `tests/whatsappWebhookAuth.test.ts` style with transport-mock
  unit tests for routing/receipt/opt-out (no live socket in CI).

## Rollout
Off-hours: stop server (drain), deploy, delete `.wwebjs_auth`, start,
scan QR or pairing code once from Hub, send test message + forced
disconnect + 5-recipient sample campaign. Rollback = redeploy previous
build (old session dir removed — rescan needed either way).

## Risks
- Baileys vs future WA protocol changes (mitigation: pin version, same as any lib).
- Ban risk unchanged (delays/batches kept; no bulk behavior change).
- Multi-number (OPENWA_SESSIONS) stays OpenWA-only; Baileys ships single
  default session first (multi-session = follow-up).

# RestoFlow Print Bridge

Lightweight print bridge that polls the RestoFlow server for queued jobs and sends them to local printers.

## How it works

1. Bridge polls `GET /api/print-gateway/bridge/jobs` every two seconds by default.
2. Every server request includes the installer-generated gateway token.
3. Bridge prints through the Windows printer queue.
4. Completion or failure is reported to the server and retried locally if reporting fails.

The bridge has no Express or `escpos` dependency. Its local health/printer API listens only on `127.0.0.1:3002`.

## Setup

The RestoFlow installer configures and starts the bridge automatically. It writes
`SERVER_URL` and the package's gateway token; do not share that token.

For manual development only: run `npm install`, put `SERVER_URL` and
`GATEWAY_TOKEN` in `.env`, then run `npm start`.

## Windows Auto-start

```powershell
npm run install:service
```

Run manually or reboot. The bridge starts automatically as a scheduled task.

## Printer Configuration

Configure printer addresses in RestoFlow. The bridge also discovers installed
Windows printers and exposes them to the Printers page through its local API.

## Logs

Logs are saved to `~/.restoflow-bridge/bridge.log`.

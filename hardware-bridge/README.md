# Coduis Zen Print Bridge

Branch Print Gateway service.
It polls backend print queue and sends jobs to thermal/network printers.

## Required env vars

- `PRINT_GATEWAY_TOKEN` (must match backend `PRINT_GATEWAY_TOKEN`)
- `PRINT_BRANCH_ID` (branch handled by this gateway, example: `b1`)

Optional:

- `PRINT_BACKEND_URL` (default: `http://localhost:3001/api/print-gateway/gateway`)
- `PRINT_GATEWAY_ID` (default: host-based id)
- `PRINT_GATEWAY_POLL_MS` (default: `1200`)
- `PRINT_BRIDGE_PORT` (default: `3002`)

## Run manually

1. `npm run bridge:install`
2. Copy `hardware-bridge/.env.example` to `hardware-bridge/.env` and fill values.
3. `npm run bridge:start`

## Run automatically on Windows startup

1. `npm run bridge:autostart:install`
2. Sign out/sign in (or reboot).

To remove auto-start:

- `npm run bridge:autostart:remove`

## Health check

- `GET http://localhost:3002/health`

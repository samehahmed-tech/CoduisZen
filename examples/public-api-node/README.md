# RestoFlow Public API — Node.js sample

This dependency-free Node 20 sample demonstrates the supported machine-to-machine flow:

1. Exchange a managed API client's credentials for an OAuth client-credentials Bearer token.
2. Read the latest orders for one allowed branch.
3. Optionally create a signed Webhook with an explicit `--create-webhook` flag.

Copy `.env.example` to a local environment file or export the variables in your shell. Never commit the client secret. The sample does not print the access token; the Webhook signing secret is replaced in the displayed output because the real value is returned only once.

```powershell
$env:RESTOFLOW_CLIENT_ID = 'client-id-from-security-settings'
$env:RESTOFLOW_CLIENT_SECRET = 'copy-once-secret'
$env:RESTOFLOW_BRANCH_ID = 'branch-id'
node examples/public-api-node/index.mjs
```

To create a Webhook, grant the client `webhooks:manage` and run:

```powershell
node examples/public-api-node/index.mjs --create-webhook --webhook-url https://partner.example/hooks
```

The default command is read-only. The sample requires Node.js 20+ for the built-in `fetch` API.

# Integration health

`/api/health` reports configuration separately from connectivity.

- By default, integrations run in `CONFIGURATION_ONLY` mode and configured providers are `UNVERIFIED`.
- Set `ENABLE_INTEGRATION_HEALTH_PROBES=true` to enable the short, non-mutating Paymob auth probe.
- A Paymob probe returns only `HEALTHY` or `ERROR`, latency, and a bounded reason; credentials and tokens are never returned.
- Aggregators remain `UNVERIFIED` until their provider contract exposes a documented health endpoint.

The probe is intentionally opt-in because it adds an external request to each health check and must not be confused with a payment transaction.

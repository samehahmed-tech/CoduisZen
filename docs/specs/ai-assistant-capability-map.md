# Capability Map: RestoFlow AI Assistant

| Module id | Responsibility | Depends on |
|---|---|---|
| ai-provider-orchestration | Provider registry, encrypted credentials, model selection, health checks, ordered fallback | — |
| ai-domain-context | Safe, branch-scoped business context for menu, sales, inventory, customers, finance and operations | ai-provider-orchestration |
| ai-action-safety | Tool/action contracts, permission checks, preview, confirmation, audit and idempotency | ai-domain-context |
| ai-assistant-experience | Conversational UI, provider/model controls, status/fallback explanation, 3D character and accessible reduced-motion mode | ai-provider-orchestration, ai-domain-context, ai-action-safety |
| ai-observability | Provider latency/errors, fallback events, token/cost metadata and redacted audit trails | ai-provider-orchestration, ai-action-safety |

Build order: ai-provider-orchestration → ai-domain-context → ai-action-safety → ai-assistant-experience → ai-observability.

External payment and delivery-platform integrations are intentionally outside this initiative.

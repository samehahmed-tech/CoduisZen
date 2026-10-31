# Spec: RestoFlow AI Assistant 2.0

## Objective

Turn the existing assistant into a trustworthy, enjoyable restaurant-ERP copilot that can answer questions, analyze branch-scoped business data, and propose or execute approved actions. It must support a free/default path, configurable providers including Gemini and NVIDIA-compatible APIs, selectable models, automatic failover, and a coherent RestoFlow domain system prompt.

## Assumptions

1. RestoFlow remains a web application with the existing React/Express architecture.
2. Provider keys are stored server-side encrypted and are never exposed to the browser or model prompts.
3. Existing authentication, branch isolation, `GuardedAIAction`, preview/execute endpoints, and audit logging remain the security boundary.
4. The first visual character will be a lightweight CSS/SVG/Canvas avatar shipped locally; no remote asset or paid 3D runtime is required.
5. “Free AI” means a no-cost route when available: system deterministic copilot, local Ollama, or a user-supplied free-tier provider key. Provider quotas and availability are not guaranteed.
6. Providers are configured by administrators; normal users may select only models that administrators have enabled.

## Capability requirements

### Provider orchestration

- Providers: SYSTEM, OLLAMA, OPENROUTER, GROQ, GEMINI, NVIDIA and a generic OpenAI-compatible endpoint.
- Each provider has a registry entry with key requirements, endpoint, model list, capability flags, timeout and retry policy.
- Admins can add/update/remove encrypted credentials and choose an ordered fallback chain.
- The user can select a provider/model when more than one configured option exists.
- A request tries the selected model first, then healthy fallback candidates, with bounded retries and no infinite loops.
- Failover occurs on timeout, connection error, 408, 429, 5xx, unsupported model and provider-side overload. Authentication errors do not silently retry forever.
- The response records the actual provider/model and whether fallback was used, without storing secrets or raw sensitive prompts.
- No provider key is accepted from a normal chat request body.

### RestoFlow domain intelligence

- System context covers menu/catalog, sales/orders, inventory/recipes/wastage, customers/CRM, finance/day close, delivery/dispatch, staff/attendance, branches and operational settings.
- Context is server-generated, branch-scoped, permission-aware and summarized; the browser does not send the entire store state as authority.
- Analyses include provenance: date range, branch scope, data freshness and metric definitions.
- Missing or stale data is stated explicitly; the model must not invent numbers.
- Domain tools return structured results and the model explains the result in Arabic or English according to the user language.

### Actions and safety

- Read-only analysis can run directly for authorized users.
- Mutating actions always return a preview with target, before/after, affected branch, risk and audit reason.
- Execution requires the existing permission gate and explicit confirmation; high-risk actions additionally require an appropriate elevated role.
- Actions are idempotent and audited. The assistant cannot change provider credentials, permissions, financial postings, delete data, or alter branch scope through free-form text alone.
- Tool errors fail closed and are shown as actionable messages.

### Experience and character

- Replace the plain assistant surface with a branded “RestoFlow Copilot” panel: welcoming state, suggested tasks, context chips, model/provider status, streaming/thinking state, fallback explanation and action cards.
- Add a locally shipped friendly 3D-style character using CSS/SVG/Canvas with idle, listening, thinking, success and error states. It must work without network access.
- Support Arabic RTL and English LTR, keyboard navigation, screen-reader labels, reduced-motion mode and a non-animated fallback.
- Character must not imply confidence or completion when the provider/action failed.

## Commands

- Unit/security tests: `npm test -- --runInBand`
- Typecheck: `npm run typecheck`
- Lint: `npm run lint -- --quiet`
- Production build: `npm run build`
- Focused AI tests: `npx vitest run tests/ai* tests/systemCopilot.test.ts`

## Project Structure

- `server/services/aiProviderRegistry.ts` — provider/model contracts and health metadata.
- `server/services/aiProviderService.ts` — bounded request/fallback orchestration.
- `server/services/aiDomainContextService.ts` — branch-scoped context and provenance.
- `server/services/aiToolRegistry.ts` — allow-listed read/write tools.
- `server/controllers/aiController.ts` and `server/routes/aiRoutes.ts` — API boundary.
- `services/api/ai.ts` — frontend API client.
- `components/AIAssistant.tsx` and `components/ai/` — assistant experience and character.
- `tests/ai*` — provider, security, context, fallback and action contracts.

## Code Style

Provider calls use typed normalized inputs and return a common result:

```ts
type AiCompletionResult = {
  text: string;
  providerId: string;
  modelId: string;
  usedFallback: boolean;
  latencyMs: number;
};
```

Provider adapters must not throw raw vendor payloads to the client. They normalize errors to stable internal codes and redact credentials in logs.

## Testing Strategy

- Contract tests for provider normalization, model selection, fallback ordering, timeout/retry limits and secret redaction.
- Authorization tests for branch scope, role gates, provider configuration and action confirmation.
- Context tests proving menu/sales/inventory/customer data is scoped and provenance is present.
- UI tests for Arabic/English, loading/fallback/error states, keyboard access and reduced motion.
- Build/typecheck/lint plus the existing full regression suites before packaging.
- Live provider smoke tests are opt-in and never run with production secrets in CI.

## Boundaries

- Always: keep keys server-side encrypted; enforce branch scope; return provenance; fail closed for mutations; audit executed actions; preserve offline/local operation.
- Ask first: adding a new runtime dependency, database table, production provider key, or external paid service.
- Never: send secrets to the browser/model; let the model choose arbitrary URLs/tools; bypass permissions; claim a failed action succeeded; silently fabricate business metrics.

## Success Criteria

1. An admin can configure at least SYSTEM/local, Gemini, NVIDIA and one generic OpenAI-compatible provider, select models, and see masked credentials.
2. A chat request succeeds through the selected provider or a bounded, visible fallback chain without changing the request contract.
3. The assistant answers a branch-scoped sales, menu, inventory and customer question with provenance and no cross-branch records.
4. A write request produces a preview, requires confirmation, enforces permissions, and leaves an audit event; unauthorized or ambiguous writes are rejected.
5. The new UI and character work in Arabic RTL, English LTR, keyboard navigation, reduced motion and offline/local mode.
6. Focused tests, full tests, typecheck, lint and production build pass.

## Open Questions

- Exact visual identity/name of the character can be tuned after the first working avatar; implementation will use the RestoFlow brand palette and a neutral professional personality.
- Provider model lists may change; the registry will allow admin-entered model IDs and a refresh/test operation rather than hardcoding availability as a guarantee.

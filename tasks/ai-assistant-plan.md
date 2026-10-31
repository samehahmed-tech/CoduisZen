# AI Assistant 2.0 Implementation Plan

This plan is isolated from the existing `tasks/plan.md` because that plan belongs to an earlier workstream and contains unfinished tasks.

## Dependency graph

```text
Provider contracts + encrypted config
        ↓
Provider adapters + bounded fallback
        ↓
Branch-scoped domain context + provenance
        ↓
Allow-listed action/tool orchestration
        ↓
Assistant UI + branded character
        ↓
Observability, review, packaging
```

## Ordered vertical slices

### Slice 1 — Provider registry and fallback

Add typed provider/model contracts, Gemini/NVIDIA/OpenAI-compatible adapters, encrypted provider configuration, model selection, bounded fallback and stable redacted errors.

Verification: focused provider tests, typecheck, lint.

### Slice 2 — Domain context

Move authoritative business context generation to the server, keep branch/role scope, attach provenance and expose a safe read-only analysis contract.

Verification: context scope/provenance tests and AI route authorization tests.

### Slice 3 — Safe tools and actions

Extend the existing action guard with explicit read-only tools, confirmation metadata, idempotency and fail-closed behavior for high-risk mutations.

Verification: action guard, branch authority, confirmation and audit tests.

### Slice 4 — Assistant experience

Refactor the assistant panel into a branded Copilot surface with provider/model controls, visible fallback state, Arabic/English copy, keyboard access, reduced motion and a local 3D-style character.

Verification: component contracts, build, accessibility-oriented DOM checks and visual/manual review.

### Slice 5 — Observability and release

Add redacted provider telemetry, health/configuration status, documentation, regression review and installer payload validation.

Verification: full unit/security suites, typecheck, lint, build and hotfix package boot probe.

## Risk controls

- No browser-supplied provider key is trusted.
- Provider/model availability is probed and never presented as guaranteed.
- Fallback is bounded and visible; no recursive retry loops.
- Business context is generated server-side and remains branch-scoped.
- Mutations remain behind existing preview/confirmation/permission/audit gates.
- No Paymob/Talabat or other delivery/payment integration work is included.

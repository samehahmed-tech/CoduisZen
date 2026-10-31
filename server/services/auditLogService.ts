// Backward-compatible import path. All signed audit writes now use the
// canonical implementation so HMACs cannot be silently omitted and payloads
// are redacted consistently.
export { createSignedAuditLog, redactAuditValue } from './auditService';

export type LegalHold = {
    id: string;
    branchId: string | null;
    caseReference: string;
    reason: string;
    startsAt: string;
    endsAt: string | null;
    active: boolean;
    createdBy: string;
    createdAt: string;
};

export const normalizeLegalHoldInput = (input: unknown) => {
    const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
    const caseReference = String(source.caseReference || '').trim();
    const reason = String(source.reason || '').trim();
    const startsAt = String(source.startsAt || '').trim();
    const endsAt = source.endsAt ? String(source.endsAt).trim() : null;
    if (!caseReference || caseReference.length > 120) throw new Error('LEGAL_HOLD_CASE_REFERENCE_REQUIRED');
    if (!reason || reason.length > 1000) throw new Error('LEGAL_HOLD_REASON_REQUIRED');
    if (!Number.isFinite(Date.parse(startsAt))) throw new Error('LEGAL_HOLD_START_INVALID');
    if (endsAt && !Number.isFinite(Date.parse(endsAt))) throw new Error('LEGAL_HOLD_END_INVALID');
    if (endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) throw new Error('LEGAL_HOLD_RANGE_INVALID');
    return { branchId: source.branchId ? String(source.branchId).trim() : null, caseReference, reason, startsAt: new Date(startsAt).toISOString(), endsAt: endsAt ? new Date(endsAt).toISOString() : null };
};

export const isLegalHoldActive = (hold: Pick<LegalHold, 'active' | 'startsAt' | 'endsAt'>, now = new Date()) =>
    hold.active && new Date(hold.startsAt).getTime() <= now.getTime() && (!hold.endsAt || new Date(hold.endsAt).getTime() >= now.getTime());


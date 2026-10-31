import { randomUUID } from 'crypto';

export type JournalProvenanceInput = {
    reference?: string;
    referenceType: string;
    source?: string;
    actorId?: string;
    createdBy?: string;
    correlationId?: string;
};

export const resolveJournalProvenance = (input: JournalProvenanceInput) => ({
    source: String(input.source || input.referenceType).trim().slice(0, 100),
    actorId: String(input.actorId || input.createdBy || 'system').trim().slice(0, 255),
    correlationId: String(
        input.correlationId || `${input.referenceType}:${input.reference || 'manual'}:${randomUUID()}`,
    ).trim().slice(0, 255),
});

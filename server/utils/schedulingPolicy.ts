export type ShiftWindowInput = {
    date: string | Date;
    startTime?: string | null;
    endTime?: string | null;
};

export type ShiftConflict = {
    kind: 'OVERLAP' | 'MIN_REST';
    entryId?: string | number;
};

const parseTimeToMinutes = (value?: string | null) => {
    if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
    const [hours, minutes] = value.split(':').map(Number);
    return (hours * 60) + minutes;
};

export const buildShiftWindow = (input: ShiftWindowInput) => {
    const startMinutes = parseTimeToMinutes(input.startTime);
    const endMinutes = parseTimeToMinutes(input.endTime);
    if (startMinutes === null || endMinutes === null) return null;

    const date = input.date instanceof Date ? new Date(input.date) : new Date(`${String(input.date).slice(0, 10)}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime())) return null;

    const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, startMinutes);
    let end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, endMinutes);
    // An end time earlier than the start belongs to the next operational day.
    if (end <= start) end += 24 * 60 * 60 * 1000;
    return { start, end };
};

export const findShiftConflict = <T extends { id?: string | number; date: string | Date; startTime?: string | null; endTime?: string | null }>(
    candidate: ShiftWindowInput,
    existing: T[],
    minimumRestMinutes = 11 * 60,
): ShiftConflict | null => {
    const candidateWindow = buildShiftWindow(candidate);
    if (!candidateWindow) return null;

    for (const entry of existing) {
        const entryWindow = buildShiftWindow(entry);
        if (!entryWindow) continue;
        if (candidateWindow.start < entryWindow.end && entryWindow.start < candidateWindow.end) {
            return { kind: 'OVERLAP', entryId: entry.id };
        }

        const gapMinutes = candidateWindow.start >= entryWindow.end
            ? (candidateWindow.start - entryWindow.end) / 60000
            : (entryWindow.start - candidateWindow.end) / 60000;
        if (gapMinutes >= 0 && gapMinutes < minimumRestMinutes) {
            return { kind: 'MIN_REST', entryId: entry.id };
        }
    }

    return null;
};

export const hasPartialShiftTime = (input: Pick<ShiftWindowInput, 'startTime' | 'endTime'>) => Boolean(input.startTime) !== Boolean(input.endTime);

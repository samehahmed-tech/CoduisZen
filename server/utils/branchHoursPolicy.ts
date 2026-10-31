const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
type DayName = typeof DAY_NAMES[number];

export interface BusinessHourWindow {
    open: string;
    close: string;
    enabled: boolean;
}

export type BusinessHours = Partial<Record<DayName | string, BusinessHourWindow>>;

const DEFAULT_OPEN_WINDOW: BusinessHourWindow = { open: '00:00', close: '00:00', enabled: true };

const parseMinutes = (value: unknown): number | null => {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour >= 0 && hour < 24 && minute >= 0 && minute < 60 ? hour * 60 + minute : null;
};

const canonicalDay = (value: unknown): DayName | null => {
    const normalized = String(value || '').trim().toLowerCase();
    const index = DAY_NAMES.findIndex(day => day.toLowerCase() === normalized || day.slice(0, 3).toLowerCase() === normalized.slice(0, 3));
    return index >= 0 ? DAY_NAMES[index] : null;
};

const getLocalParts = (date: Date, timeZone: string) => {
    try {
        const formatter = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false });
        const parts = formatter.formatToParts(date);
        const weekday = parts.find(part => part.type === 'weekday')?.value || 'Sunday';
        const hour = Number(parts.find(part => part.type === 'hour')?.value || 0) % 24;
        const minute = Number(parts.find(part => part.type === 'minute')?.value || 0);
        return { day: canonicalDay(weekday) || 'Sunday', minutes: hour * 60 + minute };
    } catch {
        return { day: DAY_NAMES[date.getDay()], minutes: date.getHours() * 60 + date.getMinutes() };
    }
};

const previousDay = (day: DayName): DayName => DAY_NAMES[(DAY_NAMES.indexOf(day) + DAY_NAMES.length - 1) % DAY_NAMES.length];

export const normalizeBusinessHours = (value: unknown): { hours: Record<DayName, BusinessHourWindow>; configured: boolean } => {
    const source = value && typeof value === 'object' ? value as Record<string, any> : {};
    const hasConfiguration = Object.keys(source).some(key => canonicalDay(key) !== null);
    const hours = {} as Record<DayName, BusinessHourWindow>;
    for (const day of DAY_NAMES) {
        const raw = source[day] || source[day.toLowerCase()] || source[day.slice(0, 3)] || {};
        const open = String(raw.open || DEFAULT_OPEN_WINDOW.open).trim();
        const close = String(raw.close || DEFAULT_OPEN_WINDOW.close).trim();
        hours[day] = { open, close, enabled: Object.keys(raw).length > 0 ? raw.enabled !== false : !hasConfiguration };
    }
    return { hours, configured: hasConfiguration };
};

const matchesWindow = (window: BusinessHourWindow, minutes: number) => {
    if (!window.enabled) return false;
    const open = parseMinutes(window.open);
    const close = parseMinutes(window.close);
    if (open === null || close === null) return false;
    if (open === close) return true;
    return open < close ? minutes >= open && minutes < close : minutes >= open || minutes < close;
};

export const isBranchOpenAt = (value: unknown, date = new Date(), timeZone = 'Africa/Cairo') => {
    const normalized = normalizeBusinessHours(value);
    // Existing installations may not have the optional setting yet. Preserve
    // their behavior until an operator explicitly configures branch hours.
    if (!normalized.configured) return true;
    const local = getLocalParts(date, timeZone);
    if (matchesWindow(normalized.hours[local.day], local.minutes)) return true;

    // An overnight window belongs to the previous day's opening schedule.
    const previous = normalized.hours[previousDay(local.day)];
    const open = parseMinutes(previous.open);
    const close = parseMinutes(previous.close);
    return previous.enabled && open !== null && close !== null && open > close && local.minutes < close;
};

export const getPublicBusinessHours = (value: unknown, date = new Date(), timeZone = 'Africa/Cairo') => {
    const normalized = normalizeBusinessHours(value);
    return {
        configured: normalized.configured,
        timezone: timeZone,
        isOpen: isBranchOpenAt(value, date, timeZone),
        hours: normalized.hours,
    };
};

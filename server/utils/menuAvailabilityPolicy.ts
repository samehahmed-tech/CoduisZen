const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const toMinutes = (value: unknown): number | null => {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60 ? hours * 60 + minutes : null;
};

const localClock = (date: Date, timeZone: string) => {
    try {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
        const hour = Number(parts.find(part => part.type === 'hour')?.value || 0) % 24;
        const minute = Number(parts.find(part => part.type === 'minute')?.value || 0);
        return hour * 60 + minute;
    } catch {
        return date.getHours() * 60 + date.getMinutes();
    }
};

const localDay = (date: Date, timeZone: string) => {
    try {
        const day = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date).toLowerCase().slice(0, 3);
        return day;
    } catch {
        return DAY_KEYS[date.getDay()];
    }
};

export const isMenuItemAvailableNow = (item: {
    isAvailable?: unknown;
    status?: unknown;
    deletedAt?: unknown;
    availableFrom?: unknown;
    availableTo?: unknown;
    availableDays?: unknown;
}, now = new Date(), timeZone = 'Africa/Cairo') => {
    if (item.isAvailable === false || item.deletedAt) return false;
    if (item.status && !['published', 'approved'].includes(String(item.status).toLowerCase())) return false;

    const days = Array.isArray(item.availableDays)
        ? item.availableDays.map(day => String(day).trim().toLowerCase().slice(0, 3)).filter(Boolean)
        : [];
    if (days.length > 0 && !days.includes(localDay(now, timeZone))) return false;

    const from = toMinutes(item.availableFrom);
    const to = toMinutes(item.availableTo);
    if (from === null && to === null) return true;
    if (from === null || to === null) return false;
    const current = localClock(now, timeZone);
    if (from === to) return true;
    return from < to ? current >= from && current < to : current >= from || current < to;
};

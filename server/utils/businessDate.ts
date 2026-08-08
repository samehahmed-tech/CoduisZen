const parseDateKey = (dateKey: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
    if (!match) throw new Error('INVALID_BUSINESS_DATE');
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
};

const addDays = (dateKey: string, days: number) => {
    const { year, month, day } = parseDateKey(dateKey);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

const zonedMidnightUtc = (dateKey: string, timeZone: string) => {
    const { year, month, day } = parseDateKey(dateKey);
    const targetWallTime = Date.UTC(year, month - 1, day);
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    });
    const wallTimeAt = (instant: number) => {
        const parts = Object.fromEntries(
            formatter.formatToParts(new Date(instant))
                .filter(part => part.type !== 'literal')
                .map(part => [part.type, Number(part.value)]),
        );
        return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    };

    let candidate = targetWallTime - (wallTimeAt(targetWallTime) - targetWallTime);
    candidate += targetWallTime - wallTimeAt(candidate);
    return new Date(candidate);
};

export const getDateKeyInTimeZone = (date: string | Date, timeZone: string) => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const parts = Object.fromEntries(
        formatter.formatToParts(new Date(date))
            .filter(part => part.type !== 'literal')
            .map(part => [part.type, part.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
};

export const getBusinessDateBounds = (dateKey: string, timeZone: string) => {
    const startOfDay = zonedMidnightUtc(dateKey, timeZone);
    const nextDayStart = zonedMidnightUtc(addDays(dateKey, 1), timeZone);
    return { startOfDay, endOfDay: new Date(nextDayStart.getTime() - 1) };
};

export const maskIdentifier = (value: unknown, visiblePrefix = 2, visibleSuffix = 2): string => {
    const raw = String(value || '');
    if (!raw) return '[REDACTED]';
    if (raw.length <= visiblePrefix + visibleSuffix) return '[REDACTED]';
    return `${raw.slice(0, visiblePrefix)}***${raw.slice(-visibleSuffix)}`;
};

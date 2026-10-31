export const resolveConfiguredSecret = (...values: unknown[]) => {
    for (const value of values) {
        const secret = String(value || '').trim();
        if (secret) return secret;
    }
    return null;
};

export const isStrongSecret = (value: unknown, minimumLength = 32) => {
    const secret = String(value || '').trim();
    return secret.length >= minimumLength;
};

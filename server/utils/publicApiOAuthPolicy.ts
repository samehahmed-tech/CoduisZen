export const parseRequestedOAuthScopes = (value: unknown): string[] => {
    if (Array.isArray(value)) return Array.from(new Set(value.map(String).map(scope => scope.trim()).filter(Boolean)));
    if (typeof value === 'string') return Array.from(new Set(value.split(/\s+/).map(scope => scope.trim()).filter(Boolean)));
    return [];
};

export const resolveOAuthScopes = (requested: unknown, allowed: string[]) => {
    const requestedScopes = parseRequestedOAuthScopes(requested);
    const uniqueAllowed = Array.from(new Set(allowed.map(scope => scope.trim()).filter(Boolean)));
    const effective = requestedScopes.length ? requestedScopes : uniqueAllowed;
    if (effective.some(scope => !uniqueAllowed.includes(scope))) {
        throw Object.assign(new Error('OAUTH_SCOPE_FORBIDDEN'), { statusCode: 400 });
    }
    return effective;
};

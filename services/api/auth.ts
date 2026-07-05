import { apiRequest } from './core';

export const authApi = {
    login: (email: string, password: string, deviceName?: string) =>
        apiRequest<{ token?: string; refreshToken?: string; user?: any; mfaRequired?: boolean; mfaToken?: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, deviceName }) }),
    verifyMfa: (mfaToken: string, code: string, deviceName?: string) =>
        apiRequest<{ token: string; refreshToken: string; user: any }>('/auth/mfa/verify', { method: 'POST', body: JSON.stringify({ mfaToken, code, deviceName }) }),
    pinLogin: (pin: string, branchId?: string, deviceName?: string) =>
        apiRequest<{ token: string; refreshToken: string; user: any }>('/auth/pin-login', { method: 'POST', body: JSON.stringify({ pin, branchId, deviceName }) }),
    me: () => apiRequest<{ user: any }>('/auth/me'),
    logout: () => apiRequest<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
    getSessions: () => apiRequest<Array<{
        id: string;
        deviceName?: string | null;
        userAgent?: string | null;
        ipAddress?: string | null;
        isActive: boolean;
        createdAt: string;
        lastSeenAt?: string | null;
        expiresAt: string;
        revokedAt?: string | null;
        isCurrent: boolean;
    }>>('/auth/sessions'),
    revokeSession: (id: string) => apiRequest<{ ok: boolean }>(`/auth/sessions/${id}`, { method: 'DELETE' }),
    revokeOtherSessions: () => apiRequest<{ ok: boolean }>('/auth/sessions/revoke-others', { method: 'POST' }),
    initiateMfaSetup: () => apiRequest<{ setupToken: string; secret: string; otpAuthUrl: string }>('/auth/mfa/setup/initiate', { method: 'POST' }),
    confirmMfaSetup: (setupToken: string, code: string) =>
        apiRequest<{ ok: boolean }>('/auth/mfa/setup/confirm', { method: 'POST', body: JSON.stringify({ setupToken, code }) }),
    disableMfa: (code: string) =>
        apiRequest<{ ok: boolean }>('/auth/mfa/disable', { method: 'POST', body: JSON.stringify({ code }) }),
};

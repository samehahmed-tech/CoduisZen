/**
 * Axios-compatible shim around the core apiRequest fetch wrapper.
 * Provides api.get(), api.post(), api.put(), api.delete() convenience methods
 * that return { data: T } to match the pattern used by HR components.
 */
import { apiRequest } from '../services/api/core';

const wrapResponse = async <T>(promise: Promise<T>): Promise<{ data: T }> => {
    const data = await promise;
    return { data };
};

export const api = {
    get: <T = any>(url: string, config?: { params?: Record<string, string> }) => {
        let endpoint = url.replace(/^\/api/, '');
        if (config?.params) {
            const qs = new URLSearchParams(config.params).toString();
            endpoint += `?${qs}`;
        }
        return wrapResponse(apiRequest<T>(endpoint));
    },

    post: <T = any>(url: string, body?: any, config?: { headers?: Record<string, string> }) => {
        const endpoint = url.replace(/^\/api/, '');
        return wrapResponse(
            apiRequest<T>(endpoint, {
                method: 'POST',
                body: typeof body === 'string' ? body : JSON.stringify(body),
                headers: config?.headers,
            }),
        );
    },

    put: <T = any>(url: string, body?: any) => {
        const endpoint = url.replace(/^\/api/, '');
        return wrapResponse(
            apiRequest<T>(endpoint, {
                method: 'PUT',
                body: JSON.stringify(body),
            }),
        );
    },

    delete: <T = any>(url: string) => {
        const endpoint = url.replace(/^\/api/, '');
        return wrapResponse(
            apiRequest<T>(endpoint, { method: 'DELETE' }),
        );
    },
};

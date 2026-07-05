import { apiRequest } from './core';

const toQuery = (params?: Record<string, unknown>) => {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    });
    return query.toString();
};

export const printGatewayApi = {
    getJobs: (params?: { branchId?: string; status?: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED'; limit?: number }) => {
        const query = toQuery(params);
        return apiRequest<{ ok: boolean; stats: { queued: number; processing: number; completed: number; failed: number; total: number }; jobs: any[] }>(`/print-gateway/jobs${query ? `?${query}` : ''}`);
    },
    retryJob: (jobId: string, params: { branchId: string }) => {
        const query = toQuery(params);
        return apiRequest<{ ok: boolean; job: any }>(`/print-gateway/jobs/${jobId}/retry${query ? `?${query}` : ''}`, { method: 'POST' });
    },
    cancelJob: (jobId: string, params: { branchId: string }) => {
        const query = toQuery(params);
        return apiRequest<{ ok: boolean; job: any }>(`/print-gateway/jobs/${jobId}${query ? `?${query}` : ''}`, { method: 'DELETE' });
    },
    purgeJobs: (params: { branchId: string }) => {
        const query = toQuery(params);
        return apiRequest<{ ok: boolean; purged: number }>(`/print-gateway/jobs/purge${query ? `?${query}` : ''}`, { method: 'DELETE' });
    },
};

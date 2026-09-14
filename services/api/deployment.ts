import { apiRequest } from './core';

export const deploymentApi = {
    getConfig: () => apiRequest<any>('/deployment/config'),
    issuePairingToken: () => apiRequest<{ token: string; expiresIn: string }>('/deployment/pairing-token', { method: 'POST' }),
    getSites: () => apiRequest<any[]>('/deployment/sites'),
    getUpdateRelease: () => apiRequest<any>('/deployment/update-release'),
    publishUpdateRelease: (data: any) => apiRequest<any>('/deployment/update-release', { method: 'PUT', body: JSON.stringify(data) }),
    queueCommand: (data: any) => apiRequest<any>('/deployment/commands', { method: 'POST', body: JSON.stringify(data) }),
    pullCommandsAt: (centralApiUrl: string, siteId: string, siteToken: string) => fetch(`${centralApiUrl.replace(/\/$/, '')}/api/deployment/commands/pull`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-site-id': siteId, 'x-site-token': siteToken }, body: JSON.stringify({ siteId, siteToken }) }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data?.error || `HTTP_${response.status}`); return data; }),
    ackCommandAt: (centralApiUrl: string, siteId: string, siteToken: string, commandId: string) => fetch(`${centralApiUrl.replace(/\/$/, '')}/api/deployment/commands/ack`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-site-id': siteId, 'x-site-token': siteToken }, body: JSON.stringify({ siteId, siteToken, commandId }) }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data?.error || `HTTP_${response.status}`); return data; }),
    registerAt: (centralApiUrl: string, payload: any) => fetch(`${centralApiUrl.replace(/\/$/, '')}/api/deployment/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data?.error || `HTTP_${response.status}`); return data; }),
};

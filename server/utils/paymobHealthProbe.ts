export interface PaymobProbeConfig {
    enabled?: boolean;
    apiKey?: string;
    baseUrl?: string;
}

const defaultBase = 'https://accept.paymob.com/api';

export const probePaymobConnectivity = async (config: PaymobProbeConfig, timeoutMs = 2000): Promise<{ connectivity: 'HEALTHY' | 'ERROR'; latencyMs: number; reason?: string }> => {
    const startedAt = Date.now();
    if (!config.enabled || !config.apiKey) return { connectivity: 'ERROR', latencyMs: 0, reason: 'PAYMOB_CREDENTIALS_MISSING' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(250, Math.min(timeoutMs, 5000)));
    try {
        const base = String(config.baseUrl || defaultBase).replace(/\/+$/, '');
        const response = await fetch(`${base}/auth/tokens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: config.apiKey }),
            signal: controller.signal,
        });
        const data: any = await response.json().catch(() => ({}));
        if (!response.ok || !data?.token) {
            return { connectivity: 'ERROR', latencyMs: Date.now() - startedAt, reason: `PAYMOB_AUTH_${response.status || 'FAILED'}` };
        }
        return { connectivity: 'HEALTHY', latencyMs: Date.now() - startedAt };
    } catch (error: any) {
        return { connectivity: 'ERROR', latencyMs: Date.now() - startedAt, reason: String(error?.name === 'AbortError' ? 'PROBE_TIMEOUT' : error?.message || error).slice(0, 120) };
    } finally {
        clearTimeout(timer);
    }
};

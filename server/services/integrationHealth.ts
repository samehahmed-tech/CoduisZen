export interface IntegrationProviderHealth {
    provider: string;
    status: 'CONFIGURED' | 'DISABLED' | 'ADAPTER_PENDING' | 'ERROR';
    configured: boolean;
    connectivity: 'HEALTHY' | 'UNVERIFIED' | 'ERROR';
    latencyMs?: number;
    probeReason?: string;
    capabilities?: Record<string, boolean>;
}

export const summarizePaymentProviderHealth = (providers: Array<any>): IntegrationProviderHealth[] => providers.map((provider) => ({
    provider: String(provider?.provider || 'UNKNOWN'),
    status: provider?.status === 'CONFIGURED'
        ? 'CONFIGURED'
        : provider?.status === 'ADAPTER_PENDING_VERIFICATION'
            ? 'ADAPTER_PENDING'
            : 'DISABLED',
    configured: Boolean(provider?.enabled || provider?.status === 'CONFIGURED'),
    connectivity: 'UNVERIFIED',
    capabilities: provider?.capabilities && typeof provider.capabilities === 'object'
        ? Object.fromEntries(Object.entries(provider.capabilities).map(([key, value]) => [key, Boolean(value)]))
        : undefined,
}));

export const summarizeAggregatorProviderHealth = (configs: Record<string, any>): IntegrationProviderHealth[] =>
    Object.entries(configs || {}).map(([provider, config]) => ({
        provider,
        status: config?.enabled ? 'CONFIGURED' : 'DISABLED',
        configured: Boolean(config?.enabled),
        connectivity: 'UNVERIFIED',
        capabilities: { webhook: Boolean(config?.enabled) },
    }));

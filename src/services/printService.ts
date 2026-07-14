export interface PrintJob {
    content: string;
    contentType?: 'text' | 'image';
    type: 'RECEIPT' | 'KITCHEN';
    printerId?: string;
    printerAddress?: string;
    printerType?: 'LOCAL' | 'NETWORK' | 'WINDOWS' | 'USB';
    targetGatewayId?: string;
    branchId: string;
}

const resolveApiBaseUrl = () => {
    const configured = import.meta.env.VITE_API_URL || '/api';
    if (configured && !configured.startsWith('/')) return configured.replace(/\/+$/, '');
    if (typeof window !== 'undefined' && import.meta.env.DEV && ['3000', '5173'].includes(window.location.port)) {
        return `${window.location.protocol}//${window.location.hostname}:3001/api`;
    }
    return configured;
};

const API_BASE_URL = resolveApiBaseUrl();

const getAuthToken = () => {
    try {
        return localStorage.getItem('auth_token');
    } catch {
        return null;
    }
};

export const printService = {
    async print(job: PrintJob): Promise<boolean> {
        const token = getAuthToken();
        const payload = {
            type: job.type,
            content: job.content,
            contentType: job.contentType || 'image',
            printerId: job.printerId,
            printerAddress: job.printerAddress,
            printerType: job.printerType,
            targetGatewayId: job.targetGatewayId,
            branchId: job.branchId,
        };

        try {
            const response = await fetch(`${API_BASE_URL}/print-gateway/jobs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify(payload),
            });

            return response.ok;
        } catch {
            return false;
        }
    },

    async triggerCashDrawer(branchId: string): Promise<boolean> {
        return this.print({ content: '\x1B\x70\x00\x19\xFA', contentType: 'text', type: 'RECEIPT', branchId });
    }
};

import { afterEach, describe, expect, it, vi } from 'vitest';
import { canPrintDirectlyOffline, normalizePrinterType } from '../src/services/localPrintPolicy';
import { printService } from '../src/services/printService';

describe('offline local print policy', () => {
    afterEach(() => vi.restoreAllMocks());

    it('allows direct bridge printing only for local-capable printer types', () => {
        expect(canPrintDirectlyOffline('LOCAL')).toBe(true);
        expect(canPrintDirectlyOffline('WINDOWS')).toBe(true);
        expect(canPrintDirectlyOffline('USB')).toBe(true);
        expect(canPrintDirectlyOffline('NETWORK')).toBe(false);
        expect(canPrintDirectlyOffline('LAN')).toBe(false);
    });

    it('normalizes printer type safely', () => {
        expect(normalizePrinterType(' windows ')).toBe('WINDOWS');
        expect(normalizePrinterType(undefined)).toBe('LOCAL');
    });

    it('routes a local printer to the loopback bridge while offline', async () => {
        vi.stubGlobal('navigator', { onLine: false });
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchMock);

        await expect(printService.print({
            id: 'local-job-1', type: 'RECEIPT', content: 'receipt', contentType: 'text',
            printerType: 'USB', branchId: 'branch-a',
        })).resolves.toBe(true);

        expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:3002/print', expect.objectContaining({
            method: 'POST',
            body: expect.stringContaining('local-job-1'),
        }));
    });

    it('does not send a network printer to the local offline bridge', async () => {
        vi.stubGlobal('navigator', { onLine: false });
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(printService.print({
            type: 'RECEIPT', content: 'receipt', printerType: 'NETWORK', branchId: 'branch-a',
        })).resolves.toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

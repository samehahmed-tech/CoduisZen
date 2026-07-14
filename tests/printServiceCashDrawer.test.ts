import { afterEach, describe, expect, it, vi } from 'vitest';
import { printService } from '../src/services/printService';

describe('printService cash drawer', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('queues the ESC/POS drawer pulse as raw text instead of an image', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('localStorage', { getItem: () => 'test-token' });

        await expect(printService.triggerCashDrawer('branch-1')).resolves.toBe(true);

        const request = fetchMock.mock.calls[0][1];
        const payload = JSON.parse(String(request.body));
        expect(payload).toMatchObject({
            branchId: 'branch-1',
            content: '\x1B\x70\x00\x19\xFA',
            contentType: 'text',
            type: 'RECEIPT',
        });
    });
});

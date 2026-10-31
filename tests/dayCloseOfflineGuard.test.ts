import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());
vi.mock('../services/api/core', () => ({ apiRequest: apiRequestMock, apiRequestBlob: vi.fn() }));

import { dayCloseApi } from '../services/api/dayClose';

describe('day close connectivity guard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('navigator', { onLine: false });
    });

    it('refuses to start a close while the device is offline', async () => {
        await expect(dayCloseApi.close('branch-a', '2026-10-28'))
            .rejects.toMatchObject({ code: 'DAY_CLOSE_REQUIRES_ONLINE' });
        expect(apiRequestMock).not.toHaveBeenCalled();
    });

    it('keeps the normal API path when the device is online', async () => {
        vi.stubGlobal('navigator', { onLine: true });
        apiRequestMock.mockResolvedValueOnce({ success: true });

        await expect(dayCloseApi.close('branch-a', '2026-10-28', { notes: 'ok' }))
            .resolves.toEqual({ success: true });
        expect(apiRequestMock).toHaveBeenCalledWith('/day-close/branch-a/2026-10-28/close', {
            method: 'POST',
            body: JSON.stringify({ notes: 'ok' }),
        });
    });
});

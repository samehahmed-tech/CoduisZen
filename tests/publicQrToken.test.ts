import { describe, expect, it, vi } from 'vitest';
import { signPublicQrToken, verifyPublicQrToken } from '../server/utils/publicQrToken';

describe('public QR capability token', () => {
    it('signs only when configured and verifies the exact branch/table pair', () => {
        vi.stubEnv('PUBLIC_QR_SECRET', 'qr-test-secret');
        const token = signPublicQrToken('branch-1', 'table-7');
        expect(token).toHaveLength(48);
        expect(verifyPublicQrToken('branch-1', 'table-7', token)).toBe(true);
        expect(verifyPublicQrToken('branch-2', 'table-7', token)).toBe(false);
        expect(verifyPublicQrToken('branch-1', 'table-8', token)).toBe(false);
        vi.unstubAllEnvs();
    });
});

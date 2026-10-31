import crypto from 'node:crypto';

const qrSecret = () => String(process.env.PUBLIC_QR_SECRET || '').trim();

const payloadFor = (branchId: string, tableId: string) => `${String(branchId).trim()}:${String(tableId).trim()}`;

export const signPublicQrToken = (branchId: string, tableId: string): string | null => {
    const secret = qrSecret();
    if (!secret || !branchId || !tableId) return null;
    return crypto.createHmac('sha256', secret).update(payloadFor(branchId, tableId)).digest('hex').slice(0, 48);
};

export const verifyPublicQrToken = (branchId: string, tableId: string, token: unknown): boolean => {
    const expected = signPublicQrToken(branchId, tableId);
    const supplied = String(token || '').trim();
    if (!expected || supplied.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(supplied, 'utf8'));
};

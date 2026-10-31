import { NextFunction, Request, Response } from 'express';
import { verifyPublicQrToken } from '../utils/publicQrToken';

declare module 'express-serve-static-core' {
    interface Request {
        publicQrTableId?: string;
    }
}

export const authenticatePublicQr = (req: Request, res: Response, next: NextFunction) => {
    const branchId = String(req.params.branchId || '').trim();
    const tableId = String(req.params.tableId || '').trim();
    const token = String(req.header('X-RestoFlow-QR-Token') || req.query.token || '').trim();
    if (!branchId || !tableId || !verifyPublicQrToken(branchId, tableId, token)) {
        return res.status(401).json({ code: 'PUBLIC_QR_TOKEN_INVALID', message: 'A valid table QR token is required.' });
    }
    req.publicQrTableId = tableId;
    req.publicApiClient = {
        id: `qr:${branchId}:${tableId}`,
        keyHash: '',
        scopes: ['menu:read', 'orders:write'],
        branchIds: [branchId],
    };
    return next();
};

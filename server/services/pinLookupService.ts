import crypto from 'crypto';
import { requireEnv } from '../config/env';

const PIN_LOOKUP_SECRET = process.env.PIN_LOOKUP_SECRET || requireEnv('JWT_SECRET');

export const buildPinLookupHash = (pin: string): string => crypto
    .createHmac('sha256', PIN_LOOKUP_SECRET)
    .update(String(pin), 'utf8')
    .digest('hex');

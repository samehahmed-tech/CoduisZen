import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const generateBase32Secret = (length = 32): string => {
    const bytes = crypto.randomBytes(length);
    let bits = '';
    for (const byte of bytes) bits += byte.toString(2).padStart(8, '0');
    let output = '';
    for (let i = 0; i < bits.length; i += 5) {
        const chunk = bits.slice(i, i + 5).padEnd(5, '0');
        output += BASE32_ALPHABET[parseInt(chunk, 2)];
    }
    return output.slice(0, length);
};

const decodeBase32 = (value: string): Buffer => {
    const normalized = value.replace(/=+$/g, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = '';
    for (const char of normalized) {
        const idx = BASE32_ALPHABET.indexOf(char);
        if (idx >= 0) bits += idx.toString(2).padStart(5, '0');
    }
    const bytes: number[] = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.slice(i, i + 8), 2));
    }
    return Buffer.from(bytes);
};

const totpAt = (secret: string, timestampMs: number, stepSeconds = 30, digits = 6): string => {
    const counter = Math.floor(timestampMs / 1000 / stepSeconds);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));
    const key = decodeBase32(secret);
    const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary = ((hmac[offset] & 0x7f) << 24)
        | ((hmac[offset + 1] & 0xff) << 16)
        | ((hmac[offset + 2] & 0xff) << 8)
        | (hmac[offset + 3] & 0xff);
    const otp = binary % Math.pow(10, digits);
    return String(otp).padStart(digits, '0');
};

export const verifyTotp = (secret: string, code: string, driftWindows = 1): boolean => {
    const normalizedCode = String(code || '').trim();
    if (!/^\d{6}$/.test(normalizedCode)) return false;
    const now = Date.now();
    for (let i = -driftWindows; i <= driftWindows; i++) {
        const ts = now + (i * 30 * 1000);
        if (totpAt(secret, ts) === normalizedCode) return true;
    }
    return false;
};

export const buildOtpAuthUri = (issuer: string, accountName: string, secret: string): string => {
    const encodedIssuer = encodeURIComponent(issuer);
    const encodedAccount = encodeURIComponent(accountName);
    return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
};

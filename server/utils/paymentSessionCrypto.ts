import crypto from 'node:crypto';

const keyMaterials = () => [
    String(process.env.PAYMENT_TOKEN_SECRET || '').trim(),
    String(process.env.PAYMENT_TOKEN_SECRET_PREVIOUS || '').trim(),
].filter(Boolean);

const encryptionKey = (material = keyMaterials()[0]) => {
    if (!material) throw new Error('PAYMENT_TOKEN_SECRET_REQUIRED');
    return crypto.createHash('sha256').update(material, 'utf8').digest();
};

/** Encrypts short-lived hosted-checkout URLs before they are persisted. */
export const encryptPaymentCheckoutUrl = (value: string): string => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
};

export const decryptPaymentCheckoutUrl = (value: unknown): string | null => {
    try {
        const [version, ivText, tagText, ciphertextText] = String(value || '').split('.');
        if (version !== 'v1' || !ivText || !tagText || !ciphertextText) return null;
        const iv = Buffer.from(ivText, 'base64url');
        const tag = Buffer.from(tagText, 'base64url');
        const ciphertext = Buffer.from(ciphertextText, 'base64url');
        for (const material of keyMaterials()) {
            try {
                const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(material), iv);
                decipher.setAuthTag(tag);
                return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
            } catch {
                // Try the previous key during an in-place rotation.
            }
        }
        return null;
    } catch {
        return null;
    }
};

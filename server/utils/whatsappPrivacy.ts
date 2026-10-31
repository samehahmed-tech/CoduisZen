export const maskWhatsAppAddress = (value: unknown): string => {
    const raw = String(value || '');
    const [localPart, suffix] = raw.split('@', 2);
    const digits = localPart.replace(/\D/g, '');
    const masked = digits.length >= 4 ? `${digits.slice(0, 2)}***${digits.slice(-2)}` : '***';
    return suffix ? `${masked}@${suffix}` : masked;
};

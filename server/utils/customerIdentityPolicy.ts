/** Canonical phone identity policy shared by CRM and call-center writes. */
export const normalizeCustomerPhone = (value: unknown): string => {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('0020') && digits.length >= 13) return `0${digits.slice(4)}`;
    if (digits.startsWith('20') && digits.length === 12) return `0${digits.slice(2)}`;
    if (digits.length === 10 && digits.startsWith('1')) return `0${digits}`;
    return digits;
};

export const customerPhoneVariants = (value: unknown): string[] => {
    const canonical = normalizeCustomerPhone(value);
    if (!canonical) return [];
    const variants = new Set([canonical]);
    if (canonical.startsWith('0') && canonical.length === 11) {
        variants.add(`20${canonical.slice(1)}`);
        variants.add(`0020${canonical.slice(1)}`);
        variants.add(canonical.slice(1));
    }
    return [...variants];
};

export const customerIdentityConfidence = (candidate: { phone?: unknown; email?: unknown }, input: { phone?: unknown; email?: unknown }) => {
    const phoneMatch = customerPhoneVariants(input.phone).includes(normalizeCustomerPhone(candidate.phone));
    const emailMatch = Boolean(input.email && candidate.email && String(input.email).trim().toLowerCase() === String(candidate.email).trim().toLowerCase());
    return phoneMatch && emailMatch ? 'EXACT_PHONE_AND_EMAIL' : phoneMatch ? 'EXACT_PHONE' : emailMatch ? 'EXACT_EMAIL' : 'POSSIBLE';
};

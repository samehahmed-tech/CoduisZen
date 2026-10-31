import { describe, expect, it } from 'vitest';
import { customerIdentityConfidence, customerPhoneVariants, normalizeCustomerPhone } from '../server/utils/customerIdentityPolicy';

describe('customer identity policy', () => {
    it('canonicalizes common Egyptian phone formats', () => {
        expect(normalizeCustomerPhone('+20 1012345678')).toBe('01012345678');
        expect(normalizeCustomerPhone('00201012345678')).toBe('01012345678');
        expect(customerPhoneVariants('01012345678')).toEqual(expect.arrayContaining(['01012345678', '201012345678', '00201012345678', '1012345678']));
    });

    it('ranks phone and email identity matches', () => {
        expect(customerIdentityConfidence({ phone: '201012345678', email: 'A@EXAMPLE.COM' }, { phone: '01012345678', email: 'a@example.com' })).toBe('EXACT_PHONE_AND_EMAIL');
        expect(customerIdentityConfidence({ phone: '201012345678' }, { phone: '01012345678' })).toBe('EXACT_PHONE');
    });
});

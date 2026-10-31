import { describe, expect, it } from 'vitest';
import { redactLogText } from '../server/utils/logger';

describe('central logger privacy', () => {
    it('redacts credentials and payment fragments embedded in error text', () => {
        const result = redactLogText('Authorization: Bearer abc123 token=tok-1 cardNumber=4111111111111111 cvv=123');
        expect(result).not.toContain('abc123');
        expect(result).not.toContain('tok-1');
        expect(result).not.toContain('4111111111111111');
        expect(result).not.toContain('123');
        expect(result).toContain('[REDACTED]');
    });

    it('keeps ordinary operational errors diagnosable', () => {
        expect(redactLogText('SQL deadlock victim')).toBe('SQL deadlock victim');
    });
});

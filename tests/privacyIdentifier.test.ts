import { describe, expect, it } from 'vitest';
import { maskIdentifier } from '../server/utils/privacy';

describe('identifier log privacy', () => {
    it('keeps only minimal diagnostic context for device and biometric identifiers', () => {
        expect(maskIdentifier('DEVICE-SERIAL-1234')).toBe('DE***34');
        expect(maskIdentifier('employee-9876')).toBe('em***76');
        expect(maskIdentifier('abc')).toBe('[REDACTED]');
        expect(maskIdentifier('')).toBe('[REDACTED]');
    });
});

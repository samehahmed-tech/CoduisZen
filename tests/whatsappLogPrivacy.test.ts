import { describe, expect, it } from 'vitest';
import { maskWhatsAppAddress } from '../server/utils/whatsappPrivacy';

describe('WhatsApp log privacy', () => {
    it('masks full phone addresses while preserving only minimal routing context', () => {
        expect(maskWhatsAppAddress('201012345678@c.us')).toBe('20***78@c.us');
        expect(maskWhatsAppAddress('201012345678@s.whatsapp.net')).toBe('20***78@s.whatsapp.net');
        expect(maskWhatsAppAddress('')).toBe('***');
    });
});

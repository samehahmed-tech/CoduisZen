import { describe, expect, it } from 'vitest';
import { validateWebhookTargetUrl } from '../server/utils/webhookTarget';

describe('webhook target SSRF guard', () => {
    it('allows public HTTP(S) targets without embedded credentials', () => {
        expect(validateWebhookTargetUrl('https://hooks.example.com/events').hostname)
            .toBe('hooks.example.com');
        expect(() => validateWebhookTargetUrl('https://user:pass@hooks.example.com/events'))
            .toThrow('WEBHOOK_URL_CREDENTIALS_NOT_ALLOWED');
    });

    it('rejects non-HTTP schemes and private targets by default', () => {
        expect(() => validateWebhookTargetUrl('file:///etc/passwd'))
            .toThrow('WEBHOOK_URL_PROTOCOL_NOT_ALLOWED');
        expect(() => validateWebhookTargetUrl('http://127.0.0.1:8080/admin'))
            .toThrow('WEBHOOK_PRIVATE_TARGET_BLOCKED');
        expect(() => validateWebhookTargetUrl('http://169.254.169.254/latest/meta-data'))
            .toThrow('WEBHOOK_PRIVATE_TARGET_BLOCKED');
        expect(() => validateWebhookTargetUrl('http://service.internal/hook'))
            .toThrow('WEBHOOK_PRIVATE_TARGET_BLOCKED');
    });
});

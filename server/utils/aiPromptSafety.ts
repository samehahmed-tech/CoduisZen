const INJECTION_PATTERNS = [
    /ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?/i,
    /disregard\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?/i,
    /reveal\s+(?:the\s+)?(?:system|developer)\s+prompt/i,
    /show\s+(?:me\s+)?(?:the\s+)?(?:api|secret|access)\s+key/i,
    /bypass\s+(?:approval|permission|confirmation|security)/i,
    /نفذ\s+بدون\s+(?:موافقة|تأكيد|صلاحية)/i,
    /تجاهل\s+(?:كل\s+)?التعليمات/i,
    /اعرض\s+(?:الـ)?(?:مفتاح|سر|تعليمات)\s+النظام/i,
];

export const MAX_AI_USER_MESSAGE_LENGTH = 4000;

export const isPromptInjectionAttempt = (value: unknown): boolean => {
    const text = String(value || '').trim();
    return INJECTION_PATTERNS.some(pattern => pattern.test(text));
};

export const prepareAiUserMessage = (value: unknown): { ok: true; text: string } | { ok: false; code: 'AI_PROMPT_INJECTION_BLOCKED' | 'AI_MESSAGE_TOO_LONG' } => {
    const text = String(value || '').trim();
    if (text.length > MAX_AI_USER_MESSAGE_LENGTH) return { ok: false, code: 'AI_MESSAGE_TOO_LONG' };
    if (isPromptInjectionAttempt(text)) return { ok: false, code: 'AI_PROMPT_INJECTION_BLOCKED' };
    return { ok: true, text };
};

export const wrapUntrustedAiData = (label: string, value: unknown): string =>
    `<untrusted-data name="${label}">\n${String(value ?? '')}\n</untrusted-data>`;

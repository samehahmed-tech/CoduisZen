/**
 * Password Policy Service
 * Enforces password complexity rules for the ERP system.
 * Features: strength scoring, sequential/repeating char detection, common password blacklist.
 */

export interface PasswordPolicyResult {
    valid: boolean;
    errors: string[];
    strength: 'WEAK' | 'FAIR' | 'STRONG' | 'VERY_STRONG';
    score: number; // 0-100
}

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

const COMMON_PASSWORDS = new Set([
    'password', '12345678', 'qwerty', 'abc12345', 'admin123',
    'letmein', 'welcome', 'monkey', 'dragon', 'master',
    'iloveyou', 'trustno1', 'sunshine', 'princess', 'football',
    'password1', 'admin1234', 'qwerty123', 'welcome1', '1234567890',
]);

function hasSequentialChars(password: string, length = 3): boolean {
    const lower = password.toLowerCase();
    for (let i = 0; i <= lower.length - length; i++) {
        let isAsc = true;
        let isDesc = true;
        for (let j = 0; j < length - 1; j++) {
            if (lower.charCodeAt(i + j + 1) !== lower.charCodeAt(i + j) + 1) isAsc = false;
            if (lower.charCodeAt(i + j + 1) !== lower.charCodeAt(i + j) - 1) isDesc = false;
        }
        if (isAsc || isDesc) return true;
    }
    return false;
}

function hasRepeatingChars(password: string, maxRepeat = 3): boolean {
    for (let i = 0; i <= password.length - maxRepeat; i++) {
        const char = password[i];
        let count = 1;
        for (let j = i + 1; j < password.length && password[j] === char; j++) {
            count++;
        }
        if (count >= maxRepeat) return true;
    }
    return false;
}

/**
 * Validates a password against the security policy.
 * Returns detailed result with strength score and specific error messages.
 */
export function validatePassword(password: string): PasswordPolicyResult {
    const errors: string[] = [];
    const pw = String(password || '');
    let score = 0;

    if (!pw) {
        return { valid: false, errors: ['Password is required'], strength: 'WEAK', score: 0 };
    }

    // Length check
    if (pw.length < MIN_LENGTH) {
        errors.push(`Password must be at least ${MIN_LENGTH} characters`);
    } else {
        score += 20;
        if (pw.length >= 12) score += 10;
        if (pw.length >= 16) score += 10;
    }
    if (pw.length > MAX_LENGTH) {
        errors.push(`Password must be at most ${MAX_LENGTH} characters`);
    }

    // Uppercase
    if (!/[A-Z]/.test(pw)) {
        errors.push('Password must contain at least one uppercase letter');
    } else {
        score += 15;
    }

    // Lowercase
    if (!/[a-z]/.test(pw)) {
        errors.push('Password must contain at least one lowercase letter');
    } else {
        score += 10;
    }

    // Digit
    if (!/[0-9]/.test(pw)) {
        errors.push('Password must contain at least one digit');
    } else {
        score += 15;
    }

    // Special character
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(pw)) {
        errors.push('Password must contain at least one special character');
    } else {
        score += 15;
    }

    // Sequential characters (abc, 123)
    if (hasSequentialChars(pw)) {
        errors.push('Password must not contain sequential characters (e.g., abc, 123)');
        score = Math.max(0, score - 10);
    }

    // Repeating characters (aaa, 111)
    if (hasRepeatingChars(pw)) {
        errors.push('Password must not have 3+ repeating characters');
        score = Math.max(0, score - 10);
    }

    // Common password check
    if (COMMON_PASSWORDS.has(pw.toLowerCase())) {
        errors.push('Password is too common');
        score = 0;
    }

    // Unique characters bonus
    const uniqueChars = new Set(pw).size;
    if (uniqueChars >= 8) score += 5;

    score = Math.min(100, Math.max(0, score));

    let strength: PasswordPolicyResult['strength'];
    if (score >= 80) strength = 'VERY_STRONG';
    else if (score >= 60) strength = 'STRONG';
    else if (score >= 40) strength = 'FAIR';
    else strength = 'WEAK';

    return { valid: errors.length === 0, errors, strength, score };
}

/** Quick check — returns true if password passes all rules */
export const isPasswordValid = (password: string): boolean => validatePassword(password).valid;

/**
 * Get current password policy rules (for frontend display)
 */
export function getPasswordPolicyRules() {
    return {
        minLength: MIN_LENGTH,
        maxLength: MAX_LENGTH,
        requireUppercase: true,
        requireLowercase: true,
        requireDigit: true,
        requireSpecial: true,
        disallowSequential: true,
        disallowRepeating: true,
    };
}

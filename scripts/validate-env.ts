/**
 * Environment Validation Script
 * Run at startup to ensure all required env vars are present
 * Usage: import { validateEnvironment } from './scripts/validate-env'
 */

interface EnvRule {
    key: string;
    required: boolean;
    description: string;
    category: string;
    validate?: (value: string) => boolean;
    defaultValue?: string;
}

const ENV_RULES: EnvRule[] = [
    // === Core ===
    { key: 'DATABASE_URL', required: true, description: 'PostgreSQL connection string', category: 'Core' },
    { key: 'API_PORT', required: false, description: 'Backend API port', category: 'Core', defaultValue: '3001' },
    { key: 'NODE_ENV', required: false, description: 'Environment mode', category: 'Core', defaultValue: 'development' },

    // === Auth & Security ===
    {
        key: 'JWT_SECRET', required: true, description: 'JWT signing secret (min 32 chars)', category: 'Security',
        validate: (v) => v.length >= 32
    },
    { key: 'JWT_EXPIRES_IN', required: false, description: 'JWT token TTL', category: 'Security', defaultValue: '12h' },
    {
        key: 'AUDIT_HMAC_SECRET', required: true, description: 'Audit log HMAC signing key', category: 'Security',
        validate: (v) => v.length >= 16
    },
    { key: 'AI_KEY_ENCRYPTION_SECRET', required: false, description: 'AI API key encryption secret', category: 'Security' },
    { key: 'PRINT_GATEWAY_TOKEN', required: false, description: 'Print bridge auth token', category: 'Security' },

    // === CORS ===
    { key: 'CORS_ORIGINS', required: false, description: 'Comma-separated allowed origins', category: 'Networking' },

    // === Redis ===
    { key: 'SOCKET_REDIS_ENABLED', required: false, description: 'Enable Redis adapter for Socket.IO', category: 'Redis', defaultValue: 'false' },
    { key: 'SOCKET_REDIS_URL', required: false, description: 'Redis URL for Socket adapter', category: 'Redis' },

    // === ETA / Fiscal ===
    { key: 'ETA_BASE_URL', required: false, description: 'Egyptian Tax Authority API base URL', category: 'Fiscal' },
    { key: 'ETA_TOKEN_URL', required: false, description: 'ETA OAuth token URL', category: 'Fiscal' },
    { key: 'ETA_CLIENT_ID', required: false, description: 'ETA OAuth client ID', category: 'Fiscal' },
    { key: 'ETA_CLIENT_SECRET', required: false, description: 'ETA OAuth client secret', category: 'Fiscal' },
    { key: 'ETA_API_KEY', required: false, description: 'ETA API key', category: 'Fiscal' },

    // === SMTP ===
    { key: 'SMTP_HOST', required: false, description: 'SMTP server host', category: 'Email' },
    { key: 'SMTP_PORT', required: false, description: 'SMTP port', category: 'Email', defaultValue: '587' },
    { key: 'SMTP_USER', required: false, description: 'SMTP username', category: 'Email' },
    { key: 'SMTP_PASS', required: false, description: 'SMTP password', category: 'Email' },
    { key: 'SMTP_FROM', required: false, description: 'Email sender address', category: 'Email' },

    // === S3 Storage ===
    { key: 'S3_BUCKET', required: false, description: 'S3 bucket name', category: 'Storage' },
    { key: 'S3_REGION', required: false, description: 'S3 region', category: 'Storage' },
    { key: 'S3_ACCESS_KEY_ID', required: false, description: 'S3 access key', category: 'Storage' },
    { key: 'S3_SECRET_ACCESS_KEY', required: false, description: 'S3 secret key', category: 'Storage' },

    // === Client ===
    { key: 'VITE_API_URL', required: false, description: 'Frontend API URL', category: 'Client', defaultValue: '/api' },
];

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    summary: Record<string, { total: number; set: number; missing: string[] }>;
}

export function validateEnvironment(env: Record<string, string | undefined> = process.env as any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const categoryMap: Record<string, { total: number; set: number; missing: string[] }> = {};

    for (const rule of ENV_RULES) {
        if (!categoryMap[rule.category]) {
            categoryMap[rule.category] = { total: 0, set: 0, missing: [] };
        }
        categoryMap[rule.category].total++;

        const value = env[rule.key];

        if (!value || value.trim() === '') {
            if (rule.required) {
                errors.push(`❌ MISSING REQUIRED: ${rule.key} — ${rule.description}`);
                categoryMap[rule.category].missing.push(rule.key);
            } else {
                if (!rule.defaultValue) {
                    warnings.push(`⚠️  OPTIONAL MISSING: ${rule.key} — ${rule.description}`);
                }
                categoryMap[rule.category].missing.push(rule.key);
            }
        } else {
            categoryMap[rule.category].set++;

            if (rule.validate && !rule.validate(value)) {
                errors.push(`❌ INVALID VALUE: ${rule.key} — ${rule.description}`);
            }
        }
    }

    // Production-specific checks
    const nodeEnv = env.NODE_ENV || 'development';
    if (nodeEnv === 'production') {
        if (!env.CORS_ORIGINS) {
            errors.push('❌ CORS_ORIGINS must be set in production');
        }
        if (env.JWT_SECRET === 'change-me' || (env.JWT_SECRET?.length ?? 0) < 32) {
            errors.push('❌ JWT_SECRET must be a strong secret (≥32 chars) in production');
        }
        if (env.AUDIT_HMAC_SECRET === 'change-me') {
            errors.push('❌ AUDIT_HMAC_SECRET must be changed from default in production');
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        summary: categoryMap,
    };
}

// CLI runner
if (process.argv[1]?.includes('validate-env')) {
    const dotenv = await import('dotenv');
    dotenv.config();

    const result = validateEnvironment();

    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║       Coduis Zen — Environment Validation         ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    console.log(`Environment: ${process.env.NODE_ENV || 'development'}\n`);

    // Category summary
    for (const [cat, info] of Object.entries(result.summary)) {
        const pct = Math.round((info.set / info.total) * 100);
        const icon = pct === 100 ? '✅' : pct > 50 ? '⚠️' : '❌';
        console.log(`${icon} ${cat}: ${info.set}/${info.total} (${pct}%)`);
        if (info.missing.length > 0 && pct < 100) {
            console.log(`   Missing: ${info.missing.join(', ')}`);
        }
    }

    console.log('');

    if (result.errors.length > 0) {
        console.log('ERRORS:');
        result.errors.forEach(e => console.log(`  ${e}`));
        console.log('');
    }

    if (result.warnings.length > 0) {
        console.log('WARNINGS:');
        result.warnings.forEach(w => console.log(`  ${w}`));
        console.log('');
    }

    if (result.valid) {
        console.log('✅ Environment validation PASSED\n');
    } else {
        console.log('❌ Environment validation FAILED — fix errors above before deploying\n');
        process.exit(1);
    }
}

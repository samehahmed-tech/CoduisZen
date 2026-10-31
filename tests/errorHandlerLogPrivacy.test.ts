import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('error handler log privacy contract', () => {
    it('uses the central redaction policy for server-side error logs', () => {
        const source = fs.readFileSync(path.resolve(process.cwd(), 'server/middleware/errorHandler.ts'), 'utf8');
        expect(source).toContain("import { redactLogText } from '../utils/logger';");
        expect(source).toContain('const maskSensitiveText = (value?: string) => value ? redactLogText(value) : value;');
        expect(source).not.toContain("replace(/(authorization|token|password|secret|api[_-]?key|client[_-]?secret)");
    });
});

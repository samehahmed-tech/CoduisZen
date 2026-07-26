import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const runtime = resolve('scripts/sameh-installer/runtime');
const { assessApiHealth } = require(join(runtime, 'health-gate.cjs'));
const { appendLog } = require(join(runtime, 'log-file.cjs'));
const temporaryDirectories: string[] = [];

describe('installer runtime resilience', () => {
    afterEach(() => {
        for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
    });

    it.each([
        [{ reachable: false }, false],
        [{ reachable: true, statusCode: 503, body: '{"services":{"database":{"status":"DISCONNECTED"}}}' }, false],
        [{ reachable: true, statusCode: 200, body: '{"status":"DEGRADED","services":{"database":{"status":"CONNECTED"}}}' }, true],
        [{ reachable: true, statusCode: 200, body: '{"status":"ok","health":{"services":{"database":{"status":"CONNECTED"}}}}' }, true],
    ])('accepts readiness only when API and database are available', (probe, expected) => {
        expect(assessApiHealth(probe).ready).toBe(expected);
    });

    it('rotates a full runtime log before appending more output', () => {
        const directory = mkdtempSync(join(tmpdir(), 'restoflow-log-'));
        temporaryDirectories.push(directory);
        const logFile = join(directory, 'service.log');
        writeFileSync(logFile, Buffer.alloc(5 * 1024 * 1024, 'x'));

        appendLog(logFile, 'service ready');

        expect(readFileSync(`${logFile}.1`).length).toBe(5 * 1024 * 1024);
        expect(readFileSync(logFile, 'utf8')).toContain('service ready');
    });

    it('keeps the configured database connection during an upgrade', () => {
        const setupAgent = readFileSync(join(runtime, 'setup-agent.cjs'), 'utf8');

        expect(setupAgent).toContain('upgrade && old.DATABASE_URL ? old.DATABASE_URL : detectedUrl');
        expect(setupAgent).toContain("if (!upgrade && /Server=(?:localhost|\\.)\\\\CODUISZEN/i.test");
    });

    it('packages the daily order number backfill into schema repair', () => {
        const schemaDoctor = readFileSync(join(runtime, 'schema-doctor.cjs'), 'utf8');
        const installerBuilder = readFileSync(resolve('scripts/sameh-installer/build-sameh-installer.ps1'), 'utf8');

        expect(schemaDoctor).toContain("database', 'daily-order-number.sql");
        expect(installerBuilder).toContain('database\\daily-order-number.sql');
    });
});

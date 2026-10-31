import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const common = readFileSync('scripts/sameh-installer/latest-fixes/Install-Common.ps1', 'utf8');
const applier = readFileSync('scripts/sameh-installer/latest-fixes/Apply Latest Fixes.ps1', 'utf8');
const builder = readFileSync('scripts/sameh-installer/build-hotfix.ps1', 'utf8');

describe('installer hotfix safety contract', () => {
    it('heals every production secret introduced by the current launch gate', () => {
        for (const key of [
            'PIN_LOOKUP_SECRET',
            'TRACK_TOKEN_SECRET',
            'PUBLIC_QR_SECRET',
            'PAYMENT_TOKEN_SECRET',
            'CODUIS_MASTER_KEY',
            'ADMS_WEBHOOK_SECRET',
            'ATTENDANCE_BRIDGE_TOKEN',
        ]) {
            expect(common).toContain(key);
        }
        expect(common).toContain('stillBad = @(Test-CEnvLaunchGate (Read-CEnvFile $EnvPath).Map)');
    });

    it('uses the installed API port for post-upgrade health checks', () => {
        expect(common).toContain('function Get-CConfiguredPort');
        expect(common).toContain('http://127.0.0.1:$Port/api/health');
        expect(applier).toContain('$serverPort = Get-CConfiguredPort $currentEnv');
        expect(applier).toContain('Wait-CServerHealthy 90 $serverPort');
    });

    it('packages the guarded applier instead of a separate legacy script', () => {
        expect(builder).toContain("latest-fixes\\Apply Latest Fixes.ps1");
        expect(builder).toContain("latest-fixes\\Install-Common.ps1");
    });
});

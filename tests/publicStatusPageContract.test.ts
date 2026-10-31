import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

describe('public status page contract', () => {
    it('is a public route that consumes only the coarse status endpoint', () => {
        const routes = fs.readFileSync('routes.tsx', 'utf8');
        const page = fs.readFileSync('components/PublicStatusPage.tsx', 'utf8');
        expect(routes).toContain("path: '/status'");
        expect(page).toContain("fetch('/api/status'");
        expect(page).toContain('setInterval');
        expect(page).not.toContain('auth_token');
        expect(page).not.toContain('branchId');
    });
    it('does not render internal diagnostics or provider details', () => {
        const page = fs.readFileSync('components/PublicStatusPage.tsx', 'utf8');
        expect(page).not.toMatch(/errorMessage|routeNames|providerConfig|gatewayId|databaseUrl/i);
        expect(page).toContain('بدون بيانات حساسة');
    });
});

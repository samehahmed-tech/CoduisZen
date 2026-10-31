import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const routesDir = path.join(root, 'server', 'routes');

const mutationPattern = /router\.(post|put|patch|delete)\s*\(/g;
const importPattern = /from\s+['"](\.\.?\/[^'"]+)['"]/g;
const auditMarkers = ['createSignedAuditLog', 'auditService.createSignedAuditLog', 'auditLogService'];
const expectedExtensions = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts'];

const resolveLocalImport = (fromFile, specifier) => {
    const resolvedBase = path.resolve(path.dirname(fromFile), specifier);
    const bases = [resolvedBase];
    // TypeScript source imports may use runtime .js specifiers while the
    // repository stores the source as .ts. Resolve both forms so coverage
    // reflects the actual route/controller graph instead of the emitter name.
    if (resolvedBase.endsWith('.js')) bases.push(resolvedBase.slice(0, -3));
    for (const base of bases) {
        for (const ext of expectedExtensions) {
            const candidate = `${base}${ext}`;
            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
        }
    }
    return null;
};

const collectLinkedSources = (entryFile, maxDepth = 3) => {
    const seen = new Set();
    const files = [];
    const visit = (file, depth) => {
        if (!file || seen.has(file) || depth > maxDepth) return;
        seen.add(file);
        files.push(file);
        const source = fs.readFileSync(file, 'utf8');
        for (const match of source.matchAll(importPattern)) {
            const resolved = resolveLocalImport(file, match[1]);
            if (resolved && (resolved.includes(`${path.sep}controllers${path.sep}`) || resolved.includes(`${path.sep}services${path.sep}`))) {
                visit(resolved, depth + 1);
            }
        }
    };
    visit(entryFile, 0);
    return files;
};

const routeFiles = fs.readdirSync(routesDir)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => path.join(routesDir, name));

const rows = [];
for (const routeFile of routeFiles) {
    const routeSource = fs.readFileSync(routeFile, 'utf8');
    const mutations = [...routeSource.matchAll(mutationPattern)].map((match) => match[1]);
    if (mutations.length === 0) continue;

    const linkedFiles = collectLinkedSources(routeFile);
    const linkedSources = linkedFiles.map((file) => fs.readFileSync(file, 'utf8'));
    const covered = linkedSources.some((source) => auditMarkers.some((marker) => source.includes(marker)));
    const name = path.relative(root, routeFile).replaceAll(path.sep, '/');
    const webhookLike = /webhook|adms|publicScreen|attendanceBridge|printGatewayGateway/i.test(name);
    rows.push({ routeFile: name, mutations: mutations.length, covered, exceptionClass: webhookLike ? 'integration-or-bridge' : null });
}

const included = rows.filter((row) => !row.exceptionClass);
const covered = included.filter((row) => row.covered).length;
const exceptions = rows.filter((row) => row.exceptionClass);
const uncovered = included.filter((row) => !row.covered);
const percentage = included.length ? Math.round((covered / included.length) * 1000) / 10 : 100;

console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    scope: 'server/routes mutation declarations linked to local controllers/services',
    totalRouteFiles: rows.length,
    includedRouteFiles: included.length,
    coveredRouteFiles: covered,
    detailedControllerCoveragePercent: percentage,
    authenticatedMutationBaseline: {
        enabled: true,
        middleware: 'server/middleware/mutationAudit.ts',
        note: 'Protected mutations receive signed request/result audit; uncovered files need domain before/after review.',
    },
    uncovered,
    excludedIntegrationOrBridge: exceptions,
}, null, 2));

if (uncovered.length > 0) {
    console.error(`Audit coverage requires review: ${uncovered.length} route files are not linked to a signed audit writer.`);
}

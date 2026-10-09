/**
 * package-externals.cjs — makes hotfix payloads self-contained.
 *
 * scripts/build-server.mjs keeps some modules EXTERNAL (mssql, bcryptjs, …).
 * Those resolve from node_modules at runtime — which full installs have at
 * {app}\node_modules, but other machines lack. A bundle that require()s a
 * missing module dies instantly on boot (caught by the applier boot-probe,
 * but the right fix is to SHIP the modules).
 *
 * This script copies each external + its transitive dependencies (exact
 * versions from this repo's node_modules) into payload/dist-server/node_modules,
 * so the bundle resolves everything locally on ANY client with zero installs.
 *
 * Skipped deliberately:
 *  - msnodesqlv8 (native SQL driver; the server uses tedious over TCP)
 *  - fsevents (macOS-only file watcher; never loaded on Windows)
 * If anything else fails to resolve the build FAILS loudly — a missing
 * module must never reach a customer machine again.
 *
 * Usage: node scripts/package-externals.cjs <output-dir>
 */
const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');

const repoRoot = path.resolve(__dirname, '..');
const outDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!outDir) {
    console.error('Usage: node scripts/package-externals.cjs <output-dir>');
    process.exit(1);
}

const EXTERNALS = ['mssql', 'msnodesqlv8', 'bcryptjs'];
// fsevents is macOS-only (never loaded on Windows). Everything else that
// fails to resolve is warned (not fatal) — the applier boot-probe is the
// real gate and fails loudly with the exact module name.
const SKIP = new Set(['fsevents']);

const copied = new Map(); // "name" -> version (dedupe; first resolution wins)

function resolvePackageDir(name, searchDir) {
    // 1) package.json subpath (classic shims like `process`, whose main-entry
    //    resolution would otherwise stop at the builtin).
    try {
        return path.dirname(require.resolve(`${name}/package.json`, { paths: [searchDir, repoRoot] }));
    } catch { /* fall through */ }
    // 2) main-entry walk-up (works even when package.json subpath is hidden
    //    behind an "exports" map, e.g. bcryptjs).
    let main;
    try {
        main = require.resolve(name, { paths: [searchDir, repoRoot] });
    } catch {
        return null;
    }
    if (main === name || !main.includes(path.sep)) return null; // builtin
    let dir = path.dirname(main);
    for (let i = 0; i < 8; i += 1) {
        const pj = path.join(dir, 'package.json');
        if (fs.existsSync(pj)) {
            try {
                if (JSON.parse(fs.readFileSync(pj, 'utf8')).name === name) return dir;
            } catch { /* keep walking */ }
        }
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
    return null;
}

// Type-only packages: never required at runtime, pure payload bloat.
const isTypesOnly = (name) => name.startsWith('@types/') || name === 'undici-types';

function copyPackage(name, searchDir) {
    if (copied.has(name)) return;
    const bare = String(name).replace(/^node:/, '');
    if (SKIP.has(name) || SKIP.has(bare) || builtinModules.includes(name) || builtinModules.includes(bare)) {
        // NOTE: a same-named npm shim (e.g. `process` with subpath imports
        // like `process/`) is still packed when resolvable below — builtin
        // here only means "stop if nothing is installed".
        const shimDir = (() => {
            try {
                return path.dirname(require.resolve(`${name}/package.json`, { paths: [searchDir, repoRoot] }));
            } catch { return null; }
        })();
        if (!shimDir) {
            console.log(`  skip (builtin): ${name}`);
            return;
        }
    }
    if (isTypesOnly(name)) {
        console.log(`  skip (types-only): ${name}`);
        copied.set(name, 'types');
        return;
    }
    const srcDir = resolvePackageDir(name, searchDir);
    if (!srcDir) {
        // Declared-but-uninstalled deps (never actually required on our code
        // paths) must not block the build — warn and continue. Anything truly
        // needed at boot is caught later by the applier boot-probe, which
        // fails loudly with the exact module name.
        console.warn(`  WARNING: cannot resolve '${name}' (declared but not installed) — skipping; boot-probe will verify.`);
        return;
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(srcDir, 'package.json'), 'utf8'));
    const destDir = path.join(outDir, name);
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
    fs.cpSync(srcDir, destDir, {
        recursive: true,
        // .bin holds CLI symlinks (unneeded at runtime, fragile on Windows).
        filter: (src) => !src.split(path.sep).includes('.bin'),
    });
    copied.set(name, pkg.version || '?');
    console.log(`  packed ${name}@${pkg.version || '?'}`);
    const deps = { ...(pkg.dependencies || {}) };
    for (const dep of Object.keys(deps)) copyPackage(dep, srcDir);
}

console.log(`Packaging server externals into ${outDir} ...`);
console.log(`(build node ${process.version}, modules ABI ${process.versions.modules} — the applier only installs native bindings on matching node majors)`);
for (const name of EXTERNALS) copyPackage(name, repoRoot);
console.log(`Done: ${copied.size} packages (${[...copied].map(([n, v]) => `${n}@${v}`).join(', ')})`);

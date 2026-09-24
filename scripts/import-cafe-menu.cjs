'use strict';
/**
 * Cafe menu importer — posts scripts/cafe-menu-data.cjs to the live server.
 *
 *   node scripts/import-cafe-menu.cjs --base http://localhost:3001 --email admin@x.com --password ****
 *   node scripts/import-cafe-menu.cjs --base http://localhost:3001 --pin 123456
 *
 * Flags:
 *   --commit            actually write (default = dry-run review only, writes NOTHING)
 *   --menu-id ID        target menu (default: menu-1)
 *   --csv-out PATH      also dump an import-ready CSV for the UI import screen
 *
 * Flow: login → dry-run (always, prints review table) → commit (only with --commit).
 * Re-runs are safe: commit uses updateExisting so corrections patch in place.
 */
const fs = require('fs');
const path = require('path');

const {
    CATEGORIES, ITEMS, DRINK_CATEGORIES, SUGAR_CATEGORIES,
    SUGAR_OPTIONS, ENABLE_SIZES, SIZE_OPTIONS,
} = require('./cafe-menu-data.cjs');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    if (hit) return hit.slice(name.length + 3);
    const i = args.indexOf(`--${name}`);
    if (i >= 0 && args[i + 1] && !args[i + 1].startsWith('--')) return args[i + 1];
    return fallback;
};
const has = (name) => args.includes(`--${name}`);
const BASE = (arg('base', 'http://localhost:3001') || '').replace(/\/+$/, '');
const MENU_ID = arg('menu-id', 'menu-1');
const COMMIT = has('commit');
const CSV_OUT = arg('csv-out', '');

const catAr = Object.fromEntries(CATEGORIES.map((c) => [c.en, c.ar]));

async function api(pathname, token, body) {
    const res = await fetch(`${BASE}${pathname}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${pathname} → ${res.status}: ${data?.error || data?.message || 'failed'}`);
    return data;
}

async function login() {
    const email = arg('email', '');
    const password = arg('password', '');
    const pin = arg('pin', '');
    if (pin) {
        const data = await api('/api/auth/pin-login', null, { pin, deviceName: 'menu-import-script' });
        if (!data?.token) throw new Error('PIN login failed (need a manager/cashier PIN with menu rights)');
        return data.token;
    }
    if (!email || !password) throw new Error('Provide --email + --password, or --pin');
    const data = await api('/api/auth/login', null, { email, password, deviceName: 'menu-import-script' });
    if (data?.mfaRequired) throw new Error('Account needs MFA — use a PIN login instead');
    if (!data?.token) throw new Error('Login failed');
    return data.token;
}

function buildPayload() {
    const rows = ITEMS.map(([category, nameAr, price]) => ({
        name: nameAr,
        nameAr,
        category,
        categoryAr: catAr[category] || category,
        price,
        available: true,
    }));

    // Modifier/sugar rows reference items BY NAME (server matches name+category).
    const modifierRows = [];
    const extraOptions = ITEMS.filter(([category]) => category === 'Extra');
    for (const [category, nameAr] of ITEMS) {
        if (category === 'Extra') continue; // an add-on never needs add-ons
        if (SUGAR_CATEGORIES.has(category)) {
            for (const sugar of SUGAR_OPTIONS) {
                modifierRows.push({
                    item_name: nameAr, group: 'السكر', group_ar: 'السكر',
                    option: sugar, option_ar: sugar, price: 0, min: 0, max: 1,
                });
            }
        }
        if (DRINK_CATEGORIES.has(category)) {
            for (const [, extraName, extraPrice] of extraOptions) {
                modifierRows.push({
                    item_name: nameAr, group: 'إضافات', group_ar: 'إضافات',
                    option: extraName, option_ar: extraName, price: extraPrice, min: 0, max: 5,
                });
            }
        }
    }

    const sizesRows = [];
    if (ENABLE_SIZES) {
        for (const [category, nameAr, price] of ITEMS) {
            if (!DRINK_CATEGORIES.has(category)) continue;
            for (const size of SIZE_OPTIONS) {
                sizesRows.push({
                    item_name: nameAr, size: size.name, size_ar: size.name,
                    price: Number(price || 0) + Number(size.delta || 0),
                });
            }
        }
    }
    return { rows, modifierRows, sizesRows };
}

function toCsvCell(value) {
    const s = String(value ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCsv(filePath, payload) {
    const header = ['Category', 'Category AR', 'Name', 'Name AR', 'Price', 'Available'];
    const lines = [header.join(',')];
    for (const row of payload.rows) {
        lines.push([row.category, row.categoryAr, row.name, row.nameAr, row.price, 'TRUE'].map(toCsvCell).join(','));
    }
    lines.push('');
    lines.push('# Modifiers — import via API (item_name | group | option | price)');
    lines.push(['item_name', 'group', 'group_ar', 'option', 'option_ar', 'price', 'min', 'max'].join(','));
    for (const row of payload.modifierRows) {
        lines.push([row.item_name, row.group, row.group_ar, row.option, row.option_ar, row.price, row.min, row.max].map(toCsvCell).join(','));
    }
    fs.writeFileSync(filePath, '﻿' + lines.join('\n'), 'utf8');
}

async function main() {
    console.log(`Cafe menu import → ${BASE} (menu: ${MENU_ID}) — ${COMMIT ? 'COMMIT MODE' : 'DRY-RUN (nothing will be written)'}`);
    const payload = buildPayload();
    console.log(`Items: ${payload.rows.length} | categories: ${CATEGORIES.length} | modifier rows: ${payload.modifierRows.length} | size rows: ${payload.sizesRows.length} ${ENABLE_SIZES ? '' : '(sizes OFF)'}`);

    if (CSV_OUT) {
        writeCsv(path.resolve(CSV_OUT), payload);
        console.log(`CSV written: ${path.resolve(CSV_OUT)}`);
        if (!COMMIT) {
            console.log('CSV-only mode (no login attempted). Add --commit to import via API.');
            console.log('\n── REVIEW TABLE ──');
            payload.rows.forEach((row, i) => {
                console.log(`${String(i + 1).padStart(3)}. ${row.nameAr} | ${row.categoryAr || row.category} | ${row.price}`);
            });
            return;
        }
    }

    const token = await login();
    console.log('Login OK. Running dry-run first (mandatory review)...');
    const dry = await api('/api/menu/items/import', token, {
        rows: payload.rows, modifierRows: payload.modifierRows, sizesRows: payload.sizesRows,
        menuId: MENU_ID, updateExisting: true, dryRun: true,
    });

    const details = Array.isArray(dry?.details) ? dry.details : [];
    console.log(`\n── REVIEW TABLE: ${payload.rows.length} items (name | category | price) ──`);
    payload.rows.forEach((row, i) => {
        console.log(`${String(i + 1).padStart(3)}. ${row.nameAr} | ${row.categoryAr || row.category} | ${row.price}`);
    });
    const errors = details.filter((d) => d.action === 'error');
    console.log(`\nDry-run: created=${dry.created ?? 0} updated=${dry.updated ?? 0} skipped=${dry.skipped ?? 0} errors=${errors.length}`);
    for (const error of errors.slice(0, 30)) console.log(`  ! ${error.message || JSON.stringify(error)}`);

    if (!COMMIT) {
        console.log('\nDry-run only. Fix names in scripts/cafe-menu-data.cjs if needed, then re-run with --commit.');
        return;
    }
    console.log('\nCommitting (updateExisting: true)...');
    const done = await api('/api/menu/items/import', token, {
        rows: payload.rows, modifierRows: payload.modifierRows, sizesRows: payload.sizesRows,
        menuId: MENU_ID, updateExisting: true, dryRun: false,
    });
    console.log(`Done: created=${done.created ?? 0} updated=${done.updated ?? 0} skipped=${done.skipped ?? 0}`);
    for (const error of (done.details || []).filter((d) => d.action === 'error').slice(0, 30)) {
        console.log(`  ! ${error.message || JSON.stringify(error)}`);
    }
}

main().catch((error) => { console.error(`FAILED: ${error?.message || error}`); process.exitCode = 1; });

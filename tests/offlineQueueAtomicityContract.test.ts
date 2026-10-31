import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.resolve(process.cwd(), 'src/services/syncService.ts'), 'utf8');

describe('offline queue atomicity contract', () => {
    it('performs dedupe lookup and write inside one IndexedDB transaction', () => {
        const transactionStart = source.indexOf("localDb.transaction('rw', localDb.syncQueue");
        const lookup = source.indexOf("where('dedupeKey')", transactionStart);
        const add = source.indexOf('localDb.syncQueue.add(item)', transactionStart);
        expect(transactionStart).toBeGreaterThanOrEqual(0);
        expect(lookup).toBeGreaterThan(transactionStart);
        expect(add).toBeGreaterThan(lookup);
    });
});

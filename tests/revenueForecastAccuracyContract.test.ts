import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('revenue forecast accuracy contract', () => {
    it('returns an explicit out-of-sample accuracy measurement', () => {
        const source = readFileSync(resolve(process.cwd(), 'server/services/revenueForecastService.ts'), 'utf8');
        expect(source).toContain('accuracy: calculateWalkForwardMape(historical.map(point => point.revenue))');
        expect(source).toContain("import { calculateWalkForwardMape, ForecastAccuracy }");
    });
});

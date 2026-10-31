import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(fileURLToPath(new URL('../src/db/schema.ts', import.meta.url)), 'utf8');
const controller = readFileSync(fileURLToPath(new URL('../server/controllers/customerController.ts', import.meta.url)), 'utf8');
const scheduler = readFileSync(fileURLToPath(new URL('../server/services/campaignSchedulerService.ts', import.meta.url)), 'utf8');
const migration = readFileSync(fileURLToPath(new URL('../server/services/marketingSchemaService.ts', import.meta.url)), 'utf8');

describe('customer birthday automation contract', () => {
    it('stores an optional birth date and filters birthday campaigns safely', () => {
        expect(schema).toContain("birthDate: datetime2('birth_date')");
        expect(controller).toContain('birthDate: customers.birthDate');
        expect(controller).toContain('birthDate: customerData.birthDate');
        expect(controller).toContain('birthDate: body.birthDate');
        expect(migration).toContain("COL_LENGTH('dbo.customers', 'birth_date')");
        expect(scheduler).toContain('BIRTHDAY_TODAY');
        expect(scheduler).toContain('birthdayOffer');
        expect(scheduler).toContain('MONTH(campaign_birthday.birth_date)');
    });
});

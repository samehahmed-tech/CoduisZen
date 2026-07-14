import { describe, expect, it } from 'vitest';
import { pool } from '../server/db';

describe('2026-07 recipe date conversion regression', () => {
    it('passes dates and quoted strings to SQL Server as typed parameters', async () => {
        const timestamp = new Date('2026-07-13T19:30:45.123Z');
        const { rows } = await pool.query(
            'select cast($1 as datetime2) as stored_at, cast($2 as nvarchar(100)) as label',
            [timestamp, "O'Brien"],
        );

        expect(rows[0].stored_at).toBeInstanceOf(Date);
        expect(Number.isNaN(rows[0].stored_at.getTime())).toBe(false);
        expect(rows[0].label).toBe("O'Brien");

        const columns = await pool.query(
            'select column_name from information_schema.columns where table_schema = SCHEMA_NAME() and table_name = $1',
            ['recipes'],
        );
        expect(columns.rows.some((column) => column.column_name === 'created_at')).toBe(true);
    });
});

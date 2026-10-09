import { expect, it } from 'vitest';
import { pool } from '../server/db';

it('prints live DDL for payroll tables', async () => {
    const { rows } = await pool.query(
        `SELECT t.name AS t, c.name AS c, ty.name AS ty, c.is_nullable AS n,
                CASE WHEN dc.definition IS NULL THEN '-' ELSE dc.definition END AS d
         FROM sys.tables t
         JOIN sys.columns c ON c.object_id = t.object_id
         JOIN sys.types ty ON ty.user_type_id = c.user_type_id
         LEFT JOIN sys.default_constraints dc ON dc.parent_object_id = t.object_id AND dc.parent_column_id = c.column_id
         WHERE t.name IN ('bonus_penalty_records','payroll_payouts')
         ORDER BY t.name, c.column_id`,
    );
    for (const r of rows as any[]) console.log(`COL ${r.t}.${r.c} ${r.ty} nullable=${r.n} default=${r.d}`);
    const { rows: fks } = await pool.query(
        `SELECT OBJECT_NAME(fk.parent_object_id) AS t, COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS c,
                OBJECT_NAME(fk.referenced_object_id) AS rt
         FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
         WHERE OBJECT_NAME(fk.parent_object_id) IN ('bonus_penalty_records','payroll_payouts')`,
    );
    for (const r of fks as any[]) console.log(`FK ${r.t}.${r.c} -> ${r.rt}`);
    expect(true).toBe(true);
}, 60_000);

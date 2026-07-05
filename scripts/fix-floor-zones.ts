import { db } from '../server/db';
import { sql } from 'drizzle-orm';

const run = async () => {
    const missing = await db.execute(sql.raw(`
        select distinct t.zone_id, t.branch_id
        from tables t
        left join floor_zones z on z.id = t.zone_id
        where t.zone_id is not null and z.id is null
    `));

    if (missing.rows.length === 0) {
        console.log('No missing floor zones detected.');
        return;
    }

    for (const row of missing.rows as Array<{ zone_id: string; branch_id: string | null }>) {
        const zoneId = row.zone_id;
        const branchId = row.branch_id || 'b1';
        const zoneName = zoneId.replace(/[_-]+/g, ' ').trim() || 'Main';

        await db.execute(sql.raw(`
            insert into floor_zones (id, name, branch_id, width, height, created_at, updated_at)
            values ('${zoneId.replace(/'/g, "''")}', '${zoneName.replace(/'/g, "''")}', '${branchId.replace(/'/g, "''")}', 1600, 1200, now(), now())
            on conflict (id) do nothing
        `));

        console.log(`Created floor zone: ${zoneId} for branch ${branchId}`);
    }
};

run().catch((error) => {
    console.error(error);
    process.exit(1);
});

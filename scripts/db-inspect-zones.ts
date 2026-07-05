import { db } from '../server/db';
import { sql } from 'drizzle-orm';

const run = async () => {
    const tables = await db.execute(sql.raw('select id, branch_id, zone_id from tables order by id limit 100'));
    const zones = await db.execute(sql.raw('select id, branch_id, name from floor_zones order by id limit 100'));

    console.log('TABLES');
    console.log(JSON.stringify(tables.rows, null, 2));
    console.log('ZONES');
    console.log(JSON.stringify(zones.rows, null, 2));
};

run().catch((error) => {
    console.error(error);
    process.exit(1);
});

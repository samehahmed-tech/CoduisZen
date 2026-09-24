/**
 * Prepare the AUTO-PRODUCTION test on the installed trial DB:
 * - Zeros inventory_stock for the 15 composite (BOM) loadtest items
 * - Reports any ACTIVE batches for them (those get consumed before auto-production kicks in)
 * - Ensures 2 menu recipes consume composite items (so a POS sale triggers auto-production)
 *
 * Run: npx tsx scripts/zero-composite-stock.ts
 * Safe: only touches rows with the loadtest prefix; never deletes history.
 */
import { db, pool, waitForDatabase } from '../server/db';
import { inventoryStock, recipeIngredients, recipes } from '../src/db/schema';
import { and, eq, sql } from 'drizzle-orm';

await waitForDatabase();
const P = 'loadtest';

// 1) zero stock for composites
const compRows = (await pool.query(
    `SELECT id, name_ar, sku FROM inventory_items WHERE id LIKE '%${P}%' AND is_composite = 1 ORDER BY id`
)).rows as any[];
console.log(`composite items: ${compRows.length}`);
for (const c of compRows) {
    await db.update(inventoryStock).set({ quantity: 0, lastUpdated: new Date() } as any)
        .where(eq(inventoryStock.itemId, c.id));
}
console.log('✅ stock zeroed for all composite items');

// 2) report active batches (would be consumed first, hiding auto-production)
const batches = (await pool.query(
    `SELECT b.item_id AS itemId, COUNT(*) AS n, SUM(b.current_qty) AS qty
     FROM inventory_batches b JOIN inventory_items i ON i.id = b.item_id
     WHERE i.id LIKE '%${P}%' AND i.is_composite = 1 AND b.status = 'ACTIVE' AND b.current_qty > 0
     GROUP BY b.item_id`
)).rows as any[];
if (batches.length === 0) {
    console.log('✅ no active batches on composites — auto-production will trigger on next sale');
} else {
    console.log('⚠️ active batches still present (consumed before auto-production):');
    for (const b of batches) console.log(`   ${b.itemId}: ${b.n} batches, qty=${b.qty}`);
}

// 3) link composites into 2 sales recipes (idempotent)
const links = [
    { recipeId: `recipe-${P}-035`, invId: `inv-${P}-099`, qty: 0.05, unit: 'KG' }, // كريب شاورما <- خلطة شاورما
    { recipeId: `recipe-${P}-089`, invId: `inv-${P}-093`, qty: 0.15, unit: 'KG' }, // فطار شرقي <- بسطرمة
];
for (const l of links) {
    const rec = (await pool.query(`SELECT id FROM recipes WHERE id = '${l.recipeId}'`)).rows as any[];
    if (rec.length === 0) { console.log(`⚠️ recipe ${l.recipeId} not found — skipped`); continue; }
    const ex = await db.select().from(recipeIngredients).where(
        and(eq(recipeIngredients.recipeId, l.recipeId), eq(recipeIngredients.inventoryItemId, l.invId)));
    if (ex.length === 0) {
        await db.insert(recipeIngredients).values({
            recipeId: l.recipeId, inventoryItemId: l.invId, quantity: l.qty,
            unit: l.unit, notes: 'loadtest-auto-production', lastKnownCost: 10, lastCostUpdate: new Date(),
        } as any);
        console.log(`✅ linked ${l.invId} into ${l.recipeId}`);
    } else {
        console.log(`— link ${l.invId} into ${l.recipeId} already exists`);
    }
}

// 4) final state
const st = (await pool.query(
    `SELECT s.item_id AS itemId, s.quantity AS qty FROM inventory_stock s
     JOIN inventory_items i ON i.id = s.item_id
     WHERE i.id LIKE '%${P}%' AND i.is_composite = 1 ORDER BY s.item_id`
)).rows as any[];
console.log('final composite stock:', st.map((r: any) => `${r.itemId.split('-').pop()}=${r.qty}`).join(' '));
process.exit(0);

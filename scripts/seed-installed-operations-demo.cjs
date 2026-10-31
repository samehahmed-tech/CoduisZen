// Opt-in, insert-only fixture for the user's installed instance. No existing rows are updated.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const dotenv = require('dotenv');
const sql = require('mssql/msnodesqlv8');
const prefix = 'demo-ops-20261029-';
const id = key => prefix + key;
const label = name => `[تجربة تشغيل] ${name}`;
const warehouses = ['wh-main', 'wh-kitchen', 'wh-bar'];
const raw = [
  ['flour', 'دقيق', 'KG', 30, 5], ['water', 'مياه', 'LTR', 2, 5],
  ['oil', 'زيت', 'LTR', 80, 1], ['tomato', 'طماطم', 'KG', 20, 3],
  ['salt', 'ملح', 'KG', 10, 0.5], ['cheese', 'موتزاريلا', 'KG', 180, 2],
  ['coffee', 'بن', 'KG', 400, 1], ['milk', 'لبن', 'LTR', 40, 3],
];
const composites = [
  { key: 'dough', name: 'عجينة بيتزا', unit: 'KG', ingredients: [['flour', .6], ['water', .37], ['oil', .02], ['salt', .01]] },
  { key: 'sauce', name: 'صوص بيتزا', unit: 'KG', ingredients: [['tomato', .9], ['water', .07], ['oil', .02], ['salt', .01]] },
];
const units = Object.fromEntries(raw.map(r => [r[0], r[2]]));
const costs = Object.fromEntries(raw.map(r => [r[0], r[3]]));
for (const c of composites) {
  units[c.key] = c.unit;
  costs[c.key] = c.ingredients.reduce((sum, [key, qty]) => sum + costs[key] * qty, 0);
}
const ingredients = rows => rows.map(([key, quantity]) => ({ itemId: id(key), inventoryItemId: id(key), quantity, unit: units[key] }));
const pizza = factor => [['dough', .25 * factor], ['sauce', .08 * factor], ['cheese', .1 * factor]];
const size = (key, name, price) => ({ id: id(key), name, nameAr: name, price, isAvailable: true });
const menu = [
  { key: 'espresso', name: 'إسبريسو مفرد', price: 45, ingredients: [['coffee', .018], ['water', .04]] },
  { key: 'latte', name: 'لاتيه بالأحجام', price: 65, ingredients: [['coffee', .018], ['milk', .18]],
    sizes: [size('latte-small', 'صغير', 65), size('latte-large', 'كبير', 85)],
    variants: [['latte-small', [['coffee', .018], ['milk', .18]]], ['latte-large', [['coffee', .024], ['milk', .28]]]] },
  { key: 'custom-pizza', name: 'بيتزا باختيارات', price: 120, ingredients: pizza(1),
    modifierGroups: [{ id: id('extras'), name: 'إضافات البيتزا', nameAr: 'إضافات البيتزا', minSelection: 0, maxSelection: 1, isRequired: false,
      options: [{ id: id('extra-cheese'), name: 'جبنة إضافية ٥٠ جم', nameAr: 'جبنة إضافية ٥٠ جم', price: 20, isAvailable: true,
        recipeEffect: 'ADD', recipe: ingredients([['cheese', .05]]) }] }] },
  { key: 'sized-pizza', name: 'بيتزا بالأحجام', price: 100, ingredients: pizza(.8),
    sizes: [size('pizza-small', 'صغير', 100), size('pizza-medium', 'وسط', 140), size('pizza-large', 'كبير', 180)],
    variants: [['pizza-small', pizza(.8)], ['pizza-medium', pizza(1.2)], ['pizza-large', pizza(1.6)]] },
  { key: 'channel-pizza', name: 'بيتزا بأسعار القنوات', price: 120, ingredients: pizza(1),
    platformPricing: [{ platformId: 'dp-dine-in', price: 120 }, { platformId: 'dp-takeaway', price: 125 }, { platformId: 'dp-talabat', price: 150 }] },
];
async function insert(tx, table, data) {
  // All identifiers are fixed in this file, never accepted from CLI/input.
  const request = new sql.Request(tx);
  const entries = Object.entries(data);
  entries.forEach(([_, value], i) => request.input(`seedValue${i}`, value));
  await request.query(`INSERT INTO [${table}] (${entries.map(([key]) => `[${key}]`).join(',')}) VALUES (${entries.map((_, i) => `@seedValue${i}`).join(',')})`);
}
async function recipe(tx, key, owner, rows, sizeId = null) {
  const recipeId = id(`recipe-${key}`);
  await insert(tx, 'recipes', { id: recipeId, ...owner, yield: 1, size_id: sizeId, version: 1,
    instructions: 'وصفة تجربة تشغيل؛ الكميات لوحدة بيع واحدة أو كيلو واحد من المنتج المركب.',
    calculated_cost: rows.reduce((sum, [item, qty]) => sum + costs[item] * qty, 0) });
  for (const [item, qty] of rows) await insert(tx, 'recipe_ingredients', {
    recipe_id: recipeId, inventory_item_id: id(item), quantity: qty, unit: units[item], last_known_cost: costs[item], notes: 'بيانات تجربة تشغيل',
  });
}
async function verify(connection) {
  const request = new sql.Request(connection).input('prefix', `${prefix}%`);
  const result = await request.query(`
    SELECT 'menu' AS entity, COUNT(*) AS total FROM menu_items WHERE id LIKE @prefix
    UNION ALL SELECT 'inventory',COUNT(*) FROM inventory_items WHERE id LIKE @prefix
    UNION ALL SELECT 'recipes',COUNT(*) FROM recipes WHERE id LIKE @prefix
    UNION ALL SELECT 'stock',COUNT(*) FROM inventory_stock WHERE item_id LIKE @prefix
    UNION ALL SELECT 'batches',COUNT(*) FROM inventory_batches WHERE id LIKE @prefix
    UNION ALL SELECT 'movements',COUNT(*) FROM stock_movements WHERE item_id LIKE @prefix;
    SELECT s.item_id,s.warehouse_id FROM inventory_stock s
    OUTER APPLY (SELECT SUM(current_qty) AS qty FROM inventory_batches b WHERE b.item_id=s.item_id AND b.warehouse_id=s.warehouse_id) b
    WHERE s.item_id LIKE @prefix AND ABS(s.quantity-COALESCE(b.qty,0))>0.0001;
    SELECT id FROM menu_items m WHERE m.id LIKE @prefix AND NOT EXISTS (SELECT 1 FROM recipes r WHERE r.menu_item_id=m.id);
    SELECT id,sizes,modifier_groups,platform_pricing FROM menu_items WHERE id LIKE @prefix;
    SELECT id,menu_item_id,inventory_item_id,size_id FROM recipes WHERE id LIKE @prefix;
    SELECT id,bom FROM inventory_items WHERE id LIKE @prefix AND is_composite=1;
    SELECT COUNT(*) AS total FROM inventory_ledger WHERE id LIKE @prefix;
  `);
  assert.deepEqual(Object.fromEntries(result.recordsets[0].map(row => [row.entity, row.total])),
    { menu: 5, inventory: 10, recipes: 12, stock: 30, batches: 24, movements: 24 });
  assert.equal(result.recordsets[1].length, 0, 'Stock/batch mismatch');
  assert.equal(result.recordsets[2].length, 0, 'Missing menu recipe');
  for (const item of result.recordsets[3]) {
    for (const variant of JSON.parse(item.sizes || '[]')) {
      assert.ok(result.recordsets[4].some(r => r.menu_item_id === item.id && r.size_id === variant.id), 'Missing size recipe');
    }
    if (item.id === id('custom-pizza')) {
      const option = JSON.parse(item.modifier_groups)[0].options[0];
      assert.equal(option.recipe[0].inventoryItemId, id('cheese'));
      assert.equal(option.recipe[0].quantity, .05);
    }
    if (item.id === id('channel-pizza')) assert.equal(JSON.parse(item.platform_pricing).length, 3);
  }
  assert.equal(result.recordsets[5].length, 2);
  for (const composite of result.recordsets[5]) {
    assert.equal(JSON.parse(composite.bom).length, 4);
    assert.ok(result.recordsets[4].some(r => r.inventory_item_id === composite.id), 'Missing production recipe');
  }
  assert.equal(result.recordsets[6][0].total, 24);
  return result.recordsets[0];
}
async function main() {
  const env = dotenv.parse(fs.readFileSync('C:/Program Files/Sameh/RestoFlow ERP/.env'));
  assert.ok(env.DATABASE_URL, 'Installed database target missing');
  const pool = await new sql.ConnectionPool({ connectionString: env.DATABASE_URL }).connect();
  try {
    const target = (await pool.request().query('SELECT DB_NAME() AS name, @@SERVERNAME AS server')).recordset[0];
    assert.equal(target.name, 'CoduisZen');
    assert.equal(target.server, 'DESKTOP-NTKA442\\CODUISZEN');
    const branches = (await pool.request().query("SELECT id FROM branches WHERE id='b1' AND is_active=1")).recordset;
    assert.equal(branches.length, 1);
    const wh = (await pool.request().query("SELECT id FROM warehouses WHERE branch_id='b1' AND is_active=1 AND id IN ('wh-main','wh-kitchen','wh-bar')")).recordset;
    assert.equal(wh.length, 3);
    const platforms = (await pool.request().query("SELECT id FROM delivery_platforms WHERE id IN ('dp-dine-in','dp-takeaway','dp-talabat')")).recordset;
    assert.equal(platforms.length, 3);
    const existing = (await pool.request().input('prefix', `${prefix}%`).query('SELECT id FROM menu_categories WHERE id LIKE @prefix')).recordset;
    if (existing.length) {
      console.log('Dataset already exists; no writes performed.', JSON.stringify(await verify(pool)));
      return;
    }
    console.log(JSON.stringify({ target, branch: 'b1', warehouses, sales: menu.map(m => ({ name: m.name, price: m.price })), inventoryItems: 10, recipes: 12, mode: process.argv.includes('--commit') ? 'COMMIT' : 'DRY RUN' }));
    if (!process.argv.includes('--commit')) return;
    const tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      await insert(tx, 'menu_categories', { id: id('category'), name: 'تجربة تشغيل', name_ar: 'تجربة تشغيل', is_active: true, sort_order: 0,
        menu_ids: JSON.stringify(['menu-1']), target_order_types: JSON.stringify(['DINE_IN', 'TAKEAWAY', 'DELIVERY']) });
      for (const row of [...raw.map(([key, name, unit, cost, qty]) => ({ key, name, unit, cost, qty })), ...composites.map(c => ({ ...c, cost: costs[c.key], qty: 0 }))]) {
        await insert(tx, 'inventory_items', { id: id(row.key), name: label(row.name), name_ar: label(row.name), sku: `DEMO-OPS-${row.key}`,
          unit: row.unit, purchase_unit: row.unit, purchase_unit_factor: 1, category: 'تجربة تشغيل', threshold: .1,
          cost_price: row.cost, purchase_price: row.cost, is_composite: !!row.ingredients, is_active: true,
          bom: JSON.stringify(row.ingredients ? ingredients(row.ingredients) : []) });
        for (const warehouse of warehouses) {
          await insert(tx, 'inventory_stock', { item_id: id(row.key), warehouse_id: warehouse, quantity: row.qty });
          if (!row.qty) continue;
          await insert(tx, 'inventory_batches', { id: id(`batch-${row.key}-${warehouse}`), item_id: id(row.key), warehouse_id: warehouse,
            batch_number: `DEMO-OPS-${row.key}-${warehouse}`, expiry_date: new Date('2027-10-29T12:00:00Z'), initial_qty: row.qty, current_qty: row.qty,
            unit_cost: row.cost, status: 'ACTIVE' });
          await insert(tx, 'stock_movements', { item_id: id(row.key), to_warehouse_id: warehouse, quantity: row.qty, unit_cost: row.cost,
            total_cost: row.qty * row.cost, type: 'ADJUSTMENT', reference_id: id('opening'), reason: 'رصيد افتتاحي افتراضي لتجربة التشغيل، ليس استلام مشتريات', performed_by: 'demo-seed' });
          await insert(tx, 'inventory_ledger', { id: id(`ledger-${row.key}-${warehouse}`), product_id: id(row.key), branch_id: 'b1', change: row.qty,
            unit_cost: row.cost, reason: 'DEMO_OPENING_BALANCE', reference_id: id('opening') });
        }
      }
      for (const c of composites) await recipe(tx, c.key, { inventory_item_id: id(c.key) }, c.ingredients);
      for (const [index, item] of menu.entries()) {
        await insert(tx, 'menu_items', { id: id(item.key), category_id: id('category'), name: label(item.name), name_ar: label(item.name),
          price: item.price, cost: item.ingredients.reduce((sum, [key, qty]) => sum + costs[key] * qty, 0), status: 'published', is_available: true,
          sku: `DEMO-SALE-${item.key}`, sort_order: index, preparation_time: item.key.includes('pizza') ? 12 : 3,
          description: 'بيانات اختبار فقط — تجربة تشغيل', description_ar: 'بيانات اختبار فقط — تجربة تشغيل',
          sizes: JSON.stringify(item.sizes || []), modifier_groups: JSON.stringify(item.modifierGroups || []), platform_pricing: JSON.stringify(item.platformPricing || []) });
        await recipe(tx, item.key, { menu_item_id: id(item.key) }, item.ingredients);
        for (const [sizeKey, rows] of item.variants || []) await recipe(tx, sizeKey, { menu_item_id: id(item.key) }, rows, id(sizeKey));
      }
      const checks = await verify(tx);
      await tx.commit();
      console.log('COMMITTED and verified:', JSON.stringify(checks));
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  } finally { await pool.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

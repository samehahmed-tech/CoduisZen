'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const JSON_COLUMNS = new Set([
  'target_order_types', 'menu_ids', 'printer_ids', 'available_days', 'modifier_groups',
  'sizes', 'branch_pricing', 'platform_pricing', 'bom', 'ingredients_snapshot',
]);

const TABLES = [
  { name: 'menu_categories', required: true, key: 'id', columns: ['id', 'name', 'name_ar', 'description', 'icon', 'image', 'color', 'sort_order', 'is_active', 'target_order_types', 'menu_ids', 'printer_ids', 'deleted_at', 'created_at', 'updated_at'] },
  { name: 'modifier_groups', key: 'id', columns: ['id', 'name', 'name_ar', 'min_selection', 'max_selection', 'is_required', 'created_at'] },
  { name: 'modifier_options', key: 'id', columns: ['id', 'group_id', 'name', 'name_ar', 'price', 'sort_order', 'is_available'] },
  { name: 'inventory_items', required: true, key: 'id', columns: ['id', 'name', 'name_ar', 'sku', 'barcode', 'unit', 'category', 'threshold', 'cost_price', 'purchase_price', 'supplier_id', 'is_audited', 'audit_frequency', 'is_composite', 'bom', 'is_active', 'deleted_at', 'created_at', 'updated_at'] },
  { name: 'menu_items', required: true, key: 'id', columns: ['id', 'category_id', 'name', 'name_ar', 'description', 'description_ar', 'price', 'cost', 'image', 'status', 'approved_at', 'published_at', 'previous_price', 'pending_price', 'price_change_reason', 'price_approved_at', 'is_available', 'available_from', 'available_to', 'available_days', 'modifier_groups', 'sizes', 'branch_pricing', 'platform_pricing', 'preparation_time', 'printer_ids', 'is_popular', 'is_featured', 'sort_order', 'layout_type', 'barcode', 'sku', 'is_tax_exempt', 'deleted_at', 'created_at', 'updated_at'] },
  { name: 'recipes', required: true, key: 'id', columns: ['id', 'menu_item_id', 'inventory_item_id', 'yield', 'size_id', 'instructions', 'version', 'current_version_id', 'calculated_cost', 'last_cost_calculation', 'created_at', 'updated_at'] },
  { name: 'recipe_versions', key: 'id', columns: ['id', 'recipe_id', 'version', 'yield', 'instructions', 'ingredients_snapshot', 'calculated_cost', 'change_reason', 'created_at'] },
  { name: 'menu_item_modifiers', replaceBy: 'menu_item_id', scopeFrom: 'menu_items', columns: ['menu_item_id', 'modifier_group_id', 'sort_order'] },
  { name: 'recipe_ingredients', required: true, replaceBy: 'recipe_id', scopeFrom: 'recipes', columns: ['recipe_id', 'inventory_item_id', 'quantity', 'unit', 'notes', 'last_known_cost', 'last_cost_update'] },
];

const INVENTORY_SKU_INDEX_SQL = `IF OBJECT_ID(N'dbo.uq_inventory_items_sku', N'UQ') IS NOT NULL
  ALTER TABLE dbo.inventory_items DROP CONSTRAINT uq_inventory_items_sku;
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID(N'dbo.inventory_items')
    AND name = N'idx_inventory_items_sku_not_null'
)
  CREATE UNIQUE INDEX idx_inventory_items_sku_not_null
  ON dbo.inventory_items(sku)
  WHERE sku IS NOT NULL;`;

function identifier(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`);
  return name;
}

function q(name) {
  return `[${identifier(name)}]`;
}

function normalizeValue(column, sourceValue) {
  if (sourceValue === undefined || sourceValue === null) return null;
  if (JSON_COLUMNS.has(column) && typeof sourceValue !== 'string') return JSON.stringify(sourceValue);
  return sourceValue;
}

function sqlLiteral(sourceValue) {
  if (sourceValue === null || sourceValue === undefined) return 'NULL';
  if (sourceValue instanceof Date) return `CAST(N'${sourceValue.toISOString().slice(0, -1)}' AS datetime2)`;
  if (typeof sourceValue === 'boolean') return sourceValue ? '1' : '0';
  if (typeof sourceValue === 'number') {
    if (!Number.isFinite(sourceValue)) throw new Error(`Invalid numeric value: ${sourceValue}`);
    return String(sourceValue);
  }
  return `N'${String(sourceValue).replace(/'/g, "''")}'`;
}

function chunks(rows, size = 250) {
  const grouped = [];
  for (let offset = 0; offset < rows.length; offset += size) grouped.push(rows.slice(offset, offset + size));
  return grouped;
}

async function loadDatasets(pg, schema) {
  const datasets = new Map();
  for (const spec of TABLES) {
    const metadata = await pg.query(`SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2`, [schema, spec.name]);
    const sourceColumns = new Set(metadata.rows.map(row => row.column_name));
    if (!sourceColumns.size) {
      if (spec.required) throw new Error(`Required table missing: ${schema}.${spec.name}`);
      datasets.set(spec.name, { spec, exists: false, columns: [], rows: [] });
      continue;
    }
    const columns = spec.columns.filter(column => sourceColumns.has(column));
    if (spec.key && !columns.includes(spec.key)) throw new Error(`Key column missing: ${spec.name}.${spec.key}`);
    if (spec.key && columns.length < 2) throw new Error(`No transferable columns found: ${spec.name}`);
    const rowsQuery = await pg.query(`SELECT ${columns.map(column => `"${identifier(column)}"`).join(', ')} FROM "${identifier(schema)}"."${identifier(spec.name)}"`);
    datasets.set(spec.name, { spec, exists: true, columns, rows: rowsQuery.rows });
  }
  return datasets;
}

function validateReferences(datasets) {
  const ids = table => new Set((datasets.get(table)?.rows || []).map(row => String(row.id)));
  const checks = [
    ['menu_items', 'category_id', 'menu_categories'], ['modifier_options', 'group_id', 'modifier_groups'],
    ['menu_item_modifiers', 'menu_item_id', 'menu_items'], ['menu_item_modifiers', 'modifier_group_id', 'modifier_groups'],
    ['recipes', 'menu_item_id', 'menu_items'], ['recipes', 'inventory_item_id', 'inventory_items'],
    ['recipe_versions', 'recipe_id', 'recipes'], ['recipe_ingredients', 'recipe_id', 'recipes'],
    ['recipe_ingredients', 'inventory_item_id', 'inventory_items'],
  ];
  for (const [table, column, parent] of checks) {
    if (!datasets.get(table)?.exists) continue;
    const parentIds = ids(parent);
    const orphan = datasets.get(table).rows.find(row => row[column] != null && !parentIds.has(String(row[column])));
    if (orphan) throw new Error(`Broken source reference: ${table}.${column}=${orphan[column]}`);
  }
}

function mergeSql(dataset) {
  const { spec, columns, rows } = dataset;
  const updateColumns = columns.filter(column => column !== spec.key);
  return chunks(rows).map(group => {
    const values = group.map(row => `(${columns.map(column => sqlLiteral(normalizeValue(column, row[column]))).join(', ')})`).join(',\n');
    return `MERGE dbo.${q(spec.name)} WITH (HOLDLOCK) AS target
USING (VALUES\n${values}\n) AS source (${columns.map(q).join(', ')})
ON target.${q(spec.key)} = source.${q(spec.key)}
WHEN MATCHED THEN UPDATE SET ${updateColumns.map(column => `target.${q(column)}=source.${q(column)}`).join(', ')}
WHEN NOT MATCHED THEN INSERT (${columns.map(q).join(', ')}) VALUES (${columns.map(column => `source.${q(column)}`).join(', ')});`;
  }).join('\n\n');
}

function replaceSql(dataset, datasets) {
  const { spec, columns, rows } = dataset;
  const parentIds = [...new Set((datasets.get(spec.scopeFrom)?.rows || []).map(row => row.id).filter(id => id != null))];
  const deletes = chunks(parentIds).map(group => `DELETE FROM dbo.${q(spec.name)} WHERE ${q(spec.replaceBy)} IN (${group.map(sqlLiteral).join(', ')});`);
  const inserts = chunks(rows).map(group => `INSERT INTO dbo.${q(spec.name)} (${columns.map(q).join(', ')}) VALUES\n${group.map(row => `(${columns.map(column => sqlLiteral(normalizeValue(column, row[column]))).join(', ')})`).join(',\n')};`);
  return [...deletes, ...inserts].join('\n\n');
}

function buildSql(datasets) {
  const body = [];
  for (const dataset of datasets.values()) {
    if (!dataset.exists) continue;
    body.push(dataset.spec.replaceBy ? replaceSql(dataset, datasets) : mergeSql(dataset));
  }
  return `-- RESTOFLOW_CATALOG_IMPORT_V1
-- Generated ${new Date().toISOString()}
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF DB_NAME() <> N'CoduisZen' THROW 51000, 'Wrong target database. Expected CoduisZen.', 1;
BEGIN TRY
  BEGIN TRANSACTION;
${INVENTORY_SKU_INDEX_SQL}

${body.filter(Boolean).join('\n\n')}
  COMMIT TRANSACTION;
  SELECT N'RestoFlow catalog import completed' AS message;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;
`;
}

function connectionConfig() {
  for (const envName of ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD']) {
    if (!process.env[envName]) throw new Error(`Source ${envName} is missing`);
  }
  return { host: process.env.PGHOST, port: Number(process.env.PGPORT), database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false, connectionTimeoutMillis: 15000 };
}

function selfTest() {
  if (sqlLiteral("طبق 'خاص'") !== "N'طبق ''خاص'''" || sqlLiteral(true) !== '1') throw new Error('SQL literal conversion failed');
  const merge = mergeSql({ spec: { name: 'menu_categories', key: 'id' }, columns: ['id', 'name'], rows: [{ id: 'c1', name: "طبق 'خاص'" }] });
  if (!merge.includes('MERGE dbo.[menu_categories]') || !merge.includes("N'طبق ''خاص''")) throw new Error('MERGE generation failed');
  const testDatasets = new Map([['menu_categories', { exists: true, rows: [{ id: 'c1' }] }], ['menu_items', { exists: true, rows: [{ id: 'i1', category_id: 'c1' }] }]]);
  validateReferences(testDatasets);
  if (!INVENTORY_SKU_INDEX_SQL.includes('CREATE UNIQUE INDEX idx_inventory_items_sku_not_null') || !INVENTORY_SKU_INDEX_SQL.includes('WHERE sku IS NOT NULL')) throw new Error('Inventory SKU index migration is missing');
  process.stdout.write('{"ok":true,"selfTest":true}\n');
}

async function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  const outputArg = process.argv.find(arg => arg.startsWith('--output='));
  if (!outputArg) throw new Error('Missing --output=path');
  const output = path.resolve(outputArg.slice('--output='.length));
  const schema = identifier(process.env.PGSCHEMA || 'public');
  const pg = new Client(connectionConfig());
  try {
    await pg.connect();
    const datasets = await loadDatasets(pg, schema);
    validateReferences(datasets);
    fs.writeFileSync(output, buildSql(datasets), 'utf8');
    const tables = Object.fromEntries([...datasets].map(([name, dataset]) => [name, dataset.exists ? dataset.rows.length : 'not present']));
    process.stdout.write(`${JSON.stringify({ ok: true, output, tables }, null, 2)}\n`);
  } finally {
    await pg.end();
  }
}

main().catch(error => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: String(error?.message || error) })}\n`);
  process.exitCode = 1;
});

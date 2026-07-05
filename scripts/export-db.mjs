// RestoFlow ERP - Database Export Script
// Exports full database schema + data into a single .sql file
// Run: node scripts/export-db.mjs

import pg from 'pg';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://restoflow_user:Coduis%40%24321@localhost:5432/restoflow_erp';
const OUTPUT_DIR = resolve(process.cwd(), 'client-release');
const DB_DUMP_FILE = join(OUTPUT_DIR, 'restoflow_erp_dump.sql');

async function queryAll(pool, text, params) {
  const r = await pool.query(text, params);
  return r.rows;
}

async function getTables(pool) {
  return await queryAll(pool,
    `SELECT table_name FROM information_schema.tables 
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
}

async function getColumns(pool, tableName) {
  return await queryAll(pool,
    `SELECT 
       c.column_name,
       c.data_type,
       c.character_maximum_length,
       c.numeric_precision,
       c.numeric_scale,
       c.is_nullable,
       c.column_default,
       c.identity_generation,
       c.is_identity
     FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = $1
     ORDER BY c.ordinal_position`,
    [tableName]
  );
}

async function getPrimaryKey(pool, tableName) {
  return await queryAll(pool,
    `SELECT kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
     WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
     ORDER BY kcu.ordinal_position`,
    [tableName]
  );
}

async function getForeignKeys(pool, tableName) {
  return await queryAll(pool,
    `SELECT
       kcu.column_name,
       ccu.table_schema AS foreign_table_schema,
       ccu.table_name AS foreign_table_name,
       ccu.column_name AS foreign_column_name,
       rc.update_rule,
       rc.delete_rule,
       tc.constraint_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
     JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
     JOIN information_schema.constraint_column_usage ccu ON rc.unique_constraint_name = ccu.constraint_name
     WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'FOREIGN KEY'`,
    [tableName]
  );
}

async function getUniqueConstraints(pool, tableName) {
  return await queryAll(pool,
    `SELECT
       tc.constraint_name,
       kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
     WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'UNIQUE'
     ORDER BY tc.constraint_name, kcu.ordinal_position`,
    [tableName]
  );
}

async function getCheckConstraints(pool, tableName) {
  return await queryAll(pool,
    `SELECT
       tc.constraint_name,
       cc.check_clause
     FROM information_schema.table_constraints tc
     JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
     WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'CHECK'`,
    [tableName]
  );
}

async function getIndexes(pool, tableName) {
  return await queryAll(pool,
    `SELECT i.indexdef
     FROM pg_indexes i
     WHERE i.schemaname = 'public' AND i.tablename = $1
     ORDER BY i.indexname`,
    [tableName]
  );
}

async function getSequences(pool) {
  return await queryAll(pool,
    `SELECT 
       c.column_name, 
       c.table_name,
       c.column_default
     FROM information_schema.columns c
     WHERE c.table_schema = 'public' 
       AND c.column_default LIKE 'nextval%'
     ORDER BY c.table_name, c.column_name`
  );
}

function typeToSQL(col) {
  let sqlType = col.data_type;
  
  switch (col.data_type) {
    case 'character varying':
    case 'varchar':
      sqlType = col.character_maximum_length ? `varchar(${col.character_maximum_length})` : 'varchar';
      break;
    case 'character':
    case 'char':
      sqlType = col.character_maximum_length ? `char(${col.character_maximum_length})` : 'char';
      break;
    case 'numeric':
    case 'decimal':
      if (col.numeric_precision && col.numeric_scale !== null) {
        sqlType = `numeric(${col.numeric_precision}, ${col.numeric_scale})`;
      } else if (col.numeric_precision) {
        sqlType = `numeric(${col.numeric_precision})`;
      } else {
        sqlType = 'numeric';
      }
      break;
    case 'real':
      sqlType = 'real';
      break;
    case 'double precision':
      sqlType = 'double precision';
      break;
    case 'boolean':
      sqlType = 'boolean';
      break;
    case 'timestamp without time zone':
      sqlType = 'timestamp';
      break;
    case 'timestamp with time zone':
      sqlType = 'timestamptz';
      break;
    case 'date':
      sqlType = 'date';
      break;
    case 'time without time zone':
      sqlType = 'time';
      break;
    case 'time with time zone':
      sqlType = 'timetz';
      break;
    case 'integer':
      sqlType = 'integer';
      break;
    case 'bigint':
      sqlType = 'bigint';
      break;
    case 'smallint':
      sqlType = 'smallint';
      break;
    case 'text':
      sqlType = 'text';
      break;
    case 'json':
      sqlType = 'json';
      break;
    case 'jsonb':
      sqlType = 'jsonb';
      break;
    case 'uuid':
      sqlType = 'uuid';
      break;
    case 'bytea':
      sqlType = 'bytea';
      break;
    case 'ARRAY':
      sqlType = 'text[]';
      break;
    case 'USER-DEFINED':
      sqlType = col.udt_name || 'text';
      break;
    default:
      sqlType = col.data_type;
  }
  return sqlType;
}

function escapeSQL(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return val.toString();
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (val instanceof Date) return `'${val.toISOString()}'`;
  const escaped = String(val).replace(/'/g, "''");
  return `'${escaped}'`;
}

function generateCreateTable(tableName, columns, pkCols, fks, uniques, checks) {
  const lines = [];
  lines.push(`CREATE TABLE IF NOT EXISTS "${tableName}" (`);
  
  const colDefs = columns.map(col => {
    let def = `  "${col.column_name}" ${typeToSQL(col)}`;
    
    // Identity / serial
    if (col.is_identity === 'YES' && col.identity_generation) {
      def += ` GENERATED ${col.identity_generation === 'ALWAYS' ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY`;
    }
    
    // Not null
    if (col.is_nullable === 'NO') {
      def += ' NOT NULL';
    }
    
    // Default
    if (col.column_default && !col.column_default.includes('nextval')) {
      def += ` DEFAULT ${col.column_default}`;
    }
    
    return def;
  });
  
  // Primary key
  if (pkCols.length > 0) {
    const pk = pkCols.map(c => `"${c.column_name}"`).join(', ');
    colDefs.push(`  PRIMARY KEY (${pk})`);
  }
  
  // Unique constraints
  const seenUniques = new Set();
  for (const uq of uniques) {
    if (!seenUniques.has(uq.constraint_name)) {
      const group = uniques.filter(u => u.constraint_name === uq.constraint_name);
      const cols = group.map(u => `"${u.column_name}"`).join(', ');
      colDefs.push(`  CONSTRAINT "${uq.constraint_name}" UNIQUE (${cols})`);
      seenUniques.add(uq.constraint_name);
    }
  }
  
  // Check constraints
  for (const ck of checks) {
    colDefs.push(`  CONSTRAINT "${ck.constraint_name}" CHECK (${ck.check_clause})`);
  }
  
  lines.push(colDefs.join(',\n'));
  lines.push(');');
  
  return lines.join('\n');
}

function generateForeignKeys(tableName, fks) {
  if (fks.length === 0) return '';
  
  return fks.map(fk => {
    let def = `ALTER TABLE ONLY "${tableName}" ADD CONSTRAINT "${fk.constraint_name}"`;
    def += ` FOREIGN KEY ("${fk.column_name}") REFERENCES "${fk.foreign_table_name}"("${fk.foreign_column_name}")`;
    if (fk.update_rule !== 'NO ACTION') def += ` ON UPDATE ${fk.update_rule}`;
    if (fk.delete_rule !== 'NO ACTION') def += ` ON DELETE ${fk.delete_rule}`;
    def += ';';
    return def;
  }).join('\n');
}

async function main() {
  console.log('=== RestoFlow ERP - Database Export ===\n');

  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });

  const sqlLines = [];
  sqlLines.push('-- ===========================================');
  sqlLines.push('-- RestoFlow ERP - Complete Database Dump');
  sqlLines.push('-- Generated: ' + new Date().toISOString());
  sqlLines.push('-- ===========================================');
  sqlLines.push('');
  sqlLines.push('BEGIN;');
  sqlLines.push('');

  try {
    const tables = await getTables(pool);
    console.log(`Found ${tables.length} tables:\n`);

    // Disable triggers for fast restore
    sqlLines.push('SET session_replication_role = replica;');
    sqlLines.push('');

    // Export table structures
    let totalRows = 0;
    
    for (const { table_name } of tables) {
      console.log(`  📦 ${table_name}...`);

      const columns = await getColumns(pool, table_name);
      const pkCols = await getPrimaryKey(pool, table_name);
      const fks = await getForeignKeys(pool, table_name);
      const uniques = await getUniqueConstraints(pool, table_name);
      const checks = await getCheckConstraints(pool, table_name);
      const indexes = await getIndexes(pool, table_name);

      // CREATE TABLE
      sqlLines.push('-- -----------------------------------------');
      sqlLines.push(`-- Table: ${table_name}`);
      sqlLines.push('-- -----------------------------------------');
      sqlLines.push(generateCreateTable(table_name, columns, pkCols, fks, uniques, checks));
      sqlLines.push('');

      // Foreign keys
      const fkSql = generateForeignKeys(table_name, fks);
      if (fkSql) {
        sqlLines.push(fkSql);
        sqlLines.push('');
      }

      // Indexes
      for (const idx of indexes) {
        if (!idx.indexdef.includes('PRIMARY KEY') && !idx.indexdef.includes('UNIQUE')) {
          sqlLines.push(idx.indexdef + ';');
        }
      }
      if (indexes.length > 0) sqlLines.push('');

      // Export data
      const dataRows = await queryAll(pool, `SELECT * FROM "${table_name}"`);
      
      if (dataRows.length > 0) {
        const rowKeys = Object.keys(dataRows[0]);
        const colList = rowKeys.map(c => `"${c}"`).join(', ');

        // Batch insert
        const BATCH_SIZE = 100;
        for (let i = 0; i < dataRows.length; i += BATCH_SIZE) {
          const batch = dataRows.slice(i, i + BATCH_SIZE);
          const valueStrings = batch.map(row => {
            const values = rowKeys.map(col => escapeSQL(row[col]));
            return '(' + values.join(', ') + ')';
          });

          sqlLines.push(`INSERT INTO "${table_name}" (${colList}) VALUES`);
          sqlLines.push(valueStrings.join(',\n') + ';');
        }
        sqlLines.push('');
        console.log(`    -> ${dataRows.length} rows`);
        totalRows += dataRows.length;
      } else {
        console.log(`    -> 0 rows`);
      }
    }

    // Re-enable triggers
    sqlLines.push('SET session_replication_role = DEFAULT;');
    sqlLines.push('');
    sqlLines.push('COMMIT;');
    sqlLines.push('');
    sqlLines.push('-- ===========================================');
    sqlLines.push('-- Export complete');
    sqlLines.push('-- ===========================================');

    // Write file
    const fullSql = sqlLines.join('\n');
    writeFileSync(DB_DUMP_FILE, fullSql, 'utf-8');

    const fileSize = (Buffer.byteLength(fullSql) / 1024 / 1024).toFixed(2);
    console.log(`\n✅ Database export complete!`);
    console.log(`   File: ${DB_DUMP_FILE}`);
    console.log(`   Size: ${fileSize} MB`);
    console.log(`   Tables: ${tables.length}`);
    console.log(`   Total rows: ${totalRows}`);

  } catch (err) {
    console.error('\n❌ Export failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
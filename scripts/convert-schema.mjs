import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, '..', 'src', 'db', 'schema.ts');

let s = readFileSync(schemaPath, 'utf-8');

// 1. Import line: replace pg-core with mssql-core and rename types
s = s.replace(
  /import \{ ([^}]+) \} from 'drizzle-orm\/pg-core';/,
  (_, imports) => {
    let ii = imports
      .replace('pgTable', 'mssqlTable')
      .replace(/\btext\b/g, 'nvarchar')
      .replace(/\bserial\b/g, 'int')
      .replace(/\binteger\b/g, 'int')
      .replace(/\bboolean\b/g, 'bit')
      .replace(/\btimestamp\b/g, 'datetime2')
      .replace(/\bjsonb\b/g, 'nvarchar')
      .replace(/\bjson\b(?!_) /g, 'nvarchar')  
      .replace(/\bvarchar\b/g, 'nvarchar');
    let parts = ii.split(', ').filter(Boolean);
    // Deduplicate keeping order
    let seen = new Set();
    parts = parts.filter(p => {
      if (seen.has(p)) return false;
      seen.add(p);
      return true;
    });
    return `import { ${parts.join(', ')} } from 'drizzle-orm/mssql-core';`;
  }
);

// 2. pgTable( → mssqlTable(
s = s.replace(/pgTable\(/g, 'mssqlTable(');

// 3. text( → nvarchar(
s = s.replace(/\btext\(/g, 'nvarchar(');

// 4. integer( → int(
s = s.replace(/\binteger\(/g, 'int(');

// 5. boolean( → bit(
s = s.replace(/\bboolean\(/g, 'bit(');

// 6. timestamp( → datetime2(
s = s.replace(/\btimestamp\(/g, 'datetime2(');

// 7. jsonb( → nvarchar(
s = s.replace(/\bjsonb\(/g, 'nvarchar(');

// 8. json( → nvarchar(
// Be careful: json( → nvarchar( but avoid double-match from jsonb
s = s.replace(/\bjson\(/g, 'nvarchar(');

// 9. serial( → int(  (serial is just auto-increment int)
s = s.replace(/\bserial\(/g, 'int(');

// 10. varchar( → nvarchar(
s = s.replace(/\bvarchar\(/g, 'nvarchar(');

// 11. Update header comment
s = s.replace("// Using Drizzle ORM with PostgreSQL", "// Using Drizzle ORM with SQL Server");

// 12. Add sql import if needed for defaultNow / raw SQL
if (!s.includes("import { sql }")) {
  s = s.replace(
    "from 'drizzle-orm/mssql-core';",
    "from 'drizzle-orm/mssql-core';" + "\nimport { sql } from 'drizzle-orm/mssql-core';"
  );
}

writeFileSync(schemaPath, s, 'utf-8');
console.log('✅ schema.ts converted to mssql-core');

// Show diff stats
const lines = s.split('\n');
const pgLines = readFileSync(schemaPath, 'utf-8').split('\n').length;
console.log(`Total lines: ${lines.length}`);
console.log(`Imports from mssql-core: ${s.includes('mssql-core')}`);
console.log(`Has mssqlTable: ${s.includes('mssqlTable(')}`);

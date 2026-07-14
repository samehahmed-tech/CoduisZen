import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, '..', 'src', 'db', 'schema.ts');

let s = readFileSync(schemaPath, 'utf-8');

// 1. Replace .default({}) with .default('{}') for nvarchar columns
s = s.replace(/\.default\(\{\}\)/g, "default('{}')");
s = s.replace(/nvarchar\(\)\.default\('\{\}'\)/g, "nvarchar({ length: 'max' }).default('{}')");

// Fix: nvarchar().default('{}') → nvarchar({ length: 'max' }).default('{}')
// But this was already done by the previous step... let me check

// 2. Fix nvarchar() with no args → add { length: 'max' }
s = s.replace(/nvarchar\(\)(?!\.)/g, "nvarchar({ length: 'max' })");
// Also fix nvarchar().method → nvarchar({ length: 'max' }).method
s = s.replace(/nvarchar\(\)\./g, "nvarchar({ length: 'max' }).");

// 3. Fix array defaults for nvarchar: .default(["sun","mon",...]) → .default('["sun","mon",...]')
// Match all .default([...]) where content is a string array
s = s.replace(/\.default\(\[("[^"]*"(?:,\s*"[^"]*")*)\]\)/g, (match) => {
  // Extract the inner content and JSON-stringify it
  const inner = match.match(/\[(.*?)\]/)[1];
  const items = inner.match(/"([^"]*)"/g).map(s => s.replace(/"/g, ''));
  const jsonStr = JSON.stringify(items);
  // Handle nested: convert to string representation
  // This creates a valid JS array expression as a string
  return `.default('${jsonStr}')`;
});

// 4. Fix index().using("btree", ...) → index(...).on(simple columns)
// The pattern: index("name").using("btree", col1.asc().nullsLast().op("xxx"), col2.asc().nullsLast().op("yyy"))
// Should become:  index("name").on(col1, col2)

// Process line by line for this complex transformation
const lines = s.split('\n');
const out = [];

for (let i = 0; i < lines.length; i++) {
  let line = lines[i];
  const trimmed = line.trim();
  
  // Fix index calls with .using("btree", ...)
  if (trimmed.includes('.using("btree",') || trimmed.includes(".using('btree',")) {
    // Extract parts: index("name").using("btree", colExpr1, colExpr2, ...)
    const match = trimmed.match(/^(\s*)(index|uniqueIndex)\("([^"]+)"\)\.using\("btree", (.*)\)/);
    // Or with single quotes
    const match2 = trimmed.match(/^(\s*)(index|uniqueIndex)\('([^']+)'\)\.using\('btree', (.*)\)/);
    
    if (match) {
      const [_, indent, idxType, idxName, colsStr] = match;
      // Split columns by ),  followed by more args
      // Each column is like: table.colName.asc().nullsLast().op("type")
      // Extract just the table.colName part
      const colParts = colsStr.split(/,\s*(?=table\.)/);
      const cleanCols = colParts.map(c => {
        const colMatch = c.match(/^(table\.\w+)/);
        return colMatch ? colMatch[1] : c.trim();
      });
      line = `${indent}${idxType}("${idxName}").on(${cleanCols.join(', ')})`;
    } else if (match2) {
      const [_, indent, idxType, idxName, colsStr] = match2;
      const colParts = colsStr.split(/,\s*(?=table\.)/);
      const cleanCols = colParts.map(c => {
        const colMatch = c.match(/^(table\.\w+)/);
        return colMatch ? colMatch[1] : c.trim();
      });
      line = `${indent}${idxType}('${idxName}').on(${cleanCols.join(', ')})`;
    }
  }
  
  out.push(line);
}

s = out.join('\n');

writeFileSync(schemaPath, s, 'utf-8');
console.log('Fixed!');

// Verify
const usingLeft = (s.match(/\.using\(/g) || []).length;
const defaultObj = (s.match(/\.default\(\{\)/g) || []).length;
console.log(`.using() left: ${usingLeft}`);
console.log(`.default({}) left: ${defaultObj}`);

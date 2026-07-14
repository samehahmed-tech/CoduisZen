import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, '..', 'src', 'db', 'schema.ts');

let s = readFileSync(schemaPath, 'utf-8');

// Add missing ]); after each (table) => [ block
// Pattern: (table) => [\n  ...indices... \n (blank or next export const)
const lines = s.split('\n');
const out = [];
let inArrayBlock = false;
let arrayIndent = '';
let bracketDepth = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();
  
  // Detect (table) => [ start
  if (trimmed.includes('(table) => [')) {
    inArrayBlock = true;
    bracketDepth = 0;
    // Count brackets in this line
    for (const ch of line) {
      if (ch === '[') bracketDepth++;
      if (ch === ']') bracketDepth--;
    }
    out.push(line);
    continue;
  }
  
  if (inArrayBlock) {
    // Count brackets
    for (const ch of line) {
      if (ch === '[') bracketDepth++;
      if (ch === ']') bracketDepth--;
    }
    
    // Check if we reached the end of block
    // End conditions:
    // 1. Blank line with bracketDepth <= 0
    // 2. Next table definition
    // 3. Line starting with "export const"
    const isBlank = trimmed === '';
    const isNewTable = trimmed.startsWith('export const ') && trimmed.includes(' = mssqlTable(');
    const isSectionHeader = trimmed.startsWith('//') || trimmed.startsWith('/*');
    
    if ((isBlank || isNewTable) && bracketDepth <= 0) {
      // Insert closing ]); before this line
      // But only if the previous line doesn't already end with ]);
      const prevLine = out.length > 0 ? out[out.length - 1].trim() : '';
      if (!prevLine.endsWith(']);') && !prevLine.endsWith('];')) {
        const indent = line.match(/^\s*/)[0] || '';
        out.push(`${indent}]);`);
      }
      inArrayBlock = false;
      out.push(line);
      continue;
    }
    
    out.push(line);
    continue;
  }
  
  out.push(line);
}

s = out.join('\n');

// Remove duplicate empty lines
s = s.replace(/\n{3,}/g, '\n\n');

writeFileSync(schemaPath, s, 'utf-8');
console.log('Fixed missing ]); closings');

// Verify
const missingClosings = (s.match(/\(table\) => \[/g) || []).length;
const hasClosings = (s.match(/\]\);/g) || []).length;
console.log(`(table) => [ blocks: ${missingClosings}`);
console.log(`]); closing lines: ${hasClosings}`);

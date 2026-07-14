import { readFileSync, writeFileSync } from 'fs';

let s = readFileSync('src/db/schema.ts', 'utf-8');

// Fix $type<Record<...>>().default('{}') -> use sql
// Use a simple string-based approach
// Find lines with $type<Record and .default('{}') and fix them
const lines = s.split('\n');
for (let i = 0; i < lines.length; i++) {
  let line = lines[i];
  if (line.includes('$type<Record') && line.includes(".default('{}')")) {
    line = line.replace(".default('{}')", ".default(sql`'{}'`)");
    console.log(`Fixed line ${i + 1}: ${line.trim().substring(0, 60)}...`);
  }
  if (line.includes('$type<string[]>') && line.includes('.default([])')) {
    line = line.replace('.default([])', ".default(sql`'[]'`)");
    console.log(`Fixed line ${i + 1}: ${line.trim().substring(0, 60)}...`);
  }
  // Also fix default(undefined[]) type errors - look for .default([]) without explicit type
  if (line.includes('.default([])') && !line.includes('$type')) {
    // This might be an issue if [] is inferred as undefined[]
    // Check if the column is nvarchar
    if (line.includes('nvarchar(')) {
      line = line.replace('.default([])', ".default(sql`'[]'`)");
      console.log(`Fixed line ${i + 1}: ${line.trim().substring(0, 60)}...`);
    }
  }
  lines[i] = line;
}
s = lines.join('\n');

writeFileSync('src/db/schema.ts', s, 'utf-8');
console.log('Done');

// Show what's left
const r1 = (s.match(/\$type<Record[^>]+>\(\)\.default/g) || []).length;
const r2 = (s.match(/\$type<string\[\]>\(\)\.default/g) || []).length;
console.log(`Remaining Record.default(): ${r1}`);
console.log(`Remaining string[].default(): ${r2}`);

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, '..', 'src', 'db', 'schema.ts');

let s = readFileSync(schemaPath, 'utf-8');
const lines = s.split('\n');
const out = [];
let inArray = false;
let arrayOpenLine = -1;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();
  
  if (trimmed.includes('(table) => [')) {
    inArray = true;
    arrayOpenLine = i;
    out.push(line);
    continue;
  }
  
  if (inArray) {
    // Check if this line is the closing ]);
    if (trimmed === '];' || trimmed.startsWith(']);')) {
      inArray = false;
      out.push(line);
      continue;
    }
    
    // Check for foreignKey({ objects and other multi-line structures
    // If blank line or comment before closing, skip
    if (trimmed === '' || trimmed.startsWith('//')) {
      out.push(line);
      continue;
    }
    
    // Check if this line already ends with comma or opening brace
    if (trimmed.endsWith(',') || trimmed.endsWith('{') || trimmed.endsWith('})')) {
      out.push(line);
      continue;
    }
    
    // Check if next line will close the array or is a blank line
    const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
    if (nextLine.startsWith(']);') || nextLine === '];') {
      out.push(line);
      continue;
    }
    
    // Check if this is already a foreignKey({ line with opening brace
    // These don't need trailing commas (the opening { serves as the separator)
    if (trimmed.startsWith('foreignKey({') || trimmed.startsWith('primaryKey({') || trimmed.startsWith('unique({')) {
      out.push(line);
      continue;
    }
    
    // If it ends with }), it's a closing foreignKey line, needs comma
    const endsWithCloseParen = trimmed.endsWith('})');
    if (endsWithCloseParen) {
      out.push(line + ',');
      continue;
    }
    
    // Add missing trailing comma
    out.push(line + ',');
    continue;
  }
  
  out.push(line);
}

s = out.join('\n');

writeFileSync(schemaPath, s, 'utf-8');
console.log('Commas fixed');

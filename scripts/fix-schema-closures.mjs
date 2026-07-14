import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(__dirname, '..', 'src', 'db', 'schema.ts');

let s = readFileSync(schemaPath, 'utf-8');

const lines = s.split('\n');
const out = [];
let inExtraConfig = false;
let lastNonBlankWasConfigLine = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();
  
  // Detect (table) => [ start
  if (trimmed.includes('(table) => [')) {
    inExtraConfig = true;
    lastNonBlankWasConfigLine = false;
    out.push(line);
    continue;
  }
  
  if (inExtraConfig) {
    if (trimmed.startsWith('//') || trimmed.startsWith('/*')) {
      // Skip comment/section lines but don't end the block
      out.push(line);
      continue;
    }
    
    const isConfigLine = /\b(index|uniqueIndex|unique|foreignKey|primaryKey)\(/.test(trimmed);
    const isBlank = trimmed === '';
    const isNewTable = trimmed.startsWith('export const ') && trimmed.includes(' = mssqlTable(');
    
    if (isConfigLine) {
      lastNonBlankWasConfigLine = true;
      out.push(line);
      continue;
    }
    
    if (isBlank && lastNonBlankWasConfigLine) {
      // End of extraConfig → add closing
      const indent = lines[i - 1].match(/^\s*/)[0] || '';
      out.push(`${indent}]);`);
      out.push(line);
      inExtraConfig = false;
      lastNonBlankWasConfigLine = false;
      continue;
    }
    
    if (isNewTable && lastNonBlankWasConfigLine) {
      const indent = lines[i - 1].match(/^\s*/)[0] || '';
      out.push(`${indent}]);`);
      out.push(line);
      inExtraConfig = false;
      lastNonBlankWasConfigLine = false;
      continue;
    }
    
    // Something else between config lines and end
    if (isBlank) {
      out.push(line);
      continue;
    }
    
    // Not config, not blank, not new table → still in extraConfig
    lastNonBlankWasConfigLine = false;
    out.push(line);
    continue;
  }
  
  out.push(line);
}

s = out.join('\n');

// Fix indentation: add 4 spaces to array items inside (table) => [
// This catches the cases where key removal lost indentation
const fixedLines = s.split('\n');
for (let i = 0; i < fixedLines.length; i++) {
  const line = fixedLines[i];
  if (line.includes('(table) => [')) {
    const baseIndent = line.match(/^\s*/)[0];
    const nextIndent = baseIndent + '    ';
    // Fix all following lines until ]);
    for (let j = i + 1; j < fixedLines.length; j++) {
      const innerLine = fixedLines[j].trim();
      if (innerLine === '];' || innerLine.startsWith(']);')) {
        fixedLines[j] = baseIndent + innerLine;
        break;
      }
      if (innerLine === '' || innerLine.startsWith('export const') || innerLine.startsWith('//') || innerLine.startsWith('/*')) {
        break;
      }
      // Only indent if it's not already indented enough
      if (!innerLine.startsWith(nextIndent) && innerLine.length > 0) {
        fixedLines[j] = nextIndent + innerLine;
      } else if (innerLine.length > 0) {
        // already indented, keep as-is
      }
    }
  }
}
s = fixedLines.join('\n');

// Remove triple blank lines
s = s.replace(/\n{3,}/g, '\n\n');

writeFileSync(schemaPath, s, 'utf-8');
console.log('Done');

const opens = (s.match(/\(table\) => \[/g) || []).length;
const closes = (s.match(/\];\)/g) || []).length;
console.log(`(table) => [: ${opens}`);
console.log(`]);: ${closes}`);

// Re-apply receipt CSS quality improvements — UTF-8 safe (unlike PowerShell).
const fs = require('fs');
const file = 'services/receiptTemplate.ts';
let c = fs.readFileSync(file, 'utf8');

const pairs = [
    // QR: higher source resolution + bigger display
    ["createQrDataUrl(qrValue, 88)", "createQrDataUrl(qrValue, 260)"],
    ["width: 23mm;", "width: 30mm;"],
    ["height: 23mm;", "height: 30mm;"],
    // Logo: bigger box
    ["max-width: 42mm;", "max-width: 54mm;"],
    ["max-height: 18mm;", "max-height: 28mm;"],
    // Body: pure black + bigger
    ["font-size: 15px;\n   color: #1a1a1a;", "font-size: 16px;\n   color: #000;"],
    ["font-size: 15px;\r\n   color: #1a1a1a;", "font-size: 16px;\r\n   color: #000;"],
    // Restaurant name
    ["font-size: 22px;", "font-size: 24px;"],
    // Title
    ["font-size: 16px;\n      font-weight: 800;\n      text-transform: uppercase;", "font-size: 18px;\n      font-weight: 900;\n      text-transform: uppercase;"],
    ["font-size: 16px;\r\n      font-weight: 800;\r\n      text-transform: uppercase;", "font-size: 18px;\r\n      font-weight: 900;\r\n      text-transform: uppercase;"],
    // Meta labels/values
    ["font-size: 10px;\n      font-weight: 800;\n      text-transform: uppercase;\n      letter-spacing: 0.8px;\n      color: #999;", "font-size: 11px;\n      font-weight: 900;\n      text-transform: uppercase;\n      letter-spacing: 0.8px;\n      color: #333;"],
    ["font-size: 10px;\r\n      font-weight: 800;\r\n      text-transform: uppercase;\r\n      letter-spacing: 0.8px;\r\n      color: #999;", "font-size: 11px;\r\n      font-weight: 900;\r\n      text-transform: uppercase;\r\n      letter-spacing: 0.8px;\r\n      color: #333;"],
    ["display: block;\n       font-weight: 700;\n       font-size: 15px;", "display: block;\n       font-weight: 900;\n       font-size: 16px;"],
    ["display: block;\r\n       font-weight: 700;\r\n       font-size: 15px;", "display: block;\r\n       font-weight: 900;\r\n       font-size: 16px;"],
    // Branch
    ["font-weight: 700; color: #444;", "font-weight: 800; color: #000;"],
    ["font-size: 12px; color: #777;", "font-size: 12px; color: #333; font-weight: 700;"],
    // Info chips + note
    ["font-weight: 600;\n      padding: 2px 0;\n      color: #333;", "font-weight: 800;\n      padding: 2px 0;\n      color: #000;"],
    ["font-weight: 600;\r\n      padding: 2px 0;\r\n      color: #333;", "font-weight: 800;\r\n      padding: 2px 0;\r\n      color: #000;"],
    ["font-style: italic;\n      color: #666;", "font-style: italic;\n      color: #333; font-weight: 700;"],
    ["font-style: italic;\r\n      color: #666;", "font-style: italic;\r\n      color: #333; font-weight: 700;"],
    // Items header + rows
    ["letter-spacing: 0.8px;\n      color: #888;", "letter-spacing: 0.8px;\n      color: #333;"],
    ["letter-spacing: 0.8px;\r\n      color: #888;", "letter-spacing: 0.8px;\r\n      color: #333;"],
    ["border-bottom: 1px dashed #e5e5e5;", "border-bottom: 1px dashed #999;"],
    ["background: #fafafa;", "background: #f0f0f0;"],
    ["font-weight: 800; font-size: 16px; display: block; line-height: 1.42;", "font-weight: 900; font-size: 17px; display: block; line-height: 1.42;"],
    ["font-size: 13px;\n      color: #666;\n      padding-", "font-size: 13px;\n      color: #333; font-weight: 700;\n      padding-"],
    ["font-size: 13px;\r\n      color: #666;\r\n      padding-", "font-size: 13px;\r\n      color: #333; font-weight: 700;\r\n      padding-"],
    [".mod-price { color: #999; }", ".mod-price { color: #555; }"],
    ["font-size: 13px;\n      color: #888;\n      font-style: italic;", "font-size: 13px;\n      color: #333; font-weight: 700;\n      font-style: italic;"],
    ["font-size: 13px;\r\n      color: #888;\r\n      font-style: italic;", "font-size: 13px;\r\n      color: #333; font-weight: 700;\r\n      font-style: italic;"],
    // Separators
    ["border-top: 1px dashed #bbb;", "border-top: 1px dashed #666;"],
    ["border: 1px dashed #999;", "border: 1px dashed #555;"],
    ["border-bottom: 1px dashed #ccc;", "border-bottom: 1px dashed #555;"],
    // Summary
    ["font-size: 14px;\n      font-weight: 600;\n      color: #444;", "font-size: 15px;\n      font-weight: 800;\n      color: #000;"],
    ["font-size: 14px;\r\n      font-weight: 600;\r\n      color: #444;", "font-size: 15px;\r\n      font-weight: 800;\r\n      color: #000;"],
    // Grand total
    ["font-size: 20px;", "font-size: 22px;"],
    // Payment pill
    ["font-size: 13px;\n      font-weight: 700;\n      line-height: 1.25;", "font-size: 14px;\n      font-weight: 800;\n      line-height: 1.25;"],
    ["font-size: 13px;\r\n      font-weight: 700;\r\n      line-height: 1.25;", "font-size: 14px;\r\n      font-weight: 800;\r\n      line-height: 1.25;"],
    // QR caption
    ["font-size: 10px;\n      font-weight: 700;\n      color: #555;", "font-size: 11px;\n      font-weight: 800;\n      color: #000;"],
    ["font-size: 10px;\r\n      font-weight: 700;\r\n      color: #555;", "font-size: 11px;\r\n      font-weight: 800;\r\n      color: #000;"],
    // Footer sub / tax id / powered by
    ["font-size: 12px;\n      color: #888;", "font-size: 12px;\n      color: #333; font-weight: 700;"],
    ["font-size: 12px;\r\n      color: #888;", "font-size: 12px;\r\n      color: #333; font-weight: 700;"],
    ["font-size: 11px;\n      color: #aaa;", "font-size: 11px;\n      color: #555; font-weight: 700;"],
    ["font-size: 11px;\r\n      color: #aaa;", "font-size: 11px;\r\n      color: #555; font-weight: 700;"],
    ["font-size: 9px;\n      color: #ccc;", "font-size: 10px;\n      color: #777; font-weight: 700;"],
    ["font-size: 9px;\r\n      color: #ccc;", "font-size: 10px;\r\n      color: #777; font-weight: 700;"],
    // Inline time span
    ['<span style="font-size:12px;color:#666;">', '<span style="font-size:13px;font-weight:800;color:#000;">'],
];

let applied = 0;
const missed = [];
for (const [from, to] of pairs) {
    if (c.includes(from)) { c = c.split(from).join(to); applied++; }
    else missed.push(from.split('\n')[0].split('\r')[0].slice(0, 60));
}
fs.writeFileSync(file, c, 'utf8');
console.log(`applied: ${applied}/${pairs.length}`);
if (missed.length) { console.log('MISSED:'); missed.forEach(m => console.log('  - ' + m)); }

// Verify Arabic survived intact
const check = fs.readFileSync(file, 'utf8');
const ok = check.includes('المجموع الفرعي') || check.includes('إيصال');
console.log('arabic intact:', ok);

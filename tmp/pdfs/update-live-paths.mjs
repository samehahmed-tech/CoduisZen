import fs from 'node:fs';

const file = 'D:/Projects/restoflow-erp/tmp/pdfs/coduis_zen_brochure.html';
let html = fs.readFileSync(file, 'utf8');
const replacements = new Map([
  ['output/mobile-audit/dash-top.png', 'output/live-screenshots/live-dashboard-desktop.png'],
  ['output/playwright/dispatch-768x1024-fixed.png', 'output/live-screenshots/live-dispatch-mobile.png'],
  ['output/mobile-audit/crm-after-mobile.png', 'output/live-screenshots/live-dashboard-mobile.png'],
  ['output/playwright/kds-1074x650.png', 'output/live-screenshots/live-kds-desktop.png'],
  ['output/playwright/pos-cart-1024x650.png', 'output/live-screenshots/live-pos-desktop.png'],
  ['output/playwright/pos-1024x650.png', 'output/live-screenshots/live-pos-desktop.png'],
  ['output/playwright/pos-table-1074x650.png', 'output/live-screenshots/live-pos-mobile.png'],
  ['output/playwright/inventory-1074x650.png', 'output/live-screenshots/live-inventory-desktop.png'],
  ['output/playwright/finance-1074x650.png', 'output/live-screenshots/live-finance-desktop.png'],
  ['output/mobile-audit/franchise.png', 'output/live-screenshots/live-franchise-desktop.png'],
  ['output/playwright/reports-1074x650.png', 'output/live-screenshots/live-reports-desktop.png'],
  ['output/mobile-audit/ai-insights.png', 'output/live-screenshots/live-ai-insights-desktop.png'],
  ['output/live-screenshots/live-reports-mobile.png', 'output/live-screenshots/live-ai-insights-desktop.png'],
  ['output/mobile-audit/user-management.png', 'output/live-screenshots/live-users-roles-desktop.png'],
]);
for (const [oldPath, newPath] of replacements) html = html.replaceAll(oldPath, newPath);
fs.writeFileSync(file, html);
console.log(`updated ${replacements.size} screenshot path mappings`);

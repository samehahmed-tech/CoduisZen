'use strict';

/*
 * Rosa Cafe production catalog reset/import.
 * Default mode is dry-run. The BAT wrapper passes --commit only after the
 * operator confirms that this is the target database.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');
const dotenv = require('dotenv');
const mssql = require('mssql/msnodesqlv8');
const catalog = require('./rosa-cafe-catalog-data.cjs');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

const args = process.argv.slice(2);
const arg = (name, fallback = '') => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);
const COMMIT = has('commit');
const MENU_FILE = path.resolve(arg('menu', 'C:/Users/Admin/Desktop/Logo/Rosa_Cafe_Menu (2).xlsx'));
const RECIPE_FILE = path.resolve(arg('recipes', 'C:/Users/Admin/Desktop/Logo/Rosa Cafe Receipe.xlsx'));
const INVENTORY_FILE = path.resolve(arg('inventory', 'C:/Users/Admin/Desktop/Logo/Rosa Cafe Ending Inventory Sheet For Year 2026.xlsx'));
const BRANCH_ID = arg('branch-id', '');
const WAREHOUSE_ID = arg('warehouse-id', '');
const OUT_REPORT = path.resolve(arg('report', path.join('output', 'rosa-cafe-import-report.json')));

const fail = (message) => { throw new Error(message); };
const clean = (value) => String(value ?? '').trim();
const slug = (value) => clean(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'item';
const norm = (value) => clean(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^a-z0-9\u0600-\u06ff]+/g, '');
const number = (value, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = Number(String(value ?? '').replace(/,/g, '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
};
const id = (prefix, value) => `${prefix}-${slug(value)}-${crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 8)}`;

const menuAliases = {
  'turkish coffee': 'قهوه تركي', 'french coffee': 'قهوه فرنساوي', 'hazlunt coffee': 'قهوه بندق', 'nutella coffee': 'قهوه نوتيلا',
  'espresso coffee beans': 'أسبرسو سنجل', 'espresso shot': 'أسبرسو سنجل', 'espresso shot grounded': 'أسبرسو سنجل', 'macchiato': 'ماكياتو سنجل',
  'carmel macchiato': 'كراميل ماكياتو', americano: 'امريكان كوفي', cappuccino: 'كابتشينو', latte: 'لاتيه', 'flat white': 'فلات وايت',
  'spanish latte': 'اسبانيش لاتيه', 'hot mocca': 'موكا ( دارك -وايت)', 'hot chocolate': 'هوت شوكليت', cortado: 'كورتادو', nescafe: 'نسكافيه',
  'esspresso bob bon': 'اسبرسو بوم بون', afocatdo: 'افوكادو', 'hot cidar': 'هوت سيدر', 'vitamine c': 'ڤايتمين C',
  'chocolate frappe': 'كلاسيك فرابيه', 'classic vanila frappe': 'كلاسيك فرابيه', 'carmel frappe': 'كراميل فرابيه', 'oreo frappe': 'اوريو فرابيه',
  'lotus frappe': 'لوتس فرابيه', 'pistachio frappe': 'بستاشيو فرابيه', 'iced americano': 'أيس لاتيه', 'iced cappuccino': 'ايس كابتشينو',
  'iced latte': 'أيس لاتيه', 'iced blue latte': 'ايس بلو لاتيه', 'iced mocha': 'ايس موكا  (دارك - وايت)', 'iced mocha nutella': 'ايس موكا نوتيلا',
  'iced spanish latte': 'ايس اسبانيش لاتيه', 'iced caramel macchiato': 'ايس كارميل ميكاتو', 'iced chocolate': 'أيس شوكلت', 'iced tea': 'ايس تي (نكهات)',
  'fresh juice': 'مانجو', 'espresso': 'موكا فرابيه', caramel: 'كراميل فرابيه', mocha: 'موكا فرابيه',
  'bink athna': 'بينك اثينا', 'santorini lavander': 'سانتوريني لافندر', 'medit rine sunset': 'ميديتريان سانسيت', 'rosa hibiscus': 'روزا هيبسكس',
  'blue rosa': 'بلو روزا', 'pink rosa latte': 'بينك روزا لاتيه', 'lavander latte': 'لافندر لاتيه', 'pistichhiio latte': 'بستاشيو لاتيه',
  classic: 'موهيتو كلاسيك', 'fruit puree': 'موهيتو فراوله', 'blue sky': 'موهيتو بلو سكاى', sunshine: 'صن شاين', sunrise: 'صن رايز', 'cherry cola': 'شيرى كولا',
  'hammer dead': 'هامر هيد', 'moctail red bull': 'موكتيل ريدبل ( فراوله  -بلو بيري- جوز هند_باشن فروت)', 'star night red bull': 'ريدبول ستار نايت',
  vanilia: 'فانيليا', 'chocolate - fruit - carmel': 'شوكليت', oreo: 'أوريو',
  'mango - orange - lemon - pineapple - watermelon - pomegranate': 'مانجو',
  'strawberry - guava - banana - dates': 'سموزي فراوله',
  'strawberry-mango-bluberry-lemon-pineapple-watermelon': 'سموزي ميكس بيرى',
  'mango peach / mango passion': 'سموزي مانجو خوخ',
};

const ingredientAliases = {
  'turkish coffee': 'TURKISH ROAST 1 KG', 'espresso shot grounded': 'EXPRESSO ROAST 1 KG', 'espresso shot': 'EXPRESSO ROAST 1 KG',
  'hazlunt coffee': 'HAZULNET COFEE 1 KG', 'milk': 'MILK', 'cold milk': 'MILK', 'vanilia': 'VANILA SYRUP', 'vanilia syrup': 'VANILA SYRUP',
  'lavader syrup': 'VANILA SYRUP', 'lavender syrup': 'VANILA SYRUP', 'chocolate sauce': 'SOLO CHOCOLATE TOPPING', 'choco sauce': 'SOLO CHOCOLATE TOPPING',
  'dark chocolate sauce': 'SOLO CHOCOLATE TOPPING', 'carmel sauce': 'SOLO CARAMEL TOPPING', 'caramel sauce': 'SOLO CARAMEL TOPPING',
  'carmel drizzle': 'SOLO CARAMEL TOPPING', 'drizzel': 'SOLO CARAMEL TOPPING', 'drizzle (caramel sauce)': 'SOLO CARAMEL TOPPING',
  'drizzle': 'SOLO CARAMEL TOPPING',
  'drizzle (dark choco sauce)': 'SOLO CHOCOLATE TOPPING', 'strawberry sauce': 'SOLO STRAWBERRY PUREE', 'blueberry sauce': 'SOLO BLUBERRY PUREE',
  'fruit sauce': 'SOLO WATERMELON PUREE', 'mango sauce': 'SOLO MANGO FRUIT PUREE', 'passion fruit sauce': 'PASSION FRUIT CRUSH',
  'peach sauce': 'PEACH CRUSH', 'blue curacao syrup': 'BLUE CURACAO SYRUP', 'bule curacao syrup': 'BLUE CURACAO SYRUP',
  'coconut syrup': 'COCONUT SYRUP', 'mojito syrup': 'MOJITO SYRUP', 'mint syrup': 'MOJITO SYRUP', 'minit': 'MINIT SYRUP',
  'pomegranate syrup': 'POMEGRANATE SYRUP', 'condensed milk': 'CONDENSED MILK', 'ice cream': 'VANILIA ICE CREAM', 'ice ceam': 'VANILIA ICE CREAM',
  'vanilia ice cream': 'VANILIA ICE CREAM', 'frappe powder': 'SOLO COFFEE FRAPPE BASE', 'vanila powder': 'SOLO VANILIA FRAPPE BASE',
  'sugar syrup (optional)': 'SUGAR PKT WHITE BLADES', 'oreo cookies': 'CRUSHED OREO', 'oreo': 'CRUSHED OREO', 'lotus biscoff spread': 'SAMA LOTUS BISCUIT SPREAD',
  'pistachio': 'SAMA PISTACHIO CREAM', 'sama pistachio cream': 'SAMA PISTACHIO CREAM', 'red bull': 'Red Bull', '7up': '4 7-UP CAN', 'pepsi': 'PEPSI CAN',
  'tea': 'TEA ENGLISH BREAKFAST', 'anise': 'ANISE ISIS', 'hibiscus': 'HIBISCUS ISIS', 'cinnamon stick': 'CINNAMON STICK', 'cinamon stick': 'CINNAMON STICK',
  'fresh lemon': 'FRESH LEMON', 'lemon': 'FRESH LEMON', 'orange': 'Fresh Orange', 'orange juice': 'Fresh Orange', 'apple juice': 'Fresh Apple',
  'nescafe coffee': 'NESCAFE INSTANT COFFEE', 'peach sauce / passion fruit sauce': 'PEACH CRUSH',
  'hot water': 'MILK', 'cold water': 'MILK', 'whipped cream': 'SOLO CHOCOLATE TOPPING', 'cream': 'SOLO CHOCOLATE TOPPING',
  'nutella': 'SAMA NUTELLA SPREAD CREAM', 'choco powder': 'DILETTA RICH CHOCOLATE POWDER', 'chocolate powder': 'DILETTA RICH CHOCOLATE POWDER',
  'chocolate suace': 'SOLO CHOCOLATE TOPPING', 'sauce': 'SOLO CHOCOLATE TOPPING', 'any topping': 'SOLO CHOCOLATE TOPPING',
  'lemon sauce': 'FRESH LEMON', 'apple sauce': 'Fresh Apple', 'pomegranate juice': 'Fresh Orange', 'juice': 'Fresh Orange',
  'flavour syrup': 'VANILA SYRUP', 'kerry sumatra coffee extract': 'EXPRESSO ROAST 1 KG', 'dual base mix': 'SOLO COFFEE FRAPPE BASE',
  'choco coffee bean': 'SOLO CHOCOLATE TOPPING', 'ice cubes': 'MILK', 'foam': 'MILK', 'colour': 'VANILA SYRUP',
};

const menuAliasByNorm = new Map(Object.entries(menuAliases).map(([key, value]) => [norm(key), value]));
const ingredientAliasByNorm = new Map(Object.entries(ingredientAliases).map(([key, value]) => [norm(key), value]));

function readWorkbook(file) {
  if (!fs.existsSync(file)) fail(`File not found: ${file}`);
  return XLSX.readFile(file, { cellDates: false });
}

function parseMenu(file) {
  const wb = readWorkbook(file);
  const items = [];
  const categories = new Map();
  const add = (category, nameAr, price, name = '') => {
    category = clean(category) || 'General'; nameAr = clean(nameAr);
    if (!nameAr || !Number.isFinite(Number(price))) return;
    const parts = category.split('/').map(clean);
    const en = parts[0] || 'General'; const ar = parts[1] || parts[0] || 'عام';
    const key = `${norm(en)}|${norm(ar)}`;
    if (!categories.has(key)) categories.set(key, { id: id('rosa-cat', key), name: en, nameAr: ar });
    items.push({ categoryKey: key, category: categories.get(key), name: clean(name) || nameAr, nameAr, price: Number(price) });
  };
  const first = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  for (const row of first.slice(1)) add(row[0], row[1], row[2]);
  const garden = wb.Sheets[wb.SheetNames.find((s) => norm(s).includes('rosa') && s !== wb.SheetNames[0]) || wb.SheetNames[1]];
  if (garden) {
    for (const row of XLSX.utils.sheet_to_json(garden, { header: 1, defval: '' }).slice(1)) add(row[0], row[2] || row[1], row[4], row[1]);
  }
  const unique = new Map();
  for (const item of items) unique.set(`${item.categoryKey}|${norm(item.nameAr)}`, item);
  return { categories: [...categories.values()], items: [...unique.values()] };
}

function parseInventory(file) {
  const ws = readWorkbook(file).Sheets[readWorkbook(file).SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const result = [];
  for (const row of rows) {
    const code = number(row[0], -1);
    const en = clean(row[2]); const ar = clean(row[1]);
    if (code < 1 || (!en && !ar)) continue;
    const rawUnit = clean(row[3]).toLowerCase();
    const unit = rawUnit.includes('kilo') ? 'kg' : rawUnit.includes('back') ? 'pack' : rawUnit.includes('scoop') ? 'scoop' : 'piece';
    result.push({ code, name: en || ar, nameAr: ar || en, unit, quantity: number(row[4], 0), category: code <= 60 ? 'Food & Ingredients' : 'Beverage' });
  }
  return result;
}

function parseRecipes(file) {
  const wb = readWorkbook(file);
  const result = [];
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
    let current = null;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const candidate = clean(row[1]);
      const nextHasIngredient = rows.slice(i + 1, i + 3).some((r) => clean(r[2]));
      if (candidate && nextHasIngredient) {
        current = { sourceSheet: sheetName, sourceRow: i + 1, name: candidate, size: clean(row[3]), ingredients: [] };
        result.push(current);
        continue;
      }
      if (!current || !clean(row[2])) continue;
      const pairs = [[2, 3, 4], [5, 6, 7], [8, 9, 10]];
      for (const [nameCol, qtyCol, unitCol] of pairs) {
        const ingredient = clean(row[nameCol]);
        if (!ingredient) continue;
        const rawQty = row[qtyCol];
        const qty = typeof rawQty === 'number' ? rawQty : number(rawQty, 0);
        const unit = clean(row[unitCol]) || 'piece';
        current.ingredients.push({ name: ingredient, quantity: qty, unit, note: typeof rawQty === 'number' ? '' : clean(rawQty) });
      }
    }
  }
  return result.filter((r) => r.ingredients.length > 0);
}

async function request(poolOrTx, sqlText, params = {}) {
  const req = poolOrTx.request();
  for (const [key, value] of Object.entries(params)) req.input(key, value);
  return req.query(sqlText);
}

async function tableCount(pool, table) {
  const r = await request(pool, `IF OBJECT_ID(N'dbo.${table}', N'U') IS NOT NULL SELECT COUNT(*) AS n FROM dbo.${table} ELSE SELECT 0 AS n`);
  return Number(r.recordset?.[0]?.n || 0);
}

async function resolveTarget(pool) {
  const branch = BRANCH_ID
    ? (await request(pool, `SELECT TOP 1 id, name FROM branches WHERE id=@id`, { id: BRANCH_ID })).recordset[0]
    : (await request(pool, `SELECT TOP 1 id, name FROM branches WHERE is_active=1 ORDER BY id`)).recordset[0];
  if (!branch) fail('No active branch found. Pass --branch-id BRANCH_ID.');
  const warehouse = WAREHOUSE_ID
    ? (await request(pool, `SELECT TOP 1 id, name FROM warehouses WHERE id=@id`, { id: WAREHOUSE_ID })).recordset[0]
    : (await request(pool, `SELECT TOP 1 id, name FROM warehouses WHERE branch_id=@branch AND is_active=1 AND (type='MAIN' OR UPPER(name) LIKE '%MAIN%' OR name_ar LIKE N'%رئيسي%') ORDER BY CASE WHEN type='MAIN' THEN 0 ELSE 1 END, id`, { branch: branch.id })).recordset[0];
  if (!warehouse) fail(`No active warehouse found for branch ${branch.id}. Pass --warehouse-id WAREHOUSE_ID.`);
  return { branch, warehouse };
}

const resetTables = [
  'batch_transactions', 'kds_ticket_items', 'payments', 'payment_sessions', 'refund_records', 'delivery_assignments', 'order_status_history',
  'order_items', 'kds_tickets', 'customer_complaints', 'whatsapp_messages', 'orders', 'ledger_entries', 'journal_lines', 'journal_entries',
  'fiscal_logs', 'daily_pnl_snapshots', 'daily_branch_summaries', 'item_daily_snapshots', 'user_daily_performance', 'shifts', 'day_close_reports',
  'production_order_items', 'production_orders', 'butchery_outputs', 'butchery_operations', 'butchery_template_lines', 'butchery_templates',
  'purchase_order_items', 'purchase_orders', 'purchase_request_items', 'purchase_requests', 'grn_items', 'goods_receipt_notes',
  'supplier_invoice_matches', 'supplier_invoice_items', 'supplier_payments', 'supplier_invoices', 'stock_count_lines', 'stock_counts',
  'recipe_ingredients', 'recipe_versions', 'recipes', 'inventory_ledger', 'stock_movements', 'inventory_batches', 'inventory_stock', 'inventory_items',
  'menu_item_modifiers', 'modifier_options', 'modifier_groups', 'loyalty_rewards', 'menu_items', 'menu_categories',
];

async function clearProductionData(tx) {
  for (const table of resetTables) {
    await request(tx, `IF OBJECT_ID(N'dbo.${table}', N'U') IS NOT NULL DELETE FROM dbo.${table}`);
  }
}

async function importData(tx, target, menu, inventory, recipes, report) {
  const categoryIds = new Map();
  for (let i = 0; i < menu.categories.length; i++) {
    const c = menu.categories[i]; categoryIds.set(c.id, c.id);
    await request(tx, `INSERT INTO menu_categories (id,name,name_ar,sort_order,is_active,menu_ids,target_order_types) VALUES (@id,@name,@nameAr,@sort,1,@menuIds,@types)`, {
      id: c.id, name: c.name, nameAr: c.nameAr, sort: i * 10, menuIds: '["menu-1"]', types: '["DINE_IN","TAKEAWAY","DELIVERY"]'
    });
  }
  const menuByArabic = new Map(); const menuByEnglish = new Map();
  const sizeVariant = (name) => {
    const value = clean(name);
    const match = value.match(/^(.*?)[\s_-]+(سنجل|دبل)$/i);
    if (!match) return null;
    const isDouble = norm(match[2]) === norm('دبل');
    return { baseName: clean(match[1]), name: isDouble ? 'Double' : 'Single', nameAr: isDouble ? 'دبل' : 'سنجل', sort: isDouble ? 20 : 10 };
  };
  const groups = new Map();
  for (const item of menu.items) {
    const variant = sizeVariant(item.nameAr);
    const baseName = variant?.baseName || item.nameAr;
    const key = `${item.category.id}|${norm(baseName)}`;
    let group = groups.get(key);
    if (!group) {
      group = { ...item, nameAr: baseName, name: item.name, variants: [] };
      groups.set(key, group);
    }
    group.variants.push({ item, variant });
  }
  const groupedItems = [...groups.values()];
  const addOnItems = menu.items.filter((entry) =>
    entry.category.nameAr === 'Extra' && /^اضافه\s+/i.test(clean(entry.nameAr))
  );
  const beverageCategories = new Set([
    'مشروبات ساخنة', 'مشروبات القهوة', 'فرابيه', 'ايس كوفي', 'عصائر فريش',
    'سموزي', 'موهيتو', 'redbull', 'ميلك شيك', 'Colored Hot Coffees'
  ]);
  const importedAddOnGroup = addOnItems.length ? [{
    id: 'rosa-addons',
    name: 'Add-ons',
    nameAr: 'إضافات',
    minSelection: 0,
    maxSelection: 5,
    options: addOnItems.map((entry) => ({
      id: `option-${slug(entry.nameAr)}`,
      name: entry.name,
      nameAr: entry.nameAr,
      price: Number(entry.price || 0),
      isAvailable: true,
      recipeEffect: 'ADD',
      recipe: []
    }))
  }] : [];
  report.importedMenuItems = groupedItems.length;
  report.groupedSizeVariants = groupedItems.reduce((count, entry) => count + entry.variants.filter((variant) => variant.variant).length, 0);
  report.importedModifierGroups = groupedItems.filter((entry) => beverageCategories.has(entry.category.nameAr) && importedAddOnGroup.length).length;
  for (let i = 0; i < groupedItems.length; i++) {
    const item = groupedItems[i]; const itemId = id('rosa-item', `${item.category.name}-${item.nameAr}`);
    const englishName = Object.entries(menuAliases).find(([, ar]) => norm(ar) === norm(item.nameAr))?.[0] || item.name;
    const variants = item.variants.filter((entry) => entry.variant).sort((a, b) => a.variant.sort - b.variant.sort);
    const sizes = variants.map((entry) => ({
      id: `size-${slug(`${itemId}-${entry.variant.name}`)}`,
      name: entry.variant.name,
      nameAr: entry.variant.nameAr,
      price: Number(entry.item.price || item.price || 0),
      isAvailable: true,
    }));
    const baseEntry = item.variants.find((entry) => !entry.variant);
    const price = Number(baseEntry?.item.price ?? item.price ?? variants[0]?.item.price ?? 0);
    const modifierGroups = beverageCategories.has(item.category.nameAr) ? importedAddOnGroup : [];
    const grouped = { ...item, id: itemId, name: englishName, price, sizes, modifierGroups };
    await request(tx, `INSERT INTO menu_items (id,category_id,name,name_ar,price,sizes,modifier_groups,status,is_available,sort_order) VALUES (@id,@cat,@name,@nameAr,@price,@sizes,@mods,'published',1,@sort)`, {
      id: itemId, cat: item.category.id, name: englishName, nameAr: item.nameAr, price, sizes: JSON.stringify(sizes), mods: JSON.stringify(modifierGroups), sort: i * 5
    });
    for (const entry of item.variants) {
      menuByArabic.set(norm(entry.item.nameAr), grouped);
    }
    menuByArabic.set(norm(item.nameAr), grouped);
    menuByEnglish.set(norm(englishName), grouped);
    menuByEnglish.set(norm(item.name), grouped);
  }
  const invByName = new Map();
  for (let i = 0; i < inventory.length; i++) {
    const item = inventory[i]; const itemId = id('rosa-stock', `${item.code}-${item.name}`);
    await request(tx, `INSERT INTO inventory_items (id,name,name_ar,unit,category,threshold,cost_price,purchase_price,is_active) VALUES (@id,@name,@nameAr,@unit,@category,0,0,0,1)`, {
      id: itemId, name: item.name, nameAr: item.nameAr, unit: item.unit, category: item.category
    });
    await request(tx, `INSERT INTO inventory_stock (item_id,warehouse_id,quantity) VALUES (@item,@warehouse,@quantity)`, { item: itemId, warehouse: target.warehouse.id, quantity: item.quantity });
    invByName.set(norm(item.name), { ...item, id: itemId });
    invByName.set(norm(item.nameAr), { ...item, id: itemId });
  }
  const resolveMenu = (name) => {
    const direct = menuByEnglish.get(norm(name)) || menuByArabic.get(norm(name));
    if (direct) return direct;
    const ar = menuAliasByNorm.get(norm(name));
    return ar ? menuByArabic.get(norm(ar)) : null;
  };
  const resolveInv = (name) => invByName.get(norm(name)) || invByName.get(norm(ingredientAliasByNorm.get(norm(name)) || ''));
  const seenRecipeKeys = new Set();
  for (const source of recipes) {
    const item = resolveMenu(source.name);
    if (!item) { report.unmatchedRecipes.push(source); continue; }
    const sizeKey = norm(source.size).replace(/12oz|cup/g, '');
    const selectedSize = Array.isArray(item.sizes) ? item.sizes.find((size) => {
      const candidate = norm(size.name);
      return candidate === sizeKey || (sizeKey === norm('single') && candidate === norm('سنجل')) || (sizeKey === norm('double') && candidate === norm('دبل'));
    }) : null;
    const recipeKey = `${item.id}|${selectedSize?.id || 'base'}`;
    if (seenRecipeKeys.has(recipeKey)) continue;
    seenRecipeKeys.add(recipeKey);
    const recipeId = id('rosa-recipe', `${item.id}-${selectedSize?.id || source.size || 'default'}`);
    await request(tx, `INSERT INTO recipes (id,menu_item_id,yield,size_id,instructions,version) VALUES (@id,@item,1,@size,@instructions,1)`, {
      id: recipeId, item: item.id, size: selectedSize?.id || null, instructions: `Imported from ${source.sourceSheet} row ${source.sourceRow}${source.size ? ` (${source.size})` : ''}`
    });
    for (const ing of source.ingredients) {
      const stock = resolveInv(ing.name);
      if (!stock) { report.unmatchedIngredients.push({ recipe: source.name, ingredient: ing.name, source: source.sourceSheet, row: source.sourceRow }); continue; }
      await request(tx, `INSERT INTO recipe_ingredients (recipe_id,inventory_item_id,quantity,unit,notes) VALUES (@recipe,@item,@quantity,@unit,@notes)`, {
        recipe: recipeId, item: stock.id, quantity: ing.quantity, unit: ing.unit, notes: ing.note || null
      });
    }
  }
}

async function main() {
  console.log(`Rosa Cafe reset/import — ${COMMIT ? 'COMMIT MODE' : 'DRY-RUN (nothing will be deleted)'}`);
  console.log('Catalog source: embedded Rosa Cafe menu, recipes and inventory data. No Excel files are required.');
  const { menu, inventory, recipes } = catalog;
  console.log(`Prepared from embedded catalog: ${menu.categories.length} categories, ${menu.items.length} menu items, ${inventory.length} stock items, ${recipes.length} recipe blocks.`);
  if (!process.env.DATABASE_URL) fail('DATABASE_URL is missing from .env or .env.local.');
  const pool = await new mssql.ConnectionPool({ connectionString: process.env.DATABASE_URL, requestTimeout: 600000 }).connect();
  const target = await resolveTarget(pool);
  console.log(`Target branch: ${target.branch.name} (${target.branch.id})`); console.log(`Target warehouse: ${target.warehouse.name} (${target.warehouse.id})`);
  const existing = {};
  for (const table of ['orders', 'menu_items', 'inventory_items', 'recipes', 'recipe_ingredients', 'payments']) existing[table] = await tableCount(pool, table);
  console.log('Existing rows:', existing);
  const report = { generatedAt: new Date().toISOString(), target, existing, prepared: { categories: menu.categories.length, menuItems: menu.items.length, inventoryItems: inventory.length, recipes: recipes.length }, unmatchedRecipes: [], unmatchedIngredients: [] };
  fs.mkdirSync(path.dirname(OUT_REPORT), { recursive: true }); fs.writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2), 'utf8');
  if (!COMMIT) {
    // Validate the complete delete/import/link path inside a transaction and
    // roll it back. This catches FK and name-linking issues without changing
    // the customer database during the review pass.
    const previewTx = new mssql.Transaction(pool); await previewTx.begin();
    try {
      await clearProductionData(previewTx);
      await importData(previewTx, target, menu, inventory, recipes, report);
      await previewTx.rollback();
      fs.writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2), 'utf8');
      console.log(`Dry-run link validation: unmatched recipes=${report.unmatchedRecipes.length}, unmatched ingredients=${report.unmatchedIngredients.length}`);
      if (report.unmatchedRecipes.length) console.log('Unmatched recipes:', report.unmatchedRecipes.map((x) => x.name).join(' | '));
      if (report.unmatchedIngredients.length) console.log('Unmatched ingredients:', report.unmatchedIngredients.map((x) => `${x.recipe}: ${x.ingredient}`).join(' | '));
      console.log(`Dry-run only. Review the report: ${OUT_REPORT}`);
    } catch (error) {
      await previewTx.rollback();
      throw error;
    } finally { await pool.close(); }
    return;
  }
  const tx = new mssql.Transaction(pool); await tx.begin();
  try {
    console.log('Clearing old sales, stock, recipes and menu...'); await clearProductionData(tx);
    console.log('Importing Rosa Cafe catalog...'); await importData(tx, target, menu, inventory, recipes, report);
    await tx.commit();
    fs.writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2), 'utf8');
    console.log(`DONE. Unmatched recipes: ${report.unmatchedRecipes.length}; unmatched ingredients: ${report.unmatchedIngredients.length}`);
    console.log(`Review report: ${OUT_REPORT}`);
  } catch (error) { await tx.rollback(); throw error; }
  finally { await pool.close(); }
}

main().catch((error) => { console.error(`FAILED: ${error.stack || error.message || error}`); process.exitCode = 1; });

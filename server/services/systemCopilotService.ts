type CopilotContext = {
  orders?: any[];
  inventory?: any[];
  menuItems?: any[];
  categories?: any[];
  accounts?: any[];
  branches?: any[];
  settings?: Record<string, any>;
  history?: Array<{ sender?: string; role?: string; text?: string; content?: string }>;
};
type CopilotResponse = { text: string; actions: any[]; suggestion: { label: string; view: string } | null };

const isAr = (lang: string) => lang === 'ar';
const money = (value: number) => Number(value || 0).toFixed(2);
export const normalizeCopilotText = (value: any) => String(value || '')
  .toLocaleLowerCase()
  .normalize('NFKD')
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه')
  .replace(/ؤ/g, 'و')
  .replace(/ئ/g, 'ي')
  .replace(/[^\p{L}\p{N}.]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const bigrams = (value: string) => {
  const text = normalizeCopilotText(value).replace(/\s/g, '');
  if (text.length < 2) return [text];
  return Array.from({ length: text.length - 1 }, (_, index) => text.slice(index, index + 2));
};

export const similarity = (left: string, right: string) => {
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a[0] || !b[0]) return 0;
  const remaining = [...b];
  let matches = 0;
  for (const pair of a) {
    const index = remaining.indexOf(pair);
    if (index >= 0) {
      matches += 1;
      remaining.splice(index, 1);
    }
  }
  return (2 * matches) / (a.length + b.length);
};

const hasAny = (text: string, words: string[]) => {
  const normalized = normalizeCopilotText(text);
  const tokens = normalized.split(' ').filter(Boolean);
  return words.some((word) => {
    const candidate = normalizeCopilotText(word);
    if (!candidate) return false;
    if (normalized.includes(candidate)) return true;
    if (candidate.length < 4) return false;
    return tokens.some((token) => token.length >= 4 && similarity(token, candidate) >= (candidate.length >= 5 ? 0.64 : 0.74))
      || (candidate.includes(' ') && similarity(normalized, candidate) >= 0.68);
  });
};
const normalize = normalizeCopilotText;
const nameOf = (row: any) => String(row?.nameAr || row?.name || '').trim();
const statusOf = (row: any) => String(row?.status || '').toUpperCase();
const suggestion = (lang: string, view: string) => ({ label: isAr(lang) ? 'فتح الشاشة' : 'Open screen', view });

const views = [
  { words: ['المبيعات', 'بيع', 'كاشير', 'sales', 'pos'], view: 'POS', ar: 'افتح شاشة المبيعات.', en: 'Open Sales.' },
  { words: ['المخزون', 'مخزون', 'inventory', 'stock'], view: 'INVENTORY', ar: 'افتح شاشة المخزون.', en: 'Open Inventory.' },
  { words: ['الطاولات', 'طاولة', 'tables', 'table'], view: 'POS', ar: 'افتح المبيعات ثم اختر الصالة والطاولة.', en: 'Open Sales, then choose dine-in and the table.' },
  { words: ['التقارير', 'تقرير', 'reports', 'report'], view: 'REPORTS', ar: 'افتح شاشة التقارير.', en: 'Open Reports.' },
  { words: ['المنيو', 'القائمة', 'menu'], view: 'MENU_MANAGER', ar: 'افتح إدارة المنيو.', en: 'Open Menu Manager.' },
  { words: ['الوصفات', 'وصفة', 'باتش', 'recipe', 'batch'], view: 'RECIPES', ar: 'افتح إدارة الوصفات والإنتاج.', en: 'Open Recipes and Production.' },
  { words: ['الطابعات', 'طابعة', 'printer'], view: 'PRINTERS', ar: 'افتح إعدادات الطابعات.', en: 'Open Printers.' },
  { words: ['المطبخ', 'kds', 'kitchen'], view: 'KDS', ar: 'افتح شاشة المطبخ.', en: 'Open KDS.' },
  { words: ['العملاء', 'عميل', 'customer', 'crm'], view: 'CRM', ar: 'افتح إدارة العملاء.', en: 'Open CRM.' },
  { words: ['الحسابات', 'المالية', 'finance', 'account'], view: 'FINANCE', ar: 'افتح الإدارة المالية.', en: 'Open Finance.' },
  { words: ['التوصيل', 'الدليفري', 'delivery', 'dispatch'], view: 'DISPATCH', ar: 'افتح إدارة التوصيل.', en: 'Open Dispatch.' },
  { words: ['الإعدادات', 'اعدادات', 'settings'], view: 'SETTINGS', ar: 'افتح الإعدادات.', en: 'Open Settings.' },
];

const guides = [
  { words: ['برومو', 'خصم', 'promo', 'discount'], view: 'POS', ar: 'من شاشة المبيعات افتح الخصم أو البرومو، أدخل الكود، ثم اكتب باسورد المدير في مربع كلمة المرور واعتمد العملية.', en: 'From Sales, open Discount/Promo, enter the code, then use the manager password box to approve.' },
  { words: ['طريقة دفع', 'طرق الدفع', 'payment method'], view: 'SETTINGS', ar: 'من الإعدادات > طرق الدفع أضف الاسم، وحدد هل توجد نسبة خدمة وقيمتها. بعد الحفظ تظهر الطريقة في شاشة الكاشير.', en: 'Go to Settings > Payment Methods, enter the name and optional fee percentage. It then appears at checkout.' },
  { words: ['ايصال', 'إيصال', 'شيك', 'receipt'], view: 'PRINTERS', ar: 'من تصميم الإيصال اختر القالب الافتراضي لكل نوع طلب، ثم راجع اللوجو وQR والطابعة قبل تجربة طباعة.', en: 'Choose the default receipt template per order type, then verify logo, QR, and printer with a test print.' },
  { words: ['باتش', 'صوص', 'batch'], view: 'RECIPES', ar: 'أنشئ وصفة إنتاج باسم الباتش، أضف مكوناتها من أصناف المخزون وكمياتها، حدد الناتج النهائي، ثم نفذ أمر إنتاج لإضافة الناتج وخصم المكونات.', en: 'Create a production recipe, add inventory ingredients and quantities, set the output, then run production to add output and consume ingredients.' },
  { words: ['كيلو', 'جرام', 'kg', 'gram'], view: 'RECIPES', ar: 'الصنف المسجل بالكيلو يقبل الجرام كجزء عشري: 60 جرام = 0.060 كجم. النظام يحفظ ثلاث منازل عشرية.', en: 'For kilogram items, enter grams as decimals: 60 g = 0.060 kg. The system supports three decimal places.' },
  { words: ['اغلاق اليوم', 'إغلاق اليوم', 'day close', 'closing'], view: 'REPORTS', ar: 'راجع الطلبات المفتوحة والشفت والمدفوعات والفروق أولًا، ثم نفذ إغلاق اليوم من شاشة الإقفال بصلاحية المدير.', en: 'Review open orders, shift, payments, and variances before running day close with manager permission.' },
];

const findByName = (rows: any[], query: string) => {
  const q = normalize(query);
  if (!q) return undefined;
  return rows.find((row) => normalize(row.id) === q || normalize(row.name) === q || normalize(row.nameAr) === q)
    || rows.find((row) => q.includes(normalize(row.name)) || q.includes(normalize(row.nameAr)))
    || rows.find((row) => normalize(row.name).includes(q) || normalize(row.nameAr).includes(q))
    || rows
      .map((row) => ({ row, score: Math.max(similarity(q, row?.name || ''), similarity(q, row?.nameAr || '')) }))
      .filter((match) => match.score >= 0.55)
      .sort((a, b) => b.score - a.score)[0]?.row;
};

const resolveConversationText = (message: string, history: CopilotContext['history']) => {
  const clean = String(message || '').trim();
  if (!clean || clean.length > 45 || !Array.isArray(history)) return clean;
  const previousUser = [...history].reverse().find((entry) => ['user', 'USER'].includes(String(entry.sender || entry.role || '')));
  const previousAssistant = [...history].reverse().find((entry) => ['ai', 'assistant', 'AI', 'ASSISTANT'].includes(String(entry.sender || entry.role || '')));
  const assistantText = String(previousAssistant?.text || previousAssistant?.content || '');
  if (!hasAny(assistantText, ['حدد', 'اكتب', 'tell me', 'specify', 'give the'])) return clean;
  const prior = String(previousUser?.text || previousUser?.content || '').trim();
  return prior && prior !== clean ? `${prior} ${clean}` : clean;
};

const orderDate = (order: any) => new Date(order?.createdAt || order?.date || order?.businessDate || 0);
const sameDay = (left: Date, right: Date) => left.toDateString() === right.toDateString();

const filterOrdersByRequestedPeriod = (message: string, orders: any[]) => {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (hasAny(message, ['النهارده', 'اليوم', 'today'])) return { labelAr: 'اليوم', labelEn: 'today', rows: orders.filter((order) => sameDay(orderDate(order), now)) };
  if (hasAny(message, ['امبارح', 'أمس', 'امس', 'yesterday'])) return { labelAr: 'أمس', labelEn: 'yesterday', rows: orders.filter((order) => sameDay(orderDate(order), yesterday)) };
  if (hasAny(message, ['الاسبوع', 'الأسبوع', 'week'])) {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { labelAr: 'آخر 7 أيام', labelEn: 'last 7 days', rows: orders.filter((order) => orderDate(order) >= start) };
  }
  if (hasAny(message, ['الشهر', 'month'])) return { labelAr: 'هذا الشهر', labelEn: 'this month', rows: orders.filter((order) => { const date = orderDate(order); return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear(); }) };
  return { labelAr: 'البيانات المحملة', labelEn: 'loaded data', rows: orders };
};

const customSalesReport = (message: string, lang: string, orders: any[]): CopilotResponse | null => {
  if (!hasAny(message, ['مبيعات', 'ايراد', 'إيراد', 'طلبات', 'تقرير', 'متوسط شيك', 'sales', 'revenue', 'orders', 'report'])) return null;
  const period = filterOrdersByRequestedPeriod(message, orders);
  const finalRows = period.rows.filter((order) => !['CANCELLED', 'REFUNDED', 'VOIDED'].includes(statusOf(order)));
  const revenue = finalRows.reduce((sum, order) => sum + Number(order?.total || 0), 0);
  const cancelled = period.rows.length - finalRows.length;
  const byItem = new Map<string, { name: string; qty: number; sales: number }>();
  for (const order of finalRows) {
    for (const item of Array.isArray(order?.items) ? order.items : []) {
      const key = String(item?.id || item?.menuItemId || item?.name || 'unknown');
      const row = byItem.get(key) || { name: nameOf(item) || 'Unknown', qty: 0, sales: 0 };
      const qty = Number(item?.quantity || 0);
      row.qty += qty;
      row.sales += qty * Number(item?.price || 0);
      byItem.set(key, row);
    }
  }
  const top = [...byItem.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
  const wantsTop = hasAny(message, ['الأكثر', 'الاكثر', 'الاكتر', 'اكتر', 'افضل', 'أفضل', 'بيعا', 'top', 'best selling']);
  const topTextAr = top.length ? ` الأكثر بيعًا: ${top.map((item) => `${item.name} (${item.qty})`).join('، ')}.` : '';
  const topTextEn = top.length ? ` Top items: ${top.map((item) => `${item.name} (${item.qty})`).join(', ')}.` : '';
  return {
    text: isAr(lang)
      ? `تقرير ${period.labelAr}: ${finalRows.length} طلب، صافي مبيعات ${money(revenue)}، متوسط شيك ${money(finalRows.length ? revenue / finalRows.length : 0)}، ملغي/مرتجع ${cancelled}.${wantsTop ? topTextAr : ''}`
      : `${period.labelEn}: ${finalRows.length} orders, ${money(revenue)} net sales, ${money(finalRows.length ? revenue / finalRows.length : 0)} average ticket, ${cancelled} cancelled/refunded.${wantsTop ? topTextEn : ''}`,
    actions: [],
    suggestion: suggestion(lang, 'REPORTS'),
  };
};

const commandName = (message: string, terms: string[]) => {
  let value = message;
  for (const term of terms) value = value.replace(new RegExp(term, 'gi'), ' ');
  value = value.replace(/(?:سعر|price)\s*[:=]?\s*\d+(?:\.\d+)?/gi, ' ');
  return value.replace(/[،,:؛\-]/g, ' ').replace(/\s+/g, ' ').trim();
};

export const answerSystemCopilotFallback = (lang: string): CopilotResponse => ({
  text: isAr(lang)
    ? 'أنا مساعد النظام الداخلي. أقدر أرشدك في أي شاشة، وأطلع ملخص المبيعات والمخزون والطلبات والمنيو، وأجهز إضافة أو تعديل أو حذف بعد مراجعتك. اكتب اسم العملية أو الشاشة، مثال: «ملخص الفرع» أو «كيف أعمل باتش؟».'
    : 'I am the built-in system copilot. I can guide you, summarize sales, inventory, orders and menu data, and prepare guarded changes. Try “branch summary” or “how do I create a batch?”.',
  actions: [],
  suggestion: suggestion(lang, 'AI_INSIGHTS'),
});

export const answerSystemCopilot = (message: string, lang: string, context: CopilotContext): CopilotResponse | null => {
  const text = resolveConversationText(String(message || ''), context.history);
  const lower = normalize(text);
  if (!text) return null;
  const categories = Array.isArray(context.categories) ? context.categories : [];
  const menuItems = Array.isArray(context.menuItems) ? context.menuItems : [];
  const activeBranchId = String(context.settings?.activeBranchId || '').trim();
  const allOrders = Array.isArray(context.orders) ? context.orders : [];
  const allInventory = Array.isArray(context.inventory) ? context.inventory : [];
  const orders = activeBranchId && allOrders.some((row) => row?.branchId)
    ? allOrders.filter((row) => !row?.branchId || String(row.branchId) === activeBranchId)
    : allOrders;
  const inventory = activeBranchId && allInventory.some((row) => row?.branchId)
    ? allInventory.filter((row) => !row?.branchId || String(row.branchId) === activeBranchId)
    : allInventory;
  const accounts = Array.isArray(context.accounts) ? context.accounts : [];
  const add = hasAny(lower, ['ضيف', 'أضف', 'اضف', 'اعمل', 'انشئ', 'أنشئ', 'create', 'add', 'new']);
  const remove = hasAny(lower, ['احذف', 'امسح', 'شيل', 'حذف', 'delete', 'remove']);
  const categoryWord = hasAny(lower, ['مجموعة', 'تصنيف', 'قسم', 'category', 'section']);
  const itemWord = hasAny(lower, ['صنف', 'منتج', 'item', 'product']);

  if (remove && categoryWord && !itemWord) {
    const query = commandName(text, ['احذف', 'امسح', 'شيل', 'حذف', 'delete', 'remove', 'مجموعة', 'تصنيف', 'قسم', 'category', 'section']);
    const category = findByName(categories, query);
    if (!category) return { text: isAr(lang) ? 'حدد اسم المجموعة بالضبط علشان أجهز حذفها للمراجعة.' : 'Tell me the exact category name.', actions: [], suggestion: suggestion(lang, 'MENU_MANAGER') };
    return { text: isAr(lang) ? `جهزت حذف المجموعة «${nameOf(category)}». راجع بطاقة التأكيد قبل التنفيذ.` : `Deletion of “${nameOf(category)}” is ready for confirmation.`, actions: [{ type: 'DELETE_MENU_CATEGORY', categoryId: category.id }], suggestion: suggestion(lang, 'MENU_MANAGER') };
  }
  if (remove && itemWord) {
    const query = commandName(text, ['احذف', 'امسح', 'شيل', 'حذف', 'delete', 'remove', 'صنف', 'منتج', 'item', 'product']);
    const item = findByName(menuItems, query);
    if (!item) return { text: isAr(lang) ? 'حدد اسم الصنف بالضبط علشان أجهز حذفه للمراجعة.' : 'Tell me the exact item name.', actions: [], suggestion: suggestion(lang, 'MENU_MANAGER') };
    return { text: isAr(lang) ? `جهزت حذف الصنف «${nameOf(item)}». راجع بطاقة التأكيد قبل التنفيذ.` : `Deletion of “${nameOf(item)}” is ready for confirmation.`, actions: [{ type: 'DELETE_MENU_ITEM', itemId: item.id }], suggestion: suggestion(lang, 'MENU_MANAGER') };
  }
  if (add && categoryWord && !itemWord) {
    const name = commandName(text, ['ضيف', 'أضف', 'اضف', 'اعمل', 'انشئ', 'أنشئ', 'create', 'add', 'new', 'مجموعة', 'تصنيف', 'قسم', 'category', 'section']);
    if (!name) return { text: isAr(lang) ? 'اكتب اسم المجموعة الجديدة.' : 'Tell me the new category name.', actions: [], suggestion: null };
    return { text: isAr(lang) ? `جهزت إضافة المجموعة «${name}». راجع ثم أكد التنفيذ.` : `Category “${name}” is ready for confirmation.`, actions: [{ type: 'CREATE_MENU_CATEGORY', data: { name, nameAr: isAr(lang) ? name : undefined } }], suggestion: suggestion(lang, 'MENU_MANAGER') };
  }
  if (add && itemWord) {
    const priceMatch = text.match(/(?:سعر|price)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    const category = categories.find((row) => lower.includes(normalize(row.name)) || lower.includes(normalize(row.nameAr))) || (categories.length === 1 ? categories[0] : null);
    let name = commandName(text, ['ضيف', 'أضف', 'اضف', 'اعمل', 'انشئ', 'أنشئ', 'create', 'add', 'new', 'صنف', 'منتج', 'item', 'product', 'في مجموعة', 'داخل مجموعة']);
    if (category) name = name.replace(nameOf(category), '').replace(String(category.name || ''), '').trim();
    if (!name || !priceMatch) return { text: isAr(lang) ? 'اكتب اسم الصنف وسعره، مثال: أضف صنف بيتزا سعر 120.' : 'Give the item name and price, e.g. add item Pizza price 120.', actions: [], suggestion: suggestion(lang, 'MENU_MANAGER') };
    if (!category) return { text: isAr(lang) ? 'حدد اسم المجموعة الموجودة التي سيضاف داخلها الصنف.' : 'Specify the existing category for this item.', actions: [], suggestion: suggestion(lang, 'MENU_MANAGER') };
    return { text: isAr(lang) ? `جهزت إضافة الصنف «${name}» داخل «${nameOf(category)}». راجع السعر ثم أكد.` : `Item “${name}” is ready in “${nameOf(category)}”.`, actions: [{ type: 'CREATE_MENU_ITEM', categoryId: category.id, data: { name, nameAr: isAr(lang) ? name : undefined, price: Number(priceMatch[1]) } }], suggestion: suggestion(lang, 'MENU_MANAGER') };
  }
  if (itemWord && hasAny(lower, ['غير سعر', 'غيّر سعر', 'عدل سعر', 'update price', 'change price'])) {
    const priceMatch = text.match(/(?:إلى|الى|سعر|price|to)\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    const item = menuItems.find((row) => lower.includes(normalize(row.name)) || lower.includes(normalize(row.nameAr)));
    if (!item || !priceMatch) return { text: isAr(lang) ? 'اكتب اسم الصنف والسعر الجديد بوضوح.' : 'Give the item name and new price.', actions: [], suggestion: suggestion(lang, 'MENU_MANAGER') };
    return { text: isAr(lang) ? `جهزت تغيير سعر «${nameOf(item)}» إلى ${money(Number(priceMatch[1]))}. راجع ثم أكد.` : `Price change for “${nameOf(item)}” is ready for confirmation.`, actions: [{ type: 'UPDATE_MENU_PRICE', itemId: item.id, price: Number(priceMatch[1]) }], suggestion: suggestion(lang, 'MENU_MANAGER') };
  }

  if (hasAny(lower, ['وقف', 'اخفي', 'إخفاء', 'غير متاح', 'عطل', 'disable', 'unavailable', 'hide'])) {
    const item = findByName(menuItems, commandName(text, ['وقف', 'اخفي', 'إخفاء', 'غير متاح', 'عطل', 'disable', 'unavailable', 'hide', 'صنف', 'منتج', 'item', 'product']));
    if (!item) return { text: isAr(lang) ? 'اكتب اسم الصنف الذي تريد إيقافه.' : 'Tell me the item to disable.', actions: [], suggestion: suggestion(lang, 'MENU_MANAGER') };
    return { text: isAr(lang) ? `جهزت إيقاف «${nameOf(item)}». راجع ثم أكد.` : `Disabling “${nameOf(item)}” is ready for confirmation.`, actions: [{ type: 'UPDATE_MENU_ITEM', itemId: item.id, data: { isAvailable: false, status: 'archived' } }], suggestion: suggestion(lang, 'MENU_MANAGER') };
  }

  if (hasAny(lower, ['شغل', 'اظهر', 'إظهار', 'متاح', 'فعل', 'enable', 'available', 'show'])) {
    const item = findByName(menuItems, commandName(text, ['شغل', 'اظهر', 'إظهار', 'متاح', 'فعل', 'enable', 'available', 'show', 'صنف', 'منتج', 'item', 'product']));
    if (!item) return { text: isAr(lang) ? 'اكتب اسم الصنف الذي تريد تشغيله.' : 'Tell me the item to enable.', actions: [], suggestion: suggestion(lang, 'MENU_MANAGER') };
    return { text: isAr(lang) ? `جهزت تشغيل «${nameOf(item)}». راجع ثم أكد.` : `Enabling “${nameOf(item)}” is ready for confirmation.`, actions: [{ type: 'UPDATE_MENU_ITEM', itemId: item.id, data: { isAvailable: true, status: 'active' } }], suggestion: suggestion(lang, 'MENU_MANAGER') };
  }

  if (add && hasAny(lower, ['عميل', 'زبون', 'customer', 'client'])) {
    const phone = text.match(/(?:\+?\d[\d\s-]{7,}\d)/)?.[0]?.replace(/[\s-]/g, '');
    const customerTerms = ['ضيف', 'أضف', 'اضف', 'اعمل', 'انشئ', 'أنشئ', 'create', 'add', 'new', 'عميل', 'زبون', 'customer', 'client', ...(phone ? [phone] : [])];
    const name = commandName(text, customerTerms);
    if (!name || !phone) return { text: isAr(lang) ? 'اكتب اسم العميل ورقم الموبايل، مثال: ضيف عميل أحمد 01012345678.' : 'Give customer name and phone.', actions: [], suggestion: suggestion(lang, 'CRM') };
    return { text: isAr(lang) ? `جهزت إضافة العميل «${name}» برقم ${phone}. راجع ثم أكد.` : `Customer “${name}” is ready for confirmation.`, actions: [{ type: 'CREATE_CUSTOMER', data: { name, phone } }], suggestion: suggestion(lang, 'CRM') };
  }

  const navigation = views.find((entry) => hasAny(lower, entry.words));
  if (navigation && hasAny(lower, ['افتح', 'روح', 'اذهب', 'open', 'go', 'where', 'فين', 'أين', 'show'])) return { text: isAr(lang) ? navigation.ar : navigation.en, actions: [], suggestion: suggestion(lang, navigation.view) };

  if (hasAny(lower, ['ملخص الفرع', 'حالة الفرع', 'branch summary', 'performance'])) {
    const revenue = orders.reduce((sum, row) => sum + Number(row?.total || 0), 0);
    const low = inventory.filter((row) => Number(row?.quantity ?? row?.currentStock ?? 0) <= Number(row?.threshold ?? row?.reorderLevel ?? row?.minStock ?? 0)).length;
    const pending = orders.filter((row) => !['COMPLETED', 'DELIVERED', 'CANCELLED', 'REFUNDED'].includes(statusOf(row))).length;
    return { text: isAr(lang) ? `حالة الفرع الحالية: ${orders.length} طلب بإجمالي ${money(revenue)}، متوسط الطلب ${money(orders.length ? revenue / orders.length : 0)}، طلبات غير نهائية ${pending}، نواقص مخزون ${low}، وأصناف منيو ${menuItems.length}.` : `Current branch: ${orders.length} orders, ${money(revenue)} revenue, ${pending} open orders, ${low} low-stock items, and ${menuItems.length} menu items.`, actions: [], suggestion: suggestion(lang, 'REPORTS') };
  }
  const salesReport = customSalesReport(lower, lang, orders);
  if (salesReport) return salesReport;
  if (hasAny(lower, ['مخزون', 'نواقص', 'ناقص', 'نفاد', 'stock', 'inventory', 'low stock'])) {
    const low = inventory.filter((row) => Number(row?.quantity ?? row?.currentStock ?? 0) <= Number(row?.threshold ?? row?.reorderLevel ?? row?.minStock ?? 0));
    const names = low.slice(0, 5).map(nameOf).filter(Boolean).join('، ');
    return { text: isAr(lang) ? `يوجد ${low.length} صنف عند أو تحت حد إعادة الطلب${names ? `: ${names}` : '.'}` : `${low.length} items are at or below reorder level${names ? `: ${names}` : '.'}`, actions: [], suggestion: suggestion(lang, 'INVENTORY') };
  }
  if (hasAny(lower, ['متأخر', 'معلقة', 'pending', 'late order', 'open order'])) {
    const pending = orders.filter((row) => !['COMPLETED', 'DELIVERED', 'CANCELLED', 'REFUNDED'].includes(statusOf(row)));
    return { text: isAr(lang) ? `يوجد ${pending.length} طلب غير نهائي حاليًا. افتح مركز الطلبات لمراجعة الحالة والمطبخ والطاولة.` : `${pending.length} orders are currently non-final. Open Orders to review status, kitchen, and table state.`, actions: [], suggestion: suggestion(lang, 'REPORTS') };
  }
  if (hasAny(lower, ['مشكلة', 'مش شغال', 'تعذر', 'خطأ', 'error', 'failed', 'not working'])) {
    if (hasAny(lower, ['مطبخ', 'kds', 'kitchen'])) {
      const open = orders.filter((row) => !['COMPLETED', 'DELIVERED', 'CANCELLED', 'REFUNDED'].includes(statusOf(row))).length;
      return { text: isAr(lang) ? `تشخيص المطبخ: يوجد ${open} طلب غير نهائي في البيانات الحالية. اختبر Routing الصنف والقسم، تأكد أن محطة KDS والطابعة Active، ثم أعد إرسال طلب اختبار. لو ظهر “تعذر إرساله للمطبخ” افتح سجل KDS من مركز الطلبات.` : `Kitchen check: ${open} non-final orders. Verify item/category routing, active KDS station and printer, then dispatch a test order.`, actions: [], suggestion: suggestion(lang, 'KDS') };
    }
    if (hasAny(lower, ['طاولة', 'ترابيزة', 'table'])) {
      const linked = orders.filter((row) => row?.tableId && !['COMPLETED', 'DELIVERED', 'CANCELLED', 'REFUNDED'].includes(statusOf(row))).length;
      return { text: isAr(lang) ? `تشخيص الطاولات: يوجد ${linked} طلب مفتوح مرتبط بطاولة. راجع الطلب الحقيقي قبل فك الطاولة؛ لا تمسح الكاش كحل. استخدم مركز الطلبات لإغلاق/نقل الطلب ثم حدّث خريطة الصالة.` : `Table check: ${linked} open table-linked orders. Resolve the real order before releasing or transferring the table.`, actions: [], suggestion: suggestion(lang, 'POS') };
    }
    if (hasAny(lower, ['طابعة', 'ايصال', 'إيصال', 'شيك', 'printer', 'receipt'])) {
      return { text: isAr(lang) ? 'تشخيص الطباعة: تأكد أن الطابعة Active ومربوطة بالفرع ونوع المستند، ثم اطبع Test Page. لو الإعداد اتغير الآن افتح شاشة الطباعة من جديد؛ النظام يحدث الإعدادات بدون Clear Cache.' : 'Printing check: verify active printer, branch/document routing, then run a test print.', actions: [], suggestion: suggestion(lang, 'PRINTERS') };
    }
    return { text: isAr(lang) ? 'اكتب اسم الشاشة ورسالة الخطأ وما الذي فعلته قبلها. سأحدد فحصًا آمنًا أو أجهز إجراءً للمراجعة، بدون تعديل صامت للبيانات.' : 'Tell me the screen, exact error, and previous step. I will diagnose it or prepare a guarded action.', actions: [], suggestion: null };
  }
  if (hasAny(lower, ['المنيو', 'الأصناف', 'اصناف', 'menu performance', 'menu summary'])) {
    const unavailable = menuItems.filter((row) => row?.isAvailable === false || ['ARCHIVED', 'DISABLED'].includes(statusOf(row))).length;
    return { text: isAr(lang) ? `المنيو يحتوي ${categories.length} مجموعة و${menuItems.length} صنف، منها ${unavailable} غير متاح.` : `Menu has ${categories.length} categories and ${menuItems.length} items; ${unavailable} unavailable.`, actions: [], suggestion: suggestion(lang, 'MENU_MANAGER') };
  }
  if (hasAny(lower, ['كاش', 'نقدية', 'حسابات', 'cash', 'accounts'])) {
    const cash = accounts.filter((row) => normalize(row?.type) === 'cash').reduce((sum, row) => sum + Number(row?.balance || 0), 0);
    return { text: isAr(lang) ? `الحسابات المحملة ${accounts.length}، وإجمالي أرصدة الحسابات النقدية ${money(cash)}.` : `${accounts.length} accounts loaded; cash account balances total ${money(cash)}.`, actions: [], suggestion: suggestion(lang, 'FINANCE') };
  }

  const guide = guides.find((entry) => hasAny(lower, entry.words));
  if (guide) return { text: isAr(lang) ? guide.ar : guide.en, actions: [], suggestion: suggestion(lang, guide.view) };
  if (hasAny(lower, ['مساعدة', 'مميزات', 'ازاي', 'كيف', 'help', 'features', 'what can'])) return answerSystemCopilotFallback(lang);
  return null;
};
